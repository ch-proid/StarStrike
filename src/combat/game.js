import * as THREE from 'three';
import { Weapon } from './weapon.js';
import { EnemyField } from './enemies.js';
import { Boss } from './boss.js';
import { DefenseLine } from './defense-line.js';
import { DebrisField, FlashPool, ScrapField, ShieldBurst } from './effects.js';
import { MergeBoard } from './board.js';
import { HUD } from './ui.js';
import { Hangar } from './hangar.js';
import { PerkState } from './perks.js';
import { TechState } from './tech.js';
import { buildWave, stageScales } from './waves.js';
import {
  AIM,
  BOSS,
  FIELD,
  HIT,
  PLAYER,
  SHIELD,
  STAGE,
  STORAGE_KEYS,
  WAVE,
} from './tuning.js';

// 코어 루프.
//
// 스테이지 하나 = 웨이브 10개 + 보스. 보스를 잡으면 클리어 화면을 거쳐 다음 스테이지로 가고,
// 체력이 다하면 스크랩을 정산한 뒤 스테이지 1부터 다시 시작한다.
//
// 압박의 축은 방어선이다. 적을 못 잡으면 화면 아래를 통과하며 체력을 깎고,
// 보스는 방어선에 닿는 순간 기체를 깔아뭉갠다. 그래서 보스전은 체력전이 아니라 시간전이다.
//
// 조준도 이 파일이 맡는다. 플레이어는 전장을 만지지 않는다.
// 표적을 고르고(방어선에 가장 가까운 적이 먼저다) 기체를 그 밑으로 보내는 일까지가 여기다.
// 손은 머지 보드에만 둔다.
//
// 죽으면 격납고가 열린다(hangar.js). 누적 스크랩으로 산 퍽은 판을 시작할 때 한 번 읽어
// 화력 배수·최대 체력·보호막·시작 무기·정예 보급 확률로 나뉘어 들어간다.
//
// 화력의 축은 머지 보드다(board.js). 보드가 정한 총 공격력을 주포가 그대로 받아 쏜다.
// 그 주포가 무엇인가는 격납고에서 고른 무기 테크가 정한다(tech.js, weapon.js).
// 레벨 체계는 그대로 두고 탄의 성질만 바뀌므로, 보드와 화력 공식은 테크를 모른다.
// 스크랩은 두 갈래로 센다. 지갑(wallet)은 무기를 사고 남은 돈이고,
// 이번 판에 번 총량(runScrap)은 결과 화면과 누적 저장에 쓴다. 쓴 돈을 다시 빼지 않는다.
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

/**
 * 선분 (x0,y0)→(x1,y1)이 반지름 radius짜리 원과 닿는가.
 * 원의 중심을 선분에 내린 발이 가장 가까운 점이다. 선분 밖으로 나가면 끝점으로 접는다.
 * 빠른 탄이 한 프레임에 적을 건너뛰는 일을 이 판정이 막는다.
 */
function segmentHitsCircle(center, radius, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = dx * dx + dy * dy;

  let t = 0;
  if (len > 0) {
    t = ((center.x - x0) * dx + (center.y - y0) * dy) / len;
    t = Math.min(Math.max(t, 0), 1);
  }

  const px = center.x - (x0 + dx * t);
  const py = center.y - (y0 + dy * t);
  return px * px + py * py <= radius * radius;
}

