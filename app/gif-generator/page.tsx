import { VrmGifGenerator } from "../components/VrmGifGenerator";

export default function GifGeneratorPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-14 sm:px-10">
        <VrmGifGenerator />
      </main>
    </div>
  );
}

