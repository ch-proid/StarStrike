import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Starfield } from './starfield.js';
import { Ship } from './ship.js';
import { CameraFX } from './camera-fx.js';
import { createEnemyInterceptor } from './ships/enemy-interceptor.js';
import { createEnemyGunship } from './ships/enemy-gunship.js';
import { createEnemySaucer } from './ships/enemy-saucer.js';
import { createBossStation } from './ships/boss-station.js';

// --- 씬 / 렌더러 초기화 ---

const app = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03040c);

const renderer = new THREE.WebGLRenderer({ antialias: true });
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

// --- 카메라: 위에서 살짝 내려다보는 원근 카메라로 2.5D 깊이감을 준다 ---

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);

const CAMERA_BASE_POSITION = new THREE.Vector3(0, -2, 16);
camera.position.copy(CAMERA_BASE_POSITION);
camera.lookAt(0, 2, 0); // 약간 위쪽을 바라보게 해 기울어진 각도를 만든다.

const cameraFX = new CameraFX(camera, CAMERA_BASE_POSITION);

// --- 화면 비율 대응: z=0 평면에서 카메라에 보이는 가로 반폭 ---
// 카메라가 살짝 기울어져 있으므로, 화면 중앙(시선 방향)을 기준으로 근사한다.
// 1) 카메라 위치에서 시선 방향으로 z=0 평면까지의 거리 d를 구하고
// 2) 그 거리에서의 반높이(tan(fov/2) * d)에 aspect를 곱해 반폭을 얻는다.
function getVisibleHalfWidthAtZ0() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const d = -camera.position.z / dir.z; // 카메라 → z=0 평면까지 시선 방향 거리
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const visibleHalfHeight = Math.tan(vFov / 2) * d;
  return visibleHalfHeight * camera.aspect;
}

let visibleHalfWidth = getVisibleHalfWidthAtZ0();

// --- 후처리: 은은한 블룸으로 발광부만 번지게 한다 ---

const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, // strength: 하이퍼캐주얼 모바일 기준으로 절제
  0.4, // radius
  0.82 // threshold: 밝은 발광부만 번지게
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// --- 조명 ---

const ambientLight = new THREE.AmbientLight(0x445577, 1.1);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(2, 5, 8);
scene.add(keyLight);

// 아래에서 올라오는 푸른 림 라이트로 어두운 적기의 실루엣을 살린다.
const rimLight = new THREE.DirectionalLight(0x5577ff, 0.7);
rimLight.position.set(-4, -6, 3);
scene.add(rimLight);

// --- 게임 오브젝트 ---

const PLAYER_MOVE_LIMIT_RATIO = 0.85; // 화면 가장자리 여백용 계수

const starfield = new Starfield(scene);
const ship = new Ship(scene, visibleHalfWidth * PLAYER_MOVE_LIMIT_RATIO);

// --- 시각 검수용 적 배치 ---
// 전투 로직은 아직 없다. 위에서 아래로 천천히 흘러내리다 위로 되돌아간다.

const DRIFT_TOP = 13;
const DRIFT_BOTTOM = -12;

const drifters = [];

/** 적기를 씬에 올린다. 기수가 -Y(플레이어 쪽)를 보도록 Z축으로 180도 돌린다. */
function addEnemy(group, { x, y, z = 0, speed = 1.6, spin = 0, faceDown = true }) {
  if (faceDown) group.rotation.z = Math.PI;
  group.position.set(x, y, z);
  scene.add(group);
  drifters.push({ group, speed, spin, baseZ: z });
  return group;
}

// 전시 배치 x좌표는 고정값 대신 화면에 보이는 반폭(visibleHalfWidth)에 대한 비율로 잡아,
// 세로로 좁은 모바일 화면에서도 화면 밖으로 나가지 않게 한다.
const SQUAD_CENTER_RATIO = -0.6;
const GUNSHIP_X_RATIO = 0;
const SAUCER_X_RATIO = 0.6;

// 인터셉터 5기 편대(V자 대형) — 다수 생성 성능 확인용. 대형 내 좌우 벌어짐도
// 반폭에 대한 비율로 잡아 편대 중심 대비 원래와 같은 비례를 유지한다.
const SQUAD_OFFSETS = [
  [0, 0],
  [-0.144, -1.1],
  [0.144, -1.1],
  [-0.289, -2.2],
  [0.289, -2.2],
];
const squadCenterX = visibleHalfWidth * SQUAD_CENTER_RATIO;
for (const [oxRatio, oy] of SQUAD_OFFSETS) {
  addEnemy(createEnemyInterceptor(), {
    x: squadCenterX + visibleHalfWidth * oxRatio,
    y: DRIFT_TOP + oy,
    speed: 2.4,
  });
}

// 중형 건쉽
addEnemy(createEnemyGunship(), { x: visibleHalfWidth * GUNSHIP_X_RATIO, y: 6.5, speed: 1.5 });

// 회전하며 내려오는 원반
addEnemy(createEnemySaucer(), {
  x: visibleHalfWidth * SAUCER_X_RATIO,
  y: 1.5,
  speed: 1.2,
  spin: 0.7,
});

// 보스 정거장: 맨 뒤 멀리에 두어 스케일감을 준다. 제자리에서 천천히 자전.
const bossStation = createBossStation();
bossStation.position.set(0, 12, -26);
scene.add(bossStation);

// --- 스페이스바로 카메라 흔들림 시연 ---

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    cameraFX.shake(0.5, 0.35);
  }
});

// --- 리사이즈 대응 ---

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);

  visibleHalfWidth = getVisibleHalfWidthAtZ0();
  ship.setMoveLimit(visibleHalfWidth * PLAYER_MOVE_LIMIT_RATIO);
});

// --- 게임 루프 ---

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1); // 탭 전환 등으로 인한 큰 dt 방지

  starfield.update(dt);
  ship.update(dt);

  for (const d of drifters) {
    d.group.position.y -= d.speed * dt;
    if (d.spin) d.group.rotation.z += d.spin * dt;
    if (d.group.position.y < DRIFT_BOTTOM) {
      d.group.position.y += DRIFT_TOP - DRIFT_BOTTOM;
    }
  }

  bossStation.rotation.z += 0.06 * dt;

  cameraFX.update(dt);

  composer.render();
}

animate();
