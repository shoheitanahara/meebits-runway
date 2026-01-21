import { VrmGifGenerator } from "../components/VrmGifGenerator";
import Link from "next/link";

export default function GifGeneratorPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pb-14 pt-24 sm:px-10">
        <section
          aria-label="GIF Generator Hero"
          className="relative isolate overflow-hidden rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-900/30 sm:p-10"
        >
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(0,215,255,0.18),transparent_45%),radial-gradient(circle_at_70%_30%,rgba(255,47,179,0.14),transparent_45%),radial-gradient(circle_at_40%_80%,rgba(255,230,0,0.12),transparent_50%)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/15 to-transparent dark:from-black/35 dark:via-black/10" />
          </div>

          <div className="max-w-2xl">
            <p className="inline-flex items-center rounded-full border border-black/10 bg-white/60 px-3 py-1 text-xs font-medium text-zinc-800 backdrop-blur dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-100">
              Meebits are art.
            </p>

            <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
              Make Meebits. Make it shareable.
            </h1>

            <p className="mt-3 max-w-xl text-pretty text-sm leading-6 text-zinc-700 dark:text-zinc-300 sm:text-base">
              Meebits 3D files are a pain to use. Now they’re Web2‑shareable in seconds.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="#generator"
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
              >
                Start generating
              </a>
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white/70 px-5 text-sm font-semibold text-zinc-950 backdrop-blur transition-colors hover:bg-white dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-50 dark:hover:bg-zinc-950"
              >
                Back to Runway
              </Link>
            </div>
          </div>
        </section>

        <section id="generator" className="scroll-mt-24">
          <VrmGifGenerator />
        </section>
      </main>
    </div>
  );
}

