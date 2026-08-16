import * as THREE from 'three';
import { boxGeo, geo, glowTexture } from '../ships/common.js';
import { FlashPool } from './effects.js';
import { VULCAN, WEAPON } from './tuning.js';

// 발칸: 항상 자동으로 나가는 기본 무장.
// 좌우 총구를 번갈아 쏘아 "따다다다" 하는 교차 리듬을 만든다.
// 탄은 밝은 심지 + 그 둘레의 가산 글로우 두 겹이라 블룸에 살짝 번진다.
//
// 위력은 머지 보드가 정한다. setPower()가 받은 "총 공격력"에서
// 대미지·연사·굵기·색을 한꺼번에 뽑는다. 보조 화력은 따로 탄이 나가지 않는
// 수치 보너스지만, 굵어진 탄과 빨라진 리듬으로 눈에 보이게 만든다.
//
// 초당 피해량은 총 공격력에 정비례한다. 그 몫을 연사와 한 발의 무게로 나눠 갖는다.
//   연사 배수 = 총 공격력 ^ FIRE_RATE_EXP (FIRE_RATE_MAX에서 멈춤)
//   한 발 대미지 = BULLET_DAMAGE × 총 공격력 ÷ 연사 배수

const CORE_RAMP = [0xdcfaff, 0xf0f2ff, 0xfff3d6]; // 심지: 흰빛 시안 → 따뜻한 흰빛
const GLOW_RAMP = [0x59dcff, 0x9d6bff, 0xffc44d]; // 둘레: 시안 → 보라 → 금색
const CORE_INTENSITY = 1.8;
const GLOW_INTENSITY = 1.3;

const BULLET_W = 0.42; // 글로우 평면 크기
const BULLET_H = 1.5;

const _worldPos = new THREE.Vector3(); // 총구 좌표 계산용 임시 벡터
const _mix = new THREE.Color();

/** 색 띠를 t(0~1)로 훑어 target에 담는다. 구간 계단이 아니라 연속 보간이다. */
function rampColor(target, ramp, t) {
  const span = ramp.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * span;
  const i = Math.min(Math.floor(f), span - 1);
  target.set(ramp[i]).lerp(_mix.set(ramp[i + 1]), f - i);
}

export class Vulcan {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.cooldown = 0;
    this.muzzleIndex = 0;

    // 탄 색이 화력에 따라 바뀌므로 재질을 공유 캐시에서 꺼내지 않고 이 무장 전용으로 만든다.
    this.coreMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      toneMapped: false,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // 탄환 풀: 심지 메시 + 글로우 평면을 묶은 그룹을 미리 만들어 둔다.
    const coreGeo = boxGeo('vulcan.core.g', 0.075, 0.62, 0.075);
    const glowGeo = geo(`plane:${BULLET_W}:${BULLET_H}`, () =>
      new THREE.PlaneGeometry(BULLET_W, BULLET_H)
    );

    this.bullets = [];
    for (let i = 0; i < VULCAN.POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(coreGeo, this.coreMat));
      group.add(new THREE.Mesh(glowGeo, this.glowMat));

      group.visible = false;
      scene.add(group);

      this.bullets.push({ group, life: 0 });
    }
    this.cursor = 0;

    // 총구 화염: 한두 프레임 동안만 보이는 작은 플래시
    this.muzzleFlash = new FlashPool(scene, {
      color: 0xcdf3ff,
      size: 0.85,
      life: VULCAN.MUZZLE_FLASH_TIME,
      count: VULCAN.MUZZLE_FLASH_POOL,
      opacity: 0.9,
      intensity: 1.7,
    });

    // 보드가 붙기 전의 기본값. 곧 setPower()로 갈아 끼워진다.
    this.setPower(WEAPON.BASE_POWER);
  }

  /**
   * 머지 보드가 정한 총 공격력을 받아 대미지·연사·연출을 한꺼번에 갈아 끼운다.
   * @param {number} power 총 공격력. 1이면 레벨 1 무기 하나짜리 발칸이다.
   */
  setPower(power) {
    this.power = Math.max(power, 0.05);

    const rate = Math.min(Math.pow(this.power, VULCAN.FIRE_RATE_EXP), VULCAN.FIRE_RATE_MAX);
    this.interval = VULCAN.FIRE_INTERVAL / rate;
    this.damage = (VULCAN.BULLET_DAMAGE * this.power) / rate;

    // 연출은 화력의 로그에 걸어 둔다. 레벨이 오를수록 조금씩, 끝없이 굵어진다.
    const t = Math.min(Math.log(this.power) / Math.log(VULCAN.VISUAL_POWER_MAX), 1);
    const k = Math.max(t, 0);

    this.bulletScaleX = 1 + k * (VULCAN.BULLET_WIDTH_MAX - 1);
    this.bulletScaleY = 1 + k * (VULCAN.BULLET_LENGTH_MAX - 1);

    rampColor(this.coreMat.color, CORE_RAMP, k);
    this.coreMat.color.multiplyScalar(CORE_INTENSITY);

    rampColor(this.glowMat.color, GLOW_RAMP, k);
    this.glowMat.color.multiplyScalar(GLOW_INTENSITY);
    this.glowMat.opacity = 0.55 + k * 0.3;
  }

  /**
   * @param {number} dt
   * @param {THREE.Object3D[]} muzzles 총구 위치를 담은 기체 자식 오브젝트들
   * @param {boolean} firing 사격 가능 여부. 사망 연출·결과 화면에서는 끈다.
   */
  update(dt, muzzles, firing = true) {
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

    // 탄환 전진
    for (const b of this.bullets) {
      if (b.life <= 0) continue;

      b.life -= dt;
      if (b.life <= 0) {
        b.group.visible = false;
        continue;
      }

      b.group.position.y += VULCAN.BULLET_SPEED * dt;
    }

    this.muzzleFlash.update(dt);
  }

  #fire(x, y, z) {
    const b = this.bullets[this.cursor];
    this.cursor = (this.cursor + 1) % this.bullets.length;

    b.life = VULCAN.BULLET_LIFE;
    b.group.position.set(x, y, z);
    b.group.scale.set(this.bulletScaleX, this.bulletScaleY, 1);
    b.group.visible = true;

    this.muzzleFlash.spawn(x, y, z);
  }

  /** 명중한 탄환을 즉시 회수한다. */
  recycle(bullet) {
    bullet.life = 0;
    bullet.group.visible = false;
  }

  /** 날아가던 탄과 총구 화염을 모두 지운다. 상태 전환·재시작 때 쓴다. */
  reset() {
    for (const b of this.bullets) this.recycle(b);
    this.cooldown = this.interval;
    this.muzzleFlash.reset();
  }
}
