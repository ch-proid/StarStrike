import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SpaceBackground } from './space-background.js';
import { Ship } from './ship.js';
import { CameraFX } from './camera-fx.js';
import { Game } from './combat/game.js';
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

const background = new SpaceBackground(scene, camera);
const ship = new Ship(scene, visibleHalfWidth * PLAYER_MOVE_LIMIT_RATIO);

// 배경 장식용 정거장: 맨 뒤 멀리에 두어 스케일감을 준다.
// 실제로 싸우는 보스는 별도 인스턴스라, 보스전 동안에는 이 장식을 숨긴다(Game이 맡는다).
const bossDecor = createBossStation();
bossDecor.position.set(0, 12, -26);
scene.add(bossDecor);

// 코어 루프: 웨이브 → 보스 → 스테이지 클리어 / 사망 → 재도전
const game = new Game(scene, ship, cameraFX, visibleHalfWidth, { bossDecor });

// --- 리사이즈 대응 ---

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);

  visibleHalfWidth = getVisibleHalfWidthAtZ0();
  ship.setMoveLimit(visibleHalfWidth * PLAYER_MOVE_LIMIT_RATIO);
  game.setBounds(visibleHalfWidth);
  background.resize(camera);
});

// --- 게임 루프 ---

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1); // 탭 전환 등으로 인한 큰 dt 방지

  // 처치 순간의 히트스톱은 게임 시간만 멈춘다. 화면 흔들림은 계속 돌아야 한다.
  const gameDt = game.gameTime(dt);

  ship.update(gameDt);
  game.update(gameDt, dt);

  bossDecor.rotation.z += 0.06 * gameDt;

  cameraFX.update(dt);

  composer.render();
}

animate();
