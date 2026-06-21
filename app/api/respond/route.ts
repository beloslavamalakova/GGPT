import { NextResponse } from "next/server";
import { generateGeminiText } from "@/lib/gemini";
import { buildPrompt } from "@/lib/prompt-builders";
import { PERSONAS } from "@/lib/personas";
import type { Attachment, ChainBubble, FollowUpMessage, PersonaAnswer, PersonaId, RespondRequest } from "@/lib/types";

export const runtime = "nodejs";

const PERSONA_IDS = new Set<PersonaId>(["bestie", "life", "delulu", "therapist"]);
const GROUP_PERSONA_IDS = new Set<PersonaId>(["bestie", "life", "delulu"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "text/markdown"]);
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MESSAGE_TYPES = new Set(["micro", "short", "medium", "long"]);

function sanitizeGeneratedText(content: string) {
  return content.replace(/\*\*/g, "").trim();
}

function extractJsonObject(content: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const source = fenced?.[1] || content;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return source.slice(start, end + 1);
}

function parseChainBubbles(content: string): ChainBubble[] | null {
  const json = extractJsonObject(content);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as { bubbles?: unknown };
    if (!Array.isArray(parsed.bubbles)) return null;

    const bubbles = parsed.bubbles.slice(0, 5).flatMap((bubble): ChainBubble[] => {
      if (!bubble || typeof bubble !== "object") return [];
      const value = bubble as Partial<ChainBubble>;
      if (
        typeof value.personaId !== "string" ||
        !PERSONA_IDS.has(value.personaId as PersonaId) ||
        typeof value.body !== "string" ||
        !value.body.trim() ||
        typeof value.messageType !== "string" ||
        !MESSAGE_TYPES.has(value.messageType) ||
        (value.replyToPersonaId !== undefined && value.replyToPersonaId !== null && !PERSONA_IDS.has(value.replyToPersonaId as PersonaId))
      ) {
        return [];
      }

      return [{
        personaId: value.personaId as PersonaId,
        body: sanitizeGeneratedText(value.body).slice(0, 2400),
        replyToPersonaId: value.replyToPersonaId ? value.replyToPersonaId as PersonaId : null,
        messageType: value.messageType as ChainBubble["messageType"],
      }];
    });

    return bubbles.length > 0 ? bubbles : null;
  } catch {
    return null;
  }
}

function filterChainBubblesForMode(bubbles: ChainBubble[], recipients: PersonaId[]) {
  if (recipients.includes("therapist")) {
    const therapistBubble = bubbles.find((bubble) => bubble.personaId === "therapist");
    return therapistBubble ? [{ ...therapistBubble, replyToPersonaId: null, messageType: "long" as const }] : [];
  }

  return bubbles.filter((bubble) => GROUP_PERSONA_IDS.has(bubble.personaId));
}

function isQuestionableAdvice(text: string) {
  return /\b(test|trap|bait|fake secret|fake post|make (him|her|them) jealous|jealous|provoke|reaction|revenge|stalk|check obsessively|play games|ignore (his|her|their) boundaries|silent treatment|punish)\b/i.test(text);
}

