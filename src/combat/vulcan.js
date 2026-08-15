import * as THREE from 'three';
import { boxGeo, glowMat, glowPlane } from '../ships/common.js';
import { FlashPool } from './effects.js';
import { VULCAN } from './tuning.js';

// 발칸: 항상 자동으로 나가는 기본 무장.
// 좌우 총구를 번갈아 쏘아 "따다다다" 하는 교차 리듬을 만든다.
// 탄은 밝은 시안 심지 + 그 둘레의 가산 글로우 두 겹이라 블룸에 살짝 번진다.

const CORE_COLOR = 0xdcfaff; // 심지: 흰빛에 가까운 시안
const GLOW_COLOR = 0x59dcff; // 둘레 글로우

const _worldPos = new THREE.Vector3(); // 총구 좌표 계산용 임시 벡터

export class Vulcan {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.cooldown = 0;
    this.muzzleIndex = 0;

    // 탄환 풀: 심지 메시 + 글로우 평면을 묶은 그룹을 미리 만들어 둔다.
    const coreGeo = boxGeo('vulcan.core.g', 0.075, 0.62, 0.075);
    const coreMat = glowMat('vulcan.core.m', { color: CORE_COLOR, intensity: 1.8 });

    this.bullets = [];
    for (let i = 0; i < VULCAN.POOL_SIZE; i++) {
      const group = new THREE.Group();

      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      const glow = glowPlane(GLOW_COLOR, 0.42, 1.5, 0.55, 1.3);
      group.add(glow);

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
  }

  /**
   * @param {number} dt
   * @param {THREE.Object3D[]} muzzles 총구 위치를 담은 기체 자식 오브젝트들
   * @param {boolean} firing 사격 가능 여부. 사망 연출·결과 화면에서는 끈다.
   */
  update(dt, muzzles, firing = true) {
    if (!firing) {
      // 쿨다운이 음수로 깊어지면 사격을 다시 켤 때 한꺼번에 쏟아진다. 그래서 붙잡아 둔다.
      this.cooldown = VULCAN.FIRE_INTERVAL;
    } else {
      this.cooldown -= dt;

      if (this.cooldown <= 0 && muzzles.length > 0) {
        this.cooldown += VULCAN.FIRE_INTERVAL;

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
    this.cooldown = VULCAN.FIRE_INTERVAL;
    this.muzzleFlash.reset();
  }
}
