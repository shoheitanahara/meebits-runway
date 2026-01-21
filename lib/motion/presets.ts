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
    description: "右手を振って挨拶",
  },
  {
    id: "nod",
    label: "Nod",
    description: "うなずき＋まばたき",
  },
  {
    id: "bow",
    label: "Bow",
    description: "軽いお辞儀",
  },
  {
    id: "point",
    label: "Point",
    description: "指差しっぽいポーズ",
  },
  {
    id: "shrug",
    label: "Shrug",
    description: "肩すくめ＋首かしげ",
  },
  {
    id: "spinPose",
    label: "Spin Pose",
    description: "軽く回って最後にキメ",
  },
  {
    id: "jump",
    label: "Jump",
    description: "小さくジャンプ",
  },
  {
    id: "idleCool",
    label: "Idle Cool",
    description: "呼吸＋ゆっくり首振り",
  },
] as const;

