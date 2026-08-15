import * as THREE from 'three';

// 자리표시용 플레이어 우주선.
// 포인터(마우스/터치) x좌표를 따라 좌우로 이동하고, 이동 방향으로 살짝 롤(roll)을 준다.

const MOVE_RANGE_X = 8; // 좌우 이동 가능 범위
const MOVE_SPEED = 10; // 목표 위치로 따라가는 속도
const MAX_ROLL = 0.35; // 최대 롤 각도(라디안)

export class Ship {
  constructor(scene) {
    this.scene = scene;
    this.mesh = this.#createMesh();
    this.scene.add(this.mesh);

    this.targetX = 0;
    this.pointerX = 0; // -1 ~ 1 정규화된 포인터 위치

    this.#bindInput();
  }

  #createMesh() {
    // 간단한 삼각형(콘) 형태로 우주선을 대신한다.
    const geometry = new THREE.ConeGeometry(0.6, 1.6, 3);
    geometry.rotateX(Math.PI / 2); // 콘이 +Y 방향으로 화면 위쪽(전방)을 보도록 눕힌다.

    const material = new THREE.MeshStandardMaterial({
      color: 0x66ccff,
      emissive: 0x113355,
      metalness: 0.3,
      roughness: 0.4,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, -6, 0);
    return mesh;
  }

  #bindInput() {
    const updateFromClientX = (clientX) => {
      const normalized = (clientX / window.innerWidth) * 2 - 1; // -1 ~ 1
      this.pointerX = THREE.MathUtils.clamp(normalized, -1, 1);
      this.targetX = this.pointerX * MOVE_RANGE_X;
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
    // 목표 x좌표로 부드럽게 이동
    const dx = this.targetX - this.mesh.position.x;
    this.mesh.position.x += dx * Math.min(MOVE_SPEED * dt, 1);

    // 이동 속도에 비례해 롤(z축 회전)을 준다.
    const rollTarget = THREE.MathUtils.clamp(-dx * 0.3, -MAX_ROLL, MAX_ROLL);
    this.mesh.rotation.z += (rollTarget - this.mesh.rotation.z) * Math.min(8 * dt, 1);
  }
}
