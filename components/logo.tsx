import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-ink dark:text-white" aria-label="GossipGPT home">
      <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/70 bg-gradient-to-br from-[#ffc3d8] to-[#e56f9f] text-xl shadow-lg shadow-grape/20">
        🎀
      </span>
      {!compact && <span className="text-xl font-black tracking-[-0.04em]">GossipGPT<span className="text-grape">.</span></span>}
    </Link>
  );
}
