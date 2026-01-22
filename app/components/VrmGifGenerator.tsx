"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type {
  BackgroundMode,
  CameraFraming,
  CameraPan,
  CameraMode,
  MotionPresetId,
  MotionSpeed,
  MotionStrength,
  SpeechPosition,
  SpeechRenderMode,
  SpeechStylePresetId,
} from "@/types";
import { MOTION_PRESETS } from "@/lib/motion/presets";
import { generateVrmGif, GIF_EXPORT_SPEC } from "@/lib/export/gifExport";
import { BACKGROUND_PRESETS } from "@/lib/background/presets";
import { SPEECH_STYLE_PRESETS } from "@/lib/text/speechStylePresets";

const Viewer = dynamic(() => import("./Viewer").then((m) => m.Viewer), {
  ssr: false,
});

const DEFAULT_MEEBIT_ID = 4274;
const MIN_MEEBIT_ID = 1;
const MAX_MEEBIT_ID = 20000;

const SPEECH_PRESETS = ["Hello", "GM", "Thanks", "Welcome", "LFG", "Nice!"] as const;

function clampMeebitId(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_MEEBIT_ID;
  return Math.min(MAX_MEEBIT_ID, Math.max(MIN_MEEBIT_ID, Math.floor(raw)));
}

function normalizeSpeech(input: string): string {
  return input.replaceAll(/\r?\n/gu, " ").slice(0, 24);
}

