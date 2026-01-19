import Image from "next/image";

type HeroProps = Readonly<{
  title: string;
  tagline: string;
  description: string;
}>;

export function Hero(props: HeroProps) {
  const { title, tagline, description } = props;

  return (
    <section
      className="relative isolate w-full overflow-hidden rounded-3xl border border-black/10 bg-black shadow-sm dark:border-white/10"
      aria-label="Hero"
    >
      {/* SPでも「横長」を維持するため、固定アスペクト比で表示する */}
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: "16 / 9" }}
      >
        <Image
          src="/images/firstview.png"
          alt="Meebits Runway first view"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 960px"
          className="object-cover object-center"
        />

        {/* Readability overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.22),transparent_45%),radial-gradient(circle_at_70%_30%,rgba(236,72,153,0.18),transparent_40%)]" />

        <div className="absolute inset-0 flex items-end">
          <div className="w-full p-6 sm:p-10">
            <div className="max-w-2xl">
              <p className="inline-flex items-center rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
                {tagline}
              </p>

              <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                {title}
              </h1>

              <p className="mt-3 max-w-xl text-pretty text-sm leading-6 text-white/85 sm:text-base">
                {description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

