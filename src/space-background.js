import * as THREE from 'three';

// 정적 우주 배경: 코드로 그린 은하수 텍스처 한 장을 아주 먼 평면에 붙인다.
// 별이 흐르지 않고 멀리 붙박여 있어, 화면은 조용하고 깊이감만 남는다.
//
// 밝기 규칙
//   블룸 임계값이 0.82라, 배경이 그보다 밝으면 화면 전체가 번져 지저분해진다.
//   그래서 성운도 별도 MAX_BRIGHT(205/255 ≈ 0.80) 아래로 눌러 그린다.
//   대비를 아끼고 여러 겹을 낮은 알파로 쌓아야 사진처럼 보인다.

const TEX_SIZE = 2048;
const PLANE_Z = -90; // 보스 정거장(z=-26)보다 한참 뒤
const COVER_MARGIN = 1.1; // 카메라 흔들림까지 감안한 여유

const MAX_BRIGHT = 205; // 어떤 픽셀도 이 값을 넘기지 않는다.

// 심우주 베이스(씬 배경색 0x03040c 계열)
const BASE_R = 3;
const BASE_G = 4;
const BASE_B = 12;

// 은하수 띠
const BAND_ANGLE = -0.42; // 화면을 비스듬히 가로지르는 기울기(라디안)
const BAND_HALF_WIDTH = TEX_SIZE * 0.15; // 띠의 두께(가우시안 표준편차)
const NEBULA_BLOBS = 560; // 성운 덩어리 수
const DUST_BLOBS = 160; // 띠를 갈라 놓는 성간먼지 수

// 별
const BAND_STARS = 2600; // 띠 주변 밀집 별
const FIELD_STARS = 3400; // 화면 전체에 흩뿌린 별
const GLOW_STARS = 42; // 살짝 번지는 밝은 별

// --- 작은 도구들 ---

const rand = (min, max) => min + Math.random() * (max - min);

/** -1~1 부근에 몰리는 대략적인 정규분포. 띠 두께 분포에 쓴다. */
function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

