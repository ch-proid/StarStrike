import * as THREE from 'three';
import { createPlayerShip } from './ships/player-ship.js';

// 플레이어 우주선.
// 포인터(마우스/터치) x좌표를 따라 좌우로 이동하고, 이동 방향으로 살짝 롤(roll)을 준다.
// 기수는 +Y(화면 위, 적 방향)를 향한다.

const MOVE_RANGE_X = 8; // 좌우 이동 가능 범위 기본값(생성자에 moveLimit 미전달 시 사용)
const MOVE_SPEED = 10; // 목표 위치로 따라가는 속도
const MAX_ROLL = 0.35; // 최대 롤 각도(라디안)

// 발칸 총구 자리(기체 로컬 좌표). 기수 양옆 캐너드 끝에 하나씩.
// 빈 오브젝트로 달아 두면 기체가 롤할 때 총구도 함께 기울어진다.
const MUZZLE_LOCAL = [
  [1.0, 1.95, 0.2],
  [-1.0, 1.95, 0.2],
];

export class Ship {
  /**
   * @param {THREE.Scene} scene
   * @param {number} [moveLimit] 좌우 이동 가능 범위(월드 단위). 화면 비율에 따라 가변.
   *   생략 시 기본값(MOVE_RANGE_X)을 쓴다. setMoveLimit()으로 이후에도 갱신 가능.
   */
  constructor(scene, moveLimit = MOVE_RANGE_X) {
    this.scene = scene;
    this.moveLimit = moveLimit;

    this.mesh = createPlayerShip();
    this.mesh.position.set(0, -3.8, 0);
    this.scene.add(this.mesh);

    this.muzzles = MUZZLE_LOCAL.map(([x, y, z]) => {
      const anchor = new THREE.Object3D();
      anchor.position.set(x, y, z);
      this.mesh.add(anchor);
      return anchor;
    });

    this.thrusters = this.mesh.userData.thrusters ?? [];
    this.thrusterBase = this.thrusters.map((t) => t.scale.y);
    this.time = 0;

    this.targetX = 0;
    this.pointerX = 0; // -1 ~ 1 정규화된 포인터 위치

    this.#bindInput();
  }

  /** 화면 리사이즈 등으로 좌우 이동 한계가 바뀌었을 때 호출한다. */
  setMoveLimit(moveLimit) {
    this.moveLimit = moveLimit;
    this.targetX = this.pointerX * this.moveLimit;
  }

  #bindInput() {
    const updateFromClientX = (clientX) => {
      const normalized = (clientX / window.innerWidth) * 2 - 1; // -1 ~ 1
      this.pointerX = THREE.MathUtils.clamp(normalized, -1, 1);
      this.targetX = this.pointerX * this.moveLimit;
    };

    window.addEventListener('mousemove', (e) => updateFromClientX(e.clientX));

    window.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length > 0) {
          updateFromClientX(e.touches[0].clientX);
        }
      },
      { passive: true }
    );
  }

  update(dt) {
    this.time += dt;

    // 목표 x좌표로 부드럽게 이동
    const dx = this.targetX - this.mesh.position.x;
    this.mesh.position.x += dx * Math.min(MOVE_SPEED * dt, 1);

    // 이동 속도에 비례해 롤(z축 회전)을 준다.
    const rollTarget = THREE.MathUtils.clamp(-dx * 0.3, -MAX_ROLL, MAX_ROLL);
    this.mesh.rotation.z += (rollTarget - this.mesh.rotation.z) * Math.min(8 * dt, 1);

    // 엔진 분사 글로우가 미세하게 흔들리도록 길이를 떨어준다.
    const flicker = 0.88 + Math.sin(this.time * 26) * 0.06 + Math.random() * 0.06;
    for (let i = 0; i < this.thrusters.length; i++) {
      this.thrusters[i].scale.y = this.thrusterBase[i] * flicker;
    }
  }
}
