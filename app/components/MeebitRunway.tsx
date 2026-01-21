"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type RunwayMode = "single" | "finale";

type ActorPhase = "walk_in" | "pose_front" | "walk_out";

type Actor = {
  id: number;
  phase: ActorPhase;
  holdRemainingMs: number;
  y: number;
  swayPhase: number;
  frameIndex: number;
  frameAccMs: number;
  laneIndex: 0 | 1 | 2;
};

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

// フィナーレ（全員連続で登場）演出
const FINALE_SPAWN_INTERVAL_MS = 800;

function buildSpriteUrl(meebitId: number): string {
  // デフォルトIDはローカルのスプライトを優先（開発体験が良い）
  if (meebitId === DEFAULT_MEEBIT_ID) return "/images/4274.png";
  // NOTE: 直接外部URLをCanvasに描画すると「tainted canvas」になり、スクショ保存(toBlob)が失敗する。
  // 同一オリジンのRoute Handler経由で取得して回避する。
  return `/api/sprites/${meebitId}`;
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

function getRandomIntInclusive(min: number, max: number): number {
  // NOTE: 可能なら crypto を使って、Math.random より偏りにくい乱数を生成する。
  // さらに modulo bias を避けるため、rejection sampling を使う。
  const range = max - min + 1;
  if (range <= 0) return min;

  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    return min + Math.floor(Math.random() * range);
  }

  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / range) * range; // 2^32 の範囲内で range の倍数
  while (true) {
    cryptoObj.getRandomValues(buffer);
    const value = buffer[0]!;
    if (value < limit) return min + (value % range);
  }
}

function generateUniqueRandomMeebitIds(count: number): number[] {
  // UI要件: 1..20000 から count 個を重複なしでランダムに生成
  const uniqueIds = new Set<number>();
  const maxAttempts = Math.max(200, count * 50); // 無限ループ保険（通常ここに到達しない）

  for (let i = 0; i < maxAttempts && uniqueIds.size < count; i += 1) {
    uniqueIds.add(getRandomIntInclusive(MIN_MEEBIT_ID, MAX_MEEBIT_ID));
  }

  // 念のため、上限に達した場合は残りを線形に埋める（count=10ならまず発生しない）
  if (uniqueIds.size < count) {
    for (let id = MIN_MEEBIT_ID; id <= MAX_MEEBIT_ID && uniqueIds.size < count; id += 1) {
      uniqueIds.add(id);
    }
  }

  return Array.from(uniqueIds);
}

function serializeMeebitIds(ids: number[]): string {
  // URLパラメータ向けに最小表現にする（カンマ区切り）
  return ids.join(",");
}

function areSameMeebitIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
  const spriteCacheRef = useRef<
    Map<number, { img: HTMLImageElement; status: "loading" | "loaded" | "error" }>
  >(new Map());

  const singleActorRef = useRef<Actor | null>(null);
  const finaleActorsRef = useRef<Actor[]>([]);
  const finaleNextSpawnIndexRef = useRef<number>(0);
  const finaleSpawnAccMsRef = useRef<number>(0);
  const finaleStartRequestedRef = useRef<boolean>(false);

  // React stateはUI用。毎フレーム更新しない（パフォーマンスのため）
  const [isPlaying, setIsPlaying] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [audioAutoplayBlocked, setAudioAutoplayBlocked] = useState(false);
  const [isBlackout, setIsBlackout] = useState(false);
  const [runwayMode, setRunwayMode] = useState<RunwayMode>("single");
  const [hasFinalePlayed, setHasFinalePlayed] = useState(false);

  // 入力されたIDを順番に表示する（ランウェイを歩き切るたびに次のIDへ）
  const [lineupInput, setLineupInput] = useState(`${DEFAULT_MEEBIT_ID}`);
  const [meebitIds, setMeebitIds] = useState<number[]>([DEFAULT_MEEBIT_ID]);
  const [currentMeebitIndex, setCurrentMeebitIndex] = useState(0);

  const currentMeebitId = meebitIds[currentMeebitIndex] ?? DEFAULT_MEEBIT_ID;

  const setQueryIdsParam = useCallback(
    (value: string | null) => {
      // NOTE: `next/navigation` を使うと静的エクスポート時にプリレンダーで落ちるケースがあるため、
      // URL同期はクライアントの History API で完結させる。
      if (typeof window === "undefined") return;

      const url = new URL(window.location.href);
      if (value == null || value.length === 0) url.searchParams.delete("ids");
      else url.searchParams.set("ids", value);

      window.history.replaceState(null, "", url.toString());
    },
    [],
  );

  const applyLineup = useCallback(
    (nextIds: number[], options?: { syncUrl?: boolean; updateInput?: boolean }) => {
      setStatusMessage(null);
      setErrorMessage(null);

      if (options?.updateInput ?? true) {
        setLineupInput(nextIds.join(", "));
      }

      setMeebitIds(nextIds);
      setCurrentMeebitIndex(0);
      setRunwayMode("single");
      setHasFinalePlayed(false);

      // ランウェイ状態を初期化（再現性と見た目のため）
      singleActorRef.current = null;
      finaleActorsRef.current = [];
      finaleNextSpawnIndexRef.current = 0;
      finaleSpawnAccMsRef.current = 0;
      finaleStartRequestedRef.current = false;

      // Share URL / 受け取ったURLからは「ランウェイが始まる」を優先
      setIsPlaying(true);

      if (options?.syncUrl) {
        setQueryIdsParam(serializeMeebitIds(nextIds));
      }
    },
    [setQueryIdsParam],
  );

  const handleRandomApply = useCallback(() => {
    // 1..20000 のIDを10個ランダム生成して適用
    const nextIds = generateUniqueRandomMeebitIds(10);
    applyLineup(nextIds, { syncUrl: true, updateInput: true });
  }, [applyLineup]);

  const handleShareUrl = useCallback(async () => {
    try {
      const idsValue = serializeMeebitIds(meebitIds);

      const url = new URL(window.location.href);
      url.searchParams.set("ids", idsValue);

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
        setStatusMessage("Share URL copied to clipboard.");
        setErrorMessage(null);
        return;
      }

      // 古い環境向けフォールバック（ユーザーが手でコピーできる）
      window.prompt("Copy Share URL:", url.toString());
      setStatusMessage(null);
      setErrorMessage(null);
    } catch {
      setStatusMessage(null);
      setErrorMessage("Failed to create/copy Share URL.");
    }
  }, [meebitIds]);

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
    // URL: `?ids=4274,17600,12345` を受け取って、lineupを初期化して開始する
    // - 初回マウント時に1回読む
    // - 戻る/進む(popstate)でも反映する
    if (typeof window === "undefined") return;

    const applyFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("ids")) return;

      const idsParamValue = params.get("ids") ?? "";
      const ids = parseMeebitIds(idsParamValue);
      const nextIds = ids.length >= 1 ? ids : [DEFAULT_MEEBIT_ID];

      // URL変更 → state反映 を冪等にして、無限ループを避ける
      if (areSameMeebitIds(nextIds, meebitIds)) return;
      applyLineup(nextIds, { syncUrl: false, updateInput: true });
    };

    applyFromLocation();
    window.addEventListener("popstate", applyFromLocation);
    return () => window.removeEventListener("popstate", applyFromLocation);
  }, [applyLineup, meebitIds]);

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

  const handleCapture = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const filename = `meebits-runway-${currentMeebitId}-${new Date().toISOString().replaceAll(":", "-")}.png`;

    try {
      // toBlob が使える環境ではメモリ効率が良い
      if (canvas.toBlob) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/png");
        });
        if (!blob) return;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }

      // fallback（古いSafari等）
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // 外部画像を直接描画していると「tainted canvas」で失敗する
      setErrorMessage(
        "Screenshot failed (tainted canvas). Please try again after the sprite loads via /api/sprites.",
      );
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    const stop = () => {
      if (animationFrameIdRef.current != null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      lastTimestampRef.current = null;
      accumulatedMsRef.current = 0;
    };


    const ctx = canvas.getContext("2d");
    if (!ctx) {
      queueMicrotask(() => setErrorMessage("Failed to initialize canvas."));
      return;
    }

    const clearBlackoutTimeouts = () => {
      for (const id of blackoutTimeoutsRef.current) {
        window.clearTimeout(id);
      }
      blackoutTimeoutsRef.current = [];
    };

    const scheduleBlackout = (onMidpoint: () => void) => {
      clearBlackoutTimeouts();
      setIsBlackout(true);
      blackoutTimeoutsRef.current.push(
        window.setTimeout(() => {
          onMidpoint();
        }, BLACKOUT_FADE_MS),
      );
      blackoutTimeoutsRef.current.push(
        window.setTimeout(() => {
          setIsBlackout(false);
        }, BLACKOUT_FADE_MS + BLACKOUT_HOLD_MS),
      );
    };

    type SpriteEntry = {
      img: HTMLImageElement;
      status: "loading" | "loaded" | "error";
    };

    const getSpriteEntry = (meebitId: number): SpriteEntry => {
      const existing = spriteCacheRef.current.get(meebitId);
      if (existing) return existing;

      const entry: SpriteEntry = {
        img: new Image(),
        status: "loading",
      };
      entry.img.src = buildSpriteUrl(meebitId);
      entry.img.addEventListener("load", () => {
        entry.status = "loaded";
      });
      entry.img.addEventListener("error", () => {
        entry.status = "error";
      });
      spriteCacheRef.current.set(meebitId, entry);
      return entry;
    };

    const initActor = (meebitId: number, laneIndex: 0 | 1 | 2): Actor => ({
      id: meebitId,
      phase: "walk_in",
      holdRemainingMs: 0,
      y: 0,
      swayPhase: 0,
      frameIndex: 0,
      frameAccMs: 0,
      laneIndex,
    });

    const resetRunForNewLineup = () => {
      singleActorRef.current = null;
      finaleActorsRef.current = [];
      finaleNextSpawnIndexRef.current = 0;
      finaleSpawnAccMsRef.current = 0;
      finaleStartRequestedRef.current = false;
      setHasFinalePlayed(false);
      setRunwayMode("single");
    };

    // lineup変更直後などで index が範囲外になった場合に備える
    if (currentMeebitIndex >= meebitIds.length) {
      queueMicrotask(() => setCurrentMeebitIndex(0));
    }

    const triggerFinale = () => {
      // 連続トリガー防止（stateは非同期なのでrefでガード）
      if (finaleStartRequestedRef.current) return;
      finaleStartRequestedRef.current = true;

      // フィナーレは「すぐに」開始（暗転は被せるだけ）
      setHasFinalePlayed(true);
      setRunwayMode("finale");
      setErrorMessage(null);

      // フィナーレは先頭から全員を連続で出す
      finaleActorsRef.current = [];
      finaleNextSpawnIndexRef.current = 0;
      finaleSpawnAccMsRef.current = FINALE_SPAWN_INTERVAL_MS; // 即スポーン
      singleActorRef.current = null;

      // 暗転演出だけ被せる（開始を待たない）
      clearBlackoutTimeouts();
      setIsBlackout(true);
      blackoutTimeoutsRef.current.push(
        window.setTimeout(() => {
          setIsBlackout(false);
        }, BLACKOUT_FADE_MS + BLACKOUT_HOLD_MS),
      );
    };

    const advanceToNextSingle = () => {
      scheduleBlackout(() => {
        setCurrentMeebitIndex((prev) => (prev + 1) % Math.max(1, meebitIds.length));
        setErrorMessage(null);
      });
    };

    const updateAndDrawActor = (params: {
      actor: Actor;
      width: number;
      height: number;
      dpr: number;
      deltaMs: number;
      topY: number;
      bottomY: number;
      centerX: number;
      topHalf: number;
      bottomHalf: number;
      maxActorHeightRatio?: number;
    }): { actor: Actor; done: boolean } => {
      const {
        actor,
        width,
        height,
        dpr,
        deltaMs,
        topY,
        bottomY,
        centerX,
        topHalf,
        bottomHalf,
        // SPでは高さが短くなりがちなので、手前最大サイズは控えめに
        maxActorHeightRatio = 0.5,
      } = params;

      const WALK_IN_ROW_INDEX = 3;
      const POSE_ROW_INDEX = 3;
      const POSE_FRAME_INDEX = 7;
      const WALK_OUT_ROW_INDEX = 1;
      const holdMs = 2100;

      // init
      if (actor.y === 0) {
        actor.y = topY + 10 * dpr;
      }

      // PCの見た目は維持しつつ、SPでは相対的に大きくなりすぎないよう基準サイズを可変にする。
      // - PCでは上限(=runwayConfig.characterSize)が効いて 160px のまま
      // - SPでは canvas の大きさに合わせて基準サイズが小さくなる
      const cssWidth = width / Math.max(1, dpr);
      const cssHeight = height / Math.max(1, dpr);
      const baseCharacterSizeCss = Math.min(
        runwayConfig.characterSize,
        cssWidth * 0.28,
        cssHeight * 0.55,
      );

      // move
      // 画面が小さい（=基準サイズが小さい）ほど移動速度も落とし、SPで速すぎる体感を抑える
      const speedScale = clamp(
        baseCharacterSizeCss / Math.max(1, runwayConfig.characterSize),
        0.1,
        1,
      );
      const pxPerMs = (runwayConfig.pixelsPerSecond * speedScale) / 1000;
      if (actor.phase === "walk_in") {
        actor.y += pxPerMs * deltaMs * dpr;
      } else if (actor.phase === "pose_front") {
        actor.holdRemainingMs -= deltaMs;
        if (actor.holdRemainingMs <= 0) {
          actor.phase = "walk_out";
        }
      } else {
        actor.y -= pxPerMs * deltaMs * dpr * 1.1;
      }

      actor.swayPhase += deltaMs * 0.008;

      // frame
      if (actor.phase === "pose_front") {
        actor.frameIndex = POSE_FRAME_INDEX;
        actor.frameAccMs = 0;
      } else {
        const stepMs = 1000 / Math.max(1, runwayConfig.fps);
        actor.frameAccMs += deltaMs;
        while (actor.frameAccMs >= stepMs) {
          actor.frameIndex = (actor.frameIndex + 1) % spriteConfig.columns;
          actor.frameAccMs -= stepMs;
        }
      }

      // perspective & placement
      const t = clamp((actor.y - topY) / Math.max(1, bottomY - topY), 0, 1);
      const farScale = 0.45;

      // SPなどでキャンバスの高さが小さい場合、手前で大きくなりすぎて頭が切れやすい。
      // dSize を突然キャップすると拡大が急に止まり、動きが不自然になりやすい。
      // そこで「手前スケール（nearScale）」を動的に下げて、拡大を最後まで滑らかにする。
      const maxDSize = height * maxActorHeightRatio; // canvas px
      const maxNearScaleByHeight =
        maxDSize / Math.max(1, baseCharacterSizeCss * dpr);
      const effectiveNearScale = Math.min(
        DEFAULT_NEAR_SCALE,
        maxNearScaleByHeight,
      );
      const scale = lerp(farScale, effectiveNearScale, t);
      const dSize = baseCharacterSizeCss * scale * dpr;

      const half = lerp(topHalf, bottomHalf, t);
      const laneOffsetRatio = actor.laneIndex === 0 ? -0.22 : actor.laneIndex === 2 ? 0.22 : 0;
      const laneOffset = laneOffsetRatio * half;

      const sway =
        actor.phase === "pose_front" ? 0 : Math.sin(actor.swayPhase) * 2 * dpr;
      const dx = centerX - dSize / 2 + laneOffset + sway;
      const dy = actor.y - dSize;

      // fade out near the end of walk_out
      const fadeOutStartT = 0.22;
      const alpha =
        actor.phase === "walk_out"
          ? t > fadeOutStartT
            ? 1
            : clamp(t / Math.max(0.001, fadeOutStartT), 0, 1)
          : 1;

      // phase transitions
      if (actor.phase === "walk_in" && actor.y >= bottomY) {
        actor.phase = "pose_front";
        actor.holdRemainingMs = holdMs;
        actor.y = bottomY;
        actor.frameIndex = POSE_FRAME_INDEX;
      }

      const done = actor.phase === "walk_out" && (actor.y <= topY || alpha <= 0.01);

      const spriteEntry = getSpriteEntry(actor.id);
      if (spriteEntry.status === "error") {
        return { actor, done: true };
      }
      if (spriteEntry.status === "loaded") {
        const rowIndex =
          actor.phase === "walk_out"
            ? WALK_OUT_ROW_INDEX
            : actor.phase === "pose_front"
              ? POSE_ROW_INDEX
              : WALK_IN_ROW_INDEX;

        ctx.save();
        ctx.globalAlpha = alpha;
        drawSpriteFrame({
          ctx,
          sprite: spriteEntry.img,
          frameIndex: actor.frameIndex,
          rowIndex,
          columns: spriteConfig.columns,
          rows: spriteConfig.rows,
          dx,
          dy,
          dSize,
        });
        ctx.restore();
      }

      return { actor, done };
    };

    const drawStaticPreview = () => {
      const { width, height, dpr } = resizeCanvasToContainer(canvas);
      drawRunwayBackground(ctx, width, height, 0);
      const { topY, bottomY, centerX, topHalf, bottomHalf } = getRunwayGeometry(
        width,
        height,
      );

      const actor = initActor(currentMeebitId, 1);
      actor.phase = "pose_front";
      actor.holdRemainingMs = 999999;
      actor.y = bottomY;
      actor.frameIndex = 7;

      updateAndDrawActor({
        actor,
        width,
        height,
        dpr,
        deltaMs: 0,
        topY,
        bottomY,
        centerX,
        topHalf,
        bottomHalf,
      });
    };

    if (!isPlaying) {
      drawStaticPreview();
      return;
    }

    queueMicrotask(() => setErrorMessage(null));
    stop();

    const tick = (timestampMs: number) => {
      if (disposed) return;

      const { width, height, dpr } = resizeCanvasToContainer(canvas);
      drawRunwayBackground(ctx, width, height, timestampMs);

      const { topY, bottomY, centerX, topHalf, bottomHalf } = getRunwayGeometry(
        width,
        height,
      );

      const last = lastTimestampRef.current ?? timestampMs;
      const deltaMs = timestampMs - last;
      lastTimestampRef.current = timestampMs;

      if (runwayMode === "single") {
        const id = currentMeebitId;
        const current = singleActorRef.current;
        if (!current || current.id !== id) {
          singleActorRef.current = initActor(id, 1);
        }

        const updated = updateAndDrawActor({
          actor: singleActorRef.current!,
          width,
          height,
          dpr,
          deltaMs,
          topY,
          bottomY,
          centerX,
          topHalf,
          bottomHalf,
        });
        singleActorRef.current = updated.actor;

        if (updated.done) {
          singleActorRef.current = null;

          if (meebitIds.length >= 2) {
            const isLast = currentMeebitIndex === meebitIds.length - 1;
            if (isLast && !hasFinalePlayed) {
              triggerFinale();
              return;
            }
            advanceToNextSingle();
            return;
          }
        }
      } else {
        // finale
        finaleSpawnAccMsRef.current += deltaMs;
        while (
          finaleSpawnAccMsRef.current >= FINALE_SPAWN_INTERVAL_MS &&
          finaleNextSpawnIndexRef.current < meebitIds.length
        ) {
          const spawnIndex = finaleNextSpawnIndexRef.current;
          const id = meebitIds[spawnIndex]!;
          // フィナーレの1体目はセンターから開始（本物のランウェイっぽく）
          // 以降はセンター→左→右の順で散らす
          const lanePattern: Array<0 | 1 | 2> = [1, 0, 2];
          const laneIndex = lanePattern[spawnIndex % lanePattern.length]!;
          finaleActorsRef.current.push(initActor(id, laneIndex));
          finaleNextSpawnIndexRef.current += 1;
          finaleSpawnAccMsRef.current -= FINALE_SPAWN_INTERVAL_MS;
        }

        // 遠い→近い順に描画したいので、更新後のtでソートするために一旦更新
        const nextActors: Array<{ actor: Actor; t: number }> = [];
        for (const actor of finaleActorsRef.current) {
          const res = updateAndDrawActor({
            actor,
            width,
            height,
            dpr,
            deltaMs,
            topY,
            bottomY,
            centerX,
            topHalf,
            bottomHalf,
          });
          if (!res.done) {
            const t = clamp(
              (res.actor.y - topY) / Math.max(1, bottomY - topY),
              0,
              1,
            );
            nextActors.push({ actor: res.actor, t });
          }
        }

        // 描画順は「遠い→近い」にしたいので t の小さい順で保持
        nextActors.sort((a, b) => a.t - b.t);
        finaleActorsRef.current = nextActors.map((x) => x.actor);

        const allSpawned = finaleNextSpawnIndexRef.current >= meebitIds.length;
        const noneLeft = finaleActorsRef.current.length === 0;
        if (allSpawned && noneLeft) {
          scheduleBlackout(() => {
            resetRunForNewLineup();
            setCurrentMeebitIndex(0);
          });
          return;
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(tick);
    };

    animationFrameIdRef.current = requestAnimationFrame(tick);

    const onResize = () => {
      if (!isPlaying) drawStaticPreview();
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      stop();
    };
  }, [
    currentMeebitId,
    currentMeebitIndex,
    hasFinalePlayed,
    isPlaying,
    meebitIds,
    runwayConfig,
    runwayMode,
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
              setStatusMessage(null);

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
                onChange={(e) => {
                  setLineupInput(e.target.value);
                  setStatusMessage(null);
                }}
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
                  applyLineup(nextIds, { syncUrl: true, updateInput: false });
                }}
              >
                Apply
              </button>

              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                onClick={handleRandomApply}
              >
                Random
              </button>

              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => void handleShareUrl()}
                disabled={errorMessage != null}
              >
                Share URL
              </button>

              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => {
                  setStatusMessage(null);
                  setQueryIdsParam(null);
                  applyLineup([DEFAULT_MEEBIT_ID], { syncUrl: false, updateInput: true });
                }}
              >
                Reset
              </button>
            </div>
          </div>

          {statusMessage && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              {statusMessage}
            </span>
          )}

          {errorMessage && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </span>
          )}
        </div>

        <div
          className="relative w-full overflow-hidden rounded-2xl border border-black/10 bg-black shadow-sm dark:border-white/10"
          // SPでも縦横比が崩れないように固定（動画枠っぽく）
          style={{ aspectRatio: "16 / 9" }}
        >
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

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void handleCapture()}
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Capture
          </button>
        </div>
      </div>
    </section>
  );
}

