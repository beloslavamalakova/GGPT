import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PERSONA_ORDER, PERSONAS, STARTER_PROMPTS } from "@/lib/personas";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-cream dark:bg-[#21141b]">
      <div className="dot-grid absolute inset-0 opacity-70" />
      <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#ffc9dd]/80 blur-3xl dark:bg-grape/20" />
      <div className="absolute -right-20 top-80 h-80 w-80 rounded-full bg-[#ffe0ea]/90 blur-3xl dark:bg-[#9d456a]/15" />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/chat" className="hidden rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-ink sm:block">
            Open chat
          </Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 md:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-grape/20 bg-white/70 px-4 py-2 text-sm font-bold text-grape backdrop-blur dark:bg-white/5 dark:text-[#ffafd0]">
            <span aria-hidden="true">🎀</span> Your group chat has thoughts
          </div>
          <h1 className="max-w-3xl text-5xl font-black leading-[0.98] tracking-[-0.06em] text-ink dark:text-white sm:text-6xl md:text-7xl">
            Three takes.<br /><span className="text-grape dark:text-[#ff9fc4]">One verdict.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-black/60 dark:text-white/60 sm:text-xl">
            Ask the thing you have already overthought. Get honesty, emotional intelligence, and a little useful delusion.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/chat" className="group inline-flex items-center justify-center gap-3 rounded-2xl bg-grape px-7 py-4 font-bold text-white shadow-glow transition hover:-translate-y-1 hover:bg-[#d9588d]">
              Ask the group <ArrowIcon className="h-5 w-5 transition group-hover:translate-x-1" />
            </Link>
            <span className="flex items-center justify-center px-4 text-sm text-black/45 dark:text-white/40">No account. No judgment.</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute -inset-5 -rotate-3 rounded-[2rem] bg-[#ffc9dc]/60 dark:bg-grape/10" />
          <div className="relative rounded-[2rem] border border-black/10 bg-white/90 p-4 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-[#1b1820]/95 sm:p-6">
            <div className="flex items-center justify-between border-b border-black/5 pb-4 dark:border-white/10">
              <div>
                <p className="font-extrabold">The bestie group 🎀</p>
                <p className="text-xs text-[#c55080] dark:text-[#ff9fc4]">3 besties online</p>
              </div>
              <div className="flex -space-x-2">
                {PERSONA_ORDER.map((id) => <span key={id} className={`grid h-9 w-9 place-items-center rounded-full border-2 border-white text-sm dark:border-[#1b1820] ${PERSONAS[id].avatarClass}`}>{PERSONAS[id].emoji}</span>)}
              </div>
            </div>
            <div className="space-y-4 py-5">
              <div className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-ink px-4 py-3 text-sm leading-6 text-white dark:bg-white dark:text-ink">He watched my story but hasn&apos;t replied in two days...</div>
              {PERSONA_ORDER.map((id, index) => {
                const persona = PERSONAS[id];
                const samples = ["Bestie, the story view is not a communication plan.", "One data point is ambiguous. The pattern is what matters.", "Okay, but maybe he is drafting the perfect reply in Notes..."];
                return <div key={id} className="flex gap-3" style={{ animationDelay: `${index * 120}ms` }}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm ${persona.avatarClass}`}>{persona.emoji}</span><div><p className="mb-1 text-xs font-bold text-black/45 dark:text-white/40">{persona.name}</p><div className={`rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-6 ${persona.bubbleClass}`}>{samples[index]}</div></div></div>;
              })}
            </div>
            <div className="rounded-2xl border border-white/30 bg-gradient-to-br from-[#eb7caa] to-[#c84f82] p-4 text-white shadow-lg">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">GGPT Verdict</p>
              <p className="mt-2 text-sm font-medium leading-6">Stop reading digital crumbs. Send one clear message, then let his effort answer the question.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="mb-5 flex items-end justify-between"><div><p className="text-sm font-black uppercase tracking-[0.16em] text-grape dark:text-[#ff9fc4]">Need an opener? 🎀</p><h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Start with the messy part.</h2></div></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {STARTER_PROMPTS.map((prompt) => <Link key={prompt} href={`/chat?prompt=${encodeURIComponent(prompt)}`} className="group flex items-center justify-between gap-5 rounded-2xl border border-black/10 bg-white/70 p-5 font-semibold leading-6 backdrop-blur transition hover:-translate-y-1 hover:border-grape/30 hover:shadow-bubble dark:border-white/10 dark:bg-white/5 dark:hover:border-grape/50"><span>{prompt}</span><ArrowIcon className="h-5 w-5 shrink-0 text-grape transition group-hover:translate-x-1" /></Link>)}
        </div>
      </section>
    </main>
  );
}
