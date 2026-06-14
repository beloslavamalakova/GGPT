import { NextResponse } from "next/server";
import { generateGeminiText } from "@/lib/gemini";
import { PERSONAS, VERDICT_PROMPT } from "@/lib/personas";
import type { Attachment, FollowUpMessage, PersonaAnswer, PersonaId, RespondRequest } from "@/lib/types";

export const runtime = "nodejs";

const PERSONA_IDS = new Set<PersonaId>(["bestie", "therapist", "delulu"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "text/markdown"]);
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function sanitizeGeneratedText(content: string) {
  return content.replace(/\*\*/g, "").trim();
}

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
    message.content.trim().length > 0 &&
    (message.replyToMessageId === undefined || typeof message.replyToMessageId === "string") &&
    (message.replyToPersona === undefined || PERSONA_IDS.has(message.replyToPersona as PersonaId))
  );
}

type ParsedRequest = { body: RespondRequest } | { error: string };

function parseRequest(value: unknown): ParsedRequest {
  if (!value || typeof value !== "object") return { error: "Request body must be an object." };
  const body = value as Partial<RespondRequest>;
  if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 4000) {
    return { error: "Message must contain between 1 and 4000 characters." };
  }

  if (
    body.type === "followup" &&
    typeof body.persona === "string" &&
    PERSONA_IDS.has(body.persona as PersonaId) &&
    typeof body.originalQuestion === "string" &&
    body.originalQuestion.trim().length > 0 &&
    Array.isArray(body.originalAnswers) &&
    body.originalAnswers.length >= 1 &&
    body.originalAnswers.length <= 3 &&
    body.originalAnswers.every(isPersonaAnswer) &&
    typeof body.verdict === "string" &&
    body.verdict.trim().length > 0 &&
    Array.isArray(body.thread) &&
    body.thread.length <= 80 &&
    body.thread.every(isFollowUpMessage) &&
    body.thread.reduce((total, message) => total + message.content.length, 0) <= 60000
  ) {
    const attachments = parseAttachments(body.attachments);
    if (!attachments) return { error: "Attachments are invalid or exceed the allowed limits." };
    return {
      body: {
        type: "followup",
        persona: body.persona as PersonaId,
        message: body.message.trim(),
        originalQuestion: body.originalQuestion.trim(),
        originalAnswers: body.originalAnswers,
        verdict: body.verdict.trim(),
        thread: body.thread,
        attachments,
      },
    };
  }

  if (
    body.type === "interjection" &&
    typeof body.persona === "string" &&
    PERSONA_IDS.has(body.persona as PersonaId) &&
    typeof body.replyToPersona === "string" &&
    PERSONA_IDS.has(body.replyToPersona as PersonaId) &&
    body.persona !== body.replyToPersona &&
    typeof body.originalQuestion === "string" &&
    body.originalQuestion.trim().length > 0 &&
    Array.isArray(body.originalAnswers) &&
    body.originalAnswers.length >= 1 &&
    body.originalAnswers.length <= 3 &&
    body.originalAnswers.every(isPersonaAnswer) &&
    typeof body.verdict === "string" &&
    body.verdict.trim().length > 0 &&
    Array.isArray(body.thread) &&
    body.thread.length > 0 &&
    body.thread.length <= 80 &&
    body.thread.every(isFollowUpMessage) &&
    body.thread.reduce((total, message) => total + message.content.length, 0) <= 60000
  ) {
    return {
      body: {
        type: "interjection",
        persona: body.persona as PersonaId,
        replyToPersona: body.replyToPersona as PersonaId,
        message: body.message.trim(),
        originalQuestion: body.originalQuestion.trim(),
        originalAnswers: body.originalAnswers,
        verdict: body.verdict.trim(),
        thread: body.thread,
      },
    };
  }

  if (
    body.type === "persona" &&
    typeof body.persona === "string" &&
    PERSONA_IDS.has(body.persona as PersonaId)
  ) {
    const attachments = parseAttachments(body.attachments);
    if (!attachments) return { error: "Attachments are invalid or exceed the allowed limits." };
    return { body: { type: "persona", persona: body.persona as PersonaId, message: body.message.trim(), attachments } };
  }

  if (
    body.type === "verdict" &&
    Array.isArray(body.answers) &&
    body.answers.length === 3 &&
    body.answers.every(isPersonaAnswer)
  ) {
    return { body: { type: "verdict", message: body.message.trim(), answers: body.answers } };
  }

  return { error: `Invalid ${typeof body.type === "string" ? body.type : "unknown"} request context.` };
}

