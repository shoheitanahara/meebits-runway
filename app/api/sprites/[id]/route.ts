import { NextResponse } from "next/server";

const MIN_MEEBIT_ID = 1;
const MAX_MEEBIT_ID = 20000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);

  if (!Number.isFinite(id) || id < MIN_MEEBIT_ID || id > MAX_MEEBIT_ID) {
    return NextResponse.json(
      { error: "Invalid Meebits ID" },
      { status: 400 },
    );
  }

  const upstreamUrl = `https://files.meebits.app/sprites/${id}.png`;

  const upstream = await fetch(upstreamUrl, {
    // Vercel/Nextのキャッシュに乗せて同じ画像を繰り返し取りに行かない
    //（スプライトなので長期キャッシュでもOK）
    cache: "force-cache",
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Upstream fetch failed" },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "image/png";
  const buffer = await upstream.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

