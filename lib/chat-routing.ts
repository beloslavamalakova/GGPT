import type { PersonaId } from "@/lib/types";

export const MAX_PERSONA_MESSAGES_PER_TURN = 5;

const TAGS: Array<{ label: string; tag: RegExp; persona: PersonaId; displayName: string }> = [
  { label: "bestie", tag: /(^|\s)@bestie\b/gi, persona: "bestie", displayName: "Bestie" },
  { label: "life", tag: /(^|\s)@life\b/gi, persona: "life", displayName: "The One With Her Life Together" },
  { label: "delulu", tag: /(^|\s)@delulu\b/gi, persona: "delulu", displayName: "Delulu Bestie" },
  { label: "therapist", tag: /(^|\s)@therapist\b/gi, persona: "therapist", displayName: "Therapist" },
];

const safetyPattern = /\b(abuse|abusive|assault|self[-\s]?harm|suicide|kill myself|danger|unsafe|stalking|threat|emergency|medical|legal)\b/i;
const dramaticPattern = /\b(ex|situationship|crush|date|dating|text|reply|replied|left me on read|ghost|ghosted|story|liked my|breadcrumb|cheat|cheated|jealous|obsessed|insane|crazy|delusional|drama|fight|messy|red flag|hooked up|kissed|slept with)\b/i;
const polarizingPattern = /\b(should i|am i wrong|am i insane|am i crazy|what does it mean|is this weird|is he|is she|do they like me|does he|does she|blocked|unblocked|followed|unfollowed)\b/i;
const practicalPattern = /\b(job|offer|study|school|exam|deadline|move|moving|roommate|family|friendship|friend|career|work|boss|money|decision|choose|plan)\b/i;

function uniqueInOrder(personas: PersonaId[]) {
  return personas.filter((persona, index) => personas.indexOf(persona) === index);
}

export function getTaggedPersonas(message: string): PersonaId[] {
  const matches = TAGS.flatMap(({ tag, persona }) => {
    tag.lastIndex = 0;
    return Array.from(message.matchAll(tag), (match) => ({ persona, index: match.index ?? 0 }));
  }).sort((a, b) => a.index - b.index);

  return uniqueInOrder(matches.map((match) => match.persona));
}

export function stripPersonaTags(message: string, addressedPersonas: PersonaId[] = getRespondingPersonas(message)) {
  const addressed = new Set(addressedPersonas);
  return TAGS.reduce((next, { tag, persona, displayName }) => {
    tag.lastIndex = 0;
    return next.replace(tag, (_match, prefix: string) => `${prefix}${addressed.has(persona) ? "" : displayName}`);
  }, message).replace(/\s{2,}/g, " ").trim();
}

export function getRespondingPersonas(message: string): PersonaId[] {
  const tagged = getTaggedPersonas(message);
  if (tagged.length > 0) return [tagged[0]];

  if (safetyPattern.test(message)) return ["life"];

  const dramatic = dramaticPattern.test(message);
  const polarizing = polarizingPattern.test(message);
  const practical = practicalPattern.test(message);

  if (dramatic && polarizing) return ["bestie", "delulu"];
  if (dramatic) return ["delulu", "bestie"];
  if (polarizing) return ["life", "bestie"];
  if (practical) return ["life"];

  return ["life"];
}

export function getInterjectionOrder(lastSpeaker: PersonaId, alreadySpoken: PersonaId[] = []): PersonaId[] {
  const preferred: Record<PersonaId, PersonaId[]> = {
    bestie: ["delulu", "life"],
    delulu: ["bestie", "life"],
    life: ["bestie", "delulu"],
    therapist: [],
  };

  const spoken = new Set(alreadySpoken);
  return preferred[lastSpeaker].filter((persona) => persona !== lastSpeaker && !spoken.has(persona));
}
