# GossipGPT

GossipGPT is a mobile-first AI friend-group chat. A user asks one question and gets four sequential Gemini responses: Bestie, Therapist, Delulu Bestie, and a final GGPT Verdict that synthesizes all three perspectives.

## MVP architecture

- **Next.js App Router + TypeScript** for the frontend and backend in one deployable project.
- **Tailwind CSS** for the responsive UI and class-based dark mode.
- **Gemini REST API** through a server-only route at `POST /api/respond`.
- **Browser localStorage** for up to 30 completed conversations and the selected theme.
- **Sequential client orchestration** so each persona appears as soon as its request completes, followed by the verdict request.
- **Shared follow-up memory** that lets the user switch between Bestie, Therapist, and Delulu Bestie while every adviser can see the full labeled conversation.
- **Multimodal context** from screenshots, images, PDFs, text, or Markdown files sent inline to Gemini.

The API key never reaches the browser. Conversation history stays in the current browser, but submitted questions and generated persona answers are sent to Google Gemini to produce responses.

## Requirements

- Node.js 18.18 or newer
- npm
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Set `GEMINI_API_KEY` in `.env.local`.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

If Next.js reports a missing generated chunk or route file, stop the server and run:

```bash
npm run clean
npm run dev
```

Development artifacts use `.next-dev`, while production builds use `.next`, so running `npm run build` no longer invalidates an active development cache.

## Validation commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Project structure

```text
app/
  api/respond/route.ts   Gemini backend endpoint
  chat/page.tsx          Chat route
  page.tsx               Landing page
components/
  chat-app.tsx           Chat flow, loading states, history
  theme-toggle.tsx       Persistent dark mode
lib/
  gemini.ts              Server-side Gemini client
  personas.ts            Persona and verdict system prompts
  types.ts               Shared request and conversation types
```

## API behavior

The chat calls the same backend route four times:

1. `Bestie` with the user's question.
2. `Therapist` with the user's question.
3. `Delulu Bestie` with the user's question.
4. `GGPT Verdict` with the question and all three generated answers.

After the verdict, each persona bubble has an **Ask a follow-up** action. Follow-ups call only the selected persona, use one Gemini request per message, and are saved with the conversation in local storage. Every follow-up request includes the original question, all three initial answers, the verdict, and the shared labeled transcript, so switching advisers preserves context.

The composer accepts up to three PNG, JPEG, WebP, PDF, TXT, or Markdown files with an 8 MB combined limit. Attachments are sent to every initial persona and to focused follow-ups in the current session. File bytes are deliberately not saved in browser history, so reopening an older conversation restores its messages but not its attachments.

Requests are intentionally sequential to support the group-chat reveal. This produces a polished demo flow but has higher total latency than parallel persona requests.

## Current scope

This MVP intentionally has no authentication, payments, social features, voice, image analysis, multi-user rooms, analytics, or server-side long-term memory.

## Gemini free tier

The default is `gemini-3.1-flash-lite`, which currently offers free-tier text input and output with rate limits. Free-tier content may be used by Google to improve its products. Availability and quotas can vary by region and account.

- [Gemini API quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
- [Gemini API pricing and free tier](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Gemini document processing](https://ai.google.dev/gemini-api/docs/document-processing)
