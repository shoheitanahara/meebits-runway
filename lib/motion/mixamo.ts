import type { MotionSpeed, MotionStrength } from "@/types";
import {
  AnimationClip,
  AnimationMixer,
  Euler,
  Object3D,
  Quaternion,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import {
  BONE,
  type BoneName,
  type VrmMotionRig,
} from "@/lib/motion/applyMotion";

/**
 * Mixamo FBX → VRM リターゲット用モジュール
 *
 * 方針:
 * - FBX と VRM はボーン軸が一致しないため「ローカル差分」は破綻しやすい。
 *   そのため「ワールド空間の差分回転」をターゲットへ適用する。
 * - 位置（トランスレーション）はGIF用途で破綻しやすいので扱わない（ルートは固定）。
 * - ただし拍手（clapping）のように"手先位置"が重要な動きは、骨長差だけでズレが残る。
 *   その場合は「Mixamo手先位置を肩幅比で写像 → CCD IK で追い込む」。
 */

export type MixamoMotionSource = Readonly<{
  root: Object3D;
  clip: AnimationClip;
  mixer: AnimationMixer;
  actionId: string;
  durationSec: number;
  bones: Partial<Record<BoneName, Object3D>>;
  /**
   * 各ボーンの「FBX読み込み直後の姿勢」におけるワールド回転（= Mixamo側の基準姿勢）。
   * リターゲットは「ワールド差分」を用いるため、ローカルの軸差に強い。
   */
  restWorld: Partial<Record<BoneName, Quaternion>>;
}>;

// ---- ユーティリティ ----

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ---- 一時変数（リターゲット用） ----
const _q0 = new Quaternion();
const _q1 = new Quaternion();
const _q2 = new Quaternion();

// ---- ヘルパー関数 ----

function addBoneOffsetEuler(
  rig: VrmMotionRig,
  name: BoneName,
  euler: Euler,
  strength: number,
): void {
  const entry = rig.bones[name];
  if (!entry) return;
  const q = new Quaternion().setFromEuler(euler);
  q.slerp(new Quaternion(), 1 - strength);
  entry.node.quaternion.multiply(q);
}

export function applyMixamoBasePose(rig: VrmMotionRig): void {
  const s = 0.75;
  addBoneOffsetEuler(rig, BONE.leftShoulder, new Euler(0.0, 0.0, 0.05), s);
  addBoneOffsetEuler(rig, BONE.rightShoulder, new Euler(0.0, 0.0, -0.05), s);
  addBoneOffsetEuler(rig, BONE.leftUpperArm, new Euler(0.02, 0.07, 0.38), s);
  addBoneOffsetEuler(rig, BONE.rightUpperArm, new Euler(0.02, -0.07, -0.38), s);
  addBoneOffsetEuler(rig, BONE.leftLowerArm, new Euler(0.0, 0.0, 0.05), s);
  addBoneOffsetEuler(rig, BONE.rightLowerArm, new Euler(0.0, 0.0, -0.05), s);
  addBoneOffsetEuler(rig, BONE.leftHand, new Euler(0.0, 0.03, 0.03), s);
  addBoneOffsetEuler(rig, BONE.rightHand, new Euler(0.0, -0.03, -0.03), s);
}

function getBoneGain(name: BoneName): number {
  switch (name) {
    case BONE.hips:
      return 0.70;
    case BONE.spine:
      return 0.80;
    case BONE.chest:
      return 0.85;
    case BONE.upperChest:
      return 0.90;
    case BONE.neck:
      return 0.85;
    case BONE.head:
      return 0.90;
    case BONE.leftShoulder:
    case BONE.rightShoulder:
      return 1.0;
    case BONE.leftUpperArm:
    case BONE.rightUpperArm:
      return 1.0;
    case BONE.leftLowerArm:
    case BONE.rightLowerArm:
      return 1.0;
    case BONE.leftHand:
    case BONE.rightHand:
      return 1.0;
    case BONE.leftUpperLeg:
    case BONE.rightUpperLeg:
      return 0.75;
    case BONE.leftLowerLeg:
    case BONE.rightLowerLeg:
      return 0.70;
    case BONE.leftFoot:
    case BONE.rightFoot:
      return 0.45;
    case BONE.leftToes:
    case BONE.rightToes:
      return 0.30;
    default:
      return 1.0;
  }
}

function getBoneMaxAngleRad(name: BoneName): number {
  switch (name) {
    case BONE.hips:
      return 0.90;
    case BONE.spine:
      return 1.00;
    case BONE.chest:
      return 1.00;
    case BONE.upperChest:
      return 1.00;
    case BONE.neck:
      return 0.90;
    case BONE.head:
      return 1.00;
    case BONE.leftShoulder:
    case BONE.rightShoulder:
    case BONE.leftUpperArm:
    case BONE.rightUpperArm:
    case BONE.leftLowerArm:
    case BONE.rightLowerArm:
    case BONE.leftHand:
    case BONE.rightHand:
      return Math.PI;
    case BONE.leftUpperLeg:
    case BONE.rightUpperLeg:
      return 1.00;
    case BONE.leftLowerLeg:
    case BONE.rightLowerLeg:
      return 1.00;
    case BONE.leftFoot:
    case BONE.rightFoot:
      return 0.60;
    case BONE.leftToes:
    case BONE.rightToes:
      return 0.40;
    default:
      return Math.PI;
  }
}

// ---- Mixamo 骨名マッピング ----

function normalizeMixamoBoneName(raw: string): string {
  const stripped = raw
    .replace(/^mixamorig[:_]?/iu, "")
    .replaceAll(/\s+/gu, "");
  return stripped.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
}

const MIXAMO_TO_VRM: Readonly<Record<string, BoneName>> = {
  hips: BONE.hips,
  spine: BONE.spine,
  spine1: BONE.chest,
  spine2: BONE.upperChest,
  neck: BONE.neck,
  head: BONE.head,
  leftshoulder: BONE.leftShoulder,
  leftarm: BONE.leftUpperArm,
  leftforearm: BONE.leftLowerArm,
  lefthand: BONE.leftHand,
  rightshoulder: BONE.rightShoulder,
  rightarm: BONE.rightUpperArm,
  rightforearm: BONE.rightLowerArm,
  righthand: BONE.rightHand,
  leftupleg: BONE.leftUpperLeg,
  leftleg: BONE.leftLowerLeg,
  leftfoot: BONE.leftFoot,
  lefttoebase: BONE.leftToes,
  rightupleg: BONE.rightUpperLeg,
  rightleg: BONE.rightLowerLeg,
  rightfoot: BONE.rightFoot,
  righttoebase: BONE.rightToes,
} as const;

function buildBoneIndex(root: Object3D): Map<string, Object3D> {
  const index = new Map<string, Object3D>();
  root.traverse((node) => {
    if (!node.name) return;
    const key = normalizeMixamoBoneName(node.name);
    if (key.length === 0) return;
    if (!index.has(key)) index.set(key, node);
  });
  return index;
}

function pickPrimaryClip(root: Object3D): AnimationClip | null {
  const clips = root.animations ?? [];
  if (clips.length === 0) return null;
  return clips[0] ?? null;
}

// ---- MixamoMotionSource 生成 ----

export async function createMixamoMotionSource(
  fbxArrayBuffer: ArrayBuffer,
): Promise<MixamoMotionSource> {
  await new Promise<void>((r) => queueMicrotask(() => r()));

  const loader = new FBXLoader();
  const root = loader.parse(fbxArrayBuffer, "");
  const clip = pickPrimaryClip(root);
  if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) {
    throw new Error("No valid animation clips found in the FBX file.");
  }

  const boneIndex = buildBoneIndex(root);
  const bones: Partial<Record<BoneName, Object3D>> = {};
  const restWorld: Partial<Record<BoneName, Quaternion>> = {};

  try {
    root.updateWorldMatrix(true, true);
  } catch {
    // ignore
  }

  for (const [mixamoKey, vrmBone] of Object.entries(MIXAMO_TO_VRM)) {
    const node = boneIndex.get(mixamoKey);
    if (!node) continue;
    bones[vrmBone] = node;
    try {
      node.updateWorldMatrix(true, false);
      restWorld[vrmBone] = node.getWorldQuaternion(new Quaternion());
    } catch {
      // ignore
    }
  }

  const mixer = new AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();

  return {
    root,
    clip,
    mixer,
    actionId: action.getClip().uuid,
    durationSec: clip.duration,
    bones,
    restWorld,
  };
}