export class Game {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../ship.js').Ship} ship
   * @param {import('../camera-fx.js').CameraFX} cameraFX
   * @param {number} halfWidth 화면에 보이는 가로 반폭
   * @param {{project?: (x: number, y: number) => {x: number, y: number}}} [opts]
   *   project: 전장 좌표를 폰 프레임 안의 px로 옮기는 함수. 뜨는 피해 숫자에 쓴다.
   */
  constructor(scene, ship, cameraFX, halfWidth, { project = null } = {}) {
    this.ship = ship;
    this.cameraFX = cameraFX;
    this.project = project;

    // 격납고에서 산 영구 성장. 판을 시작할 때 한 번 읽어 각 계통에 나눠 준다.
    this.perks = new PerkState();
    this.powerMul = this.perks.effects.powerMul;

    // 무기 테크(발칸 → 레이저 → 미사일 → 플라즈마). 이것도 판을 시작할 때 한 번 읽는다.
    this.tech = new TechState();

    this.weapon = new Weapon(scene);
    this.enemies = new EnemyField(scene, halfWidth);
    this.boss = new Boss(scene);
    this.defenseLine = new DefenseLine(scene, halfWidth);
    this.debris = new DebrisField(scene);
    this.scrap = new ScrapField(scene, () => this.#collectScrap());
    this.shieldBurst = new ShieldBurst(scene);

    // 합성 순간 기체 둘레에서 터지는 빛무리
    this.powerBurst = new FlashPool(scene, {
      color: 0xbdf1ff,
      size: PLAYER.POWER_BURST_SIZE,
      life: PLAYER.POWER_BURST_TIME,
      count: 4,
      opacity: 0.8,
      intensity: 1.9,
    });

    this.hud = new HUD({
      onNextStage: () => this.#nextStage(),
      onHangar: () => this.#openHangar(),
    });

    // 격납고. 누적 스크랩은 이 게임이 들고 있고, 격납고는 물어보고 시킬 뿐이다.
    this.hangar = new Hangar(this.perks, this.tech, {
      getTotal: () => this.totalScrap,
      spend: (cost) => this.#spendTotal(cost),
      onLaunch: () => this.#launch(),
    });

    // 진행 상태
    this.state = STATE.WAVE;
    this.stateTime = 0;
    this.hitStop = 0;

    // 관리자 패널이 만지는 두 손잡이. 평상시에는 이 값 그대로라 일반 플레이에 닿지 않는다.
    this.timeScale = 1; // 게임 시간 배수(페이싱 검증용)
    this.godMode = false; // 켜지면 피해와 즉사를 모두 흘려보낸다.

    this.stage = 1;
    this.wave = 1;
    this.waveQueue = [];
    this.spawnInterval = WAVE.SPAWN_INTERVAL;
    this.spawnTimer = 0;
    this.scrapScale = 1;

    this.maxHp = PLAYER.MAX_HP; // 장갑 퍽이 올려 준다. 판을 시작할 때 다시 잡힌다.
    this.playerHp = this.maxHp;

    this.shields = 0; // 남은 1회용 보호막(보호막 퍽)
    this.maxShields = 0;
    this.shieldGrace = 0; // 방금 깨진 보호막이 아직 막아 주는 시간(초)

    this.wallet = 0; // 지금 쓸 수 있는 스크랩(무기를 사면 줄어든다)
    this.runScrap = 0; // 이번 판에 번 스크랩 총량(쓴 돈을 빼지 않는다)
    this.stageScrap = 0; // 이번 스테이지에 번 스크랩(아직 정산 전)
    this.totalScrap = loadNumber(STORAGE_KEYS.TOTAL_SCRAP);
    this.bestStage = loadNumber(STORAGE_KEYS.BEST_STAGE);
    this.bestWave = loadNumber(STORAGE_KEYS.BEST_WAVE);

    this.diedDuringBoss = false; // 결과 화면에 "BOSS"로 적을지 웨이브 번호로 적을지

    /** @type {object|null} 지금 겨누고 있는 적. 자주 바뀌면 기체가 갈팡질팡한다. */
    this.aimTarget = null;

    // 보스 폭발 연출용
    this.bossDeathPoint = new THREE.Vector3();
    this.burstTimer = 0;
    this.burstsLeft = 0;

    this._point = new THREE.Vector3(); // 처치 위치 계산용 임시 벡터

    // 이번 프레임에 죽은 적. 탄 판정이 도는 동안에는 목록을 건드리지 않고 여기에 모아 둔다.
    // 관통·광역은 한 프레임에 여러 기를 함께 때리므로, 중간에 목록이 줄면 판정이 어긋난다.
    this._killed = [];

    // 유도탄이 매 프레임 물어보는 표적. 함수를 미리 만들어 두어 프레임마다 새로 짓지 않는다.
    this._findTarget = (x, y) => this.#nearestTarget(x, y);

    // 머지 보드. 재화는 이 게임이 들고 있고, 보드는 물어보고 시킬 뿐이다.
    this.board = new MergeBoard({
      getWallet: () => this.wallet,
      spend: (cost) => this.#spendScrap(cost),
      refund: (amount) => this.#refundScrap(amount),
      // 보드가 정한 총 공격력에 공격력 퍽 배수를 곱해 주포에 넘긴다.
      onPowerChange: (power) => this.weapon.setPower(power * this.powerMul),
      onMerge: () => this.#onWeaponMerged(),
      getEliteChance: () => this.perks.effects.eliteChance,
    });

    this.startRun();
  }

  setBounds(halfWidth) {
    this.enemies.setBounds(halfWidth);
    this.defenseLine.setBounds(halfWidth);
  }

  /**
   * 히트스톱을 반영한 "게임 시간"을 돌려준다.
   * 카메라 흔들림처럼 멈추면 안 되는 연출은 실제 dt를 그대로 쓴다.
   */
  gameTime(dt) {
    if (this.hitStop <= 0) return dt * this.timeScale;
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
    this.weapon.update(dt, this.ship.muzzles, combat, this._findTarget);

    if (combat) {
      if (this.shieldGrace > 0) this.shieldGrace -= dt;

      this.enemies.update(dt);
      this.#updateAim();
      this.#resolveBullets();
      this.#resolveBreach();
      this.#resolveCollisions();
    }

    this.defenseLine.update(dt);

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
    this.powerBurst.update(dt);
    this.shieldBurst.update(dt);

    // 스크랩 줍기는 정산 전까지만 돌린다. 결과 화면이 뜬 뒤에 주우면
    // 화면의 숫자는 오르는데 누적에는 들어가지 않아 앞뒤가 어긋난다.
    const collecting = (combat || this.state === STATE.BOSS_DEATH) && !this.ship.destroyed;
    if (collecting) this.scrap.update(dt, this.ship.mesh.position);
  }

  // --- 자동 조준 -----------------------------------------------------------

  /**
   * 표적을 고르고 기체를 그 밑으로 보낸다.
   *
   * 고르는 기준은 하나다. 방어선에 가장 가까운 적, 곧 가장 아래에 있는 적이다.
   * 놓치면 곧바로 아프기 때문이다. 그 높이가 비슷한 적이 여럿이면 가까운 쪽을 잡는다.
   * 표적이 매 프레임 바뀌면 기체가 제자리에서 떨리므로, 지금 표적보다
   * AIM.SWITCH_MARGIN만큼 더 급한 적이 나타났을 때만 갈아탄다.
   */
  #updateAim() {
    if (this.ship.destroyed) return;

    // 보스가 떠 있으면 화면 위를 통째로 막고 있다. 다른 표적을 볼 이유가 없다.
    if (this.boss.alive) {
      this.aimTarget = null;
      this.ship.setAim(this.boss.position.x);
      return;
    }

    const shipX = this.ship.mesh.position.x;
    const current = this.aimTarget?.active ? this.aimTarget : null;

    // 1) 가장 아래에 있는 적의 높이를 찾는다.
    let lowestY = Infinity;
    for (const e of this.enemies.active) {
      if (e.group.position.y < lowestY) lowestY = e.group.position.y;
    }

    // 2) 그 높이 언저리(SAME_ROW) 안에서 기체와 가장 가까운 적을 잡는다.
    const SAME_ROW = 1.2;
    let best = null;
    let bestDx = Infinity;

    for (const e of this.enemies.active) {
      if (e.group.position.y > lowestY + SAME_ROW) continue;

      const dx = Math.abs(e.group.position.x - shipX);
      if (dx < bestDx) {
        bestDx = dx;
        best = e;
      }
    }

    if (!best) {
      // 표적이 없으면 가운데로 돌아가 다음 웨이브를 기다린다.
      this.aimTarget = null;
      this.ship.setAim(0);
      return;
    }

    if (current && current !== best && current.group.position.y <= best.group.position.y + AIM.SWITCH_MARGIN) {
      best = current; // 지금 표적이 아직 충분히 급하다. 그대로 간다.
    }

    this.aimTarget = best;

    // 흔들리며 내려오는 적은 앞질러 겨눈다. 탄이 닿을 때쯤의 자리를 본다.
    const muzzleY = this.ship.mesh.position.y + 1.95;
    const travel = Math.max(best.group.position.y - muzzleY, 0);
    const lead = Math.min(travel / this.weapon.speed, AIM.LEAD_TIME_MAX);

    this.ship.setAim(best.group.position.x + best.vx * lead);
  }

