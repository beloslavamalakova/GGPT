"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CloseIcon, HistoryIcon, PaperclipIcon, PlusIcon, SendIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PERSONA_ORDER, PERSONAS, STARTER_PROMPTS } from "@/lib/personas";
import type { Attachment, Conversation, FollowUpMessage, PersonaAnswer, PersonaId, RespondRequest } from "@/lib/types";

const STORAGE_KEY = "ggpt-conversations-v1";
const WELCOME_KEY = "ggpt-welcome-seen-v1";
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "text/markdown"]);
type LoadingStage = PersonaId | "verdict" | null;

function displayText(content: string) {
  return content.replace(/\*\*/g, "");
}

function recentThreadContext(messages: FollowUpMessage[]) {
  const context: FollowUpMessage[] = [];
  let totalCharacters = 0;

  for (let index = messages.length - 1; index >= 0 && context.length < 60; index -= 1) {
    const message = messages[index];
    if (totalCharacters + message.content.length > 50000) break;
    context.unshift(message);
    totalCharacters += message.content.length;
  }

  return context;
}

function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve({ name: file.name, mimeType: file.type || "text/plain", data: result.split(",")[1] || "", size: file.size });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function requestResponse(body: RespondRequest) {
  const response = await fetch("/api/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { content?: string; error?: string };
  if (!response.ok || !data.content) throw new Error(data.error || "No response received.");
  return data.content;
}

async function requestInterjection(body: Extract<RespondRequest, { type: "interjection" }>) {
  const response = await fetch("/api/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as { content?: string | null; error?: string };
  if (!response.ok) throw new Error(data.error || "No response received.");
  return data.content || null;
}

function LoadingBubble({ personaId }: { personaId: PersonaId }) {
  const persona = PERSONAS[personaId];
  return (
    <div className="flex animate-fade-up gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-sm ${persona.avatarClass}`}>{persona.emoji}</span>
      <div>
        <div className="mb-1.5 flex items-center gap-2"><span className="text-xs font-black">{persona.name}</span><span className="text-[11px] text-black/35 dark:text-white/35">is typing...</span></div>
        <div className={`flex w-20 items-center gap-1.5 rounded-2xl rounded-tl-md px-4 py-4 ${persona.bubbleClass}`}>
          {[0, 1, 2].map((dot) => <span key={dot} className="h-2 w-2 animate-soft-pulse rounded-full bg-current" style={{ animationDelay: `${dot * 180}ms` }} />)}
        </div>
      </div>
    </div>
  );
}

function PersonaBubble({ answer, onFollowUp, showFollowUp = false, replyToPersona }: { answer: PersonaAnswer; onFollowUp?: (persona: PersonaId) => void; showFollowUp?: boolean; replyToPersona?: PersonaId }) {
  const persona = PERSONAS[answer.persona];
  return (
    <div className="flex animate-fade-up gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-sm ${persona.avatarClass}`}>{persona.emoji}</span>
      <div className="max-w-[calc(100%-3.25rem)] sm:max-w-[82%]">
        <div className="mb-1.5 flex items-center gap-2"><span className="text-xs font-black">{persona.name}</span><span className="text-[11px] text-black/35 dark:text-white/35">{replyToPersona ? `replying to ${PERSONAS[replyToPersona].name}` : persona.tagline}</span></div>
        <div className={`whitespace-pre-wrap rounded-2xl rounded-tl-md px-4 py-3.5 text-[15px] leading-6 shadow-sm ${persona.bubbleClass}`}>{displayText(answer.content)}</div>
        {showFollowUp && <button type="button" onClick={() => onFollowUp?.(answer.persona)} className="mt-2 rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-black/55 transition hover:border-grape/30 hover:text-grape dark:border-white/10 dark:text-white/55 dark:hover:text-[#bda5ff]">Ask {persona.name} a follow-up</button>}
      </div>
    </div>
  );
}

function VerdictCard({ verdict, loading }: { verdict?: string; loading?: boolean }) {
  return (
    <div className="animate-fade-up overflow-hidden rounded-3xl border border-grape/20 bg-gradient-to-br from-[#f6a9c5] via-grape to-[#c74f81] p-[1px] shadow-glow">
      <div className="rounded-[calc(1.5rem-1px)] bg-gradient-to-br from-[#eb7caa] to-[#bd4777] p-5 text-white sm:p-6">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-white/20 text-base">🎀</span><p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">GGPT Verdict</p></div>
        {loading ? <div className="mt-5 space-y-2.5"><div className="h-3 w-full animate-pulse rounded-full bg-white/20" /><div className="h-3 w-5/6 animate-pulse rounded-full bg-white/20" /><div className="h-3 w-2/3 animate-pulse rounded-full bg-white/20" /></div> : <div className="mt-4 whitespace-pre-wrap text-[15px] font-medium leading-7 text-white/95">{displayText(verdict || "")}</div>}
      </div>
    </div>
  );
}

function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#3e1f2d]/55 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="relative my-6 w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/70 bg-[#fff8fa] shadow-[0_30px_100px_rgba(93,37,62,0.3)] dark:border-white/10 dark:bg-[#2d1b24]">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#ffc5d9] blur-3xl dark:bg-grape/20" />
        <div className="relative max-h-[85dvh] overflow-y-auto p-6 scrollbar-thin sm:p-9">
          <button type="button" onClick={onClose} className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-black/5 text-black/45 transition hover:bg-black/10 hover:text-black dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15" aria-label="Close welcome message"><CloseIcon className="h-4 w-4" /></button>

          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#ffc3d8] to-grape text-3xl shadow-glow">🎀</div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-grape">Welcome to your digital group chat</p>
          <h1 id="welcome-title" className="mt-2 pr-10 text-3xl font-black tracking-[-0.045em] text-ink dark:text-white sm:text-4xl">Meet GGPT <span className="text-grape">(GossipGPT)</span></h1>

          <div className="mt-5 space-y-4 text-[15px] leading-7 text-black/65 dark:text-white/65">
            <p>GGPT is your AI-powered girls&apos; group chat, designed for those moments when you need advice, reassurance, or a reality check, but your friends are asleep, busy, or simply not around.</p>
            <p>Instead of receiving one AI response, you talk to a curated group of AI besties, each with a distinct personality and perspective:</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {PERSONA_ORDER.map((id) => {
              const persona = PERSONAS[id];
              const descriptions = {
                bestie: "Blunt honesty. She tells you what you need to hear, not what you want to hear.",
                therapist: "The grounded friend who notices the bigger picture and somehow says the sane thing.",
                delulu: "Validates your hopes and helps you explore the optimistic side without ignoring reality.",
              };
              return <div key={id} className="rounded-2xl border border-grape/15 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5"><span className={`grid h-9 w-9 place-items-center rounded-full ${persona.avatarClass}`}>{persona.emoji}</span><p className="mt-3 text-sm font-black">{persona.name}</p><p className="mt-1 text-xs leading-5 text-black/50 dark:text-white/50">{descriptions[id]}</p></div>;
            })}
          </div>

          <p className="mt-5 text-[15px] leading-7 text-black/65 dark:text-white/65">Whether you&apos;re overthinking a text at 2 a.m., navigating a situationship, sharing everyday drama, or simply missing female perspectives in your social circle, GGPT is an always-available, judgment-free digital friend group.</p>

          <div className="mt-5 rounded-2xl border border-grape/20 bg-lilac/70 p-4 text-sm leading-6 text-[#69344c] dark:bg-[#4a2938] dark:text-[#ffeaf2]">
            <p className="font-black">Demo version</p>
            <p className="mt-1 opacity-75">This MVP supports relationship, friendship, study, and life questions plus screenshots, images, PDFs, and text files. Voice notes and persona customization are part of the product vision but are not available in this demo. AI advice can be wrong, so use your judgment for high-stakes decisions.</p>
          </div>

          <button type="button" onClick={onClose} className="mt-6 w-full rounded-2xl bg-grape px-6 py-4 font-black text-white shadow-glow transition hover:-translate-y-0.5 hover:bg-[#d8588c]">Enter the group chat 🎀</button>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ conversations, selectedId, onSelect, onNew, onClose }: { conversations: Conversation[]; selectedId: string | null; onSelect: (conversation: Conversation) => void; onNew: () => void; onClose?: () => void }) {
  return (
    <aside className="flex h-full flex-col bg-[#f3eee7] p-4 dark:bg-[#19161d]">
      <div className="flex items-center justify-between px-1 pb-4"><Logo /><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/5 lg:hidden" aria-label="Close history"><CloseIcon /></button></div>
      <button type="button" onClick={() => { onNew(); onClose?.(); }} className="flex items-center justify-center gap-2 rounded-2xl bg-grape px-4 py-3 font-bold text-white transition hover:bg-[#d8588c]"><PlusIcon /> New question</button>
      <div className="mt-6 flex-1 overflow-y-auto scrollbar-thin"><p className="px-2 text-[11px] font-black uppercase tracking-[0.16em] text-black/35 dark:text-white/35">Recent verdicts</p><div className="mt-2 space-y-1">
        {conversations.length === 0 && <p className="px-2 py-5 text-sm leading-6 text-black/40 dark:text-white/40">Your chats will stay on this device.</p>}
        {conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => { onSelect(conversation); onClose?.(); }} className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedId === conversation.id ? "bg-white shadow-sm dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5"}`}><p className="truncate text-sm font-bold">{conversation.question}</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">{new Date(conversation.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p></button>)}
      </div></div>
      <p className="px-2 pt-4 text-xs leading-5 text-black/35 dark:text-white/30">Private by default. History is stored only in this browser.</p>
    </aside>
  );
}

export function ChatApp() {
  const searchParams = useSearchParams();
  const [input, setInput] = useState(searchParams.get("prompt") || "");
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<PersonaAnswer[]>([]);
  const [verdict, setVerdict] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpMessage[]>([]);
  const [activePersona, setActivePersona] = useState<PersonaId | null>(null);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoading = loadingStage !== null;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setHistory(JSON.parse(stored) as Conversation[]);
      if (!localStorage.getItem(WELCOME_KEY)) setWelcomeOpen(true);
    } catch { localStorage.removeItem(STORAGE_KEY); }
  }, []);

  function closeWelcome() {
    localStorage.setItem(WELCOME_KEY, "true");
    setWelcomeOpen(false);
  }

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [answers, followUps, loadingStage, verdict, error]);

  function persistHistory(conversations: Conversation[]) {
    setHistory(conversations);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }

  function newChat() {
    if (isLoading) return;
    setQuestion(""); setAnswers([]); setVerdict(""); setAttachments([]); setFollowUps([]); setActivePersona(null); setError(""); setSelectedId(null); setInput("");
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function selectConversation(conversation: Conversation) {
    if (isLoading) return;
    const savedFollowUps = conversation.followUps || [];
    const lastUserFollowUp = savedFollowUps.slice().reverse().find((message) => message.role === "user");
    setQuestion(conversation.question); setAnswers(conversation.answers); setVerdict(conversation.verdict); setAttachments([]); setFollowUps(savedFollowUps); setActivePersona(lastUserFollowUp?.persona || null); setSelectedId(conversation.id); setError("");
  }

  async function addAttachments(files: FileList | null) {
    if (!files) return;
    setError("");
    const nextFiles = Array.from(files);
    const normalized = nextFiles.map((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!file.type && extension === "md") return new File([file], file.name, { type: "text/markdown" });
      return file;
    });
    if (attachments.length + normalized.length > 3) {
      setError("You can attach up to 3 files.");
      return;
    }
    if (normalized.some((file) => !ALLOWED_FILE_TYPES.has(file.type))) {
      setError("Use PNG, JPEG, WebP, PDF, TXT, or Markdown files.");
      return;
    }
    if (attachments.reduce((total, file) => total + file.size, 0) + normalized.reduce((total, file) => total + file.size, 0) > MAX_ATTACHMENT_BYTES) {
      setError("Attachments must be 8 MB or less in total.");
      return;
    }
    try {
      setAttachments([...attachments, ...(await Promise.all(normalized.map(readFileAsAttachment)))]);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "A file could not be read.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function startFollowUp(persona: PersonaId) {
    if (isLoading) return;
    setActivePersona(persona);
    setError("");
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function saveFollowUps(nextFollowUps: FollowUpMessage[]) {
    setFollowUps(nextFollowUps);
    if (!selectedId) return;
    const nextHistory = history.map((conversation) =>
      conversation.id === selectedId ? { ...conversation, followUps: nextFollowUps } : conversation,
    );
    persistHistory(nextHistory);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isLoading) return;

    if (question) {
      const targetPersona = activePersona || followUps.at(-1)?.persona;
      if (!targetPersona) {
        setError(`Choose ${PERSONA_ORDER.map((id) => PERSONAS[id].name).join(", ")} before sending a follow-up.`);
        return;
      }

      const originalAnswer = answers.find((answer) => answer.persona === targetPersona);
      if (!question || !originalAnswer) {
        setError(`This conversation no longer has enough context to ask ${PERSONAS[targetPersona].name}. Reopen it from history and try again.`);
        return;
      }

      setActivePersona(targetPersona);
      const userMessage: FollowUpMessage = { id: crypto.randomUUID(), persona: targetPersona, role: "user", content: message };
      const pendingFollowUps = [...followUps, userMessage];
      setInput("");
      setFollowUps(pendingFollowUps);
      setError("");
      setLoadingStage(targetPersona);

      try {
        const content = await requestResponse({
          type: "followup",
          persona: targetPersona,
          message,
          originalQuestion: question,
          originalAnswers: answers,
          verdict,
          thread: recentThreadContext(followUps),
          attachments,
        });
        const assistantMessage: FollowUpMessage = { id: crypto.randomUUID(), persona: targetPersona, role: "assistant", content };
        const answeredFollowUps = [...pendingFollowUps, assistantMessage];
        saveFollowUps(answeredFollowUps);
        setAttachments([]);

        const interjectionOrder = targetPersona === "bestie"
          ? ["delulu", "therapist"] as PersonaId[]
          : targetPersona === "delulu"
            ? ["bestie", "therapist"] as PersonaId[]
            : ["bestie", "delulu"] as PersonaId[];

        try {
          for (const persona of interjectionOrder) {
            setLoadingStage(persona);
            const interjection = await requestInterjection({
              type: "interjection",
              persona,
              replyToPersona: targetPersona,
              message,
              originalQuestion: question,
              originalAnswers: answers,
              verdict,
              thread: recentThreadContext(answeredFollowUps),
            });
            if (interjection) {
              const interjectionMessage: FollowUpMessage = {
                id: crypto.randomUUID(),
                persona,
                role: "assistant",
                content: interjection,
                replyToMessageId: assistantMessage.id,
                replyToPersona: targetPersona,
              };
              saveFollowUps([...answeredFollowUps, interjectionMessage]);
              break;
            }
          }
        } catch (interjectionError) {
          console.error("Persona interjection error:", interjectionError);
        }
      } catch (requestError) {
        setFollowUps(followUps);
        setInput(message);
        setError(requestError instanceof Error ? requestError.message : "Something went wrong.");
      } finally {
        setLoadingStage(null);
      }
      return;
    }

    setInput(""); setQuestion(message); setAnswers([]); setVerdict(""); setFollowUps([]); setActivePersona(null); setError(""); setSelectedId(null);
    const nextAnswers: PersonaAnswer[] = [];

    try {
      for (const persona of PERSONA_ORDER) {
        setLoadingStage(persona);
        const content = await requestResponse({ type: "persona", persona, message, attachments });
        const answer = { persona, content };
        nextAnswers.push(answer);
        setAnswers([...nextAnswers]);
      }

      setLoadingStage("verdict");
      const finalVerdict = await requestResponse({ type: "verdict", message, answers: nextAnswers });
      setVerdict(finalVerdict);
      const conversation: Conversation = { id: crypto.randomUUID(), question: message, answers: nextAnswers, verdict: finalVerdict, followUps: [], createdAt: new Date().toISOString() };
      persistHistory([conversation, ...history].slice(0, 30));
      setSelectedId(conversation.id);
      setAttachments([]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong.");
    } finally {
      setLoadingStage(null);
    }
  }

  return (
    <main className="flex h-dvh overflow-hidden bg-cream text-ink dark:bg-[#21141b] dark:text-white">
      {welcomeOpen && <WelcomeModal onClose={closeWelcome} />}
      <div className="hidden w-72 shrink-0 border-r border-black/5 dark:border-white/5 lg:block"><HistoryPanel conversations={history} selectedId={selectedId} onSelect={selectConversation} onNew={newChat} /></div>
      {historyOpen && <div className="fixed inset-0 z-50 lg:hidden"><button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} aria-label="Close history" /><div className="relative h-full w-[84%] max-w-xs shadow-2xl"><HistoryPanel conversations={history} selectedId={selectedId} onSelect={selectConversation} onNew={newChat} onClose={() => setHistoryOpen(false)} /></div></div>}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-grape/10 bg-cream/85 px-4 backdrop-blur-xl dark:border-white/5 dark:bg-[#21141b]/85 sm:px-6">
          <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setHistoryOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-grape/15 bg-white/70 lg:hidden dark:border-white/10 dark:bg-white/5" aria-label="Open history"><HistoryIcon /></button><div className="min-w-0"><p className="text-sm font-black">The bestie group 🎀</p><div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-grape" /><p className="truncate text-[11px] text-black/40 dark:text-white/40">Bestie, The One With Her Life Together & Delulu</p></div></div></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => setWelcomeOpen(true)} className="grid h-10 w-10 place-items-center rounded-full border border-grape/15 bg-white/70 text-sm font-black text-grape transition hover:bg-white" aria-label="About GossipGPT">?</button><button type="button" onClick={newChat} disabled={isLoading} className="hidden items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-bold disabled:opacity-40 dark:border-white/10 dark:bg-white/5 sm:flex"><PlusIcon className="h-4 w-4" /> New</button><ThemeToggle /></div>
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="scrollbar-thin h-full overflow-y-auto px-4 pb-36 pt-6 sm:px-8">
            <div className="mx-auto max-w-3xl">
              {!question ? <div className="flex min-h-[calc(100dvh-15rem)] flex-col items-center justify-center py-8 text-center"><div className="mb-2 text-3xl" aria-hidden="true">🎀</div><div className="mb-5 flex -space-x-2">{PERSONA_ORDER.map((id) => <span key={id} className={`grid h-12 w-12 place-items-center rounded-full border-4 border-cream shadow-md dark:border-[#21141b] ${PERSONAS[id].avatarClass}`}>{PERSONAS[id].emoji}</span>)}</div><h1 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Okay, tell us everything.</h1><p className="mt-3 max-w-md leading-7 text-black/50 dark:text-white/50">Dating confusion, friendship drama, life decisions, study spirals. The group is listening.</p><div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">{STARTER_PROMPTS.slice(0, 4).map((prompt) => <button key={prompt} type="button" onClick={() => { setInput(prompt); textareaRef.current?.focus(); }} className="rounded-2xl border border-black/10 bg-white/60 p-4 text-left text-sm font-semibold leading-5 transition hover:-translate-y-0.5 hover:border-grape/30 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">{prompt}</button>)}</div></div> : <div className="space-y-6 pb-4"><div className="flex justify-end"><div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-3.5 text-[15px] leading-6 text-white shadow-bubble dark:bg-white dark:text-ink sm:max-w-[76%]">{question}</div></div>{answers.map((answer) => <PersonaBubble key={answer.persona} answer={answer} onFollowUp={startFollowUp} showFollowUp={Boolean(verdict) && !isLoading} />)}{loadingStage && loadingStage !== "verdict" && !activePersona && <LoadingBubble personaId={loadingStage} />}{(loadingStage === "verdict" || verdict) && <VerdictCard verdict={verdict} loading={loadingStage === "verdict"} />}{followUps.map((message) => message.role === "user" ? <div key={message.id} className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-br-md bg-ink px-4 py-3.5 text-[15px] leading-6 text-white dark:bg-white dark:text-ink sm:max-w-[76%]"><p className="mb-1 text-[10px] font-black uppercase tracking-wider opacity-55">To {PERSONAS[message.persona].name}</p><p className="whitespace-pre-wrap">{message.content}</p></div></div> : <PersonaBubble key={message.id} answer={{ persona: message.persona, content: message.content }} replyToPersona={message.replyToPersona} onFollowUp={startFollowUp} showFollowUp={!isLoading} />)}{loadingStage && activePersona && loadingStage !== "verdict" && <LoadingBubble personaId={loadingStage} />}{error && <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}</div>}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-cream via-cream/95 to-transparent px-4 pb-4 pt-10 dark:from-[#21141b] dark:via-[#21141b]/95 sm:px-8 sm:pb-6">
            {question && verdict && !activePersona && <div className="pointer-events-auto mx-auto mb-2 flex max-w-3xl items-center gap-2 overflow-x-auto rounded-2xl border border-grape/20 bg-white/95 p-2 shadow-sm dark:border-white/10 dark:bg-[#33202a]/95"><span className="shrink-0 px-2 text-xs font-bold text-black/45 dark:text-white/45">Refer to other bestie:</span>{PERSONA_ORDER.map((personaId) => <button key={personaId} type="button" onClick={() => startFollowUp(personaId)} className="shrink-0 rounded-full border border-grape/20 bg-[#fff3f7] px-3 py-1.5 text-xs font-bold transition hover:border-grape hover:text-grape dark:border-white/10 dark:bg-white/5 dark:hover:text-[#ff9fc4]">{PERSONAS[personaId].emoji} {PERSONAS[personaId].name}</button>)}</div>}
            {activePersona && <div className="pointer-events-auto mx-auto mb-2 flex max-w-3xl items-center justify-between rounded-2xl border border-grape/25 bg-lilac px-4 py-2 text-sm text-[#6c304b] shadow-sm dark:bg-[#4a2938] dark:text-[#ffeaf2]"><span className="font-bold">{PERSONAS[activePersona].emoji} Asking {PERSONAS[activePersona].name} only</span><button type="button" onClick={() => { setActivePersona(null); setInput(""); }} disabled={isLoading} className="rounded-full px-2 py-1 text-xs font-bold opacity-60 hover:bg-black/5 hover:opacity-100 disabled:opacity-30 dark:hover:bg-white/10">Refer to other bestie</button></div>}
            {attachments.length > 0 && <div className="pointer-events-auto mx-auto mb-2 flex max-w-3xl gap-2 overflow-x-auto pb-1 scrollbar-thin">{attachments.map((attachment, index) => <div key={`${attachment.name}-${index}`} className="relative flex h-16 min-w-36 max-w-48 items-center gap-2 overflow-hidden rounded-2xl border border-black/10 bg-white p-2 pr-8 shadow-sm dark:border-white/10 dark:bg-[#211d26]">{attachment.mimeType.startsWith("image/") ? <div className="h-12 w-12 shrink-0 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(data:${attachment.mimeType};base64,${attachment.data})` }} /> : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lilac text-xs font-black text-grape dark:bg-grape/25 dark:text-[#c9b5ff]">{attachment.mimeType === "application/pdf" ? "PDF" : "TXT"}</div>}<div className="min-w-0"><p className="truncate text-xs font-bold">{attachment.name}</p><p className="mt-1 text-[10px] text-black/40 dark:text-white/40">{(attachment.size / 1024).toFixed(0)} KB</p></div><button type="button" onClick={() => setAttachments(attachments.filter((_, attachmentIndex) => attachmentIndex !== index))} disabled={isLoading} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/5 text-black/50 hover:bg-black/10 disabled:opacity-30 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15" aria-label={`Remove ${attachment.name}`}><CloseIcon className="h-3.5 w-3.5" /></button></div>)}</div>}
            <form onSubmit={submit} className="pointer-events-auto mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-black/10 bg-white p-2 shadow-[0_15px_50px_rgba(30,20,45,0.14)] focus-within:border-grape/40 dark:border-white/10 dark:bg-[#211d26]">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown,.md" multiple className="hidden" onChange={(event) => void addAttachments(event.target.files)} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading || attachments.length >= 3} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-black/45 transition hover:bg-black/5 hover:text-grape disabled:cursor-not-allowed disabled:opacity-25 dark:text-white/45 dark:hover:bg-white/5 dark:hover:text-[#c8b4ff]" aria-label="Attach screenshot or file"><PaperclipIcon /></button>
              <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value.slice(0, 4000))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} placeholder={isLoading ? `${activePersona ? PERSONAS[activePersona].name : "The group"} is replying...` : activePersona ? `Ask ${PERSONAS[activePersona].name} more...` : question ? "Refer to a bestie to continue..." : "Ask the group..."} disabled={isLoading} className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 outline-none placeholder:text-black/30 disabled:cursor-not-allowed dark:placeholder:text-white/30" aria-label={activePersona ? `Follow up with ${PERSONAS[activePersona].name}` : question ? "Refer to a bestie before continuing" : "Your question"} />
              <button type="submit" disabled={!input.trim() || isLoading} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-grape text-white transition hover:bg-[#d8588c] disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/25 dark:disabled:bg-white/10 dark:disabled:text-white/25" aria-label="Send question"><SendIcon /></button>
            </form>
            <p className="mt-2 text-center text-[10px] text-black/30 dark:text-white/25">PNG, JPEG, WebP, PDF, TXT or MD. 3 files, 8 MB total. Files are not saved in history.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