// ---- クオータニオンスケール ----

function quatScaleByAxisAngleClamped(params: {
  delta: Quaternion;
  scale: number;
  maxAngleRad: number;
  out: Quaternion;
}): Quaternion {
  const { delta, scale, maxAngleRad, out } = params;
  if (!Number.isFinite(scale)) return out.identity();
  if (Math.abs(scale) <= 1e-8) return out.identity();

  const d = _q0.copy(delta);
  if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
  d.normalize();

  const w = Math.min(1, Math.max(-1, d.w));
  const halfAngle = Math.acos(w);
  const sinHalf = Math.sin(halfAngle);
  if (sinHalf < 1e-6) return out.identity();

  const axisX = d.x / sinHalf;
  const axisY = d.y / sinHalf;
  const axisZ = d.z / sinHalf;

  const fullAngle = halfAngle * 2;
  const clampedAngle = Math.min(fullAngle * scale, maxAngleRad);
  const newHalf = clampedAngle / 2;

  const s = Math.sin(newHalf);
  out.set(axisX * s, axisY * s, axisZ * s, Math.cos(newHalf));
  return out.normalize();
}

// ---- ループ ----

function wrap01(value: number): number {
  const v = value % 1;
  return v < 0 ? v + 1 : v;
}

// ---- メイン適用関数 ----

