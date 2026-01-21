export type MotionPresetId =
  | "wave"
  | "nod"
  | "bow"
  | "point"
  | "shrug"
  | "spinPose"
  | "jump"
  | "idleCool";

export type MotionStrength = 0.5 | 1.0 | 1.5;
export type MotionSpeed = 0.8 | 1.0 | 1.2;

// Background color presets (IDs only). UI labels / hex codes live in `lib/background/presets.ts`.
export const BACKGROUND_MODES = [
  "white",
  "dark",
  "newPunkBlue",
  "midnightNavy",
  "deepIndigo",
  "slateBlue",
  "smokeBlue",
  "popYellow",
  "lemonYellow",
  "sunflower",
  "electricCyan",
  "hotMagenta",
  "popCoral",
  "stormTeal",
  "petrolGreen",
  "sage",
  "moss",
  "oliveDrab",
  "warmSand",
  "paperBeige",
  "clay",
  "terracottaDust",
  "dustyRose",
  "mauve",
  "plumInk",
  "charcoal",
] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

// Camera angle presets (front / front-right / front-left)
export type CameraMode = "front" | "frontRight" | "frontLeft";

export type CameraFraming = "fullBody" | "waistToHead" | "face";
export type CameraPan = "left" | "center" | "right";

export type SpeechPosition =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "middleLeft"
  | "middleCenter"
  | "middleRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

export type SpeechRenderMode = "bubble" | "textOnly";

// Color presets for speech text + bubble frame (paired control in UI).
export type SpeechStylePresetId =
  | "classic"
  | "inverse"
  | "newPunk"
  | "popYellow"
  | "mint"
  | "mono";

