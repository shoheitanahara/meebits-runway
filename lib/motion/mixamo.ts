import type { MotionSpeed, MotionStrength } from "@/types";
import {
  AnimationClip,
  AnimationMixer,
  Euler,
  Object3D,
  Quaternion,
  Vector3,
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
 * - ただし拍手（clapping）のように“手先位置”が重要な動きは、骨長差だけでズレが残る。
 *   その場合は「手が近い瞬間だけ」簡易IK（CCD）で手先を寄せて見た目を整える。
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
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
  // NOTE: 腕を上げる系（Waveなど）で「上がらない」原因になりやすいので、
  // 脇を閉めたい場合でも“上腕を落としすぎない”強さに留める。
  const s = 0.75;

  // 肩はほんの少しだけ内側へ（肘が外に逃げるのを抑える）
  addBoneOffsetEuler(rig, BONE.leftShoulder, new Euler(0.0, 0.0, 0.05), s);
  addBoneOffsetEuler(rig, BONE.rightShoulder, new Euler(0.0, 0.0, -0.05), s);

  // 上腕：腕を落として脇を閉める（Iポーズ寄り）
  // NOTE: Meebitsは骨軸差で「落とす(Z)」が内巻きに見えることがあるため、
  // 少しだけ外向き（Y）成分を足してバランスを取る。
  // NOTE: 強すぎるとMixamoの「腕を上げる」動きと相殺してしまうので、かなり控えめにする。
  // 「脇の開き」は肩側で制御し、上腕の“落とし”は弱めにする（腕上げを邪魔しにくくする）。
  addBoneOffsetEuler(rig, BONE.leftUpperArm, new Euler(0.02, 0.07, 0.38), s);
  addBoneOffsetEuler(rig, BONE.rightUpperArm, new Euler(0.02, -0.07, -0.38), s);

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
      // 拍手など“手先位置”が重要なモーションでは誇張がズレの原因になるため 1.0 に揃える
      return 1.0;
    case BONE.leftUpperArm:
    case BONE.rightUpperArm:
      return 1.00;
    case BONE.leftLowerArm:
    case BONE.rightLowerArm:
      return 1.00;
    case BONE.leftHand:
    case BONE.rightHand:
      // 手首の回転量を削ると「手が合わない」原因になりやすいので 1.0 にする
      return 1.0;
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
      // 肩〜手は clapping の精度が最優先。クランプしない方が手先が合いやすい。
      return Math.PI;
    case BONE.leftUpperArm:
    case BONE.rightUpperArm:
      return Math.PI;
    case BONE.leftLowerArm:
    case BONE.rightLowerArm:
      return Math.PI;
    case BONE.leftHand:
    case BONE.rightHand:
      return Math.PI;
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
  const restWorld: Partial<Record<BoneName, Quaternion>> = {};

  // まずは基準姿勢（rest）の world 回転を確定させる
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
const tmpQ3 = new Quaternion();
const tmpQ4 = new Quaternion();
const tmpQ5 = new Quaternion();

const tmpV0 = new Vector3();
const tmpV1 = new Vector3();
const tmpV2 = new Vector3();
const tmpV3 = new Vector3();
const tmpV4 = new Vector3();
const tmpV5 = new Vector3();
const tmpV6 = new Vector3();
const tmpV7 = new Vector3();

function getRootLocalPosition(params: {
  node: Object3D;
  rootWorldPosition: Vector3;
  rootWorldQuaternionInv: Quaternion;
  out: Vector3;
}): Vector3 {
  const { node, rootWorldPosition, rootWorldQuaternionInv, out } = params;
  return out
    .copy(node.getWorldPosition(tmpV3))
    .sub(rootWorldPosition)
    .applyQuaternion(rootWorldQuaternionInv);
}

function rotateJointWorldTowardTarget(params: {
  joint: Object3D;
  effector: Object3D;
  targetWorld: Vector3;
  weight: number; // 0..1
}): void {
  const { joint, effector, targetWorld, weight } = params;
  const w = clamp(weight, 0, 1);
  if (w <= 1e-6) return;

  const jointPos = joint.getWorldPosition(tmpV4);
  const effPos = effector.getWorldPosition(tmpV5);
  const toEff = tmpV6.copy(effPos).sub(jointPos);
  const toTarget = tmpV3.copy(targetWorld).sub(jointPos);
  if (toEff.lengthSq() <= 1e-10 || toTarget.lengthSq() <= 1e-10) return;
  toEff.normalize();
  toTarget.normalize();

  const delta = tmpQ3.setFromUnitVectors(toEff, toTarget);
  // 小さめに効かせる（急なジャンプ防止）
  delta.slerp(tmpQ4.identity(), 1 - w);

  const currentWorld = joint.getWorldQuaternion(tmpQ0);
  const desiredWorld = tmpQ1.copy(delta).multiply(currentWorld).normalize();

  const parentWorld = joint.parent ? joint.parent.getWorldQuaternion(tmpQ2) : tmpQ2.identity();
  const desiredLocal = tmpQ3.copy(parentWorld).invert().multiply(desiredWorld).normalize();
  joint.quaternion.copy(desiredLocal);

  try {
    joint.updateWorldMatrix(false, false);
  } catch {
    // ignore
  }
}

function solveArmCcd(params: {
  shoulder: Object3D;
  upperArm: Object3D;
  lowerArm: Object3D;
  hand: Object3D;
  targetWorld: Vector3;
  weight: number; // 0..1
}): void {
  const { shoulder, upperArm, lowerArm, hand, targetWorld, weight } = params;
  const w = clamp(weight, 0, 1);
  if (w <= 1e-6) return;

  // 少ない反復で十分（GIF用途＆1フレーム補正）
  const iterations = 3;
  for (let i = 0; i < iterations; i += 1) {
    // 肘→肩→肩付け根 の順に効かせると安定しやすい
    rotateJointWorldTowardTarget({ joint: lowerArm, effector: hand, targetWorld, weight: w * 0.85 });
    rotateJointWorldTowardTarget({ joint: upperArm, effector: hand, targetWorld, weight: w * 0.70 });
    rotateJointWorldTowardTarget({ joint: shoulder, effector: hand, targetWorld, weight: w * 0.45 });
  }
}

function applyUpperArmTuck(params: {
  upperArm: Object3D;
  hand: Object3D;
  rootWorldPosition: Vector3;
  rootWorldQuaternion: Quaternion;
  rootWorldQuaternionInv: Quaternion;
  shoulderAxisRootLocal: Vector3; // rootローカルでの左右軸（左肩→右肩）
  tuckFactor: number; // 1.0=無効, <1.0で内側へ畳む
  amount: number; // 0..1
}): void {
  const {
    upperArm,
    hand,
    rootWorldPosition,
    rootWorldQuaternion,
    rootWorldQuaternionInv,
    shoulderAxisRootLocal,
    tuckFactor,
    amount,
  } = params;
  const a = clamp(amount, 0, 1);
  if (a <= 1e-6) return;
  if (!Number.isFinite(tuckFactor) || tuckFactor >= 0.999) return;

  // rootローカルで「上腕→手」の方向を少し内側へ回す。
  // NOTE: 以前は root の X 軸に依存していたが、モデル/カメラで軸が変わるため
  // 「左右肩の軸（左肩→右肩）」を基準に、横方向（外転）成分だけを縮める。
  const upperLocal = getRootLocalPosition({
    node: upperArm,
    rootWorldPosition,
    rootWorldQuaternionInv,
    out: tmpV0,
  });
  const handLocal = getRootLocalPosition({
    node: hand,
    rootWorldPosition,
    rootWorldQuaternionInv,
    out: tmpV1,
  });

  const currentDir = tmpV2.copy(handLocal).sub(upperLocal);
  const len = currentDir.length();
  if (!Number.isFinite(len) || len <= 1e-6) return;
  currentDir.divideScalar(len);

  const desiredDir = tmpV3.copy(currentDir);
  const axis = tmpV4.copy(shoulderAxisRootLocal);
  if (axis.lengthSq() <= 1e-10) return;
  axis.normalize();
  // 横方向成分（肩軸への射影）だけ縮める
  const side = desiredDir.dot(axis);
  desiredDir.addScaledVector(axis, side * (tuckFactor - 1));
  if (desiredDir.lengthSq() <= 1e-10) return;
  desiredDir.normalize();

  // delta（rootローカル）→ deltaWorld（共役変換）
  const deltaLocal = tmpQ3.setFromUnitVectors(currentDir, desiredDir);
  deltaLocal.slerp(tmpQ4.identity(), 1 - a);
  const deltaWorld = tmpQ5
    .copy(rootWorldQuaternion)
    .multiply(deltaLocal)
    .multiply(rootWorldQuaternionInv)
    .normalize();

  const currentUpperWorld = upperArm.getWorldQuaternion(tmpQ0);
  const desiredUpperWorld = tmpQ1.copy(deltaWorld).multiply(currentUpperWorld).normalize();

  const parentWorld = upperArm.parent
    ? upperArm.parent.getWorldQuaternion(tmpQ2)
    : tmpQ2.identity();
  const desiredLocal = tmpQ3.copy(parentWorld).invert().multiply(desiredUpperWorld).normalize();

  upperArm.quaternion.copy(desiredLocal);
  try {
    upperArm.updateWorldMatrix(false, false);
  } catch {
    // ignore
  }
}

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

  // Mixamoボーンの world 取得に必要
  try {
    source.root.updateWorldMatrix(true, true);
  } catch {
    // ignore
  }

  // rig 側は reset 済み前提だが、matrixWorld は自動更新されないためここで同期する
  // （normalized bones は vrm.scene 配下でない場合があるので hips 起点で更新する）
  try {
    rig.bones[BONE.hips]?.node.updateWorldMatrix(true, true);
  } catch {
    // ignore
  }

  // ワールド差分でリターゲットする（骨軸差に強い）
  // NOTE:
  // - 「ローカル差分をそのまま掛ける」方式は骨軸の違いで手位置が大きくズレやすい
  // - ワールド差分なら “見た目の回転” を保ちやすく、拍手など手先が重要な動きに強い
  const baseStrength = strength;

  const retargetOrder: readonly BoneName[] = [
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

  for (const boneName of retargetOrder) {
    const entry = rig.bones[boneName];
    const srcNode = source.bones[boneName];
    const srcRestWorld = source.restWorld[boneName];
    const tgtRestWorld = rig.restWorld[boneName];
    if (!entry || !srcNode || !srcRestWorld || !tgtRestWorld) continue;

    // 親の matrixWorld が古いと local への戻しがズレるため、毎ボーン確実に同期する
    try {
      entry.node.parent?.updateWorldMatrix(true, false);
    } catch {
      // ignore
    }

    // Mixamo: deltaWorld = inv(restWorld) * currentWorld
    let srcWorld: Quaternion;
    try {
      srcWorld = srcNode.getWorldQuaternion(tmpQ0);
    } catch {
      continue;
    }
    const deltaWorld = tmpQ1.copy(srcRestWorld).invert().multiply(srcWorld).normalize();

    // strength: 0.5 / 1.0 / 1.5 を「角度スケール」で反映（1.5で誇張可能）
    const gain = getBoneGain(boneName);
    const maxAngleRad = getBoneMaxAngleRad(boneName);
    const effectiveScale = clamp(baseStrength * gain, 0, 1.25);
    const scaledDeltaWorld = quatScaleByAxisAngleClamped({
      delta: deltaWorld,
      scale: effectiveScale,
      maxAngleRad,
      out: tmpQ2,
    });

    // desiredWorld = tgtRestWorld * scaledDeltaWorld
    const desiredWorld = tmpQ1.copy(tgtRestWorld).multiply(scaledDeltaWorld).normalize();

    // desiredLocal = inv(parentWorldCurrent) * desiredWorld
    const parent = entry.node.parent;
    const parentWorld = parent ? parent.getWorldQuaternion(tmpQ0) : tmpQ0.identity();
    const desiredLocal = tmpQ2.copy(parentWorld).invert().multiply(desiredWorld).normalize();

    // base（初期姿勢）からの差分にして適用（ベース姿勢保持）
    const restLocal = entry.baseQuaternion;
    const deltaLocal = tmpQ1.copy(restLocal).invert().multiply(desiredLocal).normalize();
    entry.node.quaternion.copy(restLocal).multiply(deltaLocal);

    // 子ボーンの親world取得が正しくなるよう、更新しておく（重くない範囲に留める）
    try {
      entry.node.updateWorldMatrix(false, false);
    } catch {
      // ignore
    }
  }

  // --- Pose polish: clapping時だけ「脇の開き」を少し抑える ---
  // NOTE:
  // - Mixamoの拍手は腕の外転が大きいことがあり、Meebits体型だと“脇が開きすぎ”に見えやすい
  // - 手先が近いフレーム（clapっぽい瞬間）だけ、
  //   1) 上腕を内側へ軽く畳む（シルエット改善）
  //   2) 簡易IKで手先を寄せ、残る骨長差のズレを潰す
  const leftUpperArm = rig.bones[BONE.leftUpperArm]?.node;
  const rightUpperArm = rig.bones[BONE.rightUpperArm]?.node;
  const leftHand = rig.bones[BONE.leftHand]?.node;
  const rightHand = rig.bones[BONE.rightHand]?.node;
  const leftShoulder = rig.bones[BONE.leftShoulder]?.node;
  const rightShoulder = rig.bones[BONE.rightShoulder]?.node;
  const leftLowerArm = rig.bones[BONE.leftLowerArm]?.node;
  const rightLowerArm = rig.bones[BONE.rightLowerArm]?.node;

  if (
    leftUpperArm &&
    rightUpperArm &&
    leftHand &&
    rightHand &&
    leftShoulder &&
    rightShoulder &&
    leftLowerArm &&
    rightLowerArm
  ) {
    try {
      rig.root.node.updateWorldMatrix(true, false);
      leftShoulder.updateWorldMatrix(true, false);
      rightShoulder.updateWorldMatrix(true, false);
      leftHand.updateWorldMatrix(true, false);
      rightHand.updateWorldMatrix(true, false);
    } catch {
      // ignore
    }

    const rootWorldQ = rig.root.node.getWorldQuaternion(tmpQ0);
    const rootWorldQInv = tmpQ1.copy(rootWorldQ).invert();
    // IMPORTANT:
    // rootWorldPos は以降の計算で参照し続けるため、途中で上書きされない tmp を使う。
    // （一時ベクトルの使い回しで左右の補正がズレるバグを防ぐ）
    const rootWorldPos = rig.root.node.getWorldPosition(tmpV7);

    const lHand = getRootLocalPosition({
      node: leftHand,
      rootWorldPosition: rootWorldPos,
      rootWorldQuaternionInv: rootWorldQInv,
      out: tmpV1,
    });
    const rHand = getRootLocalPosition({
      node: rightHand,
      rootWorldPosition: rootWorldPos,
      rootWorldQuaternionInv: rootWorldQInv,
      out: tmpV2,
    });
    const lShoulder = getRootLocalPosition({
      node: leftShoulder,
      rootWorldPosition: rootWorldPos,
      rootWorldQuaternionInv: rootWorldQInv,
      out: tmpV3,
    });
    const rShoulder = getRootLocalPosition({
      node: rightShoulder,
      rootWorldPosition: rootWorldPos,
      rootWorldQuaternionInv: rootWorldQInv,
      out: tmpV0,
    });

    const handDist = lHand.distanceTo(rHand);
    const shoulderSpan = Math.max(1e-6, lShoulder.distanceTo(rShoulder));
    const shoulderAxisRootLocal = tmpV4.copy(rShoulder).sub(lShoulder);
    if (shoulderAxisRootLocal.lengthSq() > 1e-10) shoulderAxisRootLocal.normalize();

    // “手が近い＝拍手” の瞬間だけ補正（滑らかにフェード）
    // - far: 補正0
    // - near: 補正1
    const near = shoulderSpan * 0.55;
    const far = shoulderSpan * 0.85;
    const clap01 = smoothstep01((far - handDist) / Math.max(1e-6, far - near));
    if (clap01 > 1e-4) {
      // strength をそのまま掛けると強すぎることがあるので、上限付きで穏やかに
      const amount = clamp(0.30 * strength, 0, 0.40) * clap01;
      const tuckFactor = 0.84; // 横方向（肩軸）成分を減らして内側へ（閉じすぎ防止）

      applyUpperArmTuck({
        upperArm: leftUpperArm,
        hand: leftHand,
        rootWorldPosition: rootWorldPos,
        rootWorldQuaternion: rootWorldQ,
        rootWorldQuaternionInv: rootWorldQInv,
        shoulderAxisRootLocal,
        tuckFactor,
        amount,
      });
      applyUpperArmTuck({
        upperArm: rightUpperArm,
        hand: rightHand,
        rootWorldPosition: rootWorldPos,
        rootWorldQuaternion: rootWorldQ,
        rootWorldQuaternionInv: rootWorldQInv,
        shoulderAxisRootLocal,
        tuckFactor,
        amount,
      });

      // 目標手先：Mixamoの「肩基準の手位置」をVRMへ写像して追従させる
      // NOTE:
      // - 回転だけのリターゲットでは骨長差で手先位置がズレる
      // - Mixamo側の手/肩の相対位置を使うと、より“本家”の軌道に近づく
      const srcLHand = source.bones[BONE.leftHand];
      const srcRHand = source.bones[BONE.rightHand];
      const srcLShoulder = source.bones[BONE.leftShoulder];
      const srcRShoulder = source.bones[BONE.rightShoulder];

      let leftTarget = tmpV5;
      let rightTarget = tmpV6;

      if (srcLHand && srcRHand && srcLShoulder && srcRShoulder) {
        const srcRootQ = source.root.getWorldQuaternion(tmpQ2);
        const srcRootQInv = tmpQ3.copy(srcRootQ).invert();
        const srcRootPos = source.root.getWorldPosition(tmpV1);

        const srcLHandLocal = getRootLocalPosition({
          node: srcLHand,
          rootWorldPosition: srcRootPos,
          rootWorldQuaternionInv: srcRootQInv,
          out: tmpV2,
        });
        const srcRHandLocal = getRootLocalPosition({
          node: srcRHand,
          rootWorldPosition: srcRootPos,
          rootWorldQuaternionInv: srcRootQInv,
          out: tmpV3,
        });
        const srcLShoulderLocal = getRootLocalPosition({
          node: srcLShoulder,
          rootWorldPosition: srcRootPos,
          rootWorldQuaternionInv: srcRootQInv,
          out: tmpV0,
        });
        const srcRShoulderLocal = getRootLocalPosition({
          node: srcRShoulder,
          rootWorldPosition: srcRootPos,
          rootWorldQuaternionInv: srcRootQInv,
          out: tmpV4,
        });

        const srcShoulderSpan = Math.max(1e-6, srcLShoulderLocal.distanceTo(srcRShoulderLocal));
        const scale = shoulderSpan / srcShoulderSpan;
        const srcCenter = tmpV7
          .copy(srcLShoulderLocal)
          .add(srcRShoulderLocal)
          .multiplyScalar(0.5);
        const tgtCenter = tmpV7.copy(lShoulder).add(rShoulder).multiplyScalar(0.5);

        const desiredLeftLocal = tmpV5
          .copy(srcLHandLocal)
          .sub(srcCenter)
          .multiplyScalar(scale)
          .add(tgtCenter);
        const desiredRightLocal = tmpV6
          .copy(srcRHandLocal)
          .sub(srcCenter)
          .multiplyScalar(scale)
          .add(tgtCenter);

        // rootローカル→ワールド
        leftTarget = desiredLeftLocal.applyQuaternion(rootWorldQ).add(rootWorldPos);
        rightTarget = desiredRightLocal.applyQuaternion(rootWorldQ).add(rootWorldPos);
      } else {
        // フォールバック：左右手の中点
        const lHandWorld = leftHand.getWorldPosition(tmpV1);
        const rHandWorld = rightHand.getWorldPosition(tmpV2);
        const mid = tmpV3.copy(lHandWorld).add(rHandWorld).multiplyScalar(0.5);
        leftTarget = tmpV5.copy(mid);
        rightTarget = tmpV6.copy(mid);
      }

      // 少しだけ左右にオフセットして貫通を避ける（肩軸に沿って分離）
      const shoulderAxisWorld = tmpV4.copy(shoulderAxisRootLocal).applyQuaternion(rootWorldQ);
      if (shoulderAxisWorld.lengthSq() > 1e-10) shoulderAxisWorld.normalize();
      const offset = shoulderAxisWorld.multiplyScalar(0.02 * shoulderSpan);
      leftTarget = tmpV5.copy(leftTarget).sub(offset);
      rightTarget = tmpV6.copy(rightTarget).add(offset);

      // IKは“寄せるだけ”に留める（やりすぎると元モーションが崩れる）
      const ikWeight = clamp(0.85 * amount, 0, 0.38);
      solveArmCcd({
        shoulder: leftShoulder,
        upperArm: leftUpperArm,
        lowerArm: leftLowerArm,
        hand: leftHand,
        targetWorld: leftTarget,
        weight: ikWeight,
      });
      solveArmCcd({
        shoulder: rightShoulder,
        upperArm: rightUpperArm,
        lowerArm: rightLowerArm,
        hand: rightHand,
        targetWorld: rightTarget,
        weight: ikWeight,
      });
    }
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
