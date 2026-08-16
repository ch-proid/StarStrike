import * as THREE from 'three';
import { glowTexture } from '../ships/common.js';
import { FlashPool, RingPool } from './effects.js';
import { ART } from './weapon-art.js';
import { GUN, WEAPON, WEAPON_TECH } from './tuning.js';

// 주포. 격납고에서 고른 테크 하나가 여기서 실제 탄이 된다.
//
// 위력은 머지 보드가 정한다. setPower()가 받은 "총 공격력"에서 대미지·연사·굵기·색을
// 한꺼번에 뽑는다. 보조 화력은 따로 탄이 나가지 않는 수치 보너스지만,
// 굵어진 탄과 빨라진 리듬으로 눈에 보이게 만든다. 이 규칙은 네 테크가 똑같이 쓴다.
//
// 테크가 바꾸는 것은 "탄의 성질"뿐이다.
//   발칸    단일 명중
//   레이저  관통(같은 적은 한 번만)
//   미사일  유도 + 좁은 스플래시
//   플라즈마 넓은 광역 폭발
//
// 충돌 판정은 이 파일이 하지 않는다. 탄이 이번 프레임에 지나온 선분(px, py → 지금 위치)만
// 남겨 두고, 그 선분으로 무엇을 때렸는지는 game.js가 가른다. 그래야 빠른 탄도 적을 건너뛰지 않는다.
//
// 풀은 테크마다 한 벌이고, 한 번 만들면 그대로 둔다. 테크를 갈아 끼워도 다시 짓지 않는다.

const BY_ID = new Map(WEAPON_TECH.map((t) => [t.ID, t]));
const _worldPos = new THREE.Vector3();
const _mix = new THREE.Color();

/** 색 띠를 t(0~1)로 훑어 target에 담는다. 구간 계단이 아니라 연속 보간이다. */
function rampColor(target, ramp, t) {
  const span = ramp.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * span;
  const i = Math.min(Math.floor(f), span - 1);
  target.set(ramp[i]).lerp(_mix.set(ramp[i + 1]), f - i);
}

export class Weapon {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.cooldown = 0;
    this.muzzleIndex = 0;
    this.power = WEAPON.BASE_POWER;

    /** @type {Record<string, object>} 테크별 풀. 쓰는 순간에 한 번만 짓는다. */
    this.pools = {};

