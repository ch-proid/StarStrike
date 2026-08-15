import * as THREE from 'three';
import { geo, glowMat, glowPlane, glowTexture } from '../ships/common.js';
import { DEBRIS, SCRAP } from './tuning.js';

// 타격 연출용 파티클들. 모두 오브젝트 풀이고, 지오메트리는 공유한다.
// 재질은 "수명 동안 흐려져야 하는가"에 따라 갈린다.
//   - 흐려지지 않는 것(플래시, 스크랩)은 공유 재질 + 크기 애니메이션
//   - 흐려져야 하는 것(파편)은 개체마다 재질을 따로 둔다.

// --- 짧은 플래시 스프라이트 풀 ---

/** 총구 화염, 스크랩 흡수 반짝임처럼 한두 프레임 번쩍이는 연출에 쓴다. */
export class FlashPool {
  /**
   * @param {THREE.Scene} scene
   * @param {{color: number, size: number, life: number, count: number,
   *          opacity?: number, intensity?: number}} opts
   */
  constructor(scene, { color, size, life, count, opacity = 0.9, intensity = 1.5 }) {
    this.life = life;

    // glowPlane은 색·투명도·발광량 조합으로 재질을 캐시해 공유한다.
    // 그래서 이 풀의 스프라이트들은 재질 하나를 함께 쓴다.
    this.items = [];
    for (let i = 0; i < count; i++) {
      const mesh = glowPlane(color, size, size, opacity, intensity);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.items.push({ mesh, time: 0 });
    }
    this.cursor = 0;
  }

  spawn(x, y, z) {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;

    item.time = this.life;
    item.mesh.position.set(x, y, z);
    item.mesh.rotation.z = Math.random() * Math.PI;
    item.mesh.scale.setScalar(1);
    item.mesh.visible = true;
  }

  update(dt) {
    for (const item of this.items) {
      if (item.time <= 0) continue;

      item.time -= dt;
      if (item.time <= 0) {
        item.mesh.visible = false;
        continue;
      }

      // 공유 재질이라 투명도 대신 크기로 사그라뜨린다.
      const t = item.time / this.life;
      item.mesh.scale.setScalar(0.25 + t * 0.95);
    }
  }
}

// --- 파괴 파편 버스트 ---

export class DebrisField {
  constructor(scene) {
    this.items = [];

    const g = geo(`fx.debris.g:${DEBRIS.SIZE}`, () => new THREE.PlaneGeometry(DEBRIS.SIZE, DEBRIS.SIZE));

    for (let i = 0; i < DEBRIS.POOL_SIZE; i++) {
      // 파편은 수명 동안 흐려져야 하므로 재질을 개체마다 따로 만든다.
      const material = new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: 0xffffff,
        toneMapped: false,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(g, material);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);

      this.items.push({ mesh, material, vx: 0, vy: 0, life: 0, maxLife: 1 });
    }
    this.cursor = 0;
  }

  /** 처치 위치에서 파편을 사방으로 흩뿌린다. */
  burst(x, y, z) {
    for (let i = 0; i < DEBRIS.PER_KILL; i++) {
      const item = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.items.length;

      const angle = Math.random() * Math.PI * 2;
      const speed = DEBRIS.SPEED_MIN + Math.random() * (DEBRIS.SPEED_MAX - DEBRIS.SPEED_MIN);

      item.vx = Math.cos(angle) * speed;
      item.vy = Math.sin(angle) * speed;
      item.maxLife = DEBRIS.LIFE_MIN + Math.random() * (DEBRIS.LIFE_MAX - DEBRIS.LIFE_MIN);
      item.life = item.maxLife;

      // 주황 파편에 시안을 섞어 폭발의 온도차를 만든다.
      item.material.color.setHex(Math.random() < 0.65 ? DEBRIS.COLOR_WARM : DEBRIS.COLOR_COOL);
      item.material.opacity = 1;

      item.mesh.position.set(x, y, z);
      item.mesh.scale.setScalar(0.7 + Math.random() * 0.7);
      item.mesh.visible = true;
    }
  }

  update(dt) {
    for (const item of this.items) {
      if (item.life <= 0) continue;

      item.life -= dt;
      if (item.life <= 0) {
        item.mesh.visible = false;
        continue;
      }

      const drag = Math.max(1 - DEBRIS.DRAG * dt, 0);
      item.vx *= drag;
      item.vy *= drag;

      item.mesh.position.x += item.vx * dt;
      item.mesh.position.y += item.vy * dt;

      const t = item.life / item.maxLife;
      item.material.opacity = t;
      item.mesh.scale.setScalar(0.35 + t * 0.85);
    }
  }
}

