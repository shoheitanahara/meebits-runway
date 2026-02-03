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
 * - FBXの骨軸差/初期姿勢差を完全に吸収するのは難しいため、
 *   まずは「各ボーンのローカル回転の差分」をVRMの基準姿勢へ適用する方式にする。
 * - 位置（トランスレーション）はGIF用途で破綻しやすいので扱わない（ルートは固定）。
 */

export type MixamoMotionSource = Readonly<{
  root: Object3D;
  clip: AnimationClip;
  mixer: AnimationMixer;
  actionId: string;
  durationSec: number;
  bones: Partial<Record<BoneName, Object3D>>;
  restInv: Partial<Record<BoneName, Quaternion>>;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addBoneOffsetEuler(
  rig: VrmMotionRig,
  name: BoneName,
  euler: Euler,
  strength: number,
): void {
  const entry = rig.bones[name];
  if (!entry) return;
  const q = new Quaternion().setFromEuler(euler);
  // strength でブレンド（0なら無回転、1なら全量適用）
  q.slerp(new Quaternion(), 1 - strength);
  entry.node.quaternion.multiply(q);
}

export function applyMixamoBasePose(rig: VrmMotionRig): void {
  // 強すぎると腕が内側に入りすぎる個体があるため、ベース補正は控えめにする。
  // NOTE: Mixamo差分で最終形は上書きされるので、ここは"初期姿勢の癖取り"が目的。
  // ただし強すぎると「腕を上げる」等のMixamo差分と相殺してしまうので、バランスを取る。
  const s = 0.75;

  // 肩はほんの少しだけ内側へ（肘が外に逃げるのを抑える）
  addBoneOffsetEuler(rig, BONE.leftShoulder, new Euler(0.0, 0.0, 0.05), s);
  addBoneOffsetEuler(rig, BONE.rightShoulder, new Euler(0.0, 0.0, -0.05), s);

  // 上腕：腕を落として脇を閉める（Iポーズ寄り）
  // NOTE: Meebitsは骨軸差で「落とす(Z)」が内巻きに見えることがあるため、
  // 少しだけ外向き（Y）成分を足してバランスを取る。
  // NOTE: 強すぎるとMixamoの「腕を上げる」動きと相殺してしまうので、かなり控えめにする。
  addBoneOffsetEuler(rig, BONE.leftUpperArm, new Euler(0.03, 0.08, 0.55), s);
  addBoneOffsetEuler(rig, BONE.rightUpperArm, new Euler(0.03, -0.08, -0.55), s);

  // 前腕は軽く絞るだけ（内側へ巻き込みを抑える）
  addBoneOffsetEuler(rig, BONE.leftLowerArm, new Euler(0.0, 0.0, 0.05), s);
  addBoneOffsetEuler(rig, BONE.rightLowerArm, new Euler(0.0, 0.0, -0.05), s);

  // 手首もほんのわずか内向き
  addBoneOffsetEuler(rig, BONE.leftHand, new Euler(0.0, 0.03, 0.03), s);
  addBoneOffsetEuler(rig, BONE.rightHand, new Euler(0.0, -0.03, -0.03), s);
}

function getBoneGain(name: BoneName): number {
  // 体幹は弱め、四肢は優先（Meebitsの見た目が破綻しにくい寄せ）
  switch (name) {
    case BONE.hips:
      return 0.35;
    case BONE.spine:
      return 0.45;
    case BONE.chest:
      return 0.65;
    case BONE.upperChest:
      return 0.70;
    case BONE.neck:
      return 0.75;
    case BONE.head:
      return 0.80;
    case BONE.leftShoulder:
    case BONE.rightShoulder:
      // 肩の上げを出すためgainを高めに
      return 1.00;
    case BONE.leftUpperArm:
    case BONE.rightUpperArm:
      return 1.00;
    case BONE.leftLowerArm:
    case BONE.rightLowerArm:
      return 1.00;
    case BONE.leftHand:
    case BONE.rightHand:
      return 0.85;
    case BONE.leftUpperLeg:
    case BONE.rightUpperLeg:
      return 0.55;
    case BONE.leftLowerLeg:
    case BONE.rightLowerLeg:
      return 0.50;
    case BONE.leftFoot:
    case BONE.rightFoot:
      return 0.25;
    case BONE.leftToes:
    case BONE.rightToes:
      return 0.15;
    default:
      return 1.0;
  }
}

function getBoneMaxAngleRad(name: BoneName): number {
  // 角度クランプで"ねじれ/暴れ"を抑える（特に体幹）
  switch (name) {
    case BONE.hips:
      return 0.45;
    case BONE.spine:
      return 0.55;
    case BONE.chest:
      return 0.60;
    case BONE.upperChest:
      return 0.65;
    case BONE.neck:
      return 0.55;
    case BONE.head:
      return 0.65;
    case BONE.leftShoulder:
    case BONE.rightShoulder:
      // 肩の上げを出すため角度を広げる
      return 1.20;
    case BONE.leftUpperArm:
    case BONE.rightUpperArm:
      return 1.80;
    case BONE.leftLowerArm:
    case BONE.rightLowerArm:
      return 1.70;
    case BONE.leftHand:
    case BONE.rightHand:
      return 1.20;
    case BONE.leftUpperLeg:
    case BONE.rightUpperLeg:
      return 0.75;
    case BONE.leftLowerLeg:
    case BONE.rightLowerLeg:
      return 0.60;
    case BONE.leftFoot:
    case BONE.rightFoot:
      return 0.35;
    case BONE.leftToes:
    case BONE.rightToes:
      return 0.20;
    default:
      return Math.PI;
  }
}

function getBoneAxisScale(
  name: BoneName,
): Readonly<{ x: number; y: number; z: number }> {
  // 軸ごとの抑制（Meebits側の見た目に寄せる）
  // NOTE:
  // - Mixamo→任意VRMは骨軸が一致しないため、厳密な意味での X/Y/Z はモデル依存。
  // - それでも「体幹の反り（pitch）」「脚の内股（yaw/adduction）」が出やすいので、
  //   実用上の"暴れ抑制"として緩く効かせる。
  switch (name) {
    case BONE.hips:
      // 重心の大きな傾きを抑える（上半身が倒れすぎない）
      return { x: 0.65, y: 0.35, z: 0.35 };
    case BONE.spine:
    case BONE.chest:
    case BONE.upperChest:
      // 上体の反り/捻りを抑えつつ、横傾きは少し許容
      return { x: 0.70, y: 0.45, z: 0.45 };
    case BONE.neck:
    case BONE.head:
      return { x: 0.85, y: 0.85, z: 0.85 };
    case BONE.leftShoulder:
    case BONE.rightShoulder:
      // 肩の上げ(X)を優先、Y/Zは少し抑える
      return { x: 1.00, y: 0.85, z: 0.85 };
    case BONE.leftUpperArm:
    case BONE.rightUpperArm:
      // 腕が体を横切りすぎ（クロス）になりやすいので、横方向成分を少し抑える
      // ただし抑えすぎると「腕を上げる」動きが出なくなるので、控えめに
      return { x: 1.0, y: 0.92, z: 0.95 };
    case BONE.leftLowerArm:
    case BONE.rightLowerArm:
      return { x: 1.0, y: 0.92, z: 0.95 };
    case BONE.leftHand:
    case BONE.rightHand:
      return { x: 1.0, y: 0.92, z: 0.95 };
    case BONE.leftUpperLeg:
    case BONE.rightUpperLeg:
      // 脚の横方向（開き/クロス）を強めに抑える
      return { x: 0.85, y: 0.25, z: 0.25 };
    case BONE.leftLowerLeg:
    case BONE.rightLowerLeg:
      return { x: 0.75, y: 0.20, z: 0.20 };
    case BONE.leftFoot:
    case BONE.rightFoot:
      // 足首は回転自体を小さく、特にyaw/rollは抑える
      return { x: 0.55, y: 0.15, z: 0.15 };
    case BONE.leftToes:
    case BONE.rightToes:
      return { x: 0.40, y: 0.10, z: 0.10 };
    default:
      return { x: 1.0, y: 1.0, z: 1.0 };
  }
}

function clampEulerForArmCrossing(boneName: BoneName, euler: Euler): void {
  // "腕が体の前を横切りすぎる"のを抑えるため、腕だけ追加クランプ。
  // NOTE: 骨軸差があるので強すぎる制限は避ける。共通で軽く効かせる。
  const isArm =
    boneName === BONE.leftUpperArm ||
    boneName === BONE.rightUpperArm ||
    boneName === BONE.leftLowerArm ||
    boneName === BONE.rightLowerArm ||
    boneName === BONE.leftHand ||
    boneName === BONE.rightHand;
  if (!isArm) return;

  const yMax = 0.95;
  const zMax = 1.35;
  euler.y = clamp(euler.y, -yMax, yMax);
  euler.z = clamp(euler.z, -zMax, zMax);
}

function normalizeMixamoBoneName(raw: string): string {
  // Mixamo骨名の揺れを吸収（例: "mixamorig:Hips", "mixamorigHips", "mixamorig_Hips"）
  const stripped = raw
    .replace(/^mixamorig[:_]?/iu, "")
    .replaceAll(/\s+/gu, "");
  // 英数字だけにして lowerCase キー化
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
    // 先勝ち（同名が複数ある場合は最初のものを採用）
    if (!index.has(key)) index.set(key, node);
  });
  return index;
}

