import * as THREE from 'three';
import { Vulcan } from './vulcan.js';
import { EnemyField } from './enemies.js';
import { Boss } from './boss.js';
import { DebrisField, ScrapField } from './effects.js';
import { HUD } from './ui.js';
import { buildWave, stageScales } from './waves.js';
import { BOSS, FIELD, HIT, PLAYER, STAGE, STORAGE_KEYS, VULCAN, WAVE } from './tuning.js';

// 코어 루프.
//
// 스테이지 하나 = 웨이브 10개 + 보스. 보스를 잡으면 클리어 화면을 거쳐 다음 스테이지로 가고,
// 체력이 다하면 스크랩을 정산한 뒤 스테이지 1부터 다시 시작한다.
//
// 압박의 축은 방어선이다. 적을 못 잡으면 화면 아래를 통과하며 체력을 깎고,
// 보스는 방어선에 닿는 순간 기체를 깔아뭉갠다. 그래서 보스전은 체력전이 아니라 시간전이다.
//
// 진행 규칙 수치는 tuning.js, 웨이브 구성 계산은 waves.js, 화면 표시는 ui.js가 맡는다.
// 이 파일은 그 셋을 이어 붙이는 상태 기계다.

/** 진행 상태. 각 상태가 무엇을 갱신하는지는 update()의 분기를 보면 된다. */
export const STATE = {
  WAVE: 'WAVE', // 웨이브 진행 중(스폰 + 전투)
  WAVE_REST: 'WAVE_REST', // 웨이브를 비우고 잠깐 쉼
  BOSS_WARNING: 'BOSS_WARNING', // 보스 등장 경고
  BOSS: 'BOSS', // 보스전(타임어택)
  BOSS_DEATH: 'BOSS_DEATH', // 보스 다단 폭발 연출
  STAGE_CLEAR: 'STAGE_CLEAR', // 클리어 화면(입력 대기)
  PLAYER_DEATH: 'PLAYER_DEATH', // 기체 폭발 연출
  GAME_OVER: 'GAME_OVER', // 결과 화면(입력 대기)
};

/** 전투가 돌아가는 상태들. 여기서만 적이 움직이고 발칸이 나간다. */
const COMBAT_STATES = new Set([STATE.WAVE, STATE.WAVE_REST, STATE.BOSS_WARNING, STATE.BOSS]);

/** localStorage가 막힌 환경(사생활 보호 모드 등)에서도 게임은 굴러가야 한다. */
function loadNumber(key) {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* 저장할 수 없어도 진행은 막지 않는다. */
  }
}

