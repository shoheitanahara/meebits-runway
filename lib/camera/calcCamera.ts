import type { CameraFraming, CameraPan } from "@/types";
import type { VRM } from "@pixiv/three-vrm";
import { Box3, type PerspectiveCamera, Vector3 } from "three";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeGetBoneWorldPosition(vrm: VRM, boneName: string): Vector3 | null {
  try {
    const node = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!node) return null;
    const v = new Vector3();
    node.getWorldPosition(v);
    return v;
  } catch {
    return null;
  }
}

export function applyVrmCameraPose(params: {
  vrm: VRM;
  camera: PerspectiveCamera;
  framing: CameraFraming;
  pan: CameraPan;
}): Vector3 {
  const { vrm, camera, framing, pan } = params;

  vrm.scene.updateWorldMatrix(true, true);

  const box = new Box3().setFromObject(vrm.scene);
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  const head = safeGetBoneWorldPosition(vrm, "head");
  const hips = safeGetBoneWorldPosition(vrm, "hips");

  const headY = head?.y ?? center.y + size.y * 0.45;
  const hipsY = hips?.y ?? center.y - size.y * 0.10;
  const bodySpan = Math.max(0.001, headY - hipsY);

  const target = center.clone();

  // framing
  let frameHeight: number;
  if (framing === "face") {
    // 顔だけ：さらにタイトに
    // - 頭が見切れやすいので、狙いは head に近づけつつ少しだけ余裕を確保
    target.y = headY - bodySpan * -0.2;
    frameHeight = clamp(bodySpan * 0.14, size.y * 0.055, size.y * 0.12);
  } else if (framing === "waistToHead") {
    // 腰〜顔：現状の“顔アップ”相当の寄り感をこちらに寄せる
    // - 頭が見切れやすいので、注視点を少し上げて余裕を持たせる
    target.y = hipsY + bodySpan * 1.0;
    frameHeight = clamp(bodySpan * 0.20, size.y * 0.07, size.y * 0.16);
  } else {
    // 全体
    target.y = center.y + size.y * 0.05;
    frameHeight = clamp(size.y * 1.18, size.y * 0.85, size.y * 1.35);
  }

  // pan（モデルを左/右に寄せる = 注視点を逆方向へずらす）
  const panSign = pan === "left" ? 1 : pan === "right" ? -1 : 0;
  const panAmount = (framing === "face" ? size.x * 0.12 : size.x * 0.22) * panSign;
  target.x += panAmount;

  const fovRad = (camera.fov * Math.PI) / 180;
  const fitHeightDistance = (frameHeight * 0.5) / Math.tan(fovRad / 2);
  const fitWidthDistance =
    (size.x * 0.5) / (Math.tan(fovRad / 2) * Math.max(0.001, camera.aspect));
  // waist/face はさらに寄せたいので係数を下げる
  const distScale = framing === "face" ? 0.78 : framing === "waistToHead" ? 0.92 : 1.12;
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * distScale;

  camera.position.set(0, target.y, distance);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  return target;
}