    this.setTech(WEAPON_TECH[0].ID);
  }

  // --- 테크 --------------------------------------------------------------

  /** 장착 테크를 갈아 끼운다. 판이 시작될 때 game.js가 한 번 부른다. */
  setTech(id) {
    const def = BY_ID.get(id) ?? WEAPON_TECH[0];
    if (this.tech?.ID === def.ID) return;

    this.reset(); // 예전 테크의 탄이 화면에 남지 않게 한다.
    this.tech = def;
    this.art = ART[def.ID];
    this.pool = this.pools[def.ID] ?? this.#buildPool(def);
    this.cursor = 0;

    this.setPower(this.power);
  }

  get bullets() {
    return this.pool.bullets;
  }

  /** 탄속. 자동 조준이 앞질러 겨눌 때 쓴다(유도탄은 발사 속도가 기준이다). */
  get speed() {
    return this.tech.SPEED;
  }

  /** 광역 피해 정의. 없으면 null이고, 그러면 맞은 적 하나만 아프다. */
  get splash() {
    return this.tech.SPLASH ?? null;
  }

  get pierces() {
    return this.tech.PIERCE === true;
  }

  /** 테크 한 벌을 짓는다. 탄 풀 + 총구 화염 + 명중 연출이 한 덩어리다. */
  #buildPool(def) {
    const art = ART[def.ID];
    const scene = this.scene;

    // 탄 색이 화력에 따라 바뀌므로 재질을 공유 캐시에서 꺼내지 않고 테크마다 한 벌씩 만든다.
    // 대신 같은 테크의 탄 수십 발은 이 한 벌을 함께 쓴다.
    const coreMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      toneMapped: false,
      transparent: true,
      opacity: art.GLOW_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const bullets = [];
    for (let i = 0; i < def.POOL_SIZE; i++) {
      const group = art.build(coreMat, glowMat);
      group.visible = false;
      scene.add(group);

      // 관통탄만 "이미 때린 적" 명부를 든다. 같은 적을 두 번 아프게 하지 않기 위해서다.
      bullets.push({
        group,
        life: 0,
        vx: 0,
        vy: 0,
        px: 0,
        py: 0,
        hits: def.PIERCE ? new Set() : null,
      });
    }

    const pool = {
      def,
      art,
      coreMat,
      glowMat,
      bullets,
      muzzleFlash: new FlashPool(scene, {
        color: art.MUZZLE.color,
        size: art.MUZZLE.size,
        life: GUN.MUZZLE_FLASH_TIME,
        count: GUN.MUZZLE_FLASH_POOL,
        opacity: 0.9,
        intensity: 1.7,
      }),
      // 발칸은 명중 연출을 따로 두지 않는다. 파편과 히트스톱이 이미 말해 주기 때문이다.
      impact: art.IMPACT.size > 0 ? new FlashPool(scene, art.IMPACT) : null,
      ring: art.RING
        ? new RingPool(scene, { ...art.RING, radius: def.SPLASH.RADIUS })
        : null,
    };

    this.pools[def.ID] = pool;
    return pool;
  }

  // --- 위력 --------------------------------------------------------------

  /**
   * 머지 보드가 정한 총 공격력을 받아 대미지·연사·연출을 한꺼번에 갈아 끼운다.
   * @param {number} power 총 공격력. 1이면 레벨 1 무기 하나짜리다.
   */
  setPower(power) {
    this.power = Math.max(power, 0.05);

    const rate = Math.min(Math.pow(this.power, GUN.FIRE_RATE_EXP), GUN.FIRE_RATE_MAX);
    this.interval = this.tech.FIRE_INTERVAL / rate;
    this.damage = (this.tech.DAMAGE * this.power) / rate;

    // 연출은 화력의 로그에 걸어 둔다. 레벨이 오를수록 조금씩, 끝없이 굵어진다.
    const k = Math.max(Math.min(Math.log(this.power) / Math.log(GUN.VISUAL_POWER_MAX), 1), 0);

    this.bulletScaleX = 1 + k * (GUN.BULLET_WIDTH_MAX - 1);
    this.bulletScaleY = 1 + k * (GUN.BULLET_LENGTH_MAX - 1);

    const art = this.art;
    rampColor(this.pool.coreMat.color, art.CORE_RAMP, k);
    this.pool.coreMat.color.multiplyScalar(art.CORE_INTENSITY);

    rampColor(this.pool.glowMat.color, art.GLOW_RAMP, k);
    this.pool.glowMat.color.multiplyScalar(art.GLOW_INTENSITY);
    this.pool.glowMat.opacity = art.GLOW_OPACITY + k * art.GLOW_OPACITY_GAIN;
  }

  // --- 한 프레임 ----------------------------------------------------------

  /**
   * @param {number} dt
   * @param {THREE.Object3D[]} muzzles 총구 위치를 담은 기체 자식 오브젝트들
   * @param {boolean} firing 사격 가능 여부. 사망 연출·결과 화면에서는 끈다.
   * @param {(x: number, y: number) => {x: number, y: number}|null} [findTarget]
   *   유도탄이 매 프레임 물어보는 "여기서 가장 가까운 표적". 없으면 곧게 난다.
   */
  update(dt, muzzles, firing = true, findTarget = null) {
    if (!firing) {
      // 쿨다운이 음수로 깊어지면 사격을 다시 켤 때 한꺼번에 쏟아진다. 그래서 붙잡아 둔다.
      this.cooldown = this.interval;
    } else {
      this.cooldown -= dt;

      if (this.cooldown <= 0 && muzzles.length > 0) {
        this.cooldown += this.interval;

        const muzzle = muzzles[this.muzzleIndex % muzzles.length];
        this.muzzleIndex = (this.muzzleIndex + 1) % muzzles.length;

        const p = muzzle.getWorldPosition(_worldPos);
        this.#fire(p.x, p.y, p.z);
      }
    }

    const homing = this.tech.HOMING;

    for (const b of this.pool.bullets) {
      if (b.life <= 0) continue;

      b.life -= dt;
      if (b.life <= 0) {
        b.group.visible = false;
        continue;
      }

      // 이번 프레임에 지나온 선분의 출발점. 충돌 판정이 이 값을 쓴다.
      b.px = b.group.position.x;
      b.py = b.group.position.y;

      if (homing) this.#steer(b, dt, homing, findTarget);

      b.group.position.x += b.vx * dt;
      b.group.position.y += b.vy * dt;
    }

    this.pool.muzzleFlash.update(dt);
    this.pool.impact?.update(dt);
    this.pool.ring?.update(dt);
  }

  /**
   * 유도: 가장 가까운 표적 쪽으로 방향을 조금씩 튼다.
   * 각도를 통째로 갈아 끼우지 않고 조향 속도를 제한하기 때문에 부드럽게 휜다.
   * 표적을 다시 묻는 것은 매 프레임이다. 그래야 표적이 터져도 참조가 남지 않는다.
   */
  #steer(b, dt, homing, findTarget) {
    let angle = Math.atan2(b.vy, b.vx);
    const target = findTarget?.(b.group.position.x, b.group.position.y);

    if (target) {
      const want = Math.atan2(target.y - b.group.position.y, target.x - b.group.position.x);
      const diff = Math.atan2(Math.sin(want - angle), Math.cos(want - angle)); // -π~π로 접는다
      const limit = homing.TURN * dt;
      angle += Math.max(-limit, Math.min(limit, diff));
    }

    const speed = Math.min(Math.hypot(b.vx, b.vy) + homing.ACCEL * dt, homing.MAX_SPEED);
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.group.rotation.z = angle - Math.PI / 2; // 탄 조형은 +Y가 앞이다.
  }

  #fire(x, y, z) {
    const b = this.pool.bullets[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.bullets.length;

    b.life = this.tech.LIFE;
    b.vx = 0;
    b.vy = this.tech.SPEED;
    b.px = x;
    b.py = y;
    b.hits?.clear();

    b.group.position.set(x, y, z);
    b.group.rotation.z = 0;
    b.group.scale.set(this.bulletScaleX, this.bulletScaleY, 1);
    b.group.visible = true;

    this.pool.muzzleFlash.spawn(x, y, z);
  }

  // --- 명중 --------------------------------------------------------------

  /** 명중 자리의 연출. 테크마다 섬광·폭발·링으로 갈린다. */
  impactAt(x, y, z = 0.4) {
    this.pool.impact?.spawn(x, y, z);
    this.pool.ring?.spawn(x, y, z);
  }

  /** 명중한 탄환을 즉시 회수한다. 관통탄은 회수하지 않고 계속 날아간다. */
  recycle(bullet) {
    bullet.life = 0;
    bullet.group.visible = false;
  }

  /** 날아가던 탄과 연출을 모두 지운다. 상태 전환·재시작 때 쓴다. */
  reset() {
    for (const pool of Object.values(this.pools)) {
      for (const b of pool.bullets) {
        b.life = 0;
        b.group.visible = false;
      }
      pool.muzzleFlash.reset();
      pool.impact?.reset();
      pool.ring?.reset();
    }
    this.cooldown = this.interval ?? 0;
  }
}
