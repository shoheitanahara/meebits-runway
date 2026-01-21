import type { MotionPresetId, MotionSpeed, MotionStrength } from "@/types";
import type { VRM } from "@pixiv/three-vrm";
import { Euler, Quaternion, type Object3D, type Vector3 } from "three";

const TAU = Math.PI * 2;

// NOTE:
// `@pixiv/three-vrm` v3系では `VRMHumanBoneName` が「型（文字列ユニオン）」として提供されるため、
// 実体（enum/namespace）に依存せず、利用するボーン名を文字列で定義する。
const BONE = {
  hips: "hips",
  spine: "spine",
  chest: "chest",
  neck: "neck",
  head: "head",
  leftUpperArm: "leftUpperArm",
  leftLowerArm: "leftLowerArm",
  leftHand: "leftHand",
  rightUpperArm: "rightUpperArm",
  rightLowerArm: "rightLowerArm",
  rightHand: "rightHand",
} as const;

type BoneName = (typeof BONE)[keyof typeof BONE];

type BoneState = Readonly<{
  node: Object3D;
  baseQuaternion: Quaternion;
}>;

export type VrmMotionRig = Readonly<{
  bones: Partial<Record<BoneName, BoneState>>;
  root: Readonly<{
    node: Object3D;
    baseQuaternion: Quaternion;
    basePosition: Vector3;
  }>;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function pulse01(t: number, center: number, width: number): number {
  // 0..1 の単発パルス（ガウスっぽい形）
  const d = Math.abs(t - center);
  const x = clamp(1 - d / Math.max(1e-6, width), 0, 1);
  return x * x;
}

function cyclesForSpeed(speed: MotionSpeed): number {
  // 3秒ループを保証するため、速度は「整数回数」にマッピングする
  if (speed === 0.8) return 2;
  if (speed === 1.2) return 4;
  return 3;
}

function getBoneNode(vrm: VRM, name: BoneName): Object3D | null {
  try {
    return vrm.humanoid.getNormalizedBoneNode(name) ?? null;
  } catch {
    return null;
  }
}

export function createVrmMotionRig(vrm: VRM): VrmMotionRig {
  const bones: Partial<Record<BoneName, BoneState>> = {};

  const boneNames: readonly BoneName[] = [
    BONE.hips,
    BONE.spine,
    BONE.chest,
    BONE.neck,
    BONE.head,
    BONE.leftUpperArm,
    BONE.leftLowerArm,
    BONE.leftHand,
    BONE.rightUpperArm,
    BONE.rightLowerArm,
    BONE.rightHand,
  ];

  for (const name of boneNames) {
    const node = getBoneNode(vrm, name);
    if (!node) continue;
    bones[name] = {
      node,
      baseQuaternion: node.quaternion.clone(),
    };
  }

  // ルートは vrm.scene を対象にする（存在は必ずある）
  return {
    bones,
    root: {
      node: vrm.scene,
      baseQuaternion: vrm.scene.quaternion.clone(),
      basePosition: vrm.scene.position.clone(),
    },
  };
}

function addBoneOffsetEuler(
  rig: VrmMotionRig,
  name: BoneName,
  euler: Euler,
  strength: number,
): void {
  const entry = rig.bones[name];
  if (!entry) return;

  const q = new Quaternion().setFromEuler(
    new Euler(euler.x * strength, euler.y * strength, euler.z * strength),
  );
  entry.node.quaternion.multiply(q);
}

function setRootOffset(
  rig: VrmMotionRig,
  params: { yawRad?: number; yOffset?: number; strength: number },
): void {
  const { yawRad = 0, yOffset = 0, strength } = params;
  const q = new Quaternion().setFromEuler(new Euler(0, yawRad * strength, 0));
  rig.root.node.quaternion.copy(rig.root.baseQuaternion).multiply(q);
  rig.root.node.position.copy(rig.root.basePosition);
  rig.root.node.position.y += yOffset * strength;
}

function setExpressionSafe(vrm: VRM, name: string, value: number): void {
  const v = clamp(value, 0, 1);
  try {
    vrm.expressionManager?.setValue(name, v);
  } catch {
    // 表情が無い/名前が違う場合は無視（落とさない）
  }
}

function applyBlink(vrm: VRM, value: number): void {
  // VRM1: blink / blinkLeft / blinkRight
  setExpressionSafe(vrm, "blink", value);
  setExpressionSafe(vrm, "blinkLeft", value);
  setExpressionSafe(vrm, "blinkRight", value);

  // VRM0互換っぽい名前も試す
  setExpressionSafe(vrm, "Blink", value);
  setExpressionSafe(vrm, "blink_l", value);
  setExpressionSafe(vrm, "blink_r", value);
}

function applySmile(vrm: VRM, value: number): void {
  setExpressionSafe(vrm, "happy", value);
  setExpressionSafe(vrm, "joy", value);
  setExpressionSafe(vrm, "smile", value);
  setExpressionSafe(vrm, "Joy", value);
}

export function resetVrmMotionRig(rig: VrmMotionRig): void {
  // 毎フレーム「初期姿勢に戻す」ことで、積み上げ誤差やドリフトを防ぐ
  rig.root.node.quaternion.copy(rig.root.baseQuaternion);
  rig.root.node.position.copy(rig.root.basePosition);

  for (const entry of Object.values(rig.bones)) {
    if (!entry) continue;
    entry.node.quaternion.copy(entry.baseQuaternion);
  }
}

function applyRelaxedBasePose(rig: VrmMotionRig, presetId: MotionPresetId): void {
  // Tポーズっぽさを消して「自然な立ち姿」に寄せる（Iポーズ寄り）
  // NOTE:
  // - モデルごとに骨向きが微妙に異なるため、極端にせず“雰囲気”を優先する
  // - `resetVrmMotionRig()` の直後に呼び、以降は addBoneOffsetEuler で上書きではなく“重ねる”
  const s = 1.0;

  // 腕をまっすぐ下ろす（Iポーズ）
  // - Z回転で“下げる”量を強めに
  // - 肘はほぼ伸ばす
  addBoneOffsetEuler(rig, BONE.leftUpperArm, new Euler(0.08, 0.0, 1.22), s);
  // Wave/Point は右腕を大きく使うので、ベース補正を重ねるとねじれやすい。
  // 右腕は“素のボーン向き”からモーション側で作る。
  const skipRightArmBase = presetId === "wave" || presetId === "point";
  if (!skipRightArmBase) {
    addBoneOffsetEuler(rig, BONE.rightUpperArm, new Euler(0.08, 0.0, -1.22), s);
  }

  // 肘はほぼ伸ばす（わずかに緩める程度）
  addBoneOffsetEuler(rig, BONE.leftLowerArm, new Euler(-0.06, 0.0, 0.02), s);
  if (!skipRightArmBase) {
    addBoneOffsetEuler(rig, BONE.rightLowerArm, new Euler(-0.06, 0.0, -0.02), s);
  }

  // 手首はニュートラル寄り（やりすぎると不自然になりやすい）
  addBoneOffsetEuler(rig, BONE.leftHand, new Euler(0.0, 0.04, 0.04), s);
  if (!skipRightArmBase) {
    addBoneOffsetEuler(rig, BONE.rightHand, new Euler(0.0, -0.04, -0.04), s);
  }

  // NOTE:
  // 胴体（服）が潰れる個体があるため、胸の前後傾（X回転）はベース補正では行わない。
  // 必要なら各モーション側で最小限の調整を入れる。
}

export function applyMotion(params: {
  vrm: VRM;
  rig: VrmMotionRig;
  t: number; // seconds
  presetId: MotionPresetId;
  strength: MotionStrength;
  speed: MotionSpeed;
}): void {
  const { vrm, rig, t, presetId } = params;
  const strength = params.strength;
  const cycles = cyclesForSpeed(params.speed);
  const phase = (t / 3) * TAU * cycles;

  // 表情は毎フレーム上書きする（残りを0に戻す意味も兼ねる）
  applyBlink(vrm, 0);
  applySmile(vrm, 0);

  // ベース姿勢（Tポーズ回避）
  applyRelaxedBasePose(rig, presetId);

  if (presetId === "wave") {
    // 片腕を上げて、腕全体（肩＋肘）を横に振る
    const swing = Math.sin(phase * 2.2);
    const swingFast = Math.sin(phase * 4.4);

    // NOTE: 要望により、Waveでは体（root）の回転/上下は行わない

    // NOTE:
    // Strength は「振り幅」だけに効かせ、腕の“基本位置（挙上/肘曲げ）”は固定する。
    const swingStrength = strength;

    addBoneOffsetEuler(
      rig,
      BONE.rightUpperArm,
      // 基本姿勢（固定）
      // - 腕を高く上げる
      // - 肘を曲げた状態で顔の横に寄せる
      // NOTE: Meebitsは骨軸が素直でないことがあるため、ねじり(Z)は控えめにする
      new Euler(-0.85, -0.55, 0.25),
      1.0,
    );
    // 振り幅（Strengthで増減）
    addBoneOffsetEuler(
      rig,
      BONE.rightUpperArm,
      // 肩で横に振る
      new Euler(0.0, 0.35 * swing, 0.0),
      swingStrength,
    );
    addBoneOffsetEuler(
      rig,
      BONE.rightLowerArm,
      // 基本姿勢（固定）
      // 肘を曲げる（自然な手振りの基本）
      new Euler(0.50, 0.0, 0.1),
      1.0,
    );
    // 振り幅（Strengthで増減）
    addBoneOffsetEuler(
      rig,
      BONE.rightLowerArm,
      // 前腕も少し追従（手首主導にしない）
      new Euler(0.0, 0.0, 0.0),
      swingStrength,
    );
    addBoneOffsetEuler(
      rig,
      BONE.rightHand,
      // 手首は補助（最小限）
      // 手のひらを前（カメラ）に向ける方向へ寄せる
      // NOTE: 骨軸差があるため、過剰なねじりは避ける
      // NOTE:
      // 以前は手の甲が見えやすかったため、Wave時は手首のベース回転を少し反転寄りにして
      // “掌が見える”方向へ寄せる（モデル差を考慮して控えめに）。
      new Euler(0.0, 0.55, 0.2),
      1.0,
    );
    addBoneOffsetEuler(
      rig,
      BONE.rightHand,
      // 手首は“味付け”程度（振りの主役は肩＋肘）
      new Euler(0.0, 0.08 * swingFast, 0.05 * swing),
      swingStrength,
    );
    addBoneOffsetEuler(
      rig,
      BONE.head,
      new Euler(0.05, 0.0, -0.18),
      strength,
    );

    applySmile(vrm, 0.35 * strength);
  } else if (presetId === "nod") {
    const nod = Math.sin(phase * 1.3);
    addBoneOffsetEuler(rig, BONE.head, new Euler(0.38 * nod, 0, 0), strength);
    addBoneOffsetEuler(rig, BONE.neck, new Euler(0.12 * nod, 0, 0), strength);
  } else if (presetId === "bow") {
    // 0..1.2秒で一往復、それ以降は待機揺れ
    const bowT = clamp(t / 1.2, 0, 1);
    const bow = Math.sin(bowT * Math.PI); // 0→1→0
    const idle = 0.15 * Math.sin(phase * 1.5);

    // NOTE: モデルによって前方向の符号が逆に見えることがあるため、"前屈" 側に寄せて符号を反転
    addBoneOffsetEuler(
      rig,
      BONE.chest,
      new Euler(-(0.55 * bow + 0.05 * idle), 0, 0),
      strength,
    );
    addBoneOffsetEuler(
      rig,
      BONE.spine,
      new Euler(-(0.35 * bow + 0.03 * idle), 0, 0),
      strength,
    );
    // 頭は少しだけ追従（倒れすぎると不自然）
    addBoneOffsetEuler(rig, BONE.head, new Euler(0.08 * bow, 0, 0), strength);

    applySmile(vrm, 0.22 * strength);
  } else if (presetId === "point") {
    // 指差しっぽく：腕を前へ伸ばして手首を整え、上体も少しだけ回す
    const sway = Math.sin(phase * 0.8);
    setRootOffset(rig, {
      yawRad: 0.10 * sway,
      yOffset: 0.005 * Math.sin(phase * 1.6),
      strength,
    });

    addBoneOffsetEuler(
      rig,
      BONE.rightUpperArm,
      // Tポーズ（横）→ 前方向に向けるには Y 回転が効きやすい
      // - Y: 前へ向ける
      // - X: 少し上げる
      new Euler(-0.25, 1.25, 0.0),
      strength,
    );
    addBoneOffsetEuler(
      rig,
      BONE.rightLowerArm,
      // ほぼ伸ばす
      new Euler(-0.02, 0.10, 0.0),
      strength,
    );
    addBoneOffsetEuler(
      rig,
      BONE.rightHand,
      // 手首で“指差し”っぽい向きを作る
      new Euler(0.0, -(0.10 + 0.08 * sway), 0.08),
      strength,
    );
    addBoneOffsetEuler(
      rig,
      BONE.head,
      new Euler(0.0, 0.18, 0.0),
      strength,
    );
  } else if (presetId === "shrug") {
    const tilt = Math.sin(phase);

    addBoneOffsetEuler(
      rig,
      BONE.chest,
      new Euler(-0.05, 0, 0),
      strength,
    );
    setRootOffset(rig, { yOffset: 0.015, strength });

    addBoneOffsetEuler(
      rig,
      BONE.leftUpperArm,
      new Euler(0.10, 0.0, 0.35),
      strength,
    );
    addBoneOffsetEuler(
      rig,
      BONE.rightUpperArm,
      new Euler(0.10, 0.0, -0.35),
      strength,
    );
    addBoneOffsetEuler(rig, BONE.head, new Euler(0.0, 0.0, 0.22 * tilt), strength);
  } else if (presetId === "spinPose") {
    // 0..2.5秒で回転 → 残りは固定
    const p = smoothstep01(t / 2.5);
    const yaw = (160 * Math.PI) / 180;
    setRootOffset(rig, { yawRad: yaw * p, strength });
    addBoneOffsetEuler(rig, BONE.chest, new Euler(-0.05, 0, 0), strength);
    applySmile(vrm, 0.18 * strength);
  } else if (presetId === "jump") {
    const jump = Math.sin(phase);
    const up = Math.max(0, jump);
    const y = 0.12 * up * up; // 上方向だけ（着地は0）
    const landing = Math.max(0, -jump);
    const sink = -0.03 * landing * landing;

    setRootOffset(rig, { yOffset: y + sink, strength });
    addBoneOffsetEuler(
      rig,
      BONE.leftUpperArm,
      new Euler(-0.25 * up, 0, 0.12),
      strength,
    );
    addBoneOffsetEuler(
      rig,
      BONE.rightUpperArm,
      new Euler(-0.25 * up, 0, -0.12),
      strength,
    );
    addBoneOffsetEuler(rig, BONE.chest, new Euler(-0.12 * landing, 0, 0), strength);
  } else if (presetId === "idleCool") {
    const breathe = Math.sin(phase);
    const headYaw = Math.sin(phase * 0.5);

    addBoneOffsetEuler(rig, BONE.chest, new Euler(0.04 * breathe, 0, 0), strength);
    addBoneOffsetEuler(
      rig,
      BONE.head,
      new Euler(0.02 * breathe, 0.18 * headYaw, 0),
      strength,
    );

    // 一定間隔のまばたき
    const blink = pulse01(((t % 1.5) + 1.5) % 1.5, 0.08, 0.06);
    applyBlink(vrm, blink);
    applySmile(vrm, 0.12 * strength);
  }

  // 表情の反映
  try {
    vrm.expressionManager?.update();
  } catch {
    // ignore
  }
}

