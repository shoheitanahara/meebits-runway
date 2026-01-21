import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MIN_MEEBIT_ID = 1;
const MAX_MEEBIT_ID = 20000;

export function buildMeebitsVrmUrl(id: number): string {
  // 直接URLでも良いが、Canvas書き出し用途では同一オリジン化して安全にする
  return `/api/vrm/${id}`;
}

function assertMeebitId(id: number): void {
  if (!Number.isFinite(id) || id < MIN_MEEBIT_ID || id > MAX_MEEBIT_ID) {
    throw new Error(`Invalid Meebits ID: ${id}`);
  }
}

export async function loadVrmFromMeebitsId(params: {
  id: number;
  onProgress?: (progress01: number) => void;
}): Promise<VRM> {
  const { id, onProgress } = params;
  assertMeebitId(id);

  const url = buildMeebitsVrmUrl(id);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await new Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTF>(
    (resolve, reject) => {
      loader.load(
        url,
        (g) => resolve(g),
        (e) => {
          if (!onProgress || !e.total) return;
          onProgress(Math.min(1, Math.max(0, e.loaded / e.total)));
        },
        (err) => reject(err),
      );
    },
  );

  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) {
    throw new Error("VRM parse failed (gltf.userData.vrm is missing).");
  }

  // VRM0は仕様上「後ろ向き」で来ることがあるので補正（three-vrm公式ユーティリティ）
  // - VRM1には適用されない
  try {
    VRMUtils.rotateVRM0(vrm);
  } catch {
    // ignore
  }

  // パフォーマンス最適化（安全な範囲）
  try {
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.removeUnnecessaryJoints(gltf.scene);
  } catch {
    // ignore
  }

  return vrm;
}