const RETARGET_ORDER: readonly BoneName[] = [
  BONE.hips,
  BONE.spine,
  BONE.chest,
  BONE.upperChest,
  BONE.neck,
  BONE.head,
  BONE.leftShoulder,
  BONE.leftUpperArm,
  BONE.leftLowerArm,
  BONE.leftHand,
  BONE.rightShoulder,
  BONE.rightUpperArm,
  BONE.rightLowerArm,
  BONE.rightHand,
  BONE.leftUpperLeg,
  BONE.leftLowerLeg,
  BONE.leftFoot,
  BONE.leftToes,
  BONE.rightUpperLeg,
  BONE.rightLowerLeg,
  BONE.rightFoot,
  BONE.rightToes,
];

export function applyMixamoMotionToRig(params: {
  source: MixamoMotionSource;
  rig: VrmMotionRig;
  t: number;
  strength: MotionStrength;
  speed: MotionSpeed;
}): void {
  const { source, rig, t, strength, speed } = params;

  const speedFactor = speed;
  const duration = source.durationSec;
  const srcTime = wrap01((t * speedFactor) / duration) * duration;

  try {
    source.mixer.setTime(srcTime);
  } catch {
    // ignore
  }

  try {
    source.root.updateWorldMatrix(true, true);
  } catch {
    // ignore
  }

  try {
    rig.bones[BONE.hips]?.node.updateWorldMatrix(true, true);
  } catch {
    // ignore
  }

  // ======== ワールド差分リターゲット ========
  const baseStrength = strength;

  for (const boneName of RETARGET_ORDER) {
    const entry = rig.bones[boneName];
    const srcNode = source.bones[boneName];
    const srcRestWorld = source.restWorld[boneName];
    const tgtRestWorld = rig.restWorld[boneName];
    if (!entry || !srcNode || !srcRestWorld || !tgtRestWorld) continue;

    try {
      entry.node.parent?.updateWorldMatrix(true, false);
    } catch {
      // ignore
    }

    let srcWorld: Quaternion;
    try {
      srcWorld = srcNode.getWorldQuaternion(_q0);
    } catch {
      continue;
    }
    // ワールド空間差分（左掛け）: delta = current * inv(rest)
    // NOTE:
    // - 以前は inv(rest) * current（右掛け＝ボーンローカル差分）だったが、
    //   Mixamo と VRM ではボーン軸が異なるため、Bow が後ろに反る等の問題が起きた。
    // - 左掛けなら「ワールド空間でどう回転したか」を保ちやすく、
    //   ボーン軸の違いに影響されにくい。
    const deltaWorld = _q1.copy(srcWorld).multiply(_q2.copy(srcRestWorld).invert()).normalize();

    const gain = getBoneGain(boneName);
    const maxAngleRad = getBoneMaxAngleRad(boneName);
    const effectiveScale = clamp(baseStrength * gain, 0, 1.25);
    const scaledDeltaWorld = quatScaleByAxisAngleClamped({
      delta: deltaWorld,
      scale: effectiveScale,
      maxAngleRad,
      out: _q2,
    });

    // 左掛けで適用: desired = scaledDelta * tgtRest
    const desiredWorld = _q1.copy(scaledDeltaWorld).multiply(tgtRestWorld).normalize();

    const parent = entry.node.parent;
    const parentWorld = parent ? parent.getWorldQuaternion(_q0) : _q0.identity();
    const desiredLocal = _q2.copy(parentWorld).invert().multiply(desiredWorld).normalize();

    const restLocal = entry.baseQuaternion;
    const deltaLocal = _q1.copy(restLocal).invert().multiply(desiredLocal).normalize();
    entry.node.quaternion.copy(restLocal).multiply(deltaLocal);

    try {
      entry.node.updateWorldMatrix(false, false);
    } catch {
      // ignore
    }
  }

}

// ---- 破棄 ----

export function disposeMixamoMotionSource(source: MixamoMotionSource | null): void {
  if (!source) return;
  try {
    source.mixer.stopAllAction();
  } catch {
    // ignore
  }

  try {
    source.root.traverse((node) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyNode = node as any;
      try {
        anyNode.geometry?.dispose?.();
      } catch {
        // ignore
      }
      const material = anyNode.material;
      if (Array.isArray(material)) {
        for (const m of material) {
          try {
            m?.dispose?.();
          } catch {
            // ignore
          }
        }
      } else {
        try {
          material?.dispose?.();
        } catch {
          // ignore
        }
      }
    });
  } catch {
    // ignore
  }
}
