import { MeebitRunway } from "./components/MeebitRunway";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-14 sm:px-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Meebits Runway by Shawn T. Art</h1>
          <p className="max-w-lg text-sm leading-6">
            Meebits are art.
          </p>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Pick any Meebit you want and send them down the runway—this is your
            street-lit fashion show.
          </p>
        </header>

        <MeebitRunway />

        <footer className="text-sm bg-gray-900/50 py-5 backdrop-blur-sm text-zinc-600 dark:text-zinc-400 text-center">
          <p>
            <a href="https://x.com/shawn_t_art" target="_blank" rel="noopener noreferrer">
              @shawn_t_art 
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
