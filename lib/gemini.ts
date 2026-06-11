export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

export async function generateGeminiText({
  systemInstruction,
  input,
  maxOutputTokens,
  temperature,
  attachments = [],
}: {
  systemInstruction: string;
  input: string;
  maxOutputTokens: number;
  temperature: number;
  attachments?: Array<{ name: string; mimeType: string; data: string }>;
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{
          role: "user",
          parts: [
            { text: input },
            ...attachments.map((attachment) => ({
              inlineData: { mimeType: attachment.mimeType, data: attachment.data },
            })),
          ],
        }],
        generationConfig: { maxOutputTokens, temperature },
      }),
    },
  );

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini request failed with status ${response.status}.`);
  }

  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
}
