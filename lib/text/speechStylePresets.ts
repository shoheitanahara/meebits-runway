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
    textColor: "rgba(255,255,255,0.98)",
    frameColor: "#2a3f6e",
    fillColor: "rgba(255,255,255,0.92)",
  },
  {
    id: "popYellow",
    label: "Pop Yellow",
    textColor: "rgba(0,0,0,0.95)",
    frameColor: "#ffe600",
    fillColor: "rgba(255,255,255,0.96)",
  },
  {
    id: "mint",
    label: "Mint",
    textColor: "rgba(0,0,0,0.95)",
    frameColor: "#00d7ff",
    fillColor: "rgba(255,255,255,0.96)",
  },
  {
    id: "mono",
    label: "Mono (Charcoal)",
    textColor: "rgba(255,255,255,0.97)",
    frameColor: "#1a1a1f",
    fillColor: "rgba(255,255,255,0.92)",
  },
] as const;

export function getSpeechStylePreset(id: SpeechStylePresetId): SpeechStylePreset {
  return SPEECH_STYLE_PRESETS.find((p) => p.id === id) ?? SPEECH_STYLE_PRESETS[0];
}

