import type { MotionPresetId } from "@/types";

export type MotionPreset = Readonly<{
  id: MotionPresetId;
  label: string;
  description: string;
}>;

export const MOTION_PRESETS: readonly MotionPreset[] = [
  {
    id: "wave",
    label: "Wave",
    description: "Wave hello with the right hand",
  },
  {
    id: "nod",
    label: "Nod",
    description: "Nod with a blink",
  },
  {
    id: "bow",
    label: "Bow",
    description: "A light bow",
  },
  {
    id: "point",
    label: "Point",
    description: "Pointing gesture",
  },
  {
    id: "shrug",
    label: "Shrug",
    description: "Shrug with a head tilt",
  },
  {
    id: "spinPose",
    label: "Spin Pose",
    description: "Quick spin, then a pose",
  },
  {
    id: "jump",
    label: "Jump",
    description: "Small jump",
  },
  {
    id: "idleCool",
    label: "Idle Cool",
    description: "Breathing with a slow head sway",
  },
] as const;

