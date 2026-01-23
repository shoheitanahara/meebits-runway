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
    id: "handDown",
    label: "Hand Down",
    description: "Lower the right hand to the center",
  },
  {
    id: "idleBounce",
    label: "Idle Bounce",
    description: "Full-body bounce (loop)",
  },
  {
    id: "idleGroove",
    label: "Idle Groove",
    description: "Full-body groove (loop)",
  },
  {
    id: "idleLean",
    label: "Idle Lean",
    description: "Lean + sway (loop)",
  },
  {
    id: "idleTurn",
    label: "Idle Turn",
    description: "Subtle turn in place (loop)",
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