/** 부드러운 방사형 덩어리 하나. 겹겹이 쌓아 성운을 만든다. */
function blob(ctx, x, y, r, color, alpha) {
  const [cr, cg, cb] = color;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0.0, `rgba(${cr},${cg},${cb},${alpha})`);
  grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},${alpha * 0.42})`);
  grad.addColorStop(0.75, `rgba(${cr},${cg},${cb},${alpha * 0.12})`);
  grad.addColorStop(1.0, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** 띠 좌표계(along = 띠 방향, across = 띠 수직 방향)를 텍스처 좌표로 옮긴다. */
function bandToTexture(along, across) {
  const c = Math.cos(BAND_ANGLE);
  const s = Math.sin(BAND_ANGLE);
  const half = TEX_SIZE / 2;
  return [half + c * along - s * across, half + s * along + c * across];
}

// --- 텍스처 생성 ---

function createNebulaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');

  // 1) 심우주 베이스
  ctx.fillStyle = `rgb(${BASE_R},${BASE_G},${BASE_B})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // 아주 옅은 광원 얼룩으로 완전한 단색을 깨 준다.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 24; i++) {
    blob(
      ctx,
      rand(0, TEX_SIZE),
      rand(0, TEX_SIZE),
      rand(TEX_SIZE * 0.18, TEX_SIZE * 0.42),
      [10, 14, 34],
      0.16
    );
  }

  // 2) 은하수 띠: 푸른빛·보랏빛 덩어리를 낮은 알파로 수백 겹 쌓는다.
  for (let i = 0; i < NEBULA_BLOBS; i++) {
    const along = (Math.random() - 0.5) * TEX_SIZE * 1.7;
    const across = gauss() * BAND_HALF_WIDTH;
    const [x, y] = bandToTexture(along, across);

    // 띠 중심에 가까울수록 진하고, 가운데 구간만 살짝 따뜻한 색을 섞는다.
    const centerness = 1 - Math.min(Math.abs(across) / (BAND_HALF_WIDTH * 2), 1);
    const coreness = 1 - Math.min(Math.abs(along) / (TEX_SIZE * 0.45), 1);
    const warm = coreness * centerness;

    const color = [
      Math.round(24 + warm * 46 + rand(-6, 10)),
      Math.round(28 + warm * 26 + rand(-6, 10)),
      Math.round(58 + rand(-10, 18)),
    ];

    const r = rand(TEX_SIZE * 0.03, TEX_SIZE * 0.13);
    blob(ctx, x, y, r, color, 0.05 + centerness * 0.07);
  }

  // 띠 한가운데의 옅은 발광 심(core)
  for (let i = 0; i < 90; i++) {
    const along = gauss() * TEX_SIZE * 0.2;
    const across = gauss() * BAND_HALF_WIDTH * 0.45;
    const [x, y] = bandToTexture(along, across);
    blob(ctx, x, y, rand(TEX_SIZE * 0.02, TEX_SIZE * 0.07), [78, 62, 74], 0.06);
  }

  // 3) 성간먼지: 어두운 덩어리를 덮어 띠를 갈라 놓는다(가산이 아니라 덮어쓰기).
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < DUST_BLOBS; i++) {
    const along = (Math.random() - 0.5) * TEX_SIZE * 1.6;
    const across = gauss() * BAND_HALF_WIDTH * 0.9;
    const [x, y] = bandToTexture(along, across);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(BAND_ANGLE + rand(-0.25, 0.25));
    ctx.scale(rand(1.6, 3.4), 1); // 띠 방향으로 늘어난 먼지 띠
    blob(ctx, 0, 0, rand(TEX_SIZE * 0.02, TEX_SIZE * 0.07), [BASE_R, BASE_G, BASE_B], 0.5);
    ctx.restore();
  }

  // 4) 별: 띠 주변에 밀집 → 화면 전체에 흩뿌림 → 몇 개만 글로우
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < BAND_STARS; i++) {
    const along = (Math.random() - 0.5) * TEX_SIZE * 1.7;
    const across = gauss() * BAND_HALF_WIDTH * 1.1;
    const [x, y] = bandToTexture(along, across);
    drawStar(ctx, x, y, rand(0.3, 1.0), rand(0.28, 0.72));
  }

  for (let i = 0; i < FIELD_STARS; i++) {
    drawStar(ctx, rand(0, TEX_SIZE), rand(0, TEX_SIZE), rand(0.3, 1.3), rand(0.2, 0.85));
  }

  for (let i = 0; i < GLOW_STARS; i++) {
    const x = rand(0, TEX_SIZE);
    const y = rand(0, TEX_SIZE);
    const tint = Math.random() < 0.5 ? [150, 175, MAX_BRIGHT] : [MAX_BRIGHT, 178, 150];
    blob(ctx, x, y, rand(6, 16), tint, 0.3);
    drawStar(ctx, x, y, rand(0.9, 1.5), 1);
  }

  ctx.globalCompositeOperation = 'source-over';
  clampBrightness(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * 마지막 안전장치: 어떤 픽셀도 MAX_BRIGHT를 넘지 않게 눌러 준다.
 * 성운을 가산으로 여러 겹 쌓다 보면 중심부가 예상보다 밝아질 수 있는데,
 * 그대로 두면 배경이 블룸에 번져 화면이 뿌옇게 뜬다.
 * 색조를 지키려고 세 채널을 같은 비율로 줄인다. 텍스처를 만들 때 한 번만 돈다.
 */
function clampBrightness(ctx) {
  const image = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
  const d = image.data;

  for (let i = 0; i < d.length; i += 4) {
    const peak = Math.max(d[i], d[i + 1], d[i + 2]);
    if (peak <= MAX_BRIGHT) continue;

    const k = MAX_BRIGHT / peak;
    d[i] *= k;
    d[i + 1] *= k;
    d[i + 2] *= k;
  }

  ctx.putImageData(image, 0, 0);
}

/** 별 하나. brightness는 0~1이고, 최대치도 블룸 임계값 아래로 눌러 둔다. */
function drawStar(ctx, x, y, radius, brightness) {
  const v = Math.round(MAX_BRIGHT * brightness);
  // 색온도를 살짝 흩어 놓으면 흑백 점보다 사진에 가까워 보인다.
  const r = Math.min(MAX_BRIGHT, Math.round(v * rand(0.9, 1.0)));
  const g = Math.min(MAX_BRIGHT, Math.round(v * rand(0.9, 1.0)));
  const b = Math.min(MAX_BRIGHT, Math.round(v * rand(0.95, 1.05)));

  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// --- 씬에 올리는 배경 평면 ---

export class SpaceBackground {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(scene, camera) {
    this.texture = createNebulaTexture();
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      depthWrite: false, // 배경이 다른 물체의 깊이를 가리지 않게
      fog: false,
    });
    this.geometry = new THREE.PlaneGeometry(1, 1);

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = -1; // 항상 맨 먼저 그린다.
    scene.add(this.mesh);

    this.resize(camera);
  }

  /**
   * 카메라 절두체의 네 모서리를 z = PLANE_Z 평면에 투영해,
   * 어떤 화면 비율에서도 배경이 화면을 완전히 덮게 크기와 중심을 맞춘다.
   */
  resize(camera) {
    camera.updateMatrixWorld();

    const corner = new THREE.Vector3();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const nx of [-1, 1]) {
      for (const ny of [-1, 1]) {
        corner.set(nx, ny, 1).unproject(camera); // 원거리 평면 위의 모서리
        corner.sub(camera.position); // 카메라에서 그쪽으로 향하는 방향
        const t = (PLANE_Z - camera.position.z) / corner.z;
        const x = camera.position.x + corner.x * t;
        const y = camera.position.y + corner.y * t;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    const width = (maxX - minX) * COVER_MARGIN;
    const height = (maxY - minY) * COVER_MARGIN;

    this.mesh.scale.set(width, height, 1);
    this.mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, PLANE_Z);
  }
}
