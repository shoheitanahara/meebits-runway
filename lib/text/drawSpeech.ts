import type { SpeechPosition, SpeechRenderMode } from "@/types";

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
  fill: string;
  stroke: string;
}): void {
  const { ctx, x, y, w, h, tail, tailCenterX, fill, stroke } = params;
  // Pixel-art-ish speech bubble:
  // - chunky black outline
  // - crisp stepped corners (no roundRect)
  // - blocky tail (matches the screenshot vibe)
  const unit = 6; // base pixel grid
  const outline = unit * 1; // thickness
  const corner = unit * 2; // cut-corner depth
  const tailW = unit * 6;
  const tailH = unit * 3;
  const shadowOffset = unit; // subtle shadow

  const bx = Math.round(x);
  const by = Math.round(y);
  const bw = Math.round(w);
  const bh = Math.round(h);

  const clampTailX = (params2: { x: number; y: number; w: number; h: number; corner: number; tailW: number }) => {
    const { x: px, w: pw, corner: pc, tailW: ptw } = params2;
    // keep tail away from corners; use unit padding to preserve “pixel steps”
    return clamp(
      tailCenterX - ptw / 2,
      px + pc + unit * 2,
      px + pw - pc - unit * 2 - ptw,
    );
  };

  const drawPath = (params2: {
    x: number;
    y: number;
    w: number;
    h: number;
    corner: number;
    tailW: number;
    tailH: number;
    tail: "up" | "down";
  }) => {
    const { x: px, y: py, w: pw, h: ph, corner: pc, tailW: ptw, tailH: pth } = params2;
    const step = unit;
    const tx = clampTailX({ x: px, y: py, w: pw, h: ph, corner: pc, tailW: ptw });

    ctx.beginPath();

    // For "up" tail, carve it into the top edge; for "down", carve into the bottom edge.
    // Start near top-left (after cut corner)
    if (tail === "up") {
      // top edge (left -> tail)
      ctx.moveTo(px + pc, py);
      ctx.lineTo(tx, py);
      // blocky tail (upwards)
      ctx.lineTo(tx, py - step);
      ctx.lineTo(tx + ptw / 2 - step, py - step);
      ctx.lineTo(tx + ptw / 2 - step, py - pth + step);
      ctx.lineTo(tx + ptw / 2 + step, py - pth + step);
      ctx.lineTo(tx + ptw / 2 + step, py - step);
      ctx.lineTo(tx + ptw, py - step);
      ctx.lineTo(tx + ptw, py);
      // top edge (tail -> right)
      ctx.lineTo(px + pw - pc, py);
    } else {
      ctx.moveTo(px + pc, py);
      ctx.lineTo(px + pw - pc, py);
    }

    // top-right stepped corner
    ctx.lineTo(px + pw - pc, py + step);
    ctx.lineTo(px + pw - step, py + step);
    ctx.lineTo(px + pw - step, py + pc);
    ctx.lineTo(px + pw, py + pc);

    // right edge
    ctx.lineTo(px + pw, py + ph - pc);

    // bottom-right stepped corner
    ctx.lineTo(px + pw - step, py + ph - pc);
    ctx.lineTo(px + pw - step, py + ph - step);
    ctx.lineTo(px + pw - pc, py + ph - step);
    ctx.lineTo(px + pw - pc, py + ph);

    if (tail === "down") {
      // bottom edge (right -> tail)
      ctx.lineTo(tx + ptw, py + ph);
      // blocky tail (downwards)
      ctx.lineTo(tx + ptw, py + ph + step);
      ctx.lineTo(tx + ptw / 2 + step, py + ph + step);
      ctx.lineTo(tx + ptw / 2 + step, py + ph + pth - step);
      ctx.lineTo(tx + ptw / 2 - step, py + ph + pth - step);
      ctx.lineTo(tx + ptw / 2 - step, py + ph + step);
      ctx.lineTo(tx, py + ph + step);
      ctx.lineTo(tx, py + ph);
      // bottom edge (tail -> left)
      ctx.lineTo(px + pc, py + ph);
    } else {
      ctx.lineTo(px + pc, py + ph);
    }

    // bottom-left stepped corner
    ctx.lineTo(px + pc, py + ph - step);
    ctx.lineTo(px + step, py + ph - step);
    ctx.lineTo(px + step, py + ph - pc);
    ctx.lineTo(px, py + ph - pc);

    // left edge
    ctx.lineTo(px, py + pc);

    // top-left stepped corner
    ctx.lineTo(px + step, py + pc);
    ctx.lineTo(px + step, py + step);
    ctx.lineTo(px + pc, py + step);
    ctx.closePath();
  };

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.lineJoin = "miter";

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  drawPath({
    x: bx + shadowOffset,
    y: by + shadowOffset,
    w: bw,
    h: bh,
    corner,
    tailW,
    tailH,
    tail,
  });
  ctx.fill();

  // outer (black)
  ctx.fillStyle = stroke;
  drawPath({ x: bx, y: by, w: bw, h: bh, corner, tailW, tailH, tail });
  ctx.fill();

  // inner (white)
  const innerCorner = Math.max(unit * 2, corner - outline);
  const innerTailW = Math.max(unit * 5, tailW - outline);
  const innerTailH = Math.max(unit * 3, tailH - outline);
  ctx.fillStyle = fill;
  drawPath({
    x: bx + outline,
    y: by + outline,
    w: bw - outline * 2,
    h: bh - outline * 2,
    corner: innerCorner,
    tailW: innerTailW,
    tailH: innerTailH,
    tail,
  });
  ctx.fill();

  ctx.restore();
}

export function drawSpeech(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  t: number; // seconds in [0..3]
  text: string;
  position: SpeechPosition;
  renderMode?: SpeechRenderMode;
  textColor?: string;
  bubbleFillColor?: string;
  bubbleFrameColor?: string;
}): void {
  const {
    ctx,
    width,
    height,
    t,
    text,
    position,
    renderMode = "bubble",
    textColor = "rgba(0,0,0,0.95)",
    bubbleFillColor = "rgba(255,255,255,0.96)",
    bubbleFrameColor = "rgba(0,0,0,0.98)",
  } = params;
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

  if (renderMode === "bubble") {
    drawPixelBubble({
      ctx,
      x: bubbleX,
      y: bubbleY,
      w: bubbleW,
      h: bubbleH,
      tail,
      tailCenterX,
      fill: bubbleFillColor,
      stroke: bubbleFrameColor,
    });
  }

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
    color: textColor,
  });

  ctx.restore();
}

