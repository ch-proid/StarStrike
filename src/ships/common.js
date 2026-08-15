import * as THREE from 'three';

// 우주선 조형에 공통으로 쓰는 도구 모음.
//
// 좌표 약속(모든 기체 공통)
//   +Y = 기수(앞)  /  +Z = 등(위, 카메라 쪽)  /  XY 평면 = 위에서 본 실루엣
// 적기는 main.js에서 Z축으로 180도 돌려 기수가 -Y(플레이어 쪽)를 보게 한다.
//
// 적은 여러 기가 동시에 생기므로 지오메트리와 재질은 키로 캐시해 재사용한다.

const geoCache = new Map();
const matCache = new Map();

/** 키로 캐시되는 지오메트리. 같은 키면 한 번만 만든다. */
export function geo(key, factory) {
  let g = geoCache.get(key);
  if (!g) {
    g = factory();
    geoCache.set(key, g);
  }
  return g;
}

/** 플랫 셰이딩 기본 재질(면이 또렷하게 보인다). */
export function stdMat(key, params) {
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      flatShading: true,
      metalness: 0.35,
      roughness: 0.55,
      ...params,
    });
    matCache.set(key, m);
  }
  return m;
}

/**
 * 조명을 받지 않는 순수 발광 재질.
 * intensity를 1보다 크게 주면 색이 1을 넘어서서 블룸 임계값을 확실히 넘긴다.
 */
export function glowMat(key, { intensity = 1, ...params } = {}) {
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ toneMapped: false, ...params });
    if (intensity !== 1) m.color.multiplyScalar(intensity);
    matCache.set(key, m);
  }
  return m;
}

/**
 * 오른쪽 절반 윤곽을 받아 좌우 대칭 폐곡선으로 만든다.
 * 첫 점과 마지막 점은 중심선(x=0) 위에 있어야 한다.
 */
export function symmetric(half) {
  const pts = half.slice();
  for (let i = half.length - 2; i >= 1; i--) {
    pts.push([-half[i][0], half[i][1]]);
  }
  return pts;
}

/**
 * 위에서 본 실루엣(XY 다각형)을 두께 있는 판으로 밀어낸다.
 * 베벨을 조금 주면 모서리에 각이 잡혀 저폴리곤 특유의 또렷한 면이 생긴다.
 */
export function plate(points, { depth = 0.3, bevel = 0.05, bevelThickness = 0.05 } = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();

  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness,
    bevelOffset: 0,
    bevelSegments: 1,
  });

  g.translate(0, 0, -depth / 2); // 두께 중심을 z=0에 맞춘다.
  g.computeVertexNormals();
  return g;
}

/** 대칭 실루엣 판을 캐시와 함께 한 번에 만든다. */
export function plateGeo(key, half, opts) {
  return geo(key, () => plate(symmetric(half), opts));
}

// --- 발광 스프라이트용 방사형 텍스처 ---

let glowTex = null;

export function glowTexture() {
  if (glowTex) return glowTex;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;

  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  glowTex = new THREE.CanvasTexture(canvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** 가산 블렌딩 글로우 평면. XY 평면에 눕혀 있어 위에서 본 카메라에 그대로 보인다. */
export function glowPlane(color, width, height, opacity = 1, intensity = 1.25) {
  const g = geo(`plane:${width}:${height}`, () => new THREE.PlaneGeometry(width, height));
  const m = glowMat(`glowspr:${color}:${opacity}:${intensity}`, {
    map: glowTexture(),
    color,
    intensity,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Mesh(g, m);
}

/** 원통(기본 축 +Y)을 그대로 쓰기 위한 캐시 래퍼. */
export function cylinderGeo(key, ...args) {
  return geo(key, () => new THREE.CylinderGeometry(...args));
}

/** 엔진 링: 기본 토러스는 XY 평면이라 X축으로 90도 돌려 Y축을 향하게 한다. */
export function ringGeoY(key, radius, tube, radialSeg = 6, tubularSeg = 18) {
  return geo(key, () => {
    const g = new THREE.TorusGeometry(radius, tube, radialSeg, tubularSeg);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

/** -Y를 향하는 원판(엔진 노즐 속 발광면). */
export function discGeoBackward(key, radius, seg = 14) {
  return geo(key, () => {
    const g = new THREE.CircleGeometry(radius, seg);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

/** +Z를 향하는 반구 돔(캐노피, 상부 돔). */
export function domeGeo(key, radius, widthSeg = 12, heightSeg = 5) {
  return geo(key, () => {
    const g = new THREE.SphereGeometry(radius, widthSeg, heightSeg, 0, Math.PI * 2, 0, Math.PI / 2);
    g.rotateX(Math.PI / 2);
    return g;
  });
}

export function boxGeo(key, w, h, d) {
  return geo(key, () => new THREE.BoxGeometry(w, h, d));
}
