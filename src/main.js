import * as THREE from 'three';
import { Starfield } from './starfield.js';
import { Ship } from './ship.js';
import { CameraFX } from './camera-fx.js';

// --- 씬 / 렌더러 초기화 ---

const app = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000005);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

// --- 조명 ---

const ambientLight = new THREE.AmbientLight(0x445577, 1.2);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(2, 5, 8);
scene.add(keyLight);

// --- 게임 오브젝트 ---

const starfield = new Starfield(scene);
const ship = new Ship(scene);

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
});

// --- 게임 루프 ---

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1); // 탭 전환 등으로 인한 큰 dt 방지

  starfield.update(dt);
  ship.update(dt);
  cameraFX.update(dt);

  renderer.render(scene, camera);
}

animate();
