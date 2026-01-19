import { MeebitRunway } from "./components/MeebitRunway";
import { Hero } from "./components/Hero";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-14 sm:px-10">
        <Hero
          title="Meebits Runway by Shawn T. Art"
          tagline="Meebits are art."
          description="Pick any Meebit you want and send them down the runway—this is your street-lit fashion show."
        />

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
