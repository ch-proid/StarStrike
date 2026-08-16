import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SpaceBackground } from './space-background.js';
import { Ship } from './ship.js';
import { CameraFX } from './camera-fx.js';
import { Game } from './combat/game.js';
import { FIELD, VIEW } from './combat/tuning.js';

// --- 폰 프레임 ---
//
// 게임 전체가 세로 한 칼럼 안에서만 돈다. 렌더러도 카메라 비율도 창이 아니라
// 이 칼럼을 기준으로 잡는다. 그래야 넓은 데스크톱 창에서도 폰과 같은 구도가 나온다.
// 칼럼 바깥은 어두운 색으로 비워 둔다(index.html의 --bg-void).

const frame = document.getElementById('frame');
const app = document.getElementById('app');

const frameSize = () => ({
  width: Math.max(frame.clientWidth, 1),
  height: Math.max(frame.clientHeight, 1),
});

let { width: viewWidth, height: viewHeight } = frameSize();

// --- 씬 / 렌더러 초기화 ---

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03040c);

const renderer = new THREE.WebGLRenderer({ antialias: true });
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(viewWidth, viewHeight);
app.appendChild(renderer.domElement);

// --- 카메라: 위에서 살짝 내려다보는 원근 카메라로 2.5D 깊이감을 준다 ---

const camera = new THREE.PerspectiveCamera(60, viewWidth / viewHeight, 0.1, 200);

// 기준 배치. 시선이 z=0 평면의 CAMERA_LOOK_AT를 지나므로, 그 점이 곧 화면 중심이다.
const CAMERA_BASE_POSITION = new THREE.Vector3(0, -2, 16);
const CAMERA_LOOK_AT = new THREE.Vector3(0, 2, 0); // 약간 위쪽을 봐 기울어진 각도를 만든다.

camera.position.copy(CAMERA_BASE_POSITION);
camera.lookAt(CAMERA_LOOK_AT);

const cameraFX = new CameraFX(camera, CAMERA_BASE_POSITION);

// --- 화면 비율 대응 ---
// 카메라가 살짝 기울어져 있으므로, 화면 중앙(시선 방향)을 기준으로 근사한다.
// 시선이 z=0 평면의 CAMERA_LOOK_AT를 지나므로, 그 점까지의 거리 d가 곧 기준 거리다.

/** z=0 평면에서 보이는 세로 반높이. 시야각과 거리만으로 정해진다(화면 비율과 무관). */
function visibleHalfHeightAtZ0() {
  const d = CAMERA_BASE_POSITION.distanceTo(CAMERA_LOOK_AT);
  return Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d;
}

/** z=0 평면에서 보이는 가로 반폭. */
function getVisibleHalfWidthAtZ0() {
  return visibleHalfHeightAtZ0() * camera.aspect;
}

const _projected = new THREE.Vector3();

/** 전장 좌표를 폰 프레임 안의 px로 옮긴다. 뜨는 피해 숫자가 이 값을 쓴다. */
function project(x, y) {
  camera.updateMatrixWorld();
  _projected.set(x, y, 0).project(camera);
  return {
    x: (_projected.x * 0.5 + 0.5) * viewWidth,
    y: (-_projected.y * 0.5 + 0.5) * viewHeight,
  };
}

/**
 * 머지 보드가 화면 아래를 차지한 만큼 전장을 위로 올린다.
 *
 * 카메라 위치와 바라보는 점을 같은 값만큼 내리면 기울기와 거리는 그대로 두고
 * 프레임만 세로로 옮길 수 있다. 얼마나 옮길지는 "보드 윗변이 방어선보다
 * VIEW.BOARD_TOP_MARGIN만큼 아래에 오도록"이라는 한 줄로 정한다.
 *
 * 방어선의 화면상 y도 여기서 함께 재 CSS 변수로 넘긴다. 체력 바가 그 자리에 붙는다.
 */
function applyFraming() {
  const boardEl = document.getElementById('board');
  const ratio = boardEl
    ? Math.min(boardEl.getBoundingClientRect().height / viewHeight, VIEW.BOARD_RATIO_MAX)
    : 0;

  const halfHeight = visibleHalfHeightAtZ0();
  const boardTopY = FIELD.DEFENSE_LINE_Y - VIEW.BOARD_TOP_MARGIN;

  // 화면 아랫변 = 중심 - 반높이, 보드 윗변 = 아랫변 + (보드 비율 × 전체 높이)
  const centerY = boardTopY + halfHeight * (1 - 2 * ratio);
  const shiftY = centerY - CAMERA_LOOK_AT.y;

  camera.position.set(
    CAMERA_BASE_POSITION.x,
    CAMERA_BASE_POSITION.y + shiftY,
    CAMERA_BASE_POSITION.z
  );
  camera.lookAt(CAMERA_LOOK_AT.x, CAMERA_LOOK_AT.y + shiftY, CAMERA_LOOK_AT.z);
  camera.updateMatrixWorld();

  cameraFX.setBase(camera.position);

  frame.style.setProperty('--line-y', `${project(0, FIELD.DEFENSE_LINE_Y).y}px`);
}

applyFraming();

let visibleHalfWidth = getVisibleHalfWidthAtZ0();

// --- 후처리: 은은한 블룸으로 발광부만 번지게 한다 ---

const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.setSize(viewWidth, viewHeight);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(viewWidth, viewHeight),
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
//
// 전장에는 배경 은하수와 기체·적·탄·방어선만 둔다.
// 장식용 정거장은 걷어냈다. 보스는 보스전에만 나온다(combat/boss.js).

const PLAYER_MOVE_LIMIT_RATIO = 0.85; // 화면 가장자리 여백용 계수

const background = new SpaceBackground(scene, camera);
const ship = new Ship(scene, visibleHalfWidth * PLAYER_MOVE_LIMIT_RATIO);

// 코어 루프: 웨이브 → 보스 → 스테이지 클리어 / 사망 → 재도전
const game = new Game(scene, ship, cameraFX, visibleHalfWidth, { project });

// --- 리사이즈 대응 ---
//
// 창 크기뿐 아니라 주소창이 접히며 프레임 높이가 바뀌는 경우도 잡아야 한다.
// 그래서 창이 아니라 프레임 자체를 지켜본다.

function resize() {
  const size = frameSize();
  if (size.width === viewWidth && size.height === viewHeight) return;

  viewWidth = size.width;
  viewHeight = size.height;

  camera.aspect = viewWidth / viewHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewWidth, viewHeight);
  composer.setSize(viewWidth, viewHeight);
  bloomPass.setSize(viewWidth, viewHeight);

  // 보드 높이가 화면 높이에 매여 있어, 창이 바뀌면 화면 구성도 다시 잡는다.
  applyFraming();
  visibleHalfWidth = getVisibleHalfWidthAtZ0();
  ship.setMoveLimit(visibleHalfWidth * PLAYER_MOVE_LIMIT_RATIO);
  game.setBounds(visibleHalfWidth);
  background.resize(camera);
}

new ResizeObserver(resize).observe(frame);
window.addEventListener('resize', resize);

// --- 게임 루프 ---

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1); // 탭 전환 등으로 인한 큰 dt 방지

  // 처치 순간의 히트스톱은 게임 시간만 멈춘다. 화면 흔들림은 계속 돌아야 한다.
  const gameDt = game.gameTime(dt);

  ship.update(gameDt);
  game.update(gameDt, dt);

  cameraFX.update(dt);

  composer.render();
}

animate();