function pickPrimaryClip(root: Object3D): AnimationClip | null {
  const clips = root.animations ?? [];
  if (clips.length === 0) return null;
  // 多くのMixamo FBXは 1 つだけ想定。複数ある場合は最初を採用。
  return clips[0] ?? null;
}

export async function createMixamoMotionSource(
  fbxArrayBuffer: ArrayBuffer,
): Promise<MixamoMotionSource> {
  // FBXLoader.parse は同期だが重い可能性があるため、タスク境界を切る
  await new Promise<void>((r) => queueMicrotask(() => r()));

  const loader = new FBXLoader();
  const root = loader.parse(fbxArrayBuffer, "");
  const clip = pickPrimaryClip(root);
  if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) {
    throw new Error("FBXに有効なアニメーションクリップが見つかりませんでした。");
  }

  const boneIndex = buildBoneIndex(root);
  const bones: Partial<Record<BoneName, Object3D>> = {};
  const restInv: Partial<Record<BoneName, Quaternion>> = {};

  for (const [mixamoKey, vrmBone] of Object.entries(MIXAMO_TO_VRM)) {
    const node = boneIndex.get(mixamoKey);
    if (!node) continue;
    bones[vrmBone] = node;
    restInv[vrmBone] = node.quaternion.clone().invert();
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
    restInv,
  };
}

