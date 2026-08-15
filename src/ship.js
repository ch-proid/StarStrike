import * as THREE from 'three';
import { createPlayerShip } from './ships/player-ship.js';
import { PLAYER } from './combat/tuning.js';

// 플레이어 우주선.
// 포인터(마우스/터치) x좌표를 따라 좌우로 이동하고, 이동 방향으로 살짝 롤(roll)을 준다.
// 기수는 +Y(화면 위, 적 방향)를 향한다.
//
// 체력과 사망 판정은 게임 진행(combat/game.js)이 들고, 여기서는 그 결과를 눈에 보이게만 한다.
// 피격하면 잠깐 붉게 물들고, 무적 시간 동안 깜빡인다.

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

    this.homeY = this.mesh.position.y;

    // 피격 연출: 적기와 같은 재질 스왑 방식이되 색만 붉다.
    this.hurtMat = new THREE.MeshBasicMaterial({
      color: PLAYER.HURT_FLASH_COLOR,
      toneMapped: false,
    });
    this.meshes = [];
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material.isMeshStandardMaterial) this.meshes.push(o);
    });
    this.baseMats = this.meshes.map((m) => m.material);

    this.hurtFlash = 0;
    this.invuln = 0;
    this.destroyed = false;

    this.#bindInput();
  }

  /**
   * 피격 연출 시작. 붉게 번쩍인 뒤 무적 시간 동안 깜빡인다.
   * @param {boolean} grantInvuln 무적을 줄지. 방어선 통과 피해는 무적을 주지 않아
   *   번쩍임이 끝날 만큼만 시간을 잡아 둔다.
   */
  playHurt(grantInvuln = true) {
    this.hurtFlash = PLAYER.HURT_FLASH_TIME;
    this.invuln = grantInvuln
      ? PLAYER.INVULN_TIME
      : Math.max(this.invuln, PLAYER.HURT_FLASH_TIME);
    this.#setHurtMaterial(true);
  }

  /** 격추. 기체를 화면에서 지운다. 폭발 파편은 게임 쪽에서 뿌린다. */
  destroy() {
    this.destroyed = true;
    this.hurtFlash = 0;
    this.invuln = 0;
    this.#setHurtMaterial(false);
    this.mesh.visible = false;
  }

  /** 재시작용 초기화. 위치·재질·깜빡임을 모두 되돌린다. */
  reset() {
    this.destroyed = false;
    this.hurtFlash = 0;
    this.invuln = 0;
    this.#setHurtMaterial(false);

    this.mesh.position.set(0, this.homeY, 0);
    this.mesh.rotation.z = 0;
    this.mesh.visible = true;

    this.targetX = this.pointerX * this.moveLimit;
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
    if (this.destroyed) return;

    this.time += dt;
    this.#updateHurt(dt);

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

  /** 붉은 번쩍임 → 무적 깜빡임 → 원래대로. */
  #updateHurt(dt) {
    if (this.invuln <= 0) return;

    this.invuln -= dt;

    if (this.hurtFlash > 0) {
      this.hurtFlash -= dt;
      if (this.hurtFlash <= 0) this.#setHurtMaterial(false);
    }

    if (this.invuln <= 0) {
      this.mesh.visible = true;
      return;
    }

    // 무적이 남아 있는 동안은 일정 주기로 껐다 켠다.
    const phase = Math.floor(this.invuln / PLAYER.BLINK_INTERVAL);
    this.mesh.visible = phase % 2 === 0;
  }

  #setHurtMaterial(on) {
    // 번쩍이는 중에 또 맞아도 원본 재질을 잃지 않도록 baseMats에서만 되돌린다.
    for (let i = 0; i < this.meshes.length; i++) {
      this.meshes[i].material = on ? this.hurtMat : this.baseMats[i];
    }
  }
}
