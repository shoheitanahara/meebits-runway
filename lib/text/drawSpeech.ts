import type { SpeechPosition } from "@/types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type Anchor = Readonly<{
  x: number;
  y: number;
  hAlign: "left" | "center" | "right";
  vAlign: "top" | "middle" | "bottom";
}>;

function getAnchor(params: {
  width: number;
  height: number;
  position: SpeechPosition;
  margin: number;
}): Anchor {
  const { width, height, position, margin } = params;

  const isLeft = position.endsWith("Left");
  const isRight = position.endsWith("Right");

  const isTop = position.startsWith("top");
  const isBottom = position.startsWith("bottom");

  const x = isLeft ? margin : isRight ? width - margin : width * 0.5;
  const y = isTop ? margin : isBottom ? height - margin : height * 0.5;

  return {
    x,
    y,
    hAlign: isLeft ? "left" : isRight ? "right" : "center",
    vAlign: isTop ? "top" : isBottom ? "bottom" : "middle",
  };
}

const pixelCanvas: HTMLCanvasElement =
  typeof document === "undefined" ? (null as unknown as HTMLCanvasElement) : document.createElement("canvas");
const pixelCtx: CanvasRenderingContext2D | null =
  typeof document === "undefined" ? null : pixelCanvas.getContext("2d");

function measurePixelTextWidth(text: string, srcFontPx: number): number {
  if (!pixelCtx) return text.length * srcFontPx;
  pixelCtx.font = `400 ${srcFontPx}px "Press Start 2P", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  return pixelCtx.measureText(text).width;
}

type PixelTextLayout = Readonly<{
  srcFontPx: number;
  srcWidth: number;
  srcHeight: number;
  dstWidth: number;
  dstHeight: number;
}>;

function computePixelTextLayout(params: {
  text: string;
  maxWidth: number;
  pixelScale: number;
}): PixelTextLayout {
  const { text, maxWidth, pixelScale } = params;
  const minSrcFont = 8;
  // ピクセル感を強める：低解像度に描いて拡大
  let srcFontPx = 12;

  while (srcFontPx >= minSrcFont) {
    const dstWidth = measurePixelTextWidth(text, srcFontPx) * pixelScale;
    if (dstWidth <= maxWidth) break;
    srcFontPx -= 1;
  }

  const srcWidth = Math.max(1, Math.ceil(measurePixelTextWidth(text, srcFontPx)) + 8);
  const srcHeight = Math.max(1, Math.ceil(srcFontPx * 1.4));
  return {
    srcFontPx,
    srcWidth,
    srcHeight,
    dstWidth: srcWidth * pixelScale,
    dstHeight: srcHeight * pixelScale,
  };
}

function drawPixelText(params: {
  ctx: CanvasRenderingContext2D;
  text: string;
  x: number;
  y: number;
  layout: PixelTextLayout;
  color: string;
}): void {
  const { ctx, text, x, y, layout, color } = params;
  if (!pixelCtx) return;

  pixelCanvas.width = layout.srcWidth;
  pixelCanvas.height = layout.srcHeight;

  pixelCtx.clearRect(0, 0, layout.srcWidth, layout.srcHeight);
  pixelCtx.imageSmoothingEnabled = false;
  pixelCtx.font = `400 ${layout.srcFontPx}px "Press Start 2P", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  pixelCtx.textAlign = "center";
  pixelCtx.textBaseline = "middle";

  // 1pxドロップシャドウ（ボクセル風）
  pixelCtx.fillStyle = "rgba(0,0,0,0.25)";
  pixelCtx.fillText(
    text,
    Math.floor(layout.srcWidth / 2) + 1,
    Math.floor(layout.srcHeight / 2) + 1,
  );
  pixelCtx.fillStyle = color;
  pixelCtx.fillText(text, Math.floor(layout.srcWidth / 2), Math.floor(layout.srcHeight / 2));

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    pixelCanvas,
    0,
    0,
    layout.srcWidth,
    layout.srcHeight,
    Math.round(x - layout.dstWidth / 2),
    Math.round(y - layout.dstHeight / 2),
    layout.dstWidth,
    layout.dstHeight,
  );
  ctx.restore();
}

