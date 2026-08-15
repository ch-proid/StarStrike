import * as THREE from 'three';
import { createEnemyInterceptor } from '../ships/enemy-interceptor.js';
import { ENEMY } from './tuning.js';

// 더미 적: 화면 위에서 무작위로 내려오는 요격기.
// 아직 공격도 회피도 하지 않는다. 타격감을 재는 과녁 역할만 한다.
//
// 피격 번쩍임은 재질 스왑으로 만든다. 자식 메시 전부를 흰색으로 바꾸되,
// 발광 부품(MeshBasicMaterial)은 건드리지 않는다. 가산 블렌딩 평면을 불투명
// 흰색으로 바꾸면 네모난 흰 판이 그대로 드러나기 때문이다.

const FLASH_COLOR = 0xffffff;

export class DummyEnemies {
  /**
   * @param {THREE.Scene} scene
   * @param {number} halfWidth 화면에 보이는 가로 반폭
   */
  constructor(scene, halfWidth) {
    this.halfWidth = halfWidth;
    this.spawnTimer = 0;

    this.flashMat = new THREE.MeshBasicMaterial({ color: FLASH_COLOR, toneMapped: false });

    this.pool = [];
    for (let i = 0; i < ENEMY.POOL_SIZE; i++) {
      const group = createEnemyInterceptor();
      group.rotation.z = Math.PI; // 기수가 -Y(플레이어 쪽)를 보게 돌린다.
      group.visible = false;
      scene.add(group);

      // 번쩍임 대상은 조명을 받는 부품만 추린다.
      const meshes = [];
      group.traverse((o) => {
        if (o.isMesh && o.material.isMeshStandardMaterial) meshes.push(o);
      });

      this.pool.push({
        group,
        meshes,
        baseMats: meshes.map((m) => m.material),
        active: false,
        hp: 0,
        speed: 0,
        flash: 0,
      });
    }

    this.active = [];
  }

  setBounds(halfWidth) {
    this.halfWidth = halfWidth;
  }

  update(dt) {
    this.#updateSpawn(dt);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];

      e.group.position.y -= e.speed * dt;

      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) this.#setFlash(e, false);
      }

      if (e.group.position.y < ENEMY.DESPAWN_Y) {
        this.release(e);
      }
    }
  }

  #updateSpawn(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || this.active.length >= ENEMY.ALIVE_MAX) return;

    // 개체가 모자라면 간격을 줄여 빠르게 채운다.
    const rush = this.active.length < ENEMY.ALIVE_MIN;
    this.spawnTimer = ENEMY.SPAWN_INTERVAL * (rush ? ENEMY.SPAWN_RUSH_SCALE : 1);

    this.#spawn();
  }

  #spawn() {
    const e = this.pool.find((p) => !p.active);
    if (!e) return;

    e.active = true;
    e.hp = ENEMY.HP;
    e.speed = ENEMY.SPEED_MIN + Math.random() * (ENEMY.SPEED_MAX - ENEMY.SPEED_MIN);
    e.flash = 0;

    const range = this.halfWidth * ENEMY.SPAWN_X_RATIO;
    e.group.position.set(
      (Math.random() * 2 - 1) * range,
      ENEMY.SPAWN_Y + Math.random() * ENEMY.SPAWN_Y_JITTER,
      0
    );
    e.group.visible = true;

    this.active.push(e);
  }

  /**
   * 피격 처리.
   * @returns {boolean} 이번 타격으로 격추됐으면 true
   */
  hit(enemy, damage) {
    enemy.hp -= damage;
    this.#setFlash(enemy, true);
    enemy.flash = ENEMY.FLASH_TIME;
    return enemy.hp <= 0;
  }

  release(enemy) {
    if (!enemy.active) return;

    this.#setFlash(enemy, false);
    enemy.active = false;
    enemy.flash = 0;
    enemy.group.visible = false;

    const i = this.active.indexOf(enemy);
    if (i >= 0) this.active.splice(i, 1);
  }

  #setFlash(enemy, on) {
    // 번쩍이는 중에 또 맞아도 원본 재질을 잃지 않도록 baseMats에서만 되돌린다.
    for (let i = 0; i < enemy.meshes.length; i++) {
      enemy.meshes[i].material = on ? this.flashMat : enemy.baseMats[i];
    }
  }
}
