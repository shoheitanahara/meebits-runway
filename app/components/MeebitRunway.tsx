"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SpriteSheetConfig = Readonly<{
  columns: number;
  rows: number;
  /**
   * 0-based index. ユーザー要件: 4行目を使う = rowIndex 3
   */
  rowIndex: number;
}>;

type RunwayConfig = Readonly<{
  /**
   * 表示上のキャラサイズ(px)。ドット絵なので整数推奨。
   */
  characterSize: number;
  /**
   * 横移動速度(px/秒)
   */
  pixelsPerSecond: number;
  /**
   * アニメFPS
   */
  fps: number;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDevicePixelRatio(): number {
  // iOSなどで極端に高いDPRだと重くなるので適度に制限
  return clamp(window.devicePixelRatio ?? 1, 1, 2);
}

function resizeCanvasToContainer(canvas: HTMLCanvasElement): {
  width: number;
  height: number;
  dpr: number;
} {
  const container = canvas.parentElement;
  if (!container) {
    return { width: canvas.width, height: canvas.height, dpr: 1 };
  }

  const rect = container.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.floor(rect.width));
  const cssHeight = Math.max(1, Math.floor(rect.height));
  const dpr = getDevicePixelRatio();

  const nextWidth = Math.floor(cssWidth * dpr);
  const nextHeight = Math.floor(cssHeight * dpr);

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }

  return { width: nextWidth, height: nextHeight, dpr };
}

type RunwayGeometry = Readonly<{
  topY: number;
  bottomY: number;
  topHalf: number;
  bottomHalf: number;
  centerX: number;
}>;

