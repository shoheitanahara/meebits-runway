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
import { loadVrmFromMeebitsId } from "@/lib/vrm/loadVrm";
import {
  applyMotion,
  createVrmMotionRig,
  resetVrmMotionRig,
} from "@/lib/motion/applyMotion";
import { drawSpeech } from "@/lib/text/drawSpeech";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { applyVrmCameraPose } from "@/lib/camera/calcCamera";
import { getBackgroundHex } from "@/lib/background/presets";
import { getSpeechStylePreset } from "@/lib/text/speechStylePresets";
import { VRMUtils } from "@pixiv/three-vrm";

const OUTPUT_SIZE = 512;
const FPS = 12;
const DURATION_SEC = 3.0;
const FRAME_COUNT = Math.round(FPS * DURATION_SEC); // 36

type SharedGifRenderer = Readonly<{
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
}>;

let sharedGifRenderer: SharedGifRenderer | null = null;

function getSharedGifRenderer(): SharedGifRenderer {
  if (sharedGifRenderer) return sharedGifRenderer;
  if (typeof document === "undefined") {
    throw new Error("GIF generation is only supported in the browser.");
  }

  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  });

  // Keep output deterministic and lightweight.
  renderer.setPixelRatio(1);

  sharedGifRenderer = { canvas, renderer };
  return sharedGifRenderer;
}

export async function generateVrmGif(params: {
  meebitId: number;
  speechText: string;
  speechPosition: SpeechPosition;
  speechRenderMode: SpeechRenderMode;
  speechStyleId: SpeechStylePresetId;
  motionId: MotionPresetId;
  strength: MotionStrength;
  speed: MotionSpeed;
  background: BackgroundMode;
  cameraMode: CameraMode;
  framing: CameraFraming;
  pan: CameraPan;
  onProgress?: (percent: number) => void;
}): Promise<Blob> {
  const {
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
    onProgress,
  } = params;

  onProgress?.(0);

  const { canvas: glCanvas, renderer } = getSharedGifRenderer();

  let vrm: Awaited<ReturnType<typeof loadVrmFromMeebitsId>> | null = null;
  let rig: ReturnType<typeof createVrmMotionRig> | null = null;
  const scene = new Scene();

  try {
    vrm = await loadVrmFromMeebitsId({ id: meebitId });
    rig = createVrmMotionRig(vrm);
    scene.add(vrm.scene);

    // プレビューと合わせて“明るめ”のライトにする（顔が潰れない）
    scene.add(new AmbientLight(0xffffff, 1.35));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(0, 1.2, 2.2);
    scene.add(key);
    const fill = new DirectionalLight(0xffffff, 1.0);
    fill.position.set(-2.2, 1.4, 1.0);
    scene.add(fill);
    const rim = new DirectionalLight(0xffffff, 0.7);
    rim.position.set(2.2, 0.8, -1.8);
    scene.add(rim);

    const camera = new PerspectiveCamera(30, 1, 0.1, 100);
    applyVrmCameraPose({ vrm, camera, cameraMode, framing, pan });

    renderer.setSize(OUTPUT_SIZE, OUTPUT_SIZE, false);
    renderer.setClearColor(new Color(getBackgroundHex(background)), 1);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = OUTPUT_SIZE;
    outCanvas.height = OUTPUT_SIZE;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) throw new Error("2D canvas init failed.");

    const gif = GIFEncoder();
    const delayMs = Math.round(1000 / FPS);
    const dt = DURATION_SEC / FRAME_COUNT;
    const style = getSpeechStylePreset(speechStyleId);

    for (let i = 0; i < FRAME_COUNT; i += 1) {
      const t = i * dt;

      resetVrmMotionRig(rig);
      applyMotion({ vrm, rig, t, presetId: motionId, strength, speed });
      try {
        vrm.update(dt);
      } catch {
        // ignore
      }

      renderer.render(scene, camera);

      // 合成順：
      // 1) VRMモデル（WebGL）
      // 2) 吹き出し（前面）
      outCtx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      outCtx.drawImage(glCanvas, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      drawSpeech({
        ctx: outCtx,
        width: OUTPUT_SIZE,
        height: OUTPUT_SIZE,
        t,
        text: speechText,
        position: speechPosition,
        renderMode: speechRenderMode,
        textColor: style.textColor,
        bubbleFrameColor: style.frameColor,
        bubbleFillColor: style.fillColor,
      });

      const imageData = outCtx.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      // ImageData.data は Uint8ClampedArray なので、gifenc 用に Uint8Array として扱う
      const rgba = new Uint8Array(
        imageData.data.buffer,
        imageData.data.byteOffset,
        imageData.data.byteLength,
      );
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);

      gif.writeFrame(index, OUTPUT_SIZE, OUTPUT_SIZE, {
        palette,
        delay: delayMs,
        repeat: i === 0 ? 0 : undefined, // 0 = infinite loop
      });

      onProgress?.(Math.round(((i + 1) / FRAME_COUNT) * 100));

      // UIが固まりにくいように、時々イベントループへ制御を返す
      if (i % 2 === 1) {
        await new Promise<void>((r) => setTimeout(() => r(), 0));
      }
    }

    gif.finish();
    const bytes = gif.bytes();
    // BlobPart 型の都合で SharedArrayBuffer を避けるため、ArrayBuffer ベースにコピーする
    const safeBytes = new Uint8Array(bytes.byteLength);
    safeBytes.set(bytes);
    return new Blob([safeBytes], { type: "image/gif" });
  } finally {
    // Avoid WebGL resource leaks (critical for repeated generations).
    try {
      renderer.renderLists?.dispose();
      renderer.resetState();
    } catch {
      // ignore
    }

    if (vrm) {
      try {
        scene.remove(vrm.scene);
      } catch {
        // ignore
      }
      try {
        // Dispose meshes/materials/textures created by this VRM load.
        VRMUtils.deepDispose(vrm.scene);
      } catch {
        // ignore
      }
      try {
        // If available, dispose VRM internal resources.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vrm as any).dispose?.();
      } catch {
        // ignore
      }
    }
  }
}

export const GIF_EXPORT_SPEC = {
  size: OUTPUT_SIZE,
  fps: FPS,
  durationSec: DURATION_SEC,
  frameCount: FRAME_COUNT,
} as const;