function isGroundingResponse(bubble: ChainBubble) {
  return (
    (bubble.personaId === "life" || bubble.personaId === "bestie") &&
    /\b(no|not|don't|do not|pause|trap|trust|boundary|boundaries|manipulat|rebuild|repair|problem|sting operation|we are not)\b/i.test(bubble.body)
  );
}

function groundingBubbleFor(unsafeBubble: ChainBubble): ChainBubble {
  const fakeSecretPattern = /\b(fake secret|fake post|test|trap|bait)\b/i;
  return {
    personaId: "life",
    body: fakeSecretPattern.test(unsafeBubble.body)
      ? "Okay, pause. Testing her with a fake secret will not actually rebuild trust. It creates a trap, and what you need is a real repair conversation about what changes next."
      : "Okay, pause. That might feel satisfying for five seconds, but it creates a new problem. The move is directness, boundaries, and self-respect, not setting up a reaction.",
    replyToPersonaId: unsafeBubble.personaId,
    messageType: "short",
  };
}

function enforceChainSafety(bubbles: ChainBubble[]) {
  const unsafeIndex = bubbles.findLastIndex((bubble) => isQuestionableAdvice(bubble.body));
  if (unsafeIndex === -1) return bubbles;

  const hasLaterGrounding = bubbles.slice(unsafeIndex + 1).some(isGroundingResponse);
  const unsafeBubble = bubbles[unsafeIndex];
  const lastBubble = bubbles[bubbles.length - 1];
  if (hasLaterGrounding && !(unsafeBubble.personaId === "delulu" && lastBubble.personaId === "delulu")) return bubbles;

  const grounding = groundingBubbleFor(unsafeBubble);
  if (bubbles.length < 5) return [...bubbles, grounding];

  return [...bubbles.slice(0, 4), grounding];
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

function parsePersonaIds(value: unknown): PersonaId[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const personas = value.filter((persona): persona is PersonaId =>
    typeof persona === "string" && PERSONA_IDS.has(persona as PersonaId),
  );
  return personas.length === value.length ? personas : null;
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
    (message.taggedPersonas === undefined ||
      (Array.isArray(message.taggedPersonas) && message.taggedPersonas.every((persona) => PERSONA_IDS.has(persona)))) &&
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
    body.type === "chain" &&
    typeof body.originalQuestion === "string" &&
    body.originalQuestion.trim().length > 0 &&
    Array.isArray(body.originalAnswers) &&
    body.originalAnswers.length <= 5 &&
    body.originalAnswers.every(isPersonaAnswer) &&
    typeof body.tldr === "string" &&
    body.tldr.trim().length > 0 &&
    Array.isArray(body.thread) &&
    body.thread.length <= 80 &&
    body.thread.every(isFollowUpMessage) &&
    body.thread.reduce((total, message) => total + message.content.length, 0) <= 60000 &&
    (body.responseMode === "auto" || body.responseMode === "direct_tagged") &&
    typeof body.asInitial === "boolean" &&
    typeof body.allowUntaggedJumpIns === "boolean"
  ) {
    const recipients = parsePersonaIds(body.recipients);
    if (!recipients) return { error: "Chain recipients are invalid." };
    const attachments = parseAttachments(body.attachments);
    if (!attachments) return { error: "Attachments are invalid or exceed the allowed limits." };
    return {
      body: {
        type: "chain",
        message: body.message.trim(),
        recipients,
        responseMode: body.responseMode,
        originalQuestion: body.originalQuestion.trim(),
        originalAnswers: body.originalAnswers,
        tldr: body.tldr.trim(),
        thread: body.thread,
        asInitial: body.asInitial,
        allowUntaggedJumpIns: body.allowUntaggedJumpIns,
        attachments,
      },
    };
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
    typeof body.tldr === "string" &&
    body.tldr.trim().length > 0 &&
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
        tldr: body.tldr.trim(),
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
    typeof body.tldr === "string" &&
    body.tldr.trim().length > 0 &&
    Array.isArray(body.thread) &&
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
        tldr: body.tldr.trim(),
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
    body.type === "tldr" &&
    Array.isArray(body.answers) &&
    body.answers.length >= 1 &&
    body.answers.length <= 5 &&
    body.answers.every(isPersonaAnswer)
  ) {
    return {
      body: {
        type: "tldr",
        message: body.message.trim(),
        answers: body.answers,
        thread: Array.isArray(body.thread) && body.thread.every(isFollowUpMessage) ? body.thread.slice(0, 80) : [],
      },
    };
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

    const prompt = buildPrompt(body);

    const content = await generateGeminiText({
      systemInstruction: prompt.systemInstruction,
      input: prompt.input,
      maxOutputTokens: prompt.maxOutputTokens,
      temperature: prompt.temperature,
      attachments: body.type === "persona" || body.type === "followup" || body.type === "chain" ? body.attachments : [],
    });

    if (!content) throw new Error("The model returned an empty response.");

    if (body.type === "chain") {
      const bubbles = parseChainBubbles(content);
      if (!bubbles) throw new Error("The model returned an invalid chain response.");
      const modeFilteredBubbles = filterChainBubblesForMode(bubbles, body.recipients);
      if (!modeFilteredBubbles.length) throw new Error("The model returned an invalid chain response.");
      return NextResponse.json({ bubbles: body.recipients.includes("therapist") ? modeFilteredBubbles : enforceChainSafety(modeFilteredBubbles) });
    }

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