export class Game {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../ship.js').Ship} ship
   * @param {import('../camera-fx.js').CameraFX} cameraFX
   * @param {number} halfWidth 화면에 보이는 가로 반폭
   * @param {{bossDecor?: THREE.Object3D}} [opts] bossDecor: 배경 장식용 정거장.
   *   보스전 동안에는 숨겨서 같은 기체가 둘로 보이지 않게 한다.
   */
  constructor(scene, ship, cameraFX, halfWidth, { bossDecor = null } = {}) {
    this.ship = ship;
    this.cameraFX = cameraFX;
    this.bossDecor = bossDecor;

    this.vulcan = new Vulcan(scene);
    this.enemies = new EnemyField(scene, halfWidth);
    this.boss = new Boss(scene);
    this.debris = new DebrisField(scene);
    this.scrap = new ScrapField(scene, () => this.#collectScrap());

    this.hud = new HUD({
      onNextStage: () => this.#nextStage(),
      onRetry: () => this.startRun(),
    });

    // 진행 상태
    this.state = STATE.WAVE;
    this.stateTime = 0;
    this.hitStop = 0;

    this.stage = 1;
    this.wave = 1;
    this.waveQueue = [];
    this.spawnInterval = WAVE.SPAWN_INTERVAL;
    this.spawnTimer = 0;
    this.scrapScale = 1;

    this.playerHp = PLAYER.MAX_HP;
    this.runScrap = 0; // 이번 판에 모은 스크랩
    this.stageScrap = 0; // 이번 스테이지에 모은 스크랩(아직 정산 전)
    this.totalScrap = loadNumber(STORAGE_KEYS.TOTAL_SCRAP);
    this.bestStage = loadNumber(STORAGE_KEYS.BEST_STAGE);
    this.bestWave = loadNumber(STORAGE_KEYS.BEST_WAVE);

    this.diedDuringBoss = false; // 결과 화면에 "BOSS"로 적을지 웨이브 번호로 적을지

    // 보스 폭발 연출용
    this.bossDeathPoint = new THREE.Vector3();
    this.burstTimer = 0;
    this.burstsLeft = 0;

    this._point = new THREE.Vector3(); // 처치 위치 계산용 임시 벡터

    this.startRun();
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

  /**
   * @param {number} dt 히트스톱이 반영된 게임 시간
   * @param {number} realDt 실제 시간. 배너 타이머처럼 멈추면 안 되는 것에 쓴다.
   */
  update(dt, realDt) {
    this.hud.update(realDt);

    this.stateTime += dt;

    const combat = COMBAT_STATES.has(this.state);
    this.vulcan.update(dt, this.ship.muzzles, combat);

    if (combat) {
      this.enemies.update(dt);
      this.#resolveBullets(dt);
      this.#resolveBreach();
      this.#resolveCollisions();
    }

    // 보스는 늘 돌린다. 터진 뒤에도 피격 불꽃이 마저 사그라들어야 하기 때문이다.
    this.boss.update(dt);
    if (this.state === STATE.BOSS) this.#watchBoss();

    switch (this.state) {
      case STATE.WAVE:
        this.#updateWave(dt);
        break;

      case STATE.WAVE_REST:
        if (this.stateTime >= WAVE.REST_TIME) this.#startNextWave();
        break;

      case STATE.BOSS_WARNING:
        if (this.stateTime >= BOSS.WARNING_TIME) this.#startBoss();
        break;

      case STATE.BOSS_DEATH:
        this.#updateBossDeath(dt);
        break;

      case STATE.PLAYER_DEATH:
        if (this.stateTime >= PLAYER.DEATH_TIME) this.#gameOver();
        break;
    }

    this.debris.update(dt);

    // 스크랩 줍기는 정산 전까지만 돌린다. 결과 화면이 뜬 뒤에 주우면
    // 화면의 숫자는 오르는데 누적에는 들어가지 않아 앞뒤가 어긋난다.
    const collecting = (combat || this.state === STATE.BOSS_DEATH) && !this.ship.destroyed;
    if (collecting) this.scrap.update(dt, this.ship.mesh.position);
  }

  // --- 판 진행 -------------------------------------------------------------

  /** 새 판을 시작한다. 첫 실행과 [다시 도전] 버튼이 함께 쓴다. */
  startRun() {
    this.stage = 1;
    this.runScrap = 0;
    this.playerHp = PLAYER.MAX_HP;

    this.ship.reset();
    this.#clearField();

    this.hud.hideScreens();
    this.hud.setScrap(0);
    this.hud.setHp(this.playerHp, PLAYER.MAX_HP);

    this.#startStage();
  }

  #startStage() {
    this.stageScrap = 0;
    this.wave = 0;

    const scales = stageScales(this.stage);
    this.enemies.setScaling(scales.hp, scales.speed);
    this.scrapScale = scales.scrap;

    this.hud.setStage(this.stage);
    this.#showBossDecor(true);
    this.#startNextWave();
  }

  #startNextWave() {
    this.wave += 1;

    const plan = buildWave(this.stage, this.wave);
    this.waveQueue = plan.queue;
    this.spawnInterval = plan.spawnInterval;
    this.spawnTimer = 0;

    this.hud.setWave(this.wave, STAGE.WAVES_PER_STAGE);
    this.hud.banner(`WAVE ${this.wave}`, `STAGE ${this.stage}`, WAVE.INTRO_TIME);

    this.#setState(STATE.WAVE);
  }

