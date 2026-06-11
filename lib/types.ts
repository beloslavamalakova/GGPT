export type PersonaId = "bestie" | "therapist" | "delulu";

export type Attachment = {
  name: string;
  mimeType: string;
  data: string;
  size: number;
};

export type PersonaAnswer = {
  persona: PersonaId;
  content: string;
};

export type FollowUpMessage = {
  id: string;
  persona: PersonaId;
  role: "user" | "assistant";
  content: string;
};

export type Conversation = {
  id: string;
  question: string;
  answers: PersonaAnswer[];
  verdict: string;
  followUps?: FollowUpMessage[];
  createdAt: string;
};

export type PersonaRequest = {
  type: "persona";
  persona: PersonaId;
  message: string;
  attachments?: Attachment[];
};

export type VerdictRequest = {
  type: "verdict";
  message: string;
  answers: PersonaAnswer[];
};

export type FollowUpRequest = {
  type: "followup";
  persona: PersonaId;
  message: string;
  originalQuestion: string;
  originalAnswers: PersonaAnswer[];
  verdict: string;
  thread: FollowUpMessage[];
  attachments?: Attachment[];
};

export type RespondRequest = PersonaRequest | VerdictRequest | FollowUpRequest;