function getRunwayGeometry(width: number, height: number): RunwayGeometry {
  return {
    topY: height * 0.42,
    bottomY: height * 0.98,
    topHalf: width * 0.12,
    bottomHalf: width * 0.42,
    centerX: width * 0.5,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function pseudoRandom01(seed: number): number {
  // 0..1 の簡易疑似乱数（決定的、軽量）
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function drawStreetRunway(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  topY: number;
  bottomY: number;
  topHalf: number;
  bottomHalf: number;
  centerX: number;
}): void {
  const {
    ctx,
    width,
    height,
    topY,
    bottomY,
    topHalf,
    bottomHalf,
    centerX,
  } = params;

  ctx.save();
  // 台形でクリップ
  ctx.beginPath();
  ctx.moveTo(centerX - topHalf, topY);
  ctx.lineTo(centerX + topHalf, topY);
  ctx.lineTo(centerX + bottomHalf, bottomY);
  ctx.lineTo(centerX - bottomHalf, bottomY);
  ctx.closePath();
  ctx.clip();

  // アスファルトっぽい地面
  const asphalt = ctx.createLinearGradient(0, topY, 0, bottomY);
  asphalt.addColorStop(0, "#0a0f15");
  asphalt.addColorStop(0.55, "#070a0e");
  asphalt.addColorStop(1, "#040406");
  ctx.fillStyle = asphalt;
  ctx.fillRect(0, topY, width, bottomY - topY);

  // 遠近グリッド（ストリート感）
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(180,255,240,0.14)";
  ctx.lineWidth = Math.max(1, Math.floor(width * 0.0012));
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const y = lerp(bottomY, topY, t);
    const half = lerp(bottomHalf, topHalf, t);
    ctx.beginPath();
    ctx.moveTo(centerX - half, y);
    ctx.lineTo(centerX + half, y);
    ctx.stroke();
  }
  for (let i = -8; i <= 8; i += 1) {
    const x0 = centerX + (i / 8) * bottomHalf;
    const x1 = centerX + (i / 8) * topHalf;
    ctx.beginPath();
    ctx.moveTo(x0, bottomY);
    ctx.lineTo(x1, topY);
    ctx.stroke();
  }
  ctx.restore();

  // ネオンのサイドレール（固定：ゆらぎ無し）
  ctx.save();
  ctx.strokeStyle = "rgba(0, 255, 210, 0.34)";
  ctx.lineWidth = Math.max(2, Math.floor(width * 0.004));
  ctx.shadowColor = "rgba(0,255,210,0.35)";
  ctx.shadowBlur = Math.max(10, width * 0.03);
  ctx.beginPath();
  ctx.moveTo(centerX - topHalf, topY);
  ctx.lineTo(centerX - bottomHalf, bottomY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centerX + topHalf, topY);
  ctx.lineTo(centerX + bottomHalf, bottomY);
  ctx.stroke();
  ctx.restore();

  // センターライン（LED風）
  ctx.save();
  ctx.strokeStyle = "rgba(0, 255, 210, 0.34)";
  ctx.lineWidth = Math.max(1, Math.floor(width * 0.002));
  ctx.setLineDash([Math.max(10, width * 0.02), Math.max(14, width * 0.03)]);
  ctx.beginPath();
  ctx.moveTo(centerX, topY + (bottomY - topY) * 0.02);
  ctx.lineTo(centerX, bottomY);
  ctx.stroke();
  ctx.restore();

  // ランウェイ上のロゴ（ネオン風）
  // 本格的な遠近ワープは重いので、軽量に「縦を潰す」ことでパースっぽく見せる
  ctx.save();
  const logoY = bottomY - (bottomY - topY) * 0.14;
  const logoScaleX = 1.35;
  const logoScaleY = 0.55;

  ctx.translate(centerX, logoY);
  ctx.scale(logoScaleX, logoScaleY);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const fontSize = Math.max(22, Math.floor(width * 0.06));
  ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial`;

  // Glow
  ctx.shadowColor = "rgba(0,255,210,0.55)";
  ctx.shadowBlur = Math.max(10, width * 0.03);
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  // Outline
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(0,255,210,0.85)";
  ctx.lineWidth = Math.max(6, Math.floor(fontSize * 0.16));
  ctx.strokeText("MEEBITS", 0, 0);

  // Inner glow
  ctx.shadowColor = "rgba(255,80,210,0.35)";
  ctx.shadowBlur = Math.max(6, width * 0.02);
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("MEEBITS", 0, 0);

  ctx.restore();

  ctx.restore();
}

function drawLightShow(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  topY: number;
  bottomY: number;
  timeMs: number;
}): void {
  const { ctx, width, height, topY, bottomY, timeMs } = params;

  // 固定ライト（ゆらぎ無し）
  const beam = (x: number, strength: number, tint: string) => {
    const g = ctx.createRadialGradient(
      x,
      topY - height * 0.05,
      10,
      x,
      topY - height * 0.05,
      height * 1.1,
    );
    g.addColorStop(0, `rgba(${tint}, ${0.22 * strength})`);
    g.addColorStop(0.22, `rgba(${tint}, ${0.10 * strength})`);
    g.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, bottomY);
  };

  ctx.save();
  beam(width * 0.38, 1.0, "255,255,255");
  beam(width * 0.68, 0.85, "120,220,255");
  ctx.restore();

  // レンズボケ（固定配置）
  ctx.save();
  ctx.globalAlpha = 0.65;
  for (let i = 0; i < 10; i += 1) {
    const r = lerp(width * 0.01, width * 0.035, pseudoRandom01(i * 31.7));
    const x = width * lerp(0.1, 0.9, pseudoRandom01(i * 91.2 + 2));
    const y = height * lerp(0.06, 0.28, pseudoRandom01(i * 71.9 + 3));
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, "rgba(255,120,220,0.15)");
    g.addColorStop(1, "rgba(255,120,220,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // カメラフラッシュ（散発的）
  // 状態を持たず、時間バケットごとに「発生するか」を決める（決定的で軽量）
  const bucketMs = 650; // 小さいほど頻度が増える（ms）
  const bucket = Math.floor(timeMs / bucketMs);
  const bucketT = (timeMs % bucketMs) / bucketMs; // 0..1

  const chance = 0.62; // 1バケットあたりの発生確率（要望：もっと多く）
  const flashSeed = bucket * 131.7;
  const willFlash = pseudoRandom01(flashSeed) < chance;
  if (willFlash) {
    // バケット内のどのタイミングで光るか（0.08..0.92）
    const center = lerp(0.08, 0.92, pseudoRandom01(flashSeed + 2.1));
    const duration = 0.14; // 閃光の幅（バケット比）
    const distance = Math.abs(bucketT - center);
    const pulse = clamp(1 - distance / duration, 0, 1);
    const intensity = pulse * pulse; // キレよく発光→減衰

    // たまに「手前フラッシュ」で画面全体が白く被る
    const frontFlashRatio = 0.28;
    const isFrontFlash = pseudoRandom01(flashSeed + 9.9) < frontFlashRatio;

    ctx.save();
    // フラッシュは“加算っぽく”見せる（白被りを強く）
    ctx.globalCompositeOperation = "screen";

    if (isFrontFlash) {
      // 画面全体を覆う白フラッシュ
      ctx.globalAlpha = 0.98 * intensity;
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fillRect(0, 0, width, height);

      // ランウェイ方向の反射（さらに強め）
      ctx.globalAlpha = 0.45 * intensity;
      const reflect = ctx.createLinearGradient(0, topY, 0, bottomY);
      reflect.addColorStop(0, "rgba(255,255,255,0)");
      reflect.addColorStop(0.35, "rgba(255,255,255,0.35)");
      reflect.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = reflect;
      ctx.fillRect(0, topY, width, bottomY - topY);
    } else {
      // 観客席の点フラッシュ
      const isLeft = pseudoRandom01(flashSeed + 9.3) < 0.5;
      const x =
        width * (isLeft ? 0.22 : 0.78) +
        (pseudoRandom01(flashSeed + 5.5) - 0.5) * width * 0.10;
      const y = height * lerp(0.14, 0.36, pseudoRandom01(flashSeed + 6.6));

      ctx.globalAlpha = 0.95 * intensity;
      const r = width * 0.09;
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // 反射（ランウェイ方向へ薄く落とす）
      ctx.globalAlpha = 0.28 * intensity;
      const reflect = ctx.createLinearGradient(0, topY, 0, bottomY);
      reflect.addColorStop(0, "rgba(255,255,255,0)");
      reflect.addColorStop(0.35, "rgba(255,255,255,0.22)");
      reflect.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = reflect;
      ctx.fillRect(0, topY, width, bottomY - topY);
    }

    ctx.restore();
  }

  // ビネット（中心に視線誘導）
  ctx.save();
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.6,
    height * 0.1,
    width * 0.5,
    height * 0.6,
    height * 0.9,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

const DEFAULT_MEEBIT_ID = 4274;
const MIN_MEEBIT_ID = 1;
const MAX_MEEBIT_ID = 20000;

// UIでは調整しない固定値（必要なら後で再度UIに戻せるように定数化）
const DEFAULT_FPS = 6;
const DEFAULT_SPEED = 60; // px/s
const DEFAULT_NEAR_SCALE = 2.0;

// Meebits切替時の暗転演出
const BLACKOUT_FADE_MS = 360;
const BLACKOUT_HOLD_MS = 10;

function buildSpriteUrl(meebitId: number): string {
  // デフォルトIDはローカルのスプライトを優先（開発体験が良い）
  if (meebitId === DEFAULT_MEEBIT_ID) return "/images/4274.png";
  return `https://files.meebits.app/sprites/${meebitId}.png`;
}

function parseMeebitIds(input: string): number[] {
  // カンマ/空白/改行区切りに対応
  const tokens = input
    .split(/[\s,]+/u)
    .map((t) => t.trim())
    .filter(Boolean);

  const ids: number[] = [];
  for (const token of tokens) {
    const maybe = Number(token);
    if (!Number.isFinite(maybe)) continue;
    const id = Math.floor(maybe);
    if (id < MIN_MEEBIT_ID || id > MAX_MEEBIT_ID) continue;
    ids.push(id);
  }
  return ids;
}

function drawRunwayBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
): void {
  const { topY, bottomY, topHalf, bottomHalf, centerX } = getRunwayGeometry(
    width,
    height,
  );

  // 背景（ナイトシティの空気感）
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#020205");
  sky.addColorStop(0.55, "#05070b");
  sky.addColorStop(1, "#030305");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // 霞（スモーク/ヘイズっぽい）
  ctx.save();
  ctx.globalAlpha = 0.28;
  const haze = ctx.createRadialGradient(
    centerX,
    topY,
    height * 0.05,
    centerX,
    topY,
    height * 0.9,
  );
  haze.addColorStop(0, "rgba(120,220,255,0.14)");
  haze.addColorStop(0.35, "rgba(255,80,210,0.06)");
  haze.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // ランウェイ（ストリート＆ネオン）
  drawStreetRunway({
    ctx,
    width,
    height,
    topY,
    bottomY,
    topHalf,
    bottomHalf,
    centerX,
  });

  // ライト演出（スポット/スイープ/ボケ/ビネット）
  drawLightShow({ ctx, width, height, topY, bottomY, timeMs });
}

