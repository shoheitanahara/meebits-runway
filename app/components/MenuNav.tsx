"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type NavItem = Readonly<{
  href: string;
  label: string;
}>;

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Top" },
  { href: "/gif-generator", label: "GIF Generator" },
] as const;

export function MenuNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const activeHref = useMemo(() => {
    const found = NAV_ITEMS.find((x) => x.href === pathname);
    return found?.href ?? null;
  }, [pathname]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-zinc-950 shadow-sm backdrop-blur transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
      >
        Menu
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-950"
        >
          <div className="p-2">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={[
                    "flex h-11 items-center rounded-xl px-3 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                      : "text-zinc-950 hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

