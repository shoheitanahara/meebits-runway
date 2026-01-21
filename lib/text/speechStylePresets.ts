import type { SpeechStylePresetId } from "@/types";

export type SpeechStylePreset = Readonly<{
  id: SpeechStylePresetId;
  label: string;
  textColor: string;
  frameColor: string;
  fillColor: string;
}>;

/**
 * Presets intentionally pair "text + frame" to satisfy pop-art styling needs
 * while staying readable against various backgrounds.
 */
export const SPEECH_STYLE_PRESETS: readonly SpeechStylePreset[] = [
  {
    id: "classic",
    label: "Classic (Black/White)",
    textColor: "rgba(0,0,0,0.95)",
    frameColor: "rgba(0,0,0,0.98)",
    fillColor: "rgba(255,255,255,0.96)",
  },
  {
    id: "inverse",
    label: "Inverse (White/Ink)",
    textColor: "rgba(255,255,255,0.97)",
    frameColor: "rgba(255,255,255,0.98)",
    fillColor: "rgba(20,20,26,0.92)",
  },
  {
    id: "newPunk",
    label: "New Punk (Blue)",
    // Prefer "frame color = text color" for clarity and easy styling.
    textColor: "#2a3f6e",
    frameColor: "#2a3f6e",
    fillColor: "rgba(255,255,255,0.96)",
  },
  {
    id: "popYellow",
    label: "Pop Yellow",
    // Prefer "frame color = text color" for clarity and easy styling.
    textColor: "#111114",
    frameColor: "#111114",
    // Make the bubble itself "yellow" while keeping text readable.
    fillColor: "rgba(255, 230, 0, 0.96)",
  },
  {
    id: "mint",
    label: "Mint",
    // Prefer "frame color = text color" for clarity and easy styling.
    textColor: "#006a7c",
    frameColor: "#006a7c",
    fillColor: "rgba(255,255,255,0.96)",
  },
  {
    id: "electricCyan",
    label: "Electric Cyan",
    // Prefer "frame color = text color" for clarity and easy styling.
    textColor: "#00a9c9",
    frameColor: "#00a9c9",
    fillColor: "rgba(255,255,255,0.96)",
  },
  {
    id: "hotMagenta",
    label: "Hot Magenta",
    // Prefer "frame color = text color" for clarity and easy styling.
    textColor: "#d1007a",
    frameColor: "#d1007a",
    fillColor: "rgba(255,255,255,0.96)",
  },
  {
    id: "popCoral",
    label: "Pop Coral",
    // Prefer "frame color = text color" for clarity and easy styling.
    textColor: "#c43a22",
    frameColor: "#c43a22",
    fillColor: "rgba(255,255,255,0.96)",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    // Prefer "frame color = text color" for clarity and easy styling.
    textColor: "#1a1a1f",
    frameColor: "#1a1a1f",
    fillColor: "rgba(255,255,255,0.96)",
  },
] as const;

export function getSpeechStylePreset(id: SpeechStylePresetId): SpeechStylePreset {
  return SPEECH_STYLE_PRESETS.find((p) => p.id === id) ?? SPEECH_STYLE_PRESETS[0];
}

