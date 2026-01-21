"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Color, type PerspectiveCamera, Vector3 } from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BackgroundMode,
  CameraFraming,
  CameraPan,
  CameraMode,
  MotionPresetId,
  MotionSpeed,
  MotionStrength,
  SpeechPosition,
} from "@/types";
import { loadVrmFromMeebitsId } from "@/lib/vrm/loadVrm";
import {
  applyMotion,
  createVrmMotionRig,
  resetVrmMotionRig,
  type VrmMotionRig,
} from "@/lib/motion/applyMotion";
import type { VRM } from "@pixiv/three-vrm";
import { drawSpeech } from "@/lib/text/drawSpeech";
import { applyVrmCameraPose } from "@/lib/camera/calcCamera";

type ViewerProps = Readonly<{
  meebitId: number;
  motionId: MotionPresetId;
  strength: MotionStrength;
  speed: MotionSpeed;
  background: BackgroundMode;
  cameraMode: CameraMode;
  framing: CameraFraming;
  pan: CameraPan;
  speechText: string;
  speechPosition: SpeechPosition;
}>;

function SceneContent(props: {
  vrm: VRM;
  motionId: MotionPresetId;
  strength: MotionStrength;
  speed: MotionSpeed;
  cameraMode: CameraMode;
  framing: CameraFraming;
  pan: CameraPan;
  speechCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  speechText: string;
  speechPosition: SpeechPosition;
}) {
  const { vrm, motionId, strength, speed, cameraMode, framing, pan, speechCanvasRef, speechText, speechPosition } = props;

  const { camera } = useThree();
  const perspectiveCamera = camera as PerspectiveCamera;
  const rigRef = useRef<VrmMotionRig | null>(null);
  const lookAtRef = useRef<Vector3>(new Vector3(0, 1, 0));

  useEffect(() => {
    // リグはVRM読み込み時に1回だけ作る（ズーム変更で基準姿勢がズレるのを防ぐ）
    rigRef.current = createVrmMotionRig(vrm);
  }, [vrm]);

  useEffect(() => {
    // カメラは共通ロジックで計算（プレビュー/書き出しで一致させる）
    // NOTE: cameraMode は一旦 front 固定（UIで3-4を外す）
    void cameraMode;
    const target = applyVrmCameraPose({ vrm, camera: perspectiveCamera, framing, pan });
    lookAtRef.current.copy(target);
  }, [vrm, perspectiveCamera, cameraMode, framing, pan]);

  useFrame(({ clock }, delta) => {
    const rig = rigRef.current;
    if (!rig) return;

    const t = clock.getElapsedTime() % 3;
    resetVrmMotionRig(rig);
    applyMotion({ vrm, rig, t, presetId: motionId, strength, speed });

    // three-vrmの更新（表情/物理等）
    try {
      vrm.update(delta);
    } catch {
      // ignore
    }

    perspectiveCamera.lookAt(lookAtRef.current);

    // セリフ（ピクセル吹き出し）をWebGLの上に描く
    const canvas = speechCanvasRef.current;
    if (canvas) {
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio ?? 1));
      const rect = canvas.getBoundingClientRect();
      const nextW = Math.max(1, Math.floor(rect.width * dpr));
      const nextH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (speechText.trim().length > 0) {
          drawSpeech({
            ctx,
            width: canvas.width,
            height: canvas.height,
            t,
            text: speechText,
            position: speechPosition,
          });
        }
      }
    }
  });

  return <primitive object={vrm.scene} />;
}

function backgroundToColor(mode: BackgroundMode): Color {
  return mode === "dark" ? new Color("#0a0a0a") : new Color("#ffffff");
}

export function Viewer(props: ViewerProps) {
  const {
    meebitId,
    motionId,
    strength,
    speed,
    background,
    cameraMode,
    framing,
    pan,
    speechText,
    speechPosition,
  } = props;

  const [vrm, setVrm] = useState<VRM | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      setIsLoading(true);
      setError(null);
      setVrm(null);
    });

    void loadVrmFromMeebitsId({ id: meebitId }).then(
      (loaded) => {
        if (disposed) return;
        setVrm(loaded);
        setIsLoading(false);
      },
      () => {
        if (disposed) return;
        setError("VRMの読み込みに失敗しました。IDを確認してください。");
        setIsLoading(false);
      },
    );

    return () => {
      disposed = true;
      // NOTE: VRM/threeのdisposeは重い&型も複雑なので最小実装では省略。
      // 必要なら後で `VRMUtils.deepDispose` 等の導入で改善できる。
    };
  }, [meebitId]);

  const bg = useMemo(() => backgroundToColor(background), [background]);
  const speechCanvasRef = useRef<HTMLCanvasElement | null>(null);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-950">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 100 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={[bg]} />
        {/* 顔が暗くならないよう、アンビエント＋正面キー＋フィルの3点で明るめに */}
        <ambientLight intensity={1.35} />
        <directionalLight position={[0, 1.2, 2.2]} intensity={2.2} />
        <directionalLight position={[-2.2, 1.4, 1.0]} intensity={1.0} />
        <directionalLight position={[2.2, 0.8, -1.8]} intensity={0.7} />
        {vrm && (
          <SceneContent
            vrm={vrm}
            motionId={motionId}
            strength={strength}
            speed={speed}
            cameraMode={cameraMode}
            framing={framing}
            pan={pan}
            speechCanvasRef={speechCanvasRef}
            speechText={speechText}
            speechPosition={speechPosition}
          />
        )}
      </Canvas>

      {/* 吹き出し（前面） */}
      <canvas
        ref={speechCanvasRef}
        className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      />

      {/* ロード/エラー表示 */}
      {(isLoading || error) && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <div className="rounded-xl bg-black/70 px-4 py-3 text-sm text-white backdrop-blur">
            {error ?? "Loading VRM..."}
          </div>
        </div>
      )}

    </div>
  );
}

