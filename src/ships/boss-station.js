import * as THREE from 'three';
import { geo, stdMat, glowMat, glowPlane, domeGeo } from './common.js';

// 10웨이브 보스: 고리형 정거장.
// 중앙 허브 + 스포크 + 납작한 고리 + 고리에 방사형으로 붙은 블록 모듈.
// 모듈과 창문은 InstancedMesh로 한 번에 그린다.

const HULL = 0x6a7280;
const DARK = 0x2a2f38;
const WINDOW = 0xffb347;
const RIM = 0x7fd4ff;

const MODULE_COUNT = 14;
const MODULE_RADIUS = 3.15;
const SPOKE_COUNT = 6;

/** 반지름/접선 오프셋과 각도로 인스턴스 행렬을 만든다. */
function placeRadial(matrix, angle, radial, tangential, z) {
  matrix.makeRotationZ(angle);
  matrix.setPosition(
    Math.cos(angle) * radial - Math.sin(angle) * tangential,
    Math.sin(angle) * radial + Math.cos(angle) * tangential,
    z
  );
}

export function createBossStation() {
  const group = new THREE.Group();

  const hullMat = stdMat('b.hull', { color: HULL, metalness: 0.6, roughness: 0.5 });
  const darkMat = stdMat('b.dark', { color: DARK, metalness: 0.75, roughness: 0.45 });
  const windowGlow = glowMat('b.window', { color: WINDOW, intensity: 1.05 });
  const rimGlow = glowMat('b.rim', { color: RIM, intensity: 1.4 });

  const m = new THREE.Matrix4();

  // --- 중앙 허브 ---
  const hub = new THREE.Mesh(
    geo('b.hub.g', () => {
      const g = new THREE.CylinderGeometry(1.35, 1.6, 1.0, 12);
      g.rotateX(Math.PI / 2);
      return g;
    }),
    hullMat
  );
  group.add(hub);

  const hubCollar = new THREE.Mesh(
    geo('b.collar.g', () => {
      const g = new THREE.CylinderGeometry(0.95, 1.15, 0.4, 12);
      g.rotateX(Math.PI / 2);
      return g;
    }),
    darkMat
  );
  hubCollar.position.z = 0.6;
  group.add(hubCollar);

  const dome = new THREE.Mesh(domeGeo('b.dome.g', 0.7, 12, 4), hullMat);
  dome.position.z = 0.72;
  dome.scale.z = 0.8;
  group.add(dome);

  // 허브 꼭대기 발광 코어 + 후광
  const core = new THREE.Mesh(domeGeo('b.core.g', 0.24, 8, 3), rimGlow);
  core.position.z = 1.28;
  group.add(core);

  const coreHalo = glowPlane(RIM, 1.9, 1.9, 0.3);
  coreHalo.position.z = 1.3;
  group.add(coreHalo);

  // --- 납작한 고리 ---
  const ring = new THREE.Mesh(
    geo('b.ring.g', () => new THREE.TorusGeometry(2.6, 0.55, 6, 30)),
    hullMat
  );
  ring.scale.z = 0.38;
  group.add(ring);

  const ringTrim = new THREE.Mesh(
    geo('b.ringtrim.g', () => new THREE.TorusGeometry(2.6, 0.6, 4, 30)),
    darkMat
  );
  ringTrim.scale.z = 0.16;
  group.add(ringTrim);

  // --- 스포크 ---
  const spokes = new THREE.InstancedMesh(
    geo('b.spoke.g', () => new THREE.BoxGeometry(1.5, 0.28, 0.24)),
    darkMat,
    SPOKE_COUNT
  );
  for (let i = 0; i < SPOKE_COUNT; i++) {
    placeRadial(m, (i / SPOKE_COUNT) * Math.PI * 2, 1.9, 0, 0);
    spokes.setMatrixAt(i, m);
  }
  spokes.instanceMatrix.needsUpdate = true;
  group.add(spokes);

  // --- 방사형 블록 모듈 ---
  const modules = new THREE.InstancedMesh(
    geo('b.module.g', () => new THREE.BoxGeometry(1.35, 1.0, 0.62)),
    hullMat,
    MODULE_COUNT
  );
  const moduleTops = new THREE.InstancedMesh(
    geo('b.moduletop.g', () => new THREE.BoxGeometry(1.05, 0.74, 0.1)),
    darkMat,
    MODULE_COUNT
  );

  for (let i = 0; i < MODULE_COUNT; i++) {
    const a = (i / MODULE_COUNT) * Math.PI * 2;
    placeRadial(m, a, MODULE_RADIUS, 0, 0);
    modules.setMatrixAt(i, m);
    placeRadial(m, a, MODULE_RADIUS, 0, 0.35);
    moduleTops.setMatrixAt(i, m);
  }
  modules.instanceMatrix.needsUpdate = true;
  moduleTops.instanceMatrix.needsUpdate = true;
  group.add(modules);
  group.add(moduleTops);

  // --- 창문 점 발광 ---
  const windowsPerModule = 3;
  const windows = new THREE.InstancedMesh(
    geo('b.window.g', () => new THREE.BoxGeometry(0.72, 0.11, 0.05)),
    windowGlow,
    MODULE_COUNT * windowsPerModule
  );
  let w = 0;
  for (let i = 0; i < MODULE_COUNT; i++) {
    const a = (i / MODULE_COUNT) * Math.PI * 2;
    for (let j = 0; j < windowsPerModule; j++) {
      const tangential = (j - 1) * 0.26;
      placeRadial(m, a, MODULE_RADIUS, tangential, 0.42);
      windows.setMatrixAt(w++, m);
    }
  }
  windows.instanceMatrix.needsUpdate = true;
  group.add(windows);

  // 고리 안쪽 띠 조명
  const ringLights = new THREE.InstancedMesh(
    geo('b.ringlight.g', () => new THREE.BoxGeometry(0.5, 0.1, 0.04)),
    rimGlow,
    MODULE_COUNT * 2
  );
  for (let i = 0; i < MODULE_COUNT * 2; i++) {
    const a = (i / (MODULE_COUNT * 2)) * Math.PI * 2;
    placeRadial(m, a, 2.6, 0, 0.22);
    ringLights.setMatrixAt(i, m);
  }
  ringLights.instanceMatrix.needsUpdate = true;
  group.add(ringLights);

  return group;
}
