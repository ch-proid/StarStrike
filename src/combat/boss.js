import { createBossStation } from '../ships/boss-station.js';
import { FlashPool } from './effects.js';
import { BOSS } from './tuning.js';
import { bossStats } from './waves.js';

// 스테이지 끝을 지키는 고리형 정거장.
// 화면 위에서 아주 천천히 내려오고, 방어선에 닿으면 플레이어를 깔아뭉갠다.
// 그래서 이 싸움은 체력 싸움이 아니라 시간 싸움이다.
//
// 피격 연출은 적기와 다르다. 적기처럼 몸통 전체를 흰 재질로 갈아 끼우면
// 초당 열 발을 맞는 동안 내내 하얀 덩어리로 보인다. 그래서 맞은 자리에
// 작은 불꽃만 튀긴다. 두꺼운 장갑에 총알이 튕기는 그림이다.

export class Boss {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.group = createBossStation();
    this.group.scale.setScalar(BOSS.SCALE);
    this.group.visible = false;
    scene.add(this.group);

    this.impact = new FlashPool(scene, {
      color: 0xffd9a8,
      size: BOSS.IMPACT_SIZE,
      life: BOSS.IMPACT_TIME,
      count: BOSS.IMPACT_POOL,
      opacity: 0.85,
      intensity: 1.8,
    });

    this.alive = false;
    this.hp = 0;
    this.maxHp = 1;
    this.descendSpeed = BOSS.DESCEND_SPEED;
    this.scrapReward = BOSS.SCRAP_DROP;
  }

  get position() {
    return this.group.position;
  }

  /** 스테이지 번호에 맞춘 능력치로 화면 위에 세운다. */
  spawn(stage) {
    const stats = bossStats(stage);

    this.alive = true;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.descendSpeed = stats.descendSpeed;
    this.scrapReward = stats.scrap;

    this.impact.reset();
    this.group.position.set(0, BOSS.SPAWN_Y, 0);
    this.group.rotation.z = 0;
    this.group.visible = true;
  }

  update(dt) {
    // 불꽃은 보스가 터진 뒤에도 마저 사그라들어야 한다.
    this.impact.update(dt);
    if (!this.alive) return;

    this.group.position.y -= this.descendSpeed * dt;
    this.group.rotation.z += BOSS.SPIN * dt;
  }

  /**
   * 피격 처리. 맞은 자리에 불꽃을 튀긴다.
   * @param {number} damage
   * @param {number} x 명중 지점
   * @param {number} y
   * @returns {boolean} 이번 타격으로 격추됐으면 true
   */
  hit(damage, x, y) {
    if (!this.alive) return false;

    this.hp -= damage;
    this.impact.spawn(x, y, 0.4);
    return this.hp <= 0;
  }

  /** 방어선을 밟았는가. 밟으면 플레이어는 즉사한다. */
  reachedLine() {
    return this.alive && this.group.position.y <= BOSS.KILL_LINE_Y;
  }

  despawn() {
    this.alive = false;
    this.hp = 0;
    this.impact.reset();
    this.group.visible = false;
  }
}