export async function POST(request: Request) {
  try {
    const parsed = parseRequest(await request.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const body = parsed.body;

    const hasPriorReplyFromSelectedPersona = body.type === "followup" && body.thread.some(
      (message) => message.role === "assistant" && message.persona === body.persona,
    );
    const interjectionClashFocus = body.type === "interjection"
      ? body.persona === "bestie" && body.replyToPersona === "delulu"
        ? `As Bestie evaluating Delulu Bestie, intervene only if Delulu's hopeful interpretation leads to a materially different conclusion or next action than your honest reading. Do not reply just to soften, qualify, endorse, or add practical advice to her optimism.`
        : body.persona === "delulu" && body.replyToPersona === "bestie"
          ? `As Delulu Bestie evaluating Bestie, silently intervene only if Bestie's conclusion closes off a hopeful reading you genuinely want to keep open, or her suggested action conflicts with yours. Do not reply just to reassure the user after agreeing with Bestie's conclusion.`
          : `Intervene only when your conclusion or recommended action is materially incompatible with ${PERSONAS[body.replyToPersona].name}'s.`
      : "";
    const interjectionVoice = body.type === "interjection" && body.persona === "delulu"
      ? `Begin with "${PERSONAS[body.replyToPersona].name}," and disagree like a friend discovering her thought while texting from bed, not a lawyer presenting a conclusion. Think out loud with "my first thought is," "my delulu brain immediately goes," "I'm not saying that's true," or a quick "what if" when natural. Paint one tiny alternative scene without claiming to know anyone's emotions, motives, fears, regrets, or intentions. Never use "you are ignoring," "you are dismissing," "valid," "acknowledging," "evidence," "reasonable," or abstract argument language. Good energy: "${PERSONAS[body.replyToPersona].name}, wait, what if he just panicked?", "${PERSONAS[body.replyToPersona].name}, I'm not saying that's true, but that assumes he had a master plan," or "${PERSONAS[body.replyToPersona].name}, girl, not everything is a strategic operation." Keep it playful, curious, uncertain, and spontaneous rather than persuasive.`
      : `Begin with the exact name "${body.type === "interjection" ? PERSONAS[body.replyToPersona].name : "the other persona"}," so it is unmistakably a direct reply. State the disagreement immediately.`;
    const stageInstructions = body.type === "persona"
      ? `\n\nINITIAL GROUP REPLY RULE: Give a complete first perspective based only on what the user shared. Do not ask the user any questions in this initial reply. Do not end with a question mark.`
      : body.type === "followup"
        ? hasPriorReplyFromSelectedPersona
          ? `\n\nONGOING CONVERSATION RULE: Respond to what the user just said, then ask at most one short, natural follow-up question only if the answer would meaningfully improve your guidance. Never ask multiple questions or make the user feel interrogated.`
          : `\n\nFIRST SELECTED-BESTIE REPLY RULE: After responding with empathy and a useful initial thought, end with exactly one short, specific, easy-to-answer follow-up question. Ask about the single missing detail that would help you understand the situation best. Do not ask multiple questions.`
        : body.type === "interjection"
          ? `\n\nDIRECT PERSONA REPLY RULE - STRICT DISAGREEMENT GATE:
These rules override the normal reply length, acknowledgment, reassurance, next-step, and user-directed opening rules above.
Your task is not to continue the conversation. Your task is only to detect a real clash with ${PERSONAS[body.replyToPersona].name}'s latest response.

A clash exists only when at least one of these is true:
1. You believe a central interpretation or prediction in their response is wrong or meaningfully misleading.
2. You recommend a materially incompatible next action.
3. Following their advice would undermine what you believe the user should do.

No clash exists when you agree with their conclusion but would use a different tone, add reassurance, add a caveat, suggest another explanation, or offer extra advice. Agreement plus nuance is still agreement. ${interjectionClashFocus}

If there is no clear clash, output exactly NO_REPLY and nothing else. When uncertain, output NO_REPLY.
If there is a clear clash, ${interjectionVoice} Do not praise, validate, support, echo, build on, or summarize the other persona's response. Do not use agreement openings such as "I agree," "exactly," "yes," "totally," "fair," or "and." Use only one or two short sentences and 15-35 words total. Do not ask a question. Use plain text only, with no Markdown or asterisks.`
          : "";
    const instructions = body.type === "verdict"
      ? VERDICT_PROMPT
      : `${PERSONAS[body.persona].systemPrompt}${stageInstructions}`;
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
          : body.type === "interjection"
            ? `You are evaluating whether to interrupt a shared GossipGPT group chat. The user directed their latest message to ${PERSONAS[body.replyToPersona].name}, who just answered. Silence is the expected outcome unless the two opinions genuinely clash. Compare conclusions and recommended actions, not personality or tone.

ORIGINAL QUESTION:
${body.originalQuestion}

ORIGINAL ADVISER ANSWERS:
${body.originalAnswers.map((answer) => `${PERSONAS[answer.persona].name.toUpperCase()}: ${answer.content}`).join("\n\n")}

GGPT VERDICT:
${body.verdict}

SHARED FOLLOW-UP TRANSCRIPT:
${body.thread.map((message) => message.role === "user"
  ? `USER TO ${PERSONAS[message.persona].name.toUpperCase()}: ${message.content}`
  : message.replyToPersona
    ? `${PERSONAS[message.persona].name.toUpperCase()} REPLYING TO ${PERSONAS[message.replyToPersona].name.toUpperCase()}: ${message.content}`
    : `${PERSONAS[message.persona].name.toUpperCase()}: ${message.content}`).join("\n\n")}

LATEST USER MESSAGE:
${body.message}

Before answering, silently complete this test: "Their response says the user should believe/do X; I instead believe the user should believe/do incompatible Y." If you cannot fill in both X and Y clearly, output NO_REPLY.`
          : `USER'S QUESTION:\n${body.message}\n\nADVISERS:\n${body.answers
            .map((answer) => `${PERSONAS[answer.persona].name.toUpperCase()}:\n${answer.content}`)
            .join("\n\n")}`;

    const content = await generateGeminiText({
      systemInstruction: instructions,
      input,
      maxOutputTokens: body.type === "verdict" ? 280 : body.type === "interjection" ? 90 : 350,
      temperature: body.type === "verdict" ? 0.45 : body.type === "interjection" ? 0.2 : 0.8,
      attachments: body.type === "persona" || body.type === "followup" ? body.attachments : [],
    });

    if (!content) throw new Error("The model returned an empty response.");

    let sanitizedContent = sanitizeGeneratedText(content);
    const isNoReply = body.type === "interjection" && /^NO_REPLY[.!]?$/i.test(sanitizedContent);
    if (body.type === "interjection" && !isNoReply) {
      const addressedPersona = PERSONAS[body.replyToPersona].name;
      if (!sanitizedContent.toLowerCase().includes(addressedPersona.toLowerCase())) {
        sanitizedContent = `${addressedPersona}, ${sanitizedContent}`;
      }
    }
    return NextResponse.json({ content: isNoReply ? null : sanitizedContent });
  } catch (error) {
    console.error("GossipGPT response error:", error);
    const missingKey = error instanceof Error && error.message.includes("GEMINI_API_KEY");
    return NextResponse.json(
      { error: missingKey ? "Gemini API key is not configured." : "The group chat could not reply. Please try again." },
      { status: missingKey ? 503 : 500 },
    );
  }
}
