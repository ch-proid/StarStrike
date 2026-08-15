import * as THREE from 'three';
import { Vulcan } from './vulcan.js';
import { DummyEnemies } from './enemies.js';
import { DebrisField, ScrapField } from './effects.js';
import { ENEMY, HIT, VULCAN } from './tuning.js';

// 손맛 샌드박스: 발칸 + 더미 적 + 타격 연출만 모아 놓은 검증용 무대.
// 웨이브도 사망도 없다. 쏘는 맛과 터지는 맛만 본다.
// 튜닝 수치는 전부 tuning.js에 있다.

export class Sandbox {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../ship.js').Ship} ship
   * @param {import('../camera-fx.js').CameraFX} cameraFX
   * @param {number} halfWidth 화면에 보이는 가로 반폭
   */
  constructor(scene, ship, cameraFX, halfWidth) {
    this.ship = ship;
    this.cameraFX = cameraFX;

    this.vulcan = new Vulcan(scene);
    this.enemies = new DummyEnemies(scene, halfWidth);
    this.debris = new DebrisField(scene);

    this.scrapCount = 0;
    this.scrapLabel = document.getElementById('scrap-count');
    this.scrap = new ScrapField(scene, () => this.#addScrap());

    this.hitStop = 0;
    this.killPoint = new THREE.Vector3();
  }

  setBounds(halfWidth) {
    this.enemies.setBounds(halfWidth);
  }

  /**
   * 히트스톱을 반영한 "게임 시간"을 돌려준다.
   * 카메라 흔들림처럼 멈추면 안 되는 연출은 실제 dt를 그대로 쓴다.
   */
  gameTime(dt) {
    if (this.hitStop <= 0) return dt;
    this.hitStop -= dt;
    return 0;
  }

  update(dt) {
    this.vulcan.update(dt, this.ship.muzzles);
    this.enemies.update(dt);
    this.#resolveHits(dt);

    this.debris.update(dt);
    this.scrap.update(dt, this.ship.mesh.position);
  }

  /**
   * 탄환과 적의 충돌을 검사한다. 둘 다 수가 적어 완전 탐색으로 충분하다.
   * 탄이 한 프레임에 판정 반지름보다 멀리 날아가면 적을 뚫고 지나가 버리므로,
   * 점이 아니라 "이번 프레임에 지나온 세로 선분"으로 재 준다.
   */
  #resolveHits(dt) {
    const radiusSq = ENEMY.HIT_RADIUS * ENEMY.HIT_RADIUS;
    const step = VULCAN.BULLET_SPEED * dt;

    for (const b of this.vulcan.bullets) {
      if (b.life <= 0) continue;

      const bx = b.group.position.x;
      const byTop = b.group.position.y;
      const byBottom = byTop - step;

      for (let i = this.enemies.active.length - 1; i >= 0; i--) {
        const e = this.enemies.active[i];
        const dx = e.group.position.x - bx;
        const ey = e.group.position.y;
        // 선분 위에서 적에게 가장 가까운 점까지의 세로 거리
        const dy = ey - Math.min(Math.max(ey, byBottom), byTop);
        if (dx * dx + dy * dy > radiusSq) continue;

        this.vulcan.recycle(b);

        if (this.enemies.hit(e, VULCAN.BULLET_DAMAGE)) {
          this.killPoint.copy(e.group.position);
          this.enemies.release(e);
          this.#onKill(this.killPoint);
        }
        break; // 탄 하나는 적 하나만 때린다.
      }
    }
  }

  /** 처치 연출: 히트스톱 → 화면 흔들림 → 파편 버스트 → 스크랩 드랍 */
  #onKill(point) {
    this.hitStop = HIT.STOP_TIME;
    this.cameraFX.shake(HIT.SHAKE_STRENGTH, HIT.SHAKE_TIME);
    this.debris.burst(point.x, point.y, point.z);
    this.scrap.drop(point.x, point.y, point.z);
  }

  #addScrap() {
    this.scrapCount += 1;
    if (this.scrapLabel) this.scrapLabel.textContent = String(this.scrapCount);
  }
}