function drawPixelBubble(params: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  w: number;
  h: number;
  tail: "up" | "down";
  tailCenterX: number;
}): void {
  const { ctx, x, y, w, h, tail, tailCenterX } = params;
  const border = 4;
  const radius = 8;
  const tailW = 16;
  const tailH = 10;

  const bx = Math.round(x);
  const by = Math.round(y);
  const bw = Math.round(w);
  const bh = Math.round(h);

  // 指定：黒枠・白背景
  const fill = "rgba(255,255,255,0.96)";
  const stroke = "rgba(0,0,0,0.95)";

  const tailX = clamp(tailCenterX - tailW / 2, bx + radius + 6, bx + bw - radius - 6 - tailW);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.lineJoin = "miter";
  ctx.lineWidth = border;

  // shadow（ピクセルっぽくズラす）
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.strokeStyle = "rgba(0,0,0,0)";
  ctx.beginPath();
  ctx.roundRect(bx + 4, by + 4, bw, bh, radius);
  ctx.fill();

  // main bubble
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, radius);
  ctx.fill();
  ctx.stroke();

  // tail
  ctx.beginPath();
  if (tail === "down") {
    ctx.moveTo(tailX, by + bh);
    ctx.lineTo(tailX + tailW, by + bh);
    ctx.lineTo(tailX + tailW / 2, by + bh + tailH);
  } else {
    ctx.moveTo(tailX, by);
    ctx.lineTo(tailX + tailW, by);
    ctx.lineTo(tailX + tailW / 2, by - tailH);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

export function drawSpeech(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  t: number; // seconds in [0..3]
  text: string;
  position: SpeechPosition;
}): void {
  const { ctx, width, height, t, text, position } = params;
  const trimmed = text.trim();
  if (trimmed.length === 0) return;

  // 入力制限（要件：最大24文字、改行なし）
  const singleLine = trimmed.replaceAll(/\s+/gu, " ").slice(0, 24);

  // アニメ：0.0〜0.2秒でフェードイン＋微拡大
  const inT = clamp(t / 0.2, 0, 1);
  const inOpacity = inT;
  const scale = lerp(0.95, 1.0, inT);

  // 任意：2.6〜3.0秒でフェードアウト
  const outT = clamp((t - 2.6) / 0.4, 0, 1);
  const outOpacity = 1 - outT;

  const opacity = clamp(inOpacity * outOpacity, 0, 1);
  if (opacity <= 0.001) return;

  const margin = Math.round(Math.min(width, height) * 0.06);
  const anchor = getAnchor({ width, height, position, margin });

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(anchor.x, anchor.y);
  ctx.scale(scale, scale);

  // テキスト計測（ピクセル風、ここでは描画しない）
  const pixelScale = 6;
  const maxTextWidth = width * 0.64;
  const textLayout = computePixelTextLayout({
    text: singleLine,
    maxWidth: maxTextWidth,
    pixelScale,
  });

  // バブルサイズ（テキストに合わせて）
  const padX = 14;
  const padY = 12;
  const bubbleW = Math.min(
    width - margin * 2,
    Math.max(120, textLayout.dstWidth + padX * 2),
  );
  const bubbleH = Math.max(56, textLayout.dstHeight + padY * 2);

  // 位置合わせ：アンカーを 3x3 の“基準点”として、バブルをそこに寄せる
  const bubbleX =
    anchor.hAlign === "left" ? 0 : anchor.hAlign === "right" ? -bubbleW : -bubbleW / 2;
  const bubbleY =
    anchor.vAlign === "top" ? 0 : anchor.vAlign === "bottom" ? -bubbleH : -bubbleH / 2;

  const tail =
    anchor.vAlign === "bottom" ? "up" : "down";

  // 尻尾位置：吹き出し中心ではなく「画面中央寄り」
  // - 左側（hAlign=left）なら右寄り、右側（hAlign=right）なら左寄り
  const tailInset = Math.min(28, bubbleW * 0.22);
  const tailCenterX =
    anchor.hAlign === "right"
      ? bubbleX + tailInset
      : anchor.hAlign === "left"
        ? bubbleX + bubbleW - tailInset
        : bubbleX + bubbleW / 2;

  drawPixelBubble({
    ctx,
    x: bubbleX,
    y: bubbleY,
    w: bubbleW,
    h: bubbleH,
    tail,
    tailCenterX,
  });

  // テキストをバブル内中央へ（バブル内座標で）
  drawPixelText({
    ctx,
    text: singleLine,
    x: bubbleX + bubbleW / 2,
    y: bubbleY + bubbleH / 2,
    layout: computePixelTextLayout({
      text: singleLine,
      maxWidth: bubbleW - padX * 2,
      pixelScale,
    }),
    // 指定：黒文字
    color: "rgba(0,0,0,0.95)",
  });

  ctx.restore();
}