function drawSpriteFrame(params: {
  ctx: CanvasRenderingContext2D;
  sprite: HTMLImageElement;
  frameIndex: number;
  rowIndex: number;
  columns: number;
  rows: number;
  dx: number;
  dy: number;
  dSize: number;
}): void {
  const { ctx, sprite, frameIndex, rowIndex, columns, rows, dx, dy, dSize } =
    params;

  const frameWidth = sprite.width / columns;
  const frameHeight = sprite.height / rows;

  const safeRowIndex = clamp(rowIndex, 0, rows - 1);
  const safeFrameIndex = ((frameIndex % columns) + columns) % columns;

  const sx = safeFrameIndex * frameWidth;
  const sy = safeRowIndex * frameHeight;

  // ピクセルアートなのでスムージングを切る（くっきり表示）
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sprite,
    sx,
    sy,
    frameWidth,
    frameHeight,
    dx,
    dy,
    dSize,
    dSize,
  );
}

export function MeebitRunway() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef<number>(0);
  const blackoutTimeoutsRef = useRef<number[]>([]);

  // React stateはUI用。毎フレーム更新しない（パフォーマンスのため）
  const [isPlaying, setIsPlaying] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioAutoplayBlocked, setAudioAutoplayBlocked] = useState(false);
  const [isBlackout, setIsBlackout] = useState(false);

  // 入力されたIDを順番に表示する（ランウェイを歩き切るたびに次のIDへ）
  const [lineupInput, setLineupInput] = useState(`${DEFAULT_MEEBIT_ID}`);
  const [meebitIds, setMeebitIds] = useState<number[]>([DEFAULT_MEEBIT_ID]);
  const [currentMeebitIndex, setCurrentMeebitIndex] = useState(0);

  const currentMeebitId = meebitIds[currentMeebitIndex] ?? DEFAULT_MEEBIT_ID;
  const currentSpriteSrc = buildSpriteUrl(currentMeebitId);

  const spriteConfig: SpriteSheetConfig = useMemo(
    () => ({
      columns: 8,
      rows: 8,
      rowIndex: 3, // 4行目（0-based）
    }),
    [],
  );

  const runwayConfig: RunwayConfig = useMemo(
    () => ({
      characterSize: 160, // 80pxを2倍にして見栄え良く
      pixelsPerSecond: DEFAULT_SPEED,
      fps: DEFAULT_FPS,
    }),
    [],
  );

  useEffect(() => {
    // unmount時にタイマーを掃除
    return () => {
      for (const id of blackoutTimeoutsRef.current) {
        window.clearTimeout(id);
      }
      blackoutTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = 0.8;
    audio.loop = true;
    audio.preload = "auto";

    if (!isPlaying) {
      audio.pause();
      return;
    }

    // 自動再生は環境によってブロックされるので、失敗時はUIで案内する
    void audio.play().then(
      () => setAudioAutoplayBlocked(false),
      () => setAudioAutoplayBlocked(true),
    );
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    const sprite = new Image();
    sprite.src = currentSpriteSrc;

    const stop = () => {
      if (animationFrameIdRef.current != null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      lastTimestampRef.current = null;
      accumulatedMsRef.current = 0;
    };

    const scheduleBlackoutToNextMeebit = () => {
      // すでに暗転中なら重複トリガーしない
      setIsBlackout((prev) => {
        if (prev) return prev;
        return true;
      });

      // フェードイン完了後に次のMeebitへ切替
      blackoutTimeoutsRef.current.push(
        window.setTimeout(() => {
          setCurrentMeebitIndex((prev) => (prev + 1) % meebitIds.length);
        }, BLACKOUT_FADE_MS),
      );

      // 切替後にフェードアウト
      blackoutTimeoutsRef.current.push(
        window.setTimeout(() => {
          setIsBlackout(false);
        }, BLACKOUT_FADE_MS + BLACKOUT_HOLD_MS),
      );
    };

    const start = (ctx: CanvasRenderingContext2D) => {
      // アニメーション状態（refのみで保持）
      // 1) walk_in: 4行目(=row 3)で奥→手前へ歩く
      // 2) pose_front: 手前到達で 4行目8列目(=col 7) を出して少し停止
      // 3) walk_out: 2行目(=row 1)で手前→奥へ戻りつつフェードアウト
      type AnimationPhase = "walk_in" | "pose_front" | "walk_out";

      let phase: AnimationPhase = "walk_in";
      let holdRemainingMs = 0;

      let y = 0;
      let swayPhase = 0; // わずかな左右の揺れ用
      let frameIndex = 0;

      const stepMs = 1000 / Math.max(1, runwayConfig.fps);
      const holdMs = 2100; // 手前での停止時間（ms）

      const WALK_IN_ROW_INDEX = 3; // 4行目
      const POSE_ROW_INDEX = 3; // 4行目
      const POSE_FRAME_INDEX = 7; // 8列目（0-based）
      const WALK_OUT_ROW_INDEX = 1; // 2行目

      const tick = (timestampMs: number) => {
        if (disposed) return;

        const { width, height, dpr } = resizeCanvasToContainer(canvas);
        drawRunwayBackground(ctx, width, height, timestampMs);

        const { topY, bottomY, centerX } = getRunwayGeometry(width, height);
        if (y === 0) {
          // 初回だけスタート位置を確定（トップの少し下）
          y = topY + 10 * dpr;
        }

        // 時間更新
        const last = lastTimestampRef.current ?? timestampMs;
        const deltaMs = timestampMs - last;
        lastTimestampRef.current = timestampMs;
        accumulatedMsRef.current += deltaMs;

        // 速度：px/s を ms に変換
        const pxPerMs = runwayConfig.pixelsPerSecond / 1000;

        // アニメ進行（移動）
        if (phase === "walk_in") {
          // CanvasはDPR分だけピクセルが増えるので、CSS px/s を canvas px/s に合わせる
          y += pxPerMs * deltaMs * dpr;
        } else if (phase === "pose_front") {
          holdRemainingMs -= deltaMs;
          if (holdRemainingMs <= 0) {
            phase = "walk_out";
          }
        } else if (phase === "walk_out") {
          // 奥へ戻る（少しだけ速くしてテンポ良く）
          y -= pxPerMs * deltaMs * dpr * 1.1;
        }

        swayPhase += deltaMs * 0.008; // 見た目の自然さ（過度に揺れない程度）

        // フレーム更新（fps固定）
        if (phase === "pose_front") {
          frameIndex = POSE_FRAME_INDEX;
          accumulatedMsRef.current = 0;
        } else {
          while (accumulatedMsRef.current >= stepMs) {
            frameIndex = (frameIndex + 1) % spriteConfig.columns;
            accumulatedMsRef.current -= stepMs;
          }
        }

        // 遠近（奥→手前に向かうほど大きく）
        const t = clamp((y - topY) / Math.max(1, bottomY - topY), 0, 1);
        const farScale = 0.45;
        const scale = lerp(farScale, DEFAULT_NEAR_SCALE, t);
        const dSize = runwayConfig.characterSize * scale * dpr;

        // 中央線上を歩く：左右の揺れを少しだけ足す
        // 停止中（手前でポーズ）は揺れゼロにして違和感を減らす
        const sway = phase === "pose_front" ? 0 : Math.sin(swayPhase) * 2 * dpr;
        const dx = centerX - dSize / 2 + sway;
        // 足元をyに合わせる（キャラの下端を進行位置に）
        const dy = y - dSize;

        // フェードアウト（walk_outの「退場直前」だけ透明に）
        // t: top=0 / bottom=1。walk_out では 1→0 に向かう。
        const fadeOutStartT = 0.22; // 0〜1のうち、奥に近づいた最後の区間だけ消す
        const alpha =
          phase === "walk_out"
            ? t > fadeOutStartT
              ? 1
              : clamp(t / Math.max(0.001, fadeOutStartT), 0, 1)
            : 1;

        const rowIndex =
          phase === "walk_out"
            ? WALK_OUT_ROW_INDEX
            : phase === "pose_front"
              ? POSE_ROW_INDEX
              : WALK_IN_ROW_INDEX;

        ctx.save();
        ctx.globalAlpha = alpha;
        drawSpriteFrame({
          ctx,
          sprite,
          frameIndex,
          rowIndex,
          columns: spriteConfig.columns,
          rows: spriteConfig.rows,
          dx,
          dy,
          dSize,
        });
        ctx.restore();

        // フェーズ遷移
        if (phase === "walk_in" && y >= bottomY) {
          // 手前に到達：ポーズして停止
          phase = "pose_front";
          holdRemainingMs = holdMs;
          y = bottomY;
          frameIndex = POSE_FRAME_INDEX;
        }

        if (phase === "walk_out" && (y <= topY || alpha <= 0.01)) {
          // 退場完了：次のMeebitへ
          if (meebitIds.length >= 2) {
            stop();
            scheduleBlackoutToNextMeebit();
            return; // 次のtickは新しいspriteのeffectで開始する
          }

          // 1体だけの場合は最初から再入場
          phase = "walk_in";
          y = topY + 10 * dpr;
          frameIndex = 0;
        }

        animationFrameIdRef.current = requestAnimationFrame(tick);
      };

      animationFrameIdRef.current = requestAnimationFrame(tick);
    };

    const handleLoad = () => {
      if (disposed) return;
      if (sprite.width === 0 || sprite.height === 0) {
        setErrorMessage("Failed to load sprite image (image size is 0).");
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setErrorMessage("Failed to initialize canvas.");
        return;
      }

      setErrorMessage(null);
      stop();

      // isPlaying が false の場合は最初の1フレームだけ描画して止める
      const { width, height, dpr } = resizeCanvasToContainer(canvas);
      const { topY, centerX } = getRunwayGeometry(width, height);
      drawRunwayBackground(ctx, width, height, 0);
      const previewScale = 0.9;
      drawSpriteFrame({
        ctx,
        sprite,
        frameIndex: 0,
        rowIndex: spriteConfig.rowIndex,
        columns: spriteConfig.columns,
        rows: spriteConfig.rows,
        dx: centerX - (runwayConfig.characterSize * previewScale * dpr) / 2,
        dy: topY + (height * 0.62 - topY) * 0.75 - runwayConfig.characterSize * previewScale * dpr,
        dSize: runwayConfig.characterSize * previewScale * dpr,
      });

      if (isPlaying) {
        start(ctx);
      }
    };

    const handleError = () => {
      if (disposed) return;
      setErrorMessage(
        `Failed to load sprite image (ID: ${currentMeebitId}).`,
      );
      stop();

      // 失敗したら次へ（複数ある場合）
      if (meebitIds.length >= 2) {
        scheduleBlackoutToNextMeebit();
      }
    };

    sprite.addEventListener("load", handleLoad);
    sprite.addEventListener("error", handleError);

    const onResize = () => {
      // 再描画は次のtickで行う（止まっている場合は手動で再描画したいが、最小構成として割愛）
      if (!isPlaying) {
        const ctx = canvas.getContext("2d");
        if (!ctx || sprite.width === 0) return;
        const { width, height, dpr } = resizeCanvasToContainer(canvas);
        const { topY, centerX } = getRunwayGeometry(width, height);
        drawRunwayBackground(ctx, width, height, 0);
        const previewScale = 0.9;
        drawSpriteFrame({
          ctx,
          sprite,
          frameIndex: 0,
          rowIndex: spriteConfig.rowIndex,
          columns: spriteConfig.columns,
          rows: spriteConfig.rows,
          dx: centerX - (runwayConfig.characterSize * previewScale * dpr) / 2,
          dy: topY + (height * 0.62 - topY) * 0.75 - runwayConfig.characterSize * previewScale * dpr,
          dSize: runwayConfig.characterSize * previewScale * dpr,
        });
      }
    };

    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      sprite.removeEventListener("load", handleLoad);
      sprite.removeEventListener("error", handleError);
      stop();
    };
    // spriteConfig はuseMemo固定、runwayConfig/isPlaying はアニメの再初期化に必要
  }, [
    currentMeebitId,
    currentSpriteSrc,
    isPlaying,
    meebitIds.length,
    runwayConfig,
    spriteConfig,
  ]);

  return (
    <section className="w-full">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white/70 p-3 backdrop-blur dark:border-white/10 dark:bg-zinc-900/40">
          <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const next = !isPlaying;
              setIsPlaying(next);

              // ユーザー操作（クリック）に紐づくので音が許可されやすい
              const audio = audioRef.current;
              if (!audio) return;

              if (!next) {
                audio.pause();
                return;
              }

              void audio.play().then(
                () => setAudioAutoplayBlocked(false),
                () => setAudioAutoplayBlocked(true),
              );
            }}
            className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            disabled={errorMessage != null}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          {audioAutoplayBlocked && (
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              Sound is blocked by your browser. Click <strong>Play</strong> to enable audio.
            </span>
          )}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Lineup (enter multiple IDs separated by commas, spaces, or new lines)
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Valid Meebits IDs: {MIN_MEEBIT_ID}–{MAX_MEEBIT_ID}
              </span>
              <input
                type="text"
                value={lineupInput}
                onChange={(e) => setLineupInput(e.target.value)}
                placeholder="e.g. 4274, 17600 12345"
                className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-zinc-950 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500"
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => {
                  const ids = parseMeebitIds(lineupInput);
                  const nextIds = ids.length >= 1 ? ids : [DEFAULT_MEEBIT_ID];
                  setMeebitIds(nextIds);
                  setCurrentMeebitIndex(0);
                  setErrorMessage(null);
                }}
              >
                Apply
              </button>

              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => {
                  setLineupInput(`${DEFAULT_MEEBIT_ID}`);
                  setMeebitIds([DEFAULT_MEEBIT_ID]);
                  setCurrentMeebitIndex(0);
                  setErrorMessage(null);
                }}
              >
                Reset
              </button>
            </div>
          </div>

          {errorMessage && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </span>
          )}
        </div>

        <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-black/10 bg-black shadow-sm dark:border-white/10">
          <audio ref={audioRef} src="/music/Meebits.mp3" playsInline />
          <canvas ref={canvasRef} className="h-full w-full" />
          <div
            className={[
              "pointer-events-none absolute inset-0 z-20 bg-black transition-opacity",
              isBlackout ? "opacity-70" : "opacity-0",
            ].join(" ")}
            style={{ transitionDuration: `${BLACKOUT_FADE_MS}ms` }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-end justify-end">
            <span className="rounded-full bg-black/40 px-3 py-1 text-xs text-zinc-100 backdrop-blur">
              ID: {currentMeebitId} / lineup:{" "}
              {meebitIds.length}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

