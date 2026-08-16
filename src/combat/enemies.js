import * as THREE from 'three';
import { createEnemyInterceptor } from '../ships/enemy-interceptor.js';
import { createEnemyGunship } from '../ships/enemy-gunship.js';
import { createEnemySaucer } from '../ships/enemy-saucer.js';
import { ENEMY, ENEMY_TYPES, FIELD } from './tuning.js';

// 적 편대. 종류별로 오브젝트 풀을 따로 두고, 웨이브가 요청할 때만 한 기씩 내보낸다.
// 스스로 스폰하지 않는다. 언제 무엇을 낼지는 웨이브 진행이 정한다(game.js).
//
// 피격 번쩍임은 재질 스왑으로 만든다. 조명을 받는 부품만 흰색으로 바꾸되,
// 발광 부품(MeshBasicMaterial)은 건드리지 않는다. 가산 블렌딩 평면을 불투명
// 흰색으로 바꾸면 네모난 흰 판이 그대로 드러나기 때문이다.

const FLASH_COLOR = 0xffffff;

/** 종류 키 → 조형 함수. 기수가 +Y를 보는 기체는 Z축으로 180도 돌려 세운다. */
const BLUEPRINTS = {
  INTERCEPTOR: { create: createEnemyInterceptor, faceDown: true },
  GUNSHIP: { create: createEnemyGunship, faceDown: true },
  SAUCER: { create: createEnemySaucer, faceDown: false },
};

export const ENEMY_KEYS = Object.keys(BLUEPRINTS);

export class EnemyField {
  /**
   * @param {THREE.Scene} scene
   * @param {number} halfWidth 화면에 보이는 가로 반폭
   */
  constructor(scene, halfWidth) {
    this.halfWidth = halfWidth;

    this.flashMat = new THREE.MeshBasicMaterial({ color: FLASH_COLOR, toneMapped: false });

    // 스테이지 난이도 배수. setScaling()으로 갈아 끼운다.
    this.hpScale = 1;
    this.speedScale = 1;

    /** @type {Record<string, object[]>} 종류별 풀 */
    this.pools = {};

    for (const key of ENEMY_KEYS) {
      const def = ENEMY_TYPES[key];
      const blueprint = BLUEPRINTS[key];
      const pool = [];

      for (let i = 0; i < def.POOL_SIZE; i++) {
        const group = blueprint.create();
        if (blueprint.faceDown) group.rotation.z = Math.PI; // 기수를 -Y(플레이어 쪽)로
        group.visible = false;
        scene.add(group);

        // 번쩍임 대상은 조명을 받는 부품만 추린다.
        const meshes = [];
        group.traverse((o) => {
          if (o.isMesh && o.material.isMeshStandardMaterial) meshes.push(o);
        });

        pool.push({
          type: key,
          def,
          group,
          meshes,
          baseMats: meshes.map((m) => m.material),
          baseRotationZ: group.rotation.z,
          active: false,
          hp: 0,
          speed: 0,
          flash: 0,
          baseX: 0,
          swayPhase: 0,
          time: 0,
        });
      }

      this.pools[key] = pool;
    }

    /** @type {object[]} 지금 살아 있는 적들 */
    this.active = [];
  }

  setBounds(halfWidth) {
    this.halfWidth = halfWidth;
  }

  /** 스테이지 난이도 배수를 갈아 끼운다. 이미 떠 있는 적에게는 적용되지 않는다. */
  setScaling(hpScale, speedScale) {
    this.hpScale = hpScale;
    this.speedScale = speedScale;
  }

  /**
   * 한 기를 화면 위에 내보낸다. 풀이 비었으면 아무것도 하지 않는다.
   * @param {string} key ENEMY_KEYS 중 하나
   * @returns {object|null} 스폰한 개체
   */
  spawn(key) {
    const pool = this.pools[key];
    if (!pool) return null;

    const e = pool.find((p) => !p.active);
    if (!e) return null;

    const def = e.def;

    e.active = true;
    // HP는 반올림하지 않는다. 탄 한 발의 대미지가 화력에 따라 실수로 오르내리기 때문이다.
    e.hp = def.HP * this.hpScale;
    e.speed =
      (def.SPEED_MIN + Math.random() * (def.SPEED_MAX - def.SPEED_MIN)) * this.speedScale;
    e.flash = 0;
    e.time = 0;
    e.swayPhase = Math.random() * Math.PI * 2;

    // 흔들리며 내려오는 적은 흔들림 폭만큼 안쪽에서 시작해야 화면을 벗어나지 않는다.
    const range = Math.max(this.halfWidth * FIELD.SPAWN_X_RATIO - def.SWAY_AMP, 0.5);
    e.baseX = (Math.random() * 2 - 1) * range;

    e.group.rotation.z = e.baseRotationZ;
    e.group.position.set(e.baseX, FIELD.SPAWN_Y + Math.random() * FIELD.SPAWN_Y_JITTER, 0);
    e.group.visible = true;

    this.active.push(e);
    return e;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      const def = e.def;

      e.time += dt;
      e.group.position.y -= e.speed * dt;

      // 원반은 좌우로 흔들리며 내려온다.
      if (def.SWAY_AMP > 0) {
        e.group.position.x = e.baseX + Math.sin(e.time * def.SWAY_FREQ + e.swayPhase) * def.SWAY_AMP;
      }
      if (def.SPIN > 0) {
        e.group.rotation.z += def.SPIN * dt;
      }

      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) this.#setFlash(e, false);
      }

      // 방어선을 지나쳐도 남아 있는 적을 거두는 안전망.
      if (e.group.position.y < FIELD.DESPAWN_Y) this.release(e);
    }
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

  /** 화면 위의 적을 전부 거둔다. 상태 전환·재시작 때 쓴다. */
  reset() {
    for (let i = this.active.length - 1; i >= 0; i--) this.release(this.active[i]);
    this.active.length = 0;
  }

  #setFlash(enemy, on) {
    // 번쩍이는 중에 또 맞아도 원본 재질을 잃지 않도록 baseMats에서만 되돌린다.
    for (let i = 0; i < enemy.meshes.length; i++) {
      enemy.meshes[i].material = on ? this.flashMat : enemy.baseMats[i];
    }
  }
}
