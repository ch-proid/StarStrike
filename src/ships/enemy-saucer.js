import * as THREE from 'three';
import { geo, stdMat, glowMat, domeGeo, boxGeo } from './common.js';

// 적 원반: LatheGeometry로 깎은 납작한 렌즈형 동체.
// 가장자리 청록 발광 링과 상부 돔이 실루엣을 만든다.

const TEAL = 0x21e8cf;
const SHELL = 0x5b6472;
const DARK = 0x252b34;

const SCALE = 0.8; // 지름 2.4 단위 정도.

// 렌즈 단면(회전축 = Y, 이후 X축으로 90도 눕혀 Z축 회전체로 만든다).
const PROFILE = [
  [0.0, 0.3],
  [0.36, 0.28],
  [0.82, 0.2],
  [1.22, 0.09],
  [1.5, 0.0],
  [1.22, -0.11],
  [0.82, -0.24],
  [0.36, -0.32],
  [0.0, -0.34],
];

function lensGeo() {
  return geo('s.lens.g', () => {
    const pts = PROFILE.map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 20);
    g.rotateX(Math.PI / 2); // 회전축을 +Z(카메라 쪽)로 세운다.
    g.computeVertexNormals();
    return g;
  });
}

function edgeRingGeo() {
  return geo('s.ring.g', () => new THREE.TorusGeometry(1.52, 0.05, 5, 28));
}

export function createEnemySaucer() {
  const group = new THREE.Group();

  const shellMat = stdMat('s.shell', { color: SHELL, metalness: 0.45, roughness: 0.5 });
  const darkMat = stdMat('s.dark', { color: DARK, metalness: 0.75, roughness: 0.4 });
  const tealGlow = glowMat('s.teal', { color: TEAL, intensity: 1.35 });

  const lens = new THREE.Mesh(lensGeo(), shellMat);
  group.add(lens);

  // 가장자리 청록 발광 링(기본 토러스가 XY 평면이라 그대로 적도에 맞는다).
  // 면적이 넓어 밝기를 낮춰야 동체가 하얗게 날아가지 않는다.
  const ring = new THREE.Mesh(edgeRingGeo(), glowMat('s.teal.ring', { color: TEAL, intensity: 0.9 }));
  group.add(ring);

  // 원반 윗면을 갈라 놓는 어두운 홈
  const trench = new THREE.Mesh(
    geo('s.trench.g', () => new THREE.TorusGeometry(1.14, 0.07, 4, 24)),
    darkMat
  );
  trench.scale.z = 0.5;
  trench.position.z = 0.14;
  group.add(trench);

  // 상부 돔 + 돔 받침
  const collar = new THREE.Mesh(
    geo('s.collar.g', () => {
      const g = new THREE.CylinderGeometry(0.72, 0.82, 0.16, 14);
      g.rotateX(Math.PI / 2);
      return g;
    }),
    darkMat
  );
  collar.position.z = 0.3;
  group.add(collar);

  const dome = new THREE.Mesh(domeGeo('s.dome.g', 0.6, 14, 5), shellMat);
  dome.position.z = 0.34;
  dome.scale.z = 0.75;
  group.add(dome);

  // 돔 꼭대기 발광 코어
  const core = new THREE.Mesh(domeGeo('s.core.g', 0.18, 8, 3), tealGlow);
  core.position.z = 0.75;
  group.add(core);

  // 원반 위 방사형 발광 슬릿 6개
  const slitGeo = boxGeo('s.slit.g', 0.09, 0.34, 0.06);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const slit = new THREE.Mesh(slitGeo, tealGlow);
    slit.position.set(Math.cos(a) * 1.12, Math.sin(a) * 1.12, 0.17);
    slit.rotation.z = a - Math.PI / 2;
    group.add(slit);
  }

  group.scale.setScalar(SCALE);
  return group;
}
