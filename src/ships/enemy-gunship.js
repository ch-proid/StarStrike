import * as THREE from 'three';
import {
  plateGeo,
  stdMat,
  glowMat,
  glowPlane,
  cylinderGeo,
  ringGeoY,
  discGeoBackward,
  boxGeo,
} from './common.js';

// 적 건쉽: 뭉툭한 중장갑 동체에 좌우 대형 원통 엔진 포드.
// 보라색 엔진 발광 + 주황색 정비 패널 발광으로 색을 잡았다.

const HULL_HALF = [
  [0, 1.55],
  [0.62, 1.15],
  [0.88, 0.35],
  [0.82, -0.75],
  [1.12, -1.05],
  [1.0, -1.6],
  [0.42, -1.5],
  [0.36, -1.85],
  [0, -1.92],
];

// 뒤로 길게 젖혀진 스파이크 핀(실루엣에 각을 준다).
const FIN_HALF = [
  [0, 0.55],
  [2.2, -0.4],
  [2.35, -0.68],
  [0.95, -0.6],
  [0, -0.35],
];

// 위에 얹는 장갑 등판.
const ARMOR_HALF = [
  [0, 1.05],
  [0.42, 0.75],
  [0.55, 0.05],
  [0.5, -0.95],
  [0.24, -1.3],
  [0, -1.35],
];

const BODY = 0x3b414b;
const PANEL = 0x1d222a;
const PURPLE = 0x9b5cff;
const ORANGE = 0xff8a1e;

const SCALE = 0.6; // 전폭 2.6 단위 정도의 중형기.

export function createEnemyGunship() {
  const group = new THREE.Group();

  const bodyMat = stdMat('g.body', { color: BODY, metalness: 0.65, roughness: 0.5 });
  const panelMat = stdMat('g.panel', { color: PANEL, metalness: 0.7, roughness: 0.45 });
  const podMat = stdMat('g.pod', { color: 0x2c313a, metalness: 0.75, roughness: 0.42 });
  const purpleGlow = glowMat('g.purple', { color: PURPLE, intensity: 1.8 });
  const orangeGlow = glowMat('g.orange', { color: ORANGE, intensity: 1.4 });

  // --- 동체 ---
  const hull = new THREE.Mesh(
    plateGeo('g.hull.g', HULL_HALF, { depth: 0.5, bevel: 0.08, bevelThickness: 0.08 }),
    bodyMat
  );
  group.add(hull);

  // 좌우로 길게 뻗은 스파이크 핀
  const fins = new THREE.Mesh(
    plateGeo('g.fin.g', FIN_HALF, { depth: 0.14, bevel: 0.04, bevelThickness: 0.04 }),
    panelMat
  );
  fins.position.set(0, 0.5, -0.16);
  group.add(fins);

  const armor = new THREE.Mesh(
    plateGeo('g.armor.g', ARMOR_HALF, { depth: 0.18, bevel: 0.05, bevelThickness: 0.05 }),
    panelMat
  );
  armor.position.z = 0.34;
  group.add(armor);

  // 앞쪽 포탑 두 문
  const barrelGeo = cylinderGeo('g.barrel.g', 0.1, 0.13, 1.1, 6);
  for (const side of [1, -1]) {
    const barrel = new THREE.Mesh(barrelGeo, panelMat);
    barrel.position.set(side * 0.44, 1.5, 0.18);
    group.add(barrel);
  }

  // --- 좌우 엔진 포드 ---
  const podGeo = cylinderGeo('g.podcyl.g', 0.5, 0.5, 2.0, 10, 1, false);
  const bandGeo = ringGeoY('g.band.g', 0.53, 0.06, 4, 12);
  const ringGeo = ringGeoY('g.ring.g', 0.44, 0.08, 5, 16);
  const discGeo = discGeoBackward('g.disc.g', 0.42, 12);
  const pylonGeo = boxGeo('g.pylon.g', 0.9, 0.62, 0.34);
  const ventGeo = boxGeo('g.vent.g', 0.16, 0.5, 0.08);

  for (const side of [1, -1]) {
    const x = side * 1.62;

    const pod = new THREE.Mesh(podGeo, podMat);
    pod.position.set(x, -0.1, 0.06);
    group.add(pod);

    // 포드 리브(장식 밴드)
    for (const y of [0.55, -0.05]) {
      const band = new THREE.Mesh(bandGeo, panelMat);
      band.position.set(x, y, 0.06);
      group.add(band);
    }

    const pylon = new THREE.Mesh(pylonGeo, panelMat);
    pylon.position.set(side * 1.1, -0.2, 0.06);
    group.add(pylon);

    // 보라색 엔진 발광
    const ring = new THREE.Mesh(ringGeo, purpleGlow);
    ring.position.set(x, -1.04, 0.06);
    group.add(ring);

    const disc = new THREE.Mesh(discGeo, glowMat('g.disccore', { color: 0xd7b6ff, intensity: 2.0 }));
    disc.position.set(x, -1.08, 0.06);
    group.add(disc);

    const flame = glowPlane(PURPLE, 1.1, 2.0, 0.5);
    flame.position.set(x, -1.55, 0.06);
    group.add(flame);

    // 주황색 정비 패널 발광
    const vent = new THREE.Mesh(ventGeo, orangeGlow);
    vent.position.set(side * 0.62, 0.3, 0.32);
    group.add(vent);

    const vent2 = new THREE.Mesh(ventGeo, orangeGlow);
    vent2.position.set(side * 0.62, -0.45, 0.32);
    group.add(vent2);
  }

  group.scale.setScalar(SCALE);
  return group;
}
