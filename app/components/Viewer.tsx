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
  SpeechRenderMode,
  SpeechStylePresetId,
} from "@/types";
import { loadVrmFromMeebitsId } from "@/lib/vrm/loadVrm";
import {
  applyMotion,
  createVrmMotionRig,
  resetVrmMotionRig,
  type VrmMotionRig,
} from "@/lib/motion/applyMotion";
import { VRMUtils, type VRM } from "@pixiv/three-vrm";
import { drawSpeech } from "@/lib/text/drawSpeech";
import { applyVrmCameraPose } from "@/lib/camera/calcCamera";
import { getBackgroundHex } from "@/lib/background/presets";
import { getSpeechStylePreset } from "@/lib/text/speechStylePresets";

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
  speechRenderMode: SpeechRenderMode;
  speechStyleId: SpeechStylePresetId;
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
  speechRenderMode: SpeechRenderMode;
  speechStyleId: SpeechStylePresetId;
}) {
  const {
    vrm,
    motionId,
    strength,
    speed,
    cameraMode,
    framing,
    pan,
    speechCanvasRef,
    speechText,
    speechPosition,
    speechRenderMode,
    speechStyleId,
  } = props;

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
    const target = applyVrmCameraPose({
      vrm,
      camera: perspectiveCamera,
      cameraMode,
      framing,
      pan,
    });
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
      // Canvas は backing store を DPR に合わせつつ、描画座標系は CSS px に揃える。
      // こうすると Preview（可変サイズ）と Result（固定 512px）で、吹き出しの見た目スケールが一致しやすい。
      const cssW = Math.max(1, rect.width);
      const cssH = Math.max(1, rect.height);
      const nextW = Math.max(1, Math.floor(cssW * dpr));
      const nextH = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }

      const ctx = canvas.getContext("2d");
      if (ctx) {
        // まず backing store を基準に完全消去
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 以降の描画は CSS px 座標系（DPR スケール）で行う
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (speechText.trim().length > 0) {
          const style = getSpeechStylePreset(speechStyleId);
          drawSpeech({
            ctx,
            width: cssW,
            height: cssH,
            t,
            text: speechText,
            position: speechPosition,
            renderMode: speechRenderMode,
            textColor: style.textColor,
            bubbleFrameColor: style.frameColor,
            bubbleFillColor: style.fillColor,
          });
        }
      }
    }
  });

  return <primitive object={vrm.scene} />;
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
    speechRenderMode,
    speechStyleId,
  } = props;

  const [vrm, setVrm] = useState<VRM | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let disposed = false;
    let prevVrm: VRM | null = null;
    queueMicrotask(() => {
      if (disposed) return;
      setIsLoading(true);
      setError(null);
      setVrm((current) => {
        prevVrm = current;
        return null;
      });
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
      // Dispose previous VRM to avoid GPU/memory leaks when switching IDs repeatedly.
      if (prevVrm) {
        try {
          VRMUtils.deepDispose(prevVrm.scene);
        } catch {
          // ignore
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (prevVrm as any).dispose?.();
        } catch {
          // ignore
        }
      }
    };
  }, [meebitId]);

  const bg = useMemo(() => new Color(getBackgroundHex(background)), [background]);
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
            speechRenderMode={speechRenderMode}
            speechStyleId={speechStyleId}
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

