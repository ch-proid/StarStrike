import * as THREE from 'three';

// 별 배경: z 깊이가 다른 3겹 Points 레이어로 패럴랙스(시차) 효과를 낸다.
// 카메라에 가까운 레이어일수록 크고 빠르게, 먼 레이어일수록 작고 느리게 흐른다.

const LAYER_CONFIG = [
  { count: 250, spread: 60, z: -10, size: 0.35, speed: 6, color: 0x8899ff },
  { count: 200, spread: 70, z: -30, size: 0.25, speed: 3.5, color: 0x6677cc },
  { count: 150, spread: 90, z: -55, size: 0.18, speed: 1.8, color: 0x445599 },
];

const FIELD_HEIGHT = 80; // 별이 흐르다 재활용되는 세로 범위

export class Starfield {
  constructor(scene) {
    this.scene = scene;
    this.layers = LAYER_CONFIG.map((cfg) => this.#createLayer(cfg));
  }

  #createLayer(cfg) {
    const positions = new Float32Array(cfg.count * 3);

    for (let i = 0; i < cfg.count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * cfg.spread;
      positions[i * 3 + 1] = (Math.random() - 0.5) * FIELD_HEIGHT;
      positions[i * 3 + 2] = cfg.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: cfg.color,
      size: cfg.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    return { points, geometry, cfg };
  }

  update(dt) {
    for (const layer of this.layers) {
      const positions = layer.geometry.attributes.position;
      const speed = layer.cfg.speed;

      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) - speed * dt;

        // 화면 아래로 흐른 별은 위쪽으로 되돌려 재사용한다.
        if (y < -FIELD_HEIGHT / 2) {
          y += FIELD_HEIGHT;
        }

        positions.setY(i, y);
      }

      positions.needsUpdate = true;
    }
  }
}
