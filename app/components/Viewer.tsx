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
import {
  applyMixamoMotionToRig,
  applyMixamoBasePose,
  createMixamoMotionSource,
  disposeMixamoMotionSource,
  type MixamoMotionSource,
} from "../../lib/motion/mixamo";

type ViewerProps = Readonly<{
  meebitId: number;
  motionId: MotionPresetId;
  mixamoFbx?: ArrayBuffer | null;
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

/**
 * 透過モード時に scene.background と clearColor をリセットする。
 * R3F の `<color attach="background">` がアンマウントされても
 * clearColor が残る場合があるため、明示的に制御する。
 */
function TransparentBackground() {
  const { gl, scene } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(0x000000, 0);
  }, [gl, scene]);
  return null;
}

function SceneContent(props: {
  vrm: VRM;
  motionId: MotionPresetId;
  mixamoFbx?: ArrayBuffer | null;
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
    mixamoFbx,
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
  const mixamoRef = useRef<MixamoMotionSource | null>(null);

  useEffect(() => {
    // リグはVRM読み込み時に1回だけ作る（ズーム変更で基準姿勢がズレるのを防ぐ）
    rigRef.current = createVrmMotionRig(vrm);
  }, [vrm]);

  useEffect(() => {
    let cancelled = false;

    // Mixamo以外なら破棄して終了
    if (motionId !== "mixamo" || !mixamoFbx) {
      disposeMixamoMotionSource(mixamoRef.current);
      mixamoRef.current = null;
      return;
    }

    // 既存を破棄して差し替え
    disposeMixamoMotionSource(mixamoRef.current);
    mixamoRef.current = null;

    void createMixamoMotionSource(mixamoFbx).then(
      (src) => {
        if (cancelled) {
          disposeMixamoMotionSource(src);
          return;
        }
        mixamoRef.current = src;
      },
      () => {
        // 失敗してもアプリは落とさない（静止表示のままにする）
        mixamoRef.current = null;
      },
    );

    return () => {
      cancelled = true;
      disposeMixamoMotionSource(mixamoRef.current);
      mixamoRef.current = null;
    };
  }, [motionId, mixamoFbx]);

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

    const proceduralT = clock.getElapsedTime() % 3;
    // Mixamoは「3秒に収めるための強制倍速」はしない。クリップ長で自然にループさせる。
    const mixamoT = clock.getElapsedTime();
    resetVrmMotionRig(rig);
    if (motionId === "mixamo" && mixamoRef.current) {
      // Mixamo前に“脇を閉じる”ベース姿勢を適用（Meebitsの見た目が安定）
      applyMixamoBasePose(rig);
      applyMixamoMotionToRig({
        source: mixamoRef.current,
        rig,
        t: mixamoT,
        strength,
        speed,
      });
    } else {
      applyMotion({ vrm, rig, t: proceduralT, presetId: motionId, strength, speed });
    }

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
            t: motionId === "mixamo" ? mixamoT % 3 : proceduralT,
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

  const isTransparentBg = background === "transparent";
  const bg = useMemo(
    () => (isTransparentBg ? null : new Color(getBackgroundHex(background))),
    [background, isTransparentBg],
  );
  const speechCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // チェッカーボード（透過プレビュー用）
  const checkerStyle = useMemo(
    () =>
      isTransparentBg
        ? ({
            backgroundImage: [
              "linear-gradient(45deg, #d0d0d0 25%, transparent 25%)",
              "linear-gradient(-45deg, #d0d0d0 25%, transparent 25%)",
              "linear-gradient(45deg, transparent 75%, #d0d0d0 75%)",
              "linear-gradient(-45deg, transparent 75%, #d0d0d0 75%)",
            ].join(", "),
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
          } as React.CSSProperties)
        : undefined,
    [isTransparentBg],
  );

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-950"
      style={checkerStyle}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 100 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
      >
        {bg ? <color attach="background" args={[bg]} /> : <TransparentBackground />}
        {/* 顔が暗くならないよう、アンビエント＋正面キー＋フィルの3点で照らす。
            NOTE: 近すぎ/強すぎるとハイライトが強くなり「ピカピカ」するので、少し遠く・少し弱めに。 */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[1.8, 3.8, 4.2]} intensity={4.2} />
        <directionalLight position={[-8.8, 5.6, 4.0]} intensity={1.0} />
        <directionalLight position={[8.8, 3.2, -7.2]} intensity={0.7} />
        {vrm && (
          <SceneContent
            vrm={vrm}
            motionId={motionId}
            mixamoFbx={props.mixamoFbx ?? null}
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

