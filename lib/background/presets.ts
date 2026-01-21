import type { BackgroundMode } from "@/types";

export type BackgroundPreset = Readonly<{
  id: BackgroundMode;
  label: string;
  hex: `#${string}`;
}>;

/**
 * Calm, art-forward palette (used for both preview and GIF export).
 * Keep saturation moderate to avoid overpowering pixel-art shading.
 */
export const BACKGROUND_PRESETS = [
  { id: "white", label: "White", hex: "#ffffff" },
  { id: "dark", label: "Dark", hex: "#0a0a0a" },

  // Blues
  { id: "newPunkBlue", label: "New Punk Blue", hex: "#2a3f6e" },
  { id: "midnightNavy", label: "Midnight Navy", hex: "#0f1b2d" },
  { id: "deepIndigo", label: "Deep Indigo", hex: "#1b2140" },
  { id: "slateBlue", label: "Slate Blue", hex: "#3b4a63" },
  { id: "smokeBlue", label: "Smoke Blue", hex: "#5a6f86" },

  // Pop accents (for pop-art vibes)
  { id: "popYellow", label: "Pop Yellow", hex: "#ffe600" },
  { id: "lemonYellow", label: "Lemon Yellow", hex: "#fff06a" },
  { id: "sunflower", label: "Sunflower", hex: "#ffcc33" },
  { id: "electricCyan", label: "Electric Cyan", hex: "#00d7ff" },
  { id: "hotMagenta", label: "Hot Magenta", hex: "#ff2fb3" },
  { id: "popCoral", label: "Pop Coral", hex: "#ff6b4a" },

  // Greens
  { id: "stormTeal", label: "Storm Teal", hex: "#1b4a4c" },
  { id: "petrolGreen", label: "Petrol Green", hex: "#123c3a" },
  { id: "sage", label: "Sage", hex: "#7d8d7a" },
  { id: "moss", label: "Moss", hex: "#556a55" },
  { id: "oliveDrab", label: "Olive Drab", hex: "#4c4a2b" },

  // Warm neutrals
  { id: "warmSand", label: "Warm Sand", hex: "#d6c6a8" },
  { id: "paperBeige", label: "Paper Beige", hex: "#f1eadf" },
  { id: "clay", label: "Clay", hex: "#b08a77" },
  { id: "terracottaDust", label: "Terracotta Dust", hex: "#8f5f4d" },

  // Purples / pinks
  { id: "dustyRose", label: "Dusty Rose", hex: "#b58a93" },
  { id: "mauve", label: "Mauve", hex: "#7f6377" },
  { id: "plumInk", label: "Plum Ink", hex: "#2c1f2b" },

  // Grays
  { id: "charcoal", label: "Charcoal", hex: "#1a1a1f" },
] as const satisfies readonly BackgroundPreset[];

export function getBackgroundHex(mode: BackgroundMode): `#${string}` {
  const preset = BACKGROUND_PRESETS.find((p) => p.id === mode);
  return preset?.hex ?? "#ffffff";
}

