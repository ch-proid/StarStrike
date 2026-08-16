import * as THREE from 'three';
import { boxGeo, geo, glowTexture } from '../ships/common.js';

// 테크별 탄 조형과 색. weapon.js는 이 표만 보고 풀을 짓는다.
//
// 색 띠(RAMP)는 총 공격력의 로그에 걸린다. 합성할 때마다 탄이 굵어지고 색이 옮겨 간다.
// 네 테크가 같은 규칙을 쓰되 출발색이 달라, 무엇을 들고 있는지 한눈에 갈린다.
//
// 재질은 테크마다 한 벌씩만 만든다(weapon.js). 색이 화력에 따라 바뀌므로
// 공유 캐시에서 꺼내 쓸 수 없지만, 같은 테크의 탄 수십 발은 그 한 벌을 함께 쓴다.
// 지오메트리는 common.js의 캐시를 그대로 탄다.

/** 가산 블렌딩 글로우 평면 한 장. 재질은 밖에서 받아 공유한다. */
function glowQuad(mat, w, h, y = 0) {
  const g = geo(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.y = y;
  return mesh;
}

export const ART = {
  // 발칸: 밝은 심지 + 둘레 글로우 두 겹. 예전 그대로가 기준이다.
  vulcan: {
    CORE_RAMP: [0xdcfaff, 0xf0f2ff, 0xfff3d6], // 흰빛 시안 → 따뜻한 흰빛
    GLOW_RAMP: [0x59dcff, 0x9d6bff, 0xffc44d], // 시안 → 보라 → 금색
    CORE_INTENSITY: 1.8,
    GLOW_INTENSITY: 1.3,
    GLOW_OPACITY: 0.55,
    GLOW_OPACITY_GAIN: 0.3,
    MUZZLE: { color: 0xcdf3ff, size: 0.85 },
    IMPACT: { color: 0, size: 0 }, // 발칸은 따로 명중 연출을 두지 않는다(파편이 대신한다).

    build(coreMat, glowMat) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(boxGeo('bullet.vulcan.core', 0.075, 0.62, 0.075), coreMat));
      group.add(glowQuad(glowMat, 0.42, 1.5));
      return group;
    },
  },

  // 레이저: 가늘고 긴 광선. 붉은색을 쓰지 않는다. 위험색과 섞이면 안 되기 때문이다.
  laser: {
    CORE_RAMP: [0xeafeff, 0xf4f8ff, 0xfff6e2],
    GLOW_RAMP: [0x6ff0ff, 0xa07bff, 0xffd07a],
    CORE_INTENSITY: 2.1,
    GLOW_INTENSITY: 1.45,
    GLOW_OPACITY: 0.5,
    GLOW_OPACITY_GAIN: 0.32,
    MUZZLE: { color: 0xdafcff, size: 0.7 },
    // 관통이라 한 발이 여러 번 터진다. 그래서 작고 짧은 섬광이다.
    IMPACT: { color: 0xdff9ff, size: 0.95, life: 0.07, count: 20, opacity: 0.9, intensity: 2.0 },

    build(coreMat, glowMat) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(boxGeo('bullet.laser.core', 0.05, 1.7, 0.05), coreMat));
      group.add(glowQuad(glowMat, 0.3, 2.6));
      return group;
    },
  },

  // 미사일: 뾰족한 탄두 + 뒤로 뻗는 배기 불꽃. 휘는 것이 보이도록 몸통이 길다.
  missile: {
    CORE_RAMP: [0xfff0dc, 0xf6eaff, 0xfff3d6],
    GLOW_RAMP: [0xffb26b, 0xd88bff, 0xffd06a],
    CORE_INTENSITY: 1.6,
    GLOW_INTENSITY: 1.4,
    GLOW_OPACITY: 0.6,
    GLOW_OPACITY_GAIN: 0.28,
    MUZZLE: { color: 0xffd9a8, size: 0.95 },
    IMPACT: { color: 0xffc06a, size: 2.1, life: 0.16, count: 12, opacity: 0.95, intensity: 2.0 },

    build(coreMat, glowMat) {
      const group = new THREE.Group();

      // 탄두. 원뿔은 기본 축이 +Y라 그대로 앞을 본다.
      const nose = new THREE.Mesh(
        geo('bullet.missile.nose', () => {
          const g = new THREE.ConeGeometry(0.11, 0.26, 8);
          g.translate(0, 0.3, 0);
          return g;
        }),
        coreMat
      );
      group.add(nose);
      group.add(new THREE.Mesh(boxGeo('bullet.missile.body', 0.16, 0.44, 0.16), coreMat));

      // 배기 불꽃: 몸통 뒤로 늘어진다.
      group.add(glowQuad(glowMat, 0.5, 1.15, -0.5));
      return group;
    },
  },

  // 플라즈마: 큰 구체. 명중하면 링이 퍼진다.
  plasma: {
    CORE_RAMP: [0xe8faff, 0xf6eaff, 0xfff3d6],
    GLOW_RAMP: [0x7fdcff, 0xc07bff, 0xffd36a],
    CORE_INTENSITY: 1.7,
    GLOW_INTENSITY: 1.5,
    GLOW_OPACITY: 0.65,
    GLOW_OPACITY_GAIN: 0.25,
    MUZZLE: { color: 0xbde9ff, size: 1.1 },
    IMPACT: { color: 0xa8e6ff, size: 2.6, life: 0.18, count: 10, opacity: 0.9, intensity: 1.9 },
    // 광역을 눈으로 알려 주는 고리. 반경은 SPLASH.RADIUS를 그대로 따른다.
    RING: { color: 0x8fe4ff, life: 0.3, count: 8, intensity: 1.9 },

    build(coreMat, glowMat) {
      const group = new THREE.Group();
      group.add(
        new THREE.Mesh(
          geo('bullet.plasma.core', () => new THREE.SphereGeometry(0.17, 12, 8)),
          coreMat
        )
      );
      group.add(glowQuad(glowMat, 0.95, 0.95));
      return group;
    },
  },
};