  #updateWave(dt) {
    // 목록에 남은 적을 간격을 두고 한 기씩 내보낸다.
    if (this.waveQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.active.length < WAVE.ALIVE_MAX) {
        this.spawnTimer = this.spawnInterval;
        this.enemies.spawn(this.waveQueue.pop());
      }
      return;
    }

    // 다 내보냈고 화면도 비었으면 웨이브 종료.
    if (this.enemies.active.length > 0) return;

    if (this.wave >= STAGE.WAVES_PER_STAGE) {
      this.#startBossWarning();
    } else {
      this.#setState(STATE.WAVE_REST);
    }
  }

  // --- 보스전 -------------------------------------------------------------

  #startBossWarning() {
    this.hud.setWaveBoss();
    this.hud.banner('WARNING', '거대 정거장 접근', BOSS.WARNING_TIME, true);
    this.#showBossDecor(false);
    this.cameraFX.shake(0.18, BOSS.WARNING_TIME);
    this.#setState(STATE.BOSS_WARNING);
  }

  #startBoss() {
    this.boss.spawn(this.stage);
    this.hud.showBossHp(true);
    this.hud.setBossHp(this.boss.hp, this.boss.maxHp);
    this.#setState(STATE.BOSS);
  }

  /** 보스전 동안 방어선과 체력 바를 지켜본다. */
  #watchBoss() {
    // 방어선을 밟히면 기체가 깔린다. 이것이 타임어택의 압박이다.
    if (this.boss.reachedLine()) {
      this.#killPlayer();
      return;
    }

    this.hud.setBossHp(this.boss.hp, this.boss.maxHp);
  }

  #onBossDefeated() {
    this.bossDeathPoint.copy(this.boss.position);

    this.hitStop = BOSS.DEATH_STOP_TIME;
    this.cameraFX.shake(BOSS.DEATH_SHAKE_STRENGTH, BOSS.DEATH_SHAKE_TIME);

    // 스크랩을 보스 덩치만큼 넓게 흩뿌린다.
    this.scrap.drop(
      this.bossDeathPoint.x,
      this.bossDeathPoint.y,
      this.bossDeathPoint.z,
      Math.round(this.boss.scrapReward * this.scrapScale),
      BOSS.DEATH_BURST_RADIUS
    );

    this.boss.despawn();
    this.hud.showBossHp(false);

    this.burstsLeft = BOSS.DEATH_BURSTS;
    this.burstTimer = 0;
    this.#setState(STATE.BOSS_DEATH);
  }

  /** 다단 폭발: 보스가 있던 자리 여기저기서 연달아 터진다. */
  #updateBossDeath(dt) {
    this.burstTimer -= dt;

    if (this.burstsLeft > 0 && this.burstTimer <= 0) {
      this.burstsLeft -= 1;
      this.burstTimer = (BOSS.DEATH_TIME * 0.75) / BOSS.DEATH_BURSTS;

      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * BOSS.DEATH_BURST_RADIUS;
      this.debris.burst(
        this.bossDeathPoint.x + Math.cos(angle) * radius,
        this.bossDeathPoint.y + Math.sin(angle) * radius,
        0,
        1.5
      );
      this.cameraFX.shake(0.5, 0.2);
    }

    if (this.stateTime >= BOSS.DEATH_TIME) this.#stageClear();
  }

  // --- 결과 화면 ----------------------------------------------------------

  #stageClear() {
    const earned = this.stageScrap;
    this.#bankScrap();
    this.#recordBest(this.stage, STAGE.WAVES_PER_STAGE);

    this.hud.showStageClear({
      stage: this.stage,
      scrap: earned,
      total: this.totalScrap,
    });

    this.#setState(STATE.STAGE_CLEAR);
  }

  /** [다음 스테이지] 버튼. 화면을 깨끗이 비우고 한 단계 위에서 다시 시작한다. */
  #nextStage() {
    if (this.state !== STATE.STAGE_CLEAR) return;

    this.stage += 1;

    // 스테이지를 넘길 때마다 체력을 조금 돌려준다. 온전히 회복되지는 않는다.
    this.playerHp = Math.min(this.playerHp + PLAYER.STAGE_CLEAR_HEAL, PLAYER.MAX_HP);
    this.hud.setHp(this.playerHp, PLAYER.MAX_HP);

    this.#clearField();
    this.hud.hideScreens();
    this.#startStage();
  }

  /** 기체 격추. 폭발 연출을 깔고 결과 화면으로 넘어갈 준비를 한다. */
  #killPlayer() {
    if (this.ship.destroyed) return;

    const p = this.ship.mesh.position;
    this.diedDuringBoss = this.state === STATE.BOSS || this.state === STATE.BOSS_WARNING;

    this.ship.destroy();
    this.scrap.reset(); // 사라진 기체로 빨려 들어갈 곳이 없다.

    this.hitStop = HIT.STOP_TIME;
    this.cameraFX.shake(PLAYER.DEATH_SHAKE_STRENGTH, PLAYER.DEATH_SHAKE_TIME);

    for (let i = 0; i < PLAYER.DEATH_DEBRIS_BURSTS; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 0.8;
      this.debris.burst(p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius, 0, 1.6);
    }

    this.playerHp = 0;
    this.hud.setHp(0, PLAYER.MAX_HP);
    this.hud.hideBanner();
    this.hud.showBossHp(false);

    this.#setState(STATE.PLAYER_DEATH);
  }

  #gameOver() {
    const isBoss = this.diedDuringBoss;

    this.#bankScrap();
    this.#recordBest(this.stage, this.wave);

    this.hud.showGameOver({
      stage: this.stage,
      wave: this.wave,
      isBoss,
      scrap: this.runScrap,
      total: this.totalScrap,
      bestStage: this.bestStage,
      bestWave: this.bestWave,
    });

    this.#setState(STATE.GAME_OVER);
  }

  // --- 피해 판정 ----------------------------------------------------------

  /**
   * 탄환과 적/보스의 충돌.
   * 탄이 한 프레임에 판정 반지름보다 멀리 날아가면 뚫고 지나가 버리므로,
   * 점이 아니라 "이번 프레임에 지나온 세로 선분"으로 재 준다.
   */
  #resolveBullets(dt) {
    const step = VULCAN.BULLET_SPEED * dt;

    for (const b of this.vulcan.bullets) {
      if (b.life <= 0) continue;

      const bx = b.group.position.x;
      const byTop = b.group.position.y;
      const byBottom = byTop - step;

      // 보스가 떠 있으면 먼저 본다. 화면 위쪽을 통째로 막고 있기 때문이다.
      if (this.boss.alive && this.#segmentHits(this.boss.position, BOSS.HIT_RADIUS, bx, byBottom, byTop)) {
        this.vulcan.recycle(b);
        this.cameraFX.shake(BOSS.HIT_SHAKE_STRENGTH, BOSS.HIT_SHAKE_TIME);

        if (this.boss.hit(VULCAN.BULLET_DAMAGE, bx, byTop)) {
          this.#onBossDefeated();
          return; // 보스가 터졌으면 이번 프레임 판정은 여기서 끝낸다.
        }
        continue;
      }

      for (let i = this.enemies.active.length - 1; i >= 0; i--) {
        const e = this.enemies.active[i];
        if (!this.#segmentHits(e.group.position, e.def.HIT_RADIUS, bx, byBottom, byTop)) continue;

        this.vulcan.recycle(b);

        if (this.enemies.hit(e, VULCAN.BULLET_DAMAGE)) {
          this._point.copy(e.group.position);
          const def = e.def;
          this.enemies.release(e);
          this.#onEnemyKilled(this._point, def);
        }
        break; // 탄 하나는 적 하나만 때린다.
      }
    }
  }

  /** 세로 선분(byBottom~byTop, x=bx)이 반지름 r짜리 원과 닿는가. */
  #segmentHits(center, radius, bx, byBottom, byTop) {
    const dx = center.x - bx;
    const dy = center.y - Math.min(Math.max(center.y, byBottom), byTop);
    return dx * dx + dy * dy <= radius * radius;
  }

  /** 방어선 통과: 놓친 적이 아래로 빠져나가며 체력을 깎는다. */
  #resolveBreach() {
    let damage = 0;

    for (let i = this.enemies.active.length - 1; i >= 0; i--) {
      const e = this.enemies.active[i];
      if (e.group.position.y > FIELD.DEFENSE_LINE_Y) continue;

      damage += e.def.BREACH_DAMAGE;
      this.debris.burst(e.group.position.x, e.group.position.y, 0, 0.6);
      this.enemies.release(e);
    }

    // 같은 프레임에 여러 기가 통과하면 한 번에 몰아 맞는다.
    // 무적 시간으로 막지 않는다. 못 잡으면 아프다는 것이 이 게임의 압박이다.
    if (damage > 0) this.#hurtPlayer(damage, false);
  }

  /** 기체 충돌: 부딪힌 적은 부서지고, 플레이어는 짧은 무적을 얻는다. */
  #resolveCollisions() {
    if (this.ship.destroyed || this.ship.invuln > 0) return;

    const ship = this.ship.mesh.position;

    for (let i = this.enemies.active.length - 1; i >= 0; i--) {
      const e = this.enemies.active[i];
      const reach = PLAYER.HIT_RADIUS + e.def.HIT_RADIUS;

      const dx = e.group.position.x - ship.x;
      const dy = e.group.position.y - ship.y;
      if (dx * dx + dy * dy > reach * reach) continue;

      this.debris.burst(e.group.position.x, e.group.position.y, 0, 0.8);
      const damage = e.def.CRASH_DAMAGE;
      this.enemies.release(e);
      this.#hurtPlayer(damage, true);
      return; // 한 프레임에 한 번만 부딪힌다.
    }
  }

  /**
   * @param {number} amount 깎을 체력
   * @param {boolean} grantInvuln 무적 시간을 줄지. 충돌은 주고, 방어선 통과는 주지 않는다.
   */
  #hurtPlayer(amount, grantInvuln) {
    if (this.ship.destroyed) return;

    this.playerHp -= amount;
    this.hud.setHp(Math.max(this.playerHp, 0), PLAYER.MAX_HP);

    if (this.playerHp <= 0) {
      this.#killPlayer();
      return;
    }

    this.ship.playHurt(grantInvuln);
    this.hitStop = Math.max(this.hitStop, PLAYER.HURT_STOP_TIME);
    this.cameraFX.shake(PLAYER.HURT_SHAKE_STRENGTH, PLAYER.HURT_SHAKE_TIME);
  }

  /** 처치 연출: 히트스톱 → 화면 흔들림 → 파편 버스트 → 스크랩 드랍 */
  #onEnemyKilled(point, def) {
    this.hitStop = Math.max(this.hitStop, HIT.STOP_TIME);
    this.cameraFX.shake(HIT.SHAKE_STRENGTH, HIT.SHAKE_TIME);

    // 덩치가 클수록 크게 터진다.
    const scale = def.HIT_RADIUS / 0.62;
    this.debris.burst(point.x, point.y, point.z, scale);

    const span = def.SCRAP_MAX - def.SCRAP_MIN + 1;
    const count = def.SCRAP_MIN + Math.floor(Math.random() * span);
    this.scrap.drop(point.x, point.y, point.z, Math.round(count * this.scrapScale));
  }

  // --- 재화와 기록 --------------------------------------------------------

  #collectScrap() {
    this.runScrap += 1;
    this.stageScrap += 1;
    this.hud.setScrap(this.runScrap);
  }

  /** 이번 스테이지에서 모은 몫을 누적 스크랩에 넣고 저장한다. 두 번 세지 않는다. */
  #bankScrap() {
    if (this.stageScrap <= 0) return;

    this.totalScrap += this.stageScrap;
    this.stageScrap = 0;
    saveNumber(STORAGE_KEYS.TOTAL_SCRAP, this.totalScrap);
  }

  #recordBest(stage, wave) {
    if (stage < this.bestStage || (stage === this.bestStage && wave <= this.bestWave)) return;

    this.bestStage = stage;
    this.bestWave = wave;
    saveNumber(STORAGE_KEYS.BEST_STAGE, stage);
    saveNumber(STORAGE_KEYS.BEST_WAVE, wave);
  }

  // --- 정리 ---------------------------------------------------------------

  #setState(state) {
    this.state = state;
    this.stateTime = 0;
  }

  /** 화면에 남은 탄·적·파편·스크랩·보스를 전부 거둔다. 상태 전환마다 잔상이 남지 않게. */
  #clearField() {
    this.vulcan.reset();
    this.enemies.reset();
    this.debris.reset();
    this.scrap.reset();
    this.boss.despawn();

    this.hitStop = 0;
    this.waveQueue.length = 0;

    this.hud.hideBanner();
    this.hud.showBossHp(false);
  }

  #showBossDecor(visible) {
    if (this.bossDecor) this.bossDecor.visible = visible;
  }
}
