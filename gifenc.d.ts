declare module "gifenc" {
  /** Each palette entry is an [R, G, B] tuple. */
  export type GifPaletteEntry = [number, number, number];

  /** Palette: array of [R,G,B] tuples returned by `quantize`. */
  export type GifPalette = GifPaletteEntry[];

  export type GifWriteFrameOptions = Readonly<{
    palette: GifPalette;
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
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