function randomIntInclusive(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function VrmGifGenerator() {
  const [meebitIdInput, setMeebitIdInput] = useState(`${DEFAULT_MEEBIT_ID}`);
  const meebitId = useMemo(
    () => clampMeebitId(Number(meebitIdInput)),
    [meebitIdInput],
  );

  const [speechText, setSpeechText] = useState("Hello");
  const [speechPosition, setSpeechPosition] =
    useState<SpeechPosition>("bottomCenter");
  const [speechRenderMode, setSpeechRenderMode] =
    useState<SpeechRenderMode>("bubble");
  const [speechStyleId, setSpeechStyleId] =
    useState<SpeechStylePresetId>("classic");

  const [motionId, setMotionId] = useState<MotionPresetId>("wave");
  const [strength, setStrength] = useState<MotionStrength>(1.0);
  const [speed, setSpeed] = useState<MotionSpeed>(1.0);

  const [background, setBackground] = useState<BackgroundMode>("white");
  const [cameraMode, setCameraMode] = useState<CameraMode>("front");
  const [framing, setFraming] = useState<CameraFraming>("fullBody");
  const [pan, setPan] = useState<CameraPan>("center");

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (gifUrl) URL.revokeObjectURL(gifUrl);
    };
  }, [gifUrl]);

  const handleGenerate = async () => {
    try {
      setErrorMessage(null);
      setIsGenerating(true);
      setProgress(0);

      if (gifUrl) {
        URL.revokeObjectURL(gifUrl);
        setGifUrl(null);
      }

      const blob = await generateVrmGif({
        meebitId,
        speechText,
        speechPosition,
        speechRenderMode,
        speechStyleId,
        motionId,
        strength,
        speed,
        background,
        cameraMode,
        framing,
        pan,
        onProgress: (p) => setProgress(p),
      });

      const url = URL.createObjectURL(blob);
      setGifUrl(url);
      setProgress(100);
    } catch {
      setErrorMessage(
        "Failed to generate the GIF. Please check VRM loading/rendering and try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="w-full">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Meebits GIF
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {GIF_EXPORT_SPEC.durationSec}s / {GIF_EXPORT_SPEC.fps}fps / {GIF_EXPORT_SPEC.size}px
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Left: preview */}
          <div className="flex flex-col gap-3">
            <div className="aspect-square w-full">
              <Viewer
                meebitId={meebitId}
                motionId={motionId}
                strength={strength}
                speed={speed}
                background={background}
                cameraMode={cameraMode}
                framing={framing}
                pan={pan}
                speechText={speechText}
                speechPosition={speechPosition}
                speechRenderMode={speechRenderMode}
                speechStyleId={speechStyleId}
              />
            </div>

            {gifUrl && (
              <div className="rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900/40">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Result</span>
                </div>
                <div className="mt-3 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gifUrl} alt="Generated GIF preview" className="h-full w-full" />
                </div>
                <div className="mt-4 flex">
                  <a
                    className="inline-flex h-11 w-full items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    href={gifUrl}
                    download={`meebits-${meebitId}-3s.gif`}
                  >
                    Download GIF
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Right: controls */}
          <div className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-white/70 p-4 backdrop-blur dark:border-white/10 dark:bg-zinc-900/40">
            <div className="grid grid-cols-1 gap-3">
              <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                Meebits ID ({MIN_MEEBIT_ID}–{MAX_MEEBIT_ID})
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_MEEBIT_ID}
                    max={MAX_MEEBIT_ID}
                    value={meebitIdInput}
                    onChange={(e) => setMeebitIdInput(e.target.value)}
                    disabled={isGenerating}
                    className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setMeebitIdInput(`${randomIntInclusive(MIN_MEEBIT_ID, MAX_MEEBIT_ID)}`)
                    }
                    disabled={isGenerating}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                  >
                    Random
                  </button>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  VRM URL:{" "}
                  <span className="font-mono">{`https://files.meebits.app/vrm/${meebitId}.vrm`}</span>
                </span>
              </label>

              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Speech</div>
                <div className="flex flex-wrap gap-2">
                  {SPEECH_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSpeechText(p)}
                      disabled={isGenerating}
                      className={[
                        "h-9 rounded-full border px-4 text-sm transition-colors disabled:opacity-60",
                        speechText === p
                          ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                          : "border-black/10 bg-white text-zinc-950 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900",
                      ].join(" ")}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={speechText}
                  onChange={(e) => setSpeechText(normalizeSpeech(e.target.value))}
                  maxLength={24}
                  disabled={isGenerating}
                  className="h-10 rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                />

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                    Display
                    <select
                      value={speechRenderMode}
                      onChange={(e) => setSpeechRenderMode(e.target.value as SpeechRenderMode)}
                      disabled={isGenerating}
                      className="h-10 rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                    >
                      <option value="bubble">Bubble</option>
                      <option value="textOnly">Text only</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                    Style
                    <select
                      value={speechStyleId}
                      onChange={(e) => setSpeechStyleId(e.target.value as SpeechStylePresetId)}
                      disabled={isGenerating}
                      className="h-10 rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                    >
                      {SPEECH_STYLE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-sm font-medium">Position</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["topLeft", "TL"],
                        ["topCenter", "TC"],
                        ["topRight", "TR"],
                        ["middleLeft", "ML"],
                        ["middleCenter", "MC"],
                        ["middleRight", "MR"],
                        ["bottomLeft", "BL"],
                        ["bottomCenter", "BC"],
                        ["bottomRight", "BR"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSpeechPosition(value)}
                        disabled={isGenerating}
                        className={[
                          "h-10 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60",
                          speechPosition === value
                            ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                            : "border-black/10 bg-white text-zinc-950 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="text-sm font-medium">Motion</div>
                <select
                  value={motionId}
                  onChange={(e) => setMotionId(e.target.value as MotionPresetId)}
                  disabled={isGenerating}
                  className="h-10 rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                >
                  {MOTION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {p.description}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                    Strength
                    <select
                      value={strength}
                      onChange={(e) => setStrength(Number(e.target.value) as MotionStrength)}
                      disabled={isGenerating}
                      className="h-10 rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                    >
                      <option value={0.5}>0.5</option>
                      <option value={1.0}>1.0</option>
                      <option value={1.5}>1.5</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                    Speed
                    <select
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value) as MotionSpeed)}
                      disabled={isGenerating}
                      className="h-10 rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                    >
                      <option value={0.8}>0.8</option>
                      <option value={1.0}>1.0</option>
                      <option value={1.2}>1.2</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="text-sm font-medium">Scene</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                    Background
                    <select
                      value={background}
                      onChange={(e) => setBackground(e.target.value as BackgroundMode)}
                      disabled={isGenerating}
                      className="h-10 rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                    >
                      {BACKGROUND_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                    Angle
                    <select
                      value={cameraMode}
                      onChange={(e) => setCameraMode(e.target.value as CameraMode)}
                      disabled={isGenerating}
                      className="h-10 rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                    >
                      <option value="front">Front</option>
                      <option value="frontRight">Front-right</option>
                      <option value="frontLeft">Front-left</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                    Zoom
                    <select
                      value={framing}
                      onChange={(e) => setFraming(e.target.value as CameraFraming)}
                      disabled={isGenerating}
                      className="h-10 rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
                    >
                      <option value="fullBody">Full body</option>
                      <option value="waistToHead">Waist to head</option>
                      <option value="face">Close-up</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="text-sm font-medium">Pan</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["left", "Left"],
                      ["center", "Center"],
                      ["right", "Right"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPan(value)}
                      disabled={isGenerating}
                      className={[
                        "h-10 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-60",
                        pan === value
                          ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                          : "border-black/10 bg-white text-zinc-950 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={isGenerating}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {isGenerating ? "Generating..." : "Generate 3s GIF"}
                </button>

                <div className="flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                  <span>Progress</span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-zinc-950 transition-[width] dark:bg-zinc-50"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {errorMessage && (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {errorMessage}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

