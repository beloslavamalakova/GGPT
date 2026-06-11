import { NextResponse } from "next/server";
import { generateGeminiText } from "@/lib/gemini";
import { PERSONAS, VERDICT_PROMPT } from "@/lib/personas";
import type { Attachment, FollowUpMessage, PersonaAnswer, PersonaId, RespondRequest } from "@/lib/types";

export const runtime = "nodejs";

const PERSONA_IDS = new Set<PersonaId>(["bestie", "therapist", "delulu"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "text/markdown"]);
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== "object") return false;
  const attachment = value as Partial<Attachment>;
  return (
    typeof attachment.name === "string" && attachment.name.length > 0 && attachment.name.length <= 180 &&
    typeof attachment.mimeType === "string" && ALLOWED_MIME_TYPES.has(attachment.mimeType) &&
    typeof attachment.data === "string" && attachment.data.length > 0 &&
    typeof attachment.size === "number" && attachment.size > 0 && attachment.size <= MAX_ATTACHMENT_BYTES &&
    attachment.data.length <= Math.ceil(attachment.size / 3) * 4 + 4
  );
}

function parseAttachments(value: unknown): Attachment[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3 || !value.every(isAttachment)) return null;
  return value.reduce((total, attachment) => total + attachment.size, 0) <= MAX_ATTACHMENT_BYTES ? value : null;
}

function isPersonaAnswer(value: unknown): value is PersonaAnswer {
  if (!value || typeof value !== "object") return false;
  const answer = value as Partial<PersonaAnswer>;
  return (
    typeof answer.persona === "string" &&
    PERSONA_IDS.has(answer.persona as PersonaId) &&
    typeof answer.content === "string" &&
    answer.content.trim().length > 0
  );
}

function isFollowUpMessage(value: unknown): value is FollowUpMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<FollowUpMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.persona === "string" &&
    PERSONA_IDS.has(message.persona as PersonaId) &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function parseRequest(value: unknown): RespondRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Partial<RespondRequest>;
  if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 4000) {
    return null;
  }

  if (
    body.type === "followup" &&
    typeof body.persona === "string" &&
    PERSONA_IDS.has(body.persona as PersonaId) &&
    typeof body.originalQuestion === "string" &&
    body.originalQuestion.trim().length > 0 &&
    Array.isArray(body.originalAnswers) &&
    body.originalAnswers.length === 3 &&
    body.originalAnswers.every(isPersonaAnswer) &&
    typeof body.verdict === "string" &&
    body.verdict.trim().length > 0 &&
    Array.isArray(body.thread) &&
    body.thread.length <= 80 &&
    body.thread.every(isFollowUpMessage) &&
    body.thread.reduce((total, message) => total + message.content.length, 0) <= 60000
  ) {
    const attachments = parseAttachments(body.attachments);
    if (!attachments) return null;
    return {
      type: "followup",
      persona: body.persona as PersonaId,
      message: body.message.trim(),
      originalQuestion: body.originalQuestion.trim(),
      originalAnswers: body.originalAnswers,
      verdict: body.verdict.trim(),
      thread: body.thread,
      attachments,
    };
  }

  if (
    body.type === "persona" &&
    typeof body.persona === "string" &&
    PERSONA_IDS.has(body.persona as PersonaId)
  ) {
    const attachments = parseAttachments(body.attachments);
    if (!attachments) return null;
    return { type: "persona", persona: body.persona as PersonaId, message: body.message.trim(), attachments };
  }

  if (
    body.type === "verdict" &&
    Array.isArray(body.answers) &&
    body.answers.length === 3 &&
    body.answers.every(isPersonaAnswer)
  ) {
    return { type: "verdict", message: body.message.trim(), answers: body.answers };
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = parseRequest(await request.json());
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const instructions = body.type === "verdict" ? VERDICT_PROMPT : PERSONAS[body.persona].systemPrompt;
    const input =
      body.type === "persona"
        ? body.message
        : body.type === "followup"
          ? `You are joining an ongoing shared GossipGPT conversation. You can see what the user discussed with every adviser. Stay fully in your own persona, but use the entire shared history when forming your opinion. Never claim another adviser's words as your own. Answer the latest user message directly and do not recap the whole conversation unless asked.

ORIGINAL QUESTION:
${body.originalQuestion}

ORIGINAL ADVISER ANSWERS:
${body.originalAnswers.map((answer) => `${PERSONAS[answer.persona].name.toUpperCase()}: ${answer.content}`).join("\n\n")}

GGPT VERDICT:
${body.verdict}

SHARED FOLLOW-UP TRANSCRIPT:
${body.thread.map((message) => message.role === "user"
  ? `USER TO ${PERSONAS[message.persona].name.toUpperCase()}: ${message.content}`
  : `${PERSONAS[message.persona].name.toUpperCase()}: ${message.content}`).join("\n\n") || "No earlier follow-ups."}

LATEST USER MESSAGE TO ${PERSONAS[body.persona].name.toUpperCase()}:
${body.message}`
          : `USER'S QUESTION:\n${body.message}\n\nADVISERS:\n${body.answers
            .map((answer) => `${PERSONAS[answer.persona].name.toUpperCase()}:\n${answer.content}`)
            .join("\n\n")}`;

    const content = await generateGeminiText({
      systemInstruction: instructions,
      input,
      maxOutputTokens: body.type === "verdict" ? 280 : 350,
      temperature: body.type === "verdict" ? 0.45 : 0.8,
      attachments: body.type === "verdict" ? [] : body.attachments,
    });

    if (!content) throw new Error("The model returned an empty response.");

    return NextResponse.json({ content });
  } catch (error) {
    console.error("GossipGPT response error:", error);
    const missingKey = error instanceof Error && error.message.includes("GEMINI_API_KEY");
    return NextResponse.json(
      { error: missingKey ? "Gemini API key is not configured." : "The group chat could not reply. Please try again." },
      { status: missingKey ? 503 : 500 },
    );
  }
}
