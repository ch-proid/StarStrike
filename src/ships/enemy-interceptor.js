import * as THREE from 'three';
import { plateGeo, stdMat, glowMat, glowPlane, boxGeo } from './common.js';

// 적 인터셉터: 가오리/맹금류 실루엣의 소형 기체.
// 다수가 동시에 뜨므로 부품 수를 최소로 잡았다(메시 5개).

// 뒤로 크게 젖혀진 날개와 톱니 모양 뒷전.
const WING_HALF = [
  [0, 1.65],
  [0.36, 0.85],
  [0.58, 0.2],
  [2.25, -0.78],
  [2.35, -1.02],
  [1.35, -0.42],
  [0.92, -0.98],
  [0.6, -0.5],
  [0.52, -1.35],
  [0, -1.05],
];

// 중앙 동체 능선.
const BODY_HALF = [
  [0, 1.35],
  [0.22, 0.7],
  [0.34, 0.05],
  [0.3, -0.7],
  [0.16, -1.0],
  [0, -1.08],
];

const SHELL = 0x14171f;
const PLATE = 0x2b3140;
const RED = 0xff2d2d;

const SCALE = 0.34; // 전폭 1.6 단위 정도의 소형기.

export function createEnemyInterceptor() {
  const group = new THREE.Group();

  const shellMat = stdMat('i.shell', {
    color: SHELL,
    metalness: 0.55,
    roughness: 0.5,
  });
  const plateMat = stdMat('i.plate', {
    color: PLATE,
    metalness: 0.7,
    roughness: 0.4,
  });
  const eyeMat = glowMat('i.eye', { color: RED, intensity: 1.7 });

  // 날개판
  const wing = new THREE.Mesh(
    plateGeo('i.wing.g', WING_HALF, { depth: 0.16, bevel: 0.04, bevelThickness: 0.04 }),
    shellMat
  );
  group.add(wing);

  // 중앙 동체(위로 솟은 능선)
  const body = new THREE.Mesh(
    plateGeo('i.body.g', BODY_HALF, { depth: 0.34, bevel: 0.06, bevelThickness: 0.06 }),
    plateMat
  );
  body.position.z = 0.12;
  group.add(body);

  // 붉은 발광 콕핏 "눈" 두 개
  const eyeGeo = boxGeo('i.eye.g', 0.12, 0.3, 0.08);
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.14, 0.82, 0.26);
    eye.rotation.z = side * -0.25;
    group.add(eye);
  }

  // 뒤쪽 붉은 분사 글로우 한 장
  const flame = glowPlane(RED, 0.75, 1.5, 0.55);
  flame.position.set(0, -1.75, 0.05);
  group.add(flame);

  group.scale.setScalar(SCALE);
  return group;
}