  /**
   * 유도탄이 부르는 "여기서 가장 가까운 표적".
   * 표적을 붙잡아 두지 않고 매 프레임 다시 묻는다. 그래야 표적이 터져도 참조가 남지 않는다.
   * @returns {{x: number, y: number}|null}
   */
  #nearestTarget(x, y) {
    if (this.boss.alive) return this.boss.position;

    let best = null;
    let bestDist = Infinity;

    for (const e of this.enemies.active) {
      if (e.hp <= 0) continue;

      const dx = e.group.position.x - x;
      const dy = e.group.position.y - y;
      const dist = dx * dx + dy * dy;

      if (dist < bestDist) {
        bestDist = dist;
        best = e.group.position;
      }
    }

    return best;
  }

  // --- 판 진행 -------------------------------------------------------------

  /**
   * 새 판을 시작한다. 첫 실행과 격납고의 [출격]이 함께 쓴다.
   *
   * 퍽과 무기 테크는 여기서 딱 한 번 읽는다. 판이 도는 동안에는 바뀌지 않는다.
   * 격납고는 죽어야 열리기 때문이다.
   */
  startRun() {
    const perks = this.perks.effects;

    // 테크는 전역 설정이다. 주포와 보드 실루엣이 함께 갈아 끼워진다.
    const techId = this.tech.current.ID;
    this.weapon.setTech(techId);
    this.board.setTech(techId);

    this.powerMul = perks.powerMul;
    this.maxHp = perks.maxHp;
    this.shields = perks.shields;
    this.maxShields = perks.shields;
    this.shieldGrace = 0;

    this.stage = 1;
    this.runScrap = 0;
    this.wallet = 0;
    this.playerHp = this.maxHp;

    this.ship.reset();
    this.#clearField();

    // 죽으면 보드도 함께 사라진다(로그라이트). 대신 시작 무기를 하나 다시 준다.
    this.board.reset(perks.startLevel);

    this.hud.hideScreens();
    this.hud.setScrap(this.wallet);
    this.hud.setHp(this.playerHp, this.maxHp);
    this.hud.setShields(this.shields, this.maxShields);

    this.#startStage();
  }

  // --- 격납고 --------------------------------------------------------------

  /** 사망 결과 화면의 [격납고]. 결과를 걷고 상점을 연다. */
  #openHangar() {
    if (this.state !== STATE.GAME_OVER) return;

    this.hud.hideScreens();
    this.hangar.open();
  }

  /** 격납고의 [출격]. 스테이지 1부터 새 판이다. */
  #launch() {
    this.hangar.close();
    this.startRun();
  }

  /**
   * 격납고에서 쓰는 돈은 누적 스크랩에서 곧바로 빠지고 곧바로 저장된다.
   * @returns {boolean} 살 수 있었는지
   */
  #spendTotal(cost) {
    if (cost <= 0 || this.totalScrap < cost) return false;

    this.totalScrap -= cost;
    saveNumber(STORAGE_KEYS.TOTAL_SCRAP, this.totalScrap);
    return true;
  }

  #startStage() {
    this.stageScrap = 0;
    this.wave = 0;

    const scales = stageScales(this.stage);
    this.enemies.setScaling(scales.hp, scales.speed);
    this.scrapScale = scales.scrap;

    this.hud.setStage(this.stage);
    this.#startNextWave();
  }

  #startNextWave() {
    this.wave += 1;

    const plan = buildWave(this.stage, this.wave);
    this.waveQueue = plan.queue;
    this.spawnInterval = plan.spawnInterval;
    this.spawnTimer = 0;

    this.hud.setWave(this.wave);
    this.hud.banner(`WAVE ${this.wave}`, '', WAVE.INTRO_TIME);

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
    this.hud.banner('WARNING', '정거장 접근', BOSS.WARNING_TIME, true);
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
    // 보스가 내려온 만큼 방어선이 미리 붉어진다. 같은 선이 같은 위험을 말한다.
    const span = BOSS.SPAWN_Y - BOSS.KILL_LINE_Y;
    this.defenseLine.setThreat((BOSS.SPAWN_Y - this.boss.position.y) / span);

    // 즉사선을 밟히면 기체가 깔린다. 이것이 타임어택의 압박이다.
    if (this.boss.reachedLine()) {
      this.defenseLine.hit(this.boss.position.x);
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
    this.defenseLine.setThreat(0);
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
    this.playerHp = Math.min(this.playerHp + PLAYER.STAGE_CLEAR_HEAL, this.maxHp);
    this.hud.setHp(this.playerHp, this.maxHp);

    this.#clearField();
    this.hud.hideScreens();
    this.#startStage();
  }

  /**
   * 기체 격추. 폭발 연출을 깔고 결과 화면으로 넘어갈 준비를 한다.
   * @param {boolean} [force] 무적을 무시하고 죽인다. 관리자 패널의 [즉시 사망]만 쓴다.
   */
  #killPlayer(force = false) {
    if (this.ship.destroyed) return;
    if (this.godMode && !force) return;

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
    this.hud.setHp(0, this.maxHp);
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
   *
   * 탄이 한 프레임에 판정 반지름보다 멀리 날아가면 뚫고 지나가 버리므로,
   * 점이 아니라 "이번 프레임에 지나온 선분"으로 잰다. 유도탄처럼 비스듬히 나는
   * 탄도 있어서 세로 선분이 아니라 실제 자취를 그대로 쓴다(weapon.js가 px·py에 남겨 둔다).
   *
   * 테크에 따라 갈리는 것은 셋이다.
   *   관통(레이저)  탄을 회수하지 않고, 이미 때린 적은 명부로 걸러 두 번 아프게 하지 않는다.
   *   광역(미사일·플라즈마)  맞은 자리 둘레의 적에게도 몫을 나눈다.
   *   그 밖(발칸)  탄 하나가 적 하나만 때린다.
   *
   * 죽은 적은 곧바로 치우지 않고 모아 둔다. 관통·광역은 한 프레임에 여러 기를 함께
   * 때리는데, 도중에 목록이 줄면 남은 판정이 엉뚱한 적을 건너뛰기 때문이다.
   */
  #resolveBullets() {
    const weapon = this.weapon;
    const pierce = weapon.pierces;
    const splash = weapon.splash;
    const killed = this._killed;
    killed.length = 0;

    for (const b of weapon.bullets) {
      if (b.life <= 0) continue;

      const x1 = b.group.position.x;
      const y1 = b.group.position.y;

      // 보스가 떠 있으면 먼저 본다. 화면 위쪽을 통째로 막고 있기 때문이다.
      if (
        this.boss.alive &&
        !b.hits?.has(this.boss) &&
        segmentHitsCircle(this.boss.position, BOSS.HIT_RADIUS, b.px, b.py, x1, y1)
      ) {
        b.hits?.add(this.boss); // 관통탄이 같은 보스를 다단으로 때리지 않게 한다.
        if (!pierce) weapon.recycle(b);
        weapon.impactAt(x1, y1);
        this.cameraFX.shake(BOSS.HIT_SHAKE_STRENGTH, BOSS.HIT_SHAKE_TIME);

        if (this.boss.hit(weapon.damage, x1, y1)) {
          this.#onBossDefeated();
          return; // 보스가 터졌으면 이번 프레임 판정은 여기서 끝낸다.
        }
        continue;
      }

      for (let i = this.enemies.active.length - 1; i >= 0; i--) {
        const e = this.enemies.active[i];
        if (e.hp <= 0 || b.hits?.has(e)) continue; // 이미 이번 프레임에 죽었거나 때린 적
        if (!segmentHitsCircle(e.group.position, e.def.HIT_RADIUS, b.px, b.py, x1, y1)) continue;

        b.hits?.add(e);
        if (!pierce) weapon.recycle(b);

        // 연출은 탄이 멈춘 자리가 아니라 맞은 적 위에 얹는다.
        // 폭발과 링이 곧 "여기까지 아프다"는 표시이기 때문이다.
        const hx = e.group.position.x;
        const hy = e.group.position.y;
        weapon.impactAt(hx, hy);

        if (this.enemies.hit(e, weapon.damage)) killed.push(e);
        if (splash) this.#splash(hx, hy, splash, e, killed);

        if (!pierce) break; // 탄 하나가 적 하나만 때린다.
      }
    }

    // 이제야 치운다. 판정이 다 끝났으므로 목록이 줄어도 어긋날 곳이 없다.
    for (const e of killed) {
      this._point.copy(e.group.position);
      const def = e.def;
      this.enemies.release(e);
      this.#onEnemyKilled(this._point, def);
    }
    killed.length = 0;
  }

  /**
   * 광역 피해. 맞은 적을 뺀 반경 안의 적 전원이 몫만큼 아프다.
   * @param {object} splash 테크의 SPLASH 정의(RADIUS·RATIO)
   * @param {object} exclude 직격을 이미 받은 적
   * @param {object[]} killed 이번 프레임에 죽은 적을 모으는 자리
   */
  #splash(x, y, splash, exclude, killed) {
    const reach = splash.RADIUS * splash.RADIUS;
    const damage = this.weapon.damage * splash.RATIO;

    for (const e of this.enemies.active) {
      if (e === exclude || e.hp <= 0) continue;

      const dx = e.group.position.x - x;
      const dy = e.group.position.y - y;
      if (dx * dx + dy * dy > reach) continue;

      if (this.enemies.hit(e, damage)) killed.push(e);
    }
  }

  /** 방어선 통과: 놓친 적이 아래로 빠져나가며 체력을 깎는다. */
  #resolveBreach() {
    let damage = 0;
    let breachX = 0;

    for (let i = this.enemies.active.length - 1; i >= 0; i--) {
      const e = this.enemies.active[i];
      if (e.group.position.y > FIELD.DEFENSE_LINE_Y) continue;

      damage += e.def.BREACH_DAMAGE;
      breachX = e.group.position.x;
      this.debris.burst(e.group.position.x, e.group.position.y, 0, 0.6);
      // 선이 그 자리에서 붉게 출렁인다. 어디가 뚫렸는지 눈으로 보여 준다.
      this.defenseLine.hit(breachX);
      this.enemies.release(e);
    }

    // 같은 프레임에 여러 기가 통과하면 한 번에 몰아 맞는다.
    // 무적 시간으로 막지 않는다. 못 잡으면 아프다는 것이 이 게임의 압박이다.
    if (damage > 0) this.#hurtPlayer(damage, false, breachX, FIELD.DEFENSE_LINE_Y);
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
      const hitX = e.group.position.x;
      const hitY = e.group.position.y;
      this.enemies.release(e);
      this.#hurtPlayer(damage, true, hitX, hitY);
      return; // 한 프레임에 한 번만 부딪힌다.
    }
  }

  /**
   * @param {number} amount 깎을 체력
   * @param {boolean} grantInvuln 무적 시간을 줄지. 충돌은 주고, 방어선 통과는 주지 않는다.
   * @param {number} x 맞은 자리(전장 좌표). 뜨는 숫자를 여기에 띄운다.
   * @param {number} y
   */
  #hurtPlayer(amount, grantInvuln, x = 0, y = FIELD.DEFENSE_LINE_Y) {
    if (this.ship.destroyed || this.godMode) return;

    // 방금 깨진 보호막이 아직 막고 있다. 이 몫은 이미 값을 치렀다.
    if (this.shieldGrace > 0) return;

    // 보호막이 남아 있으면 이 피해는 통째로 사라지고, 방패 하나가 깨진다.
    if (this.shields > 0) {
      this.#breakShield();
      return;
    }

    this.playerHp -= amount;
    this.hud.setHp(Math.max(this.playerHp, 0), this.maxHp);

    // 얼마나 왜 아팠는지 눈으로 알려 준다. 붉은 비네트가 번쩍이고 숫자가 떠오른다.
    this.hud.hurtFlash();
    const p = this.project?.(x, y);
    if (p) this.hud.damage(p.x, p.y, amount);

    if (this.playerHp <= 0) {
      this.#killPlayer();
      return;
    }

    this.ship.playHurt(grantInvuln);
    this.hitStop = Math.max(this.hitStop, PLAYER.HURT_STOP_TIME);
    this.cameraFX.shake(PLAYER.HURT_SHAKE_STRENGTH, PLAYER.HURT_SHAKE_TIME);
  }

  /**
   * 보호막 하나가 대신 맞고 깨진다.
   *
   * 깨진 뒤 SHIELD.GRACE_TIME 동안은 다음 방패가 소모되지 않는다.
   * 방어선 통과 피해는 무적을 뚫고 들어오기 때문에, 유예가 없으면 한 번의
   * 돌파에 방패가 통째로 녹는다. 보스에게 깔리는 즉사는 막지 못한다.
   * 그래야 보스전이 시간전이라는 약속이 남는다.
   */
  #breakShield() {
    this.shields -= 1;
    this.shieldGrace = SHIELD.GRACE_TIME;

    const p = this.ship.mesh.position;
    this.shieldBurst.spawn(p.x, p.y, p.z + 0.4);
    this.ship.playShieldBreak();

    this.hitStop = Math.max(this.hitStop, SHIELD.STOP_TIME);
    this.cameraFX.shake(SHIELD.SHAKE_STRENGTH, SHIELD.SHAKE_TIME);
    this.hud.breakShield(this.shields, this.maxShields);
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
    this.wallet += 1;
    this.hud.setScrap(this.wallet);
    this.board?.refreshWallet();
  }

  /**
   * 무기 구매. 지갑에서만 빠진다.
   * 번 총량(runScrap)은 건드리지 않아, 누적 스크랩은 "이번 판에 번 돈" 기준을 지킨다.
   * 쓴 돈을 다시 빼지 않는 후한 셈이다. 초반 성장 체감을 위해 일부러 그렇게 뒀다.
   * @returns {boolean} 살 수 있었는지
   */
  #spendScrap(cost) {
    if (this.wallet < cost) return false;

    this.wallet -= cost;
    this.hud.setScrap(this.wallet);
    return true;
  }

  /** 분해 환급. 되돌려받는 돈이라 번 총량에는 넣지 않는다. */
  #refundScrap(amount) {
    this.wallet += amount;
    this.hud.setScrap(this.wallet);
  }

  /** 합성으로 주포가 세진 순간. 화력 갱신은 보드가 이미 했고, 여기서는 몸으로 보여 준다. */
  #onWeaponMerged() {
    if (this.ship.destroyed) return;

    const p = this.ship.mesh.position;
    this.ship.playPowerUp();
    this.powerBurst.spawn(p.x, p.y, p.z + 0.4);
    this.cameraFX.shake(PLAYER.POWER_SHAKE_STRENGTH, PLAYER.POWER_SHAKE_TIME);
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

  // --- 관리자 패널이 쓰는 좁은 창구 -----------------------------------------

  /**
   * 개발용 조작 창구. `?dev`로 열리는 관리자 패널(dev-panel.js)만 이 객체를 쓴다.
   *
   * 패널이 게임 속을 직접 헤집지 않도록 필요한 만큼만 열어 둔다.
   * 여기 없는 것은 패널도 만질 수 없다. 일반 플레이 경로는 이 창구를 지나지 않는다.
   */
  get devApi() {
    return {
      /** 지갑에 스크랩을 얹는다(인게임). */
      addWallet: (amount) => {
        this.wallet += amount;
        this.hud.setScrap(this.wallet);
        this.board.refreshWallet();
      },

      /** 누적 스크랩을 얹고 곧바로 저장한다(아웃게임). */
      addTotalScrap: (amount) => {
        this.totalScrap += amount;
        saveNumber(STORAGE_KEYS.TOTAL_SCRAP, this.totalScrap);
      },

      /** 지금 웨이브를 비운다. 남은 스폰 대기열까지 걷어 곧바로 다음으로 넘어간다. */
      clearWave: () => {
        if (!COMBAT_STATES.has(this.state)) return;
        this.waveQueue.length = 0;
        this.enemies.reset();
        this.aimTarget = null;
      },

      /** 웨이브를 건너뛰고 곧장 보스전으로 간다. */
      spawnBoss: () => {
        if (!COMBAT_STATES.has(this.state) || this.boss.alive) return;
        this.waveQueue.length = 0;
        this.enemies.reset();
        this.aimTarget = null;
        this.wave = STAGE.WAVES_PER_STAGE;
        this.#startBossWarning();
      },

      /** 스테이지를 한 칸 올리고 처음부터 다시 깐다. */
      nextStage: () => {
        this.stage += 1;
        this.#clearField();
        this.hud.hideScreens();
        this.#startStage();
      },

      /** 무적 토글. @returns {boolean} 켜졌는지 */
      toggleGodMode: () => {
        this.godMode = !this.godMode;
        return this.godMode;
      },

      /** 게임 시간 배수. 페이싱을 빠르게 훑어볼 때 쓴다. */
      setTimeScale: (scale) => {
        this.timeScale = scale;
      },

      // 무적을 무시하고 죽인다. 사망 흐름을 확인할 때 쓴다.
      // 무적 값 자체는 건드리지 않는다. 패널의 표시와 실제가 어긋나면 안 되기 때문이다.
      killPlayer: () => this.#killPlayer(true),

      /** 무기 테크를 전부 연다. 장착은 격납고에서 고른다. */
      unlockAllTech: () => this.tech.unlockAll(),

      /** 저장을 통째로 지운다. 검증용으로 부풀린 값을 되돌릴 때 쓴다. */
      resetSave: () => {
        for (const key of Object.values(STORAGE_KEYS)) {
          try {
            localStorage.removeItem(key);
          } catch {
            /* 지울 수 없어도 새로고침은 한다. */
          }
        }
      },

      /** 패널이 켜질 때 지금 상태를 읽어 표시에 반영한다. */
      readState: () => ({ godMode: this.godMode, timeScale: this.timeScale }),
    };
  }

  // --- 정리 ---------------------------------------------------------------

  #setState(state) {
    this.state = state;
    this.stateTime = 0;
  }

  /** 화면에 남은 탄·적·파편·스크랩·보스를 전부 거둔다. 상태 전환마다 잔상이 남지 않게. */
  #clearField() {
    this.weapon.reset();
    this.enemies.reset();
    this.debris.reset();
    this.scrap.reset();
    this.powerBurst.reset();
    this.shieldBurst.reset();
    this.boss.despawn();
    this.defenseLine.reset();

    this.hitStop = 0;
    this.waveQueue.length = 0;
    this.aimTarget = null;
    this._killed.length = 0;

    this.hud.hideBanner();
    this.hud.showBossHp(false);
  }
}