function quatScaleByAxisAngleClamped(params: {
  delta: Quaternion;
  scale: number;
  maxAngleRad: number;
  out: Quaternion;
}): Quaternion {
  const { delta, scale, maxAngleRad, out } = params;
  // delta を軸角へ変換し、角度だけスケールして out に格納
  if (!Number.isFinite(scale)) return out.identity();
  if (Math.abs(scale) <= 1e-8) return out.identity();

  // -q と q は同一回転。w>=0に寄せて角度ジャンプを抑える。
  const d = tmpQ0.copy(delta);
  if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
  d.normalize();

  const w = Math.min(1, Math.max(-1, d.w));
  const halfAngle = Math.acos(w);
  const sinHalf = Math.sin(halfAngle);
  if (sinHalf < 1e-6) {
    // ほぼ無回転
    return out.identity();
  }

  const axisX = d.x / sinHalf;
  const axisY = d.y / sinHalf;
  const axisZ = d.z / sinHalf;

  // クランプ
  const fullAngle = halfAngle * 2;
  const clampedAngle = Math.min(fullAngle * scale, maxAngleRad);
  const newHalf = clampedAngle / 2;

  const s = Math.sin(newHalf);
  out.set(axisX * s, axisY * s, axisZ * s, Math.cos(newHalf));
  return out.normalize();
}

const tmpQ0 = new Quaternion();
const tmpQ1 = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpE0 = new Euler();

function wrap01(value: number): number {
  // JSの % は負値を返す可能性があるので 0..1 に正規化
  const v = value % 1;
  return v < 0 ? v + 1 : v;
}

export function applyMixamoMotionToRig(params: {
  source: MixamoMotionSource;
  rig: VrmMotionRig;
  t: number; // seconds
  strength: MotionStrength;
  speed: MotionSpeed;
}): void {
  const { source, rig, t, strength, speed } = params;

  // ユーザー要望：「動きを早くしない」＝"3秒に収めるための強制ループ/加速"はしない。
  // Mixamoクリップの自然な長さで"素直にループ"させる。
  const speedFactor = speed; // 0.8/1.0/1.2
  const duration = source.durationSec;
  // クリップ長で自然ループ
  const srcTime = wrap01((t * speedFactor) / duration) * duration;

  try {
    source.mixer.setTime(srcTime);
  } catch {
    // ignore
  }

  // strength: 0.5 / 1.0 / 1.5 を「角度スケール」で反映（1.5で誇張可能）
  const baseStrength = strength;

  for (const [boneName, srcNode] of Object.entries(source.bones) as Array<
    [BoneName, Object3D]
  >) {
    const entry = rig.bones[boneName];
    const restInv = source.restInv[boneName];
    if (!entry || !srcNode || !restInv) continue;

    // delta = inv(rest) * current
    const delta = tmpQ1.copy(restInv).multiply(srcNode.quaternion).normalize();
    const gain = getBoneGain(boneName);
    const maxAngleRad = getBoneMaxAngleRad(boneName);
    const effectiveScale = clamp(baseStrength * gain, 0, 1.25);

    // 軸ごとに抑制（脚クロス/上体反り対策）
    // NOTE: 厳密な軸一致は難しいため、暴れ抑制として"ほどほどに"効かせる。
    tmpE0.setFromQuaternion(delta, "YXZ");
    clampEulerForArmCrossing(boneName, tmpE0);
    const axis = getBoneAxisScale(boneName);
    tmpE0.set(tmpE0.x * axis.x, tmpE0.y * axis.y, tmpE0.z * axis.z, "YXZ");
    tmpQ1.setFromEuler(tmpE0);

    const scaled = quatScaleByAxisAngleClamped({
      delta: tmpQ1,
      scale: effectiveScale,
      maxAngleRad,
      out: tmpQ2,
    });
    entry.node.quaternion.multiply(scaled);
  }
}

export function disposeMixamoMotionSource(source: MixamoMotionSource | null): void {
  if (!source) return;
  try {
    source.mixer.stopAllAction();
  } catch {
    // ignore
  }

  // FBXLoaderが生成したGeometry/Materialを明示的に破棄（繰り返しアップロード対策）
  try {
    source.root.traverse((node) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyNode = node as any;
      // geometry
      try {
        anyNode.geometry?.dispose?.();
      } catch {
        // ignore
      }
      // material(s)
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
