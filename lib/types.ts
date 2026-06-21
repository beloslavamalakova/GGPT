export type PersonaId = "bestie" | "life" | "delulu" | "therapist";

export type Attachment = {
  name: string;
  mimeType: string;
  data: string;
  size: number;
};

export type PersonaAnswer = {
  persona: PersonaId;
  content: string;
  replyToPersona?: PersonaId;
  messageType?: "micro" | "short" | "medium" | "long";
};

export type FollowUpMessage = {
  id: string;
  persona: PersonaId;
  role: "user" | "assistant";
  content: string;
  messageType?: "micro" | "short" | "medium" | "long";
  taggedPersonas?: PersonaId[];
  replyToMessageId?: string;
  replyToPersona?: PersonaId;
};

export type Conversation = {
  id: string;
  question: string;
  answers: PersonaAnswer[];
  tldr: string;
  verdict?: string;
  followUps?: FollowUpMessage[];
  createdAt: string;
};

export type PersonaRequest = {
  type: "persona";
  persona: PersonaId;
  message: string;
  attachments?: Attachment[];
};

export type TldrRequest = {
  type: "tldr";
  message: string;
  answers: PersonaAnswer[];
  thread?: FollowUpMessage[];
};

export type FollowUpRequest = {
  type: "followup";
  persona: PersonaId;
  message: string;
  originalQuestion: string;
  originalAnswers: PersonaAnswer[];
  tldr: string;
  thread: FollowUpMessage[];
  attachments?: Attachment[];
};

export type InterjectionRequest = {
  type: "interjection";
  persona: PersonaId;
  replyToPersona: PersonaId;
  message: string;
  originalQuestion: string;
  originalAnswers: PersonaAnswer[];
  tldr: string;
  thread: FollowUpMessage[];
};

export type ChainBubble = {
  personaId: PersonaId;
  body: string;
  replyToPersonaId?: PersonaId | null;
  messageType: "micro" | "short" | "medium" | "long";
};

export type ChainRequest = {
  type: "chain";
  message: string;
  recipients: PersonaId[];
  responseMode: "auto" | "direct_tagged";
  originalQuestion: string;
  originalAnswers: PersonaAnswer[];
  tldr: string;
  thread: FollowUpMessage[];
  asInitial: boolean;
  allowUntaggedJumpIns: boolean;
  attachments?: Attachment[];
};

export type RespondRequest = PersonaRequest | TldrRequest | FollowUpRequest | InterjectionRequest | ChainRequest;