// --- 스크랩: 흩어졌다가 기체로 빨려 들어온다 ---

export class ScrapField {
  /**
   * @param {THREE.Scene} scene
   * @param {() => void} onCollect 흡수 성공 시 호출(카운터 증가 등)
   */
  constructor(scene, onCollect) {
    this.onCollect = onCollect;
    this.items = [];

    const g = geo('fx.scrap.g', () => new THREE.PlaneGeometry(SCRAP.SIZE, SCRAP.SIZE));
    const m = glowMat('fx.scrap.m', {
      map: glowTexture(),
      color: SCRAP.COLOR,
      intensity: 1.4,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < SCRAP.POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(g, m);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.items.push({ mesh, active: false, vx: 0, vy: 0, scatter: 0, spin: 0 });
    }
    this.cursor = 0;

    this.absorbFlash = new FlashPool(scene, {
      color: 0xd8ffd0,
      size: 0.9,
      life: SCRAP.ABSORB_FLASH_TIME,
      count: 6,
      opacity: 0.85,
      intensity: 1.6,
    });
  }

  /** 처치 위치에 조각 두세 개를 떨군다. */
  drop(x, y, z) {
    const span = SCRAP.PER_KILL_MAX - SCRAP.PER_KILL_MIN + 1;
    const count = SCRAP.PER_KILL_MIN + Math.floor(Math.random() * span);

    for (let i = 0; i < count; i++) {
      const item = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.items.length;

      const angle = Math.random() * Math.PI * 2;
      item.vx = Math.cos(angle) * SCRAP.SCATTER_SPEED;
      item.vy = Math.sin(angle) * SCRAP.SCATTER_SPEED;
      item.scatter = SCRAP.SCATTER_TIME;
      item.spin = (Math.random() - 0.5) * 6;
      item.active = true;

      item.mesh.position.set(x, y, z);
      item.mesh.rotation.z = Math.random() * Math.PI;
      item.mesh.scale.setScalar(1);
      item.mesh.visible = true;
    }
  }

  /** @param {THREE.Vector3} target 빨려 들어갈 목표(플레이어 기체 위치) */
  update(dt, target) {
    for (const item of this.items) {
      if (!item.active) continue;

      item.mesh.rotation.z += item.spin * dt;

      if (item.scatter > 0) {
        // 1단계: 잠깐 흩어진다.
        item.scatter -= dt;
        const drag = Math.max(1 - SCRAP.SCATTER_DRAG * dt, 0);
        item.vx *= drag;
        item.vy *= drag;
      } else {
        // 2단계: 기체 쪽으로 가속하며 빨려 들어간다.
        const dx = target.x - item.mesh.position.x;
        const dy = target.y - item.mesh.position.y;
        const dist = Math.hypot(dx, dy) || 1;

        item.vx += (dx / dist) * SCRAP.MAGNET_ACCEL * dt;
        item.vy += (dy / dist) * SCRAP.MAGNET_ACCEL * dt;

        const speed = Math.hypot(item.vx, item.vy);
        if (speed > SCRAP.MAGNET_MAX_SPEED) {
          const k = SCRAP.MAGNET_MAX_SPEED / speed;
          item.vx *= k;
          item.vy *= k;
        }

        // 이번 프레임에 지나쳐 버릴 거리까지 흡수 범위로 쳐서, 느린 기기에서
        // 조각이 기체를 스쳐 지나 맴도는 일을 막는다.
        const step = Math.min(speed, SCRAP.MAGNET_MAX_SPEED) * dt;
        if (dist < SCRAP.PICKUP_RADIUS + step) {
          item.active = false;
          item.mesh.visible = false;
          this.absorbFlash.spawn(target.x, target.y, item.mesh.position.z);
          this.onCollect();
          continue;
        }
      }

      item.mesh.position.x += item.vx * dt;
      item.mesh.position.y += item.vy * dt;
    }

    this.absorbFlash.update(dt);
  }
}
