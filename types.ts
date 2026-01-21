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

export type BackgroundMode = "white" | "dark";
// NOTE: 3-4(threeQuarter) は見た目の違和感報告があるため一旦外す
export type CameraMode = "front";

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

