import * as THREE from 'three';
import {
  geo,
  plateGeo,
  stdMat,
  glowMat,
  glowPlane,
  cylinderGeo,
  ringGeoY,
  discGeoBackward,
  domeGeo,
  boxGeo,
} from './common.js';

// 플레이어 기체: 흰 화살촉 동체 + 좌우 원통 나셀 + 파란 발광 링.
// 기수는 +Y(화면 위, 적 방향)를 향한다.

// 위에서 본 동체 실루엣의 오른쪽 절반. 첫/끝 점은 중심선 위.
const HULL_HALF = [
  [0, 3.1],
  [0.26, 2.1],
  [0.4, 1.25],
  [0.66, 0.55],
  [1.05, 0.0],
  [1.2, -0.9],
  [2.2, -1.5],
  [2.0, -1.95],
  [0.95, -1.75],
  [0.75, -2.3],
  [0, -2.4],
];

// 동체 위에 얹는 어두운 등마루(패널 라인 역할).
const SPINE_HALF = [
  [0, 2.5],
  [0.17, 1.75],
  [0.3, 0.85],
  [0.45, 0.15],
  [0.5, -1.05],
  [0.28, -1.6],
  [0, -1.72],
];

// 기수 양옆으로 뻗은 갈매기꼴 캐너드(한 덩어리 대칭 판).
const CANARD_HALF = [
  [0, 0.95],
  [0.5, 0.45],
  [1.18, -0.62],
  [0.86, -0.78],
  [0.34, -0.16],
  [0, -0.32],
];

const WHITE = 0xf1f5f9;
const DARK = 0x39414e;
const BLUE = 0x49b6ff;

const SCALE = 0.42; // 게임 화면 기준 전장 2.3 단위 정도.

export function createPlayerShip() {
  const group = new THREE.Group();

  const hullMat = stdMat('p.hull', {
    color: WHITE,
    metalness: 0.08,
    roughness: 0.5,
  });
  const darkMat = stdMat('p.dark', {
    color: DARK,
    metalness: 0.25,
    roughness: 0.55,
  });
  const trimMat = stdMat('p.trim', {
    color: 0x8d97a4,
    metalness: 0.7,
    roughness: 0.35,
  });
  const glowBlue = glowMat('p.glow', { color: BLUE, intensity: 1.9 });
  const canopyMat = stdMat('p.canopy', {
    color: 0x0d2a4a,
    emissive: BLUE,
    emissiveIntensity: 1.6,
    metalness: 0.4,
    roughness: 0.2,
  });

  // --- 동체 ---
  const hull = new THREE.Mesh(
    plateGeo('p.hull.g', HULL_HALF, { depth: 0.34, bevel: 0.055, bevelThickness: 0.05 }),
    hullMat
  );
  group.add(hull);

  // 어두운 등마루: 동체 위로 살짝 솟게 얹어 패널 라인처럼 보이게 한다.
  const spine = new THREE.Mesh(
    plateGeo('p.spine.g', SPINE_HALF, { depth: 0.1, bevel: 0.04, bevelThickness: 0.03 }),
    darkMat
  );
  spine.position.z = 0.2;
  group.add(spine);

  // 아래쪽 복부 판: 두께감을 주는 얇은 검은 판.
  const belly = new THREE.Mesh(
    plateGeo('p.spine.g', SPINE_HALF, { depth: 0.1, bevel: 0.04, bevelThickness: 0.03 }),
    darkMat
  );
  belly.position.z = -0.2;
  group.add(belly);

  // 기수 캐너드: 한 덩어리 대칭 판을 기수 뒤쪽에 얹는다.
  const canard = new THREE.Mesh(
    plateGeo('p.canard.g', CANARD_HALF, { depth: 0.13, bevel: 0.035, bevelThickness: 0.03 }),
    trimMat
  );
  canard.position.set(0, 1.45, 0.0);
  group.add(canard);

  // --- 캐노피 ---
  const canopy = new THREE.Mesh(domeGeo('p.canopy.g', 1, 10, 4), canopyMat);
  canopy.position.set(0, 1.3, 0.24);
  canopy.scale.set(0.4, 0.95, 0.3);
  group.add(canopy);

  // --- 좌우 엔진 나셀 ---
  const nacelleGeo = cylinderGeo('p.nacelle.g', 0.32, 0.3, 2.6, 10, 1, false);
  const pylonGeo = boxGeo('p.pylon.g', 0.95, 0.52, 0.16);
  const ringGeo = ringGeoY('p.ring.g', 0.37, 0.075, 5, 18);
  const discGeo = discGeoBackward('p.disc.g', 0.29, 12);
  const intakeGeo = ringGeoY('p.intake.g', 0.3, 0.05, 4, 14);
  // 위에서 내려다보는 카메라에 파란 링이 보이도록 나셀 윗면에도 링을 얹는다.
  const topRingGeo = geo('p.topring.g', () => new THREE.TorusGeometry(0.24, 0.045, 4, 16));
  const topCoreGeo = geo('p.topcore.g', () => new THREE.CircleGeometry(0.2, 12));

  const thrusters = [];

  for (const side of [1, -1]) {
    const x = side * 1.5;

    const nacelle = new THREE.Mesh(nacelleGeo, hullMat);
    nacelle.position.set(x, -0.55, 0.04);
    group.add(nacelle);

    // 나셀 앞뒤의 어두운 캡
    const capFront = new THREE.Mesh(intakeGeo, darkMat);
    capFront.position.set(x, 0.71, 0.04);
    group.add(capFront);

    const pylon = new THREE.Mesh(pylonGeo, darkMat);
    pylon.position.set(side * 1.08, -0.35, 0.02);
    group.add(pylon);

    for (const y of [0.05, -1.05]) {
      const topRing = new THREE.Mesh(topRingGeo, glowBlue);
      topRing.position.set(x, y, 0.33);
      group.add(topRing);

      const topCore = new THREE.Mesh(topCoreGeo, glowMat('p.topcore.m', { color: 0x0d3a66 }));
      topCore.position.set(x, y, 0.32);
      group.add(topCore);
    }

    // 파랗게 빛나는 링 + 노즐 발광면
    const ring = new THREE.Mesh(ringGeo, glowBlue);
    ring.position.set(x, -1.85, 0.04);
    group.add(ring);

    const disc = new THREE.Mesh(discGeo, glowMat('p.disc.m', { color: 0xbfe6ff, intensity: 2.1 }));
    disc.position.set(x, -1.88, 0.04);
    group.add(disc);

    // 엔진 분사 글로우(가산 블렌딩 평면)
    const flame = glowPlane(BLUE, 0.95, 2.6, 0.6);
    flame.position.set(x, -3.0, 0.04);
    thrusters.push(flame);
    group.add(flame);

    const flameCore = glowPlane(0xffffff, 0.4, 1.5, 0.7);
    flameCore.position.set(x, -2.45, 0.05);
    thrusters.push(flameCore);
    group.add(flameCore);

    // 동체 옆면 발광 스트립
    const strip = new THREE.Mesh(boxGeo('p.strip.g', 0.1, 1.5, 0.07), glowBlue);
    strip.position.set(side * 0.82, -0.35, 0.16);
    group.add(strip);
  }

  group.scale.setScalar(SCALE);
  group.userData.thrusters = thrusters;

  return group;
}
