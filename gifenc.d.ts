declare module "gifenc" {
  export type GifPalette = Uint8Array | number[];

  export type GifWriteFrameOptions = Readonly<{
    palette: GifPalette;
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
  }>;

  export type GifEncoder = Readonly<{
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      options: GifWriteFrameOptions,
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  }>;

  export function GIFEncoder(): GifEncoder;
  export function quantize(rgba: Uint8Array, maxColors: number): GifPalette;
  export function applyPalette(rgba: Uint8Array, palette: GifPalette): Uint8Array;
}

