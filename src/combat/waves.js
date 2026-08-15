import { BOSS, STAGE, WAVE, WAVE_TABLE } from './tuning.js';

// 웨이브 난이도 규칙.
// "어떤 적이 몇 기 나오는가"는 tuning.js의 WAVE_TABLE이 정하고,
// "스테이지가 오르면 얼마나 세지는가"는 STAGE 배수가 정한다.
// 이 파일은 그 둘을 곱해 실제 스폰 목록으로 바꾸는 일만 한다.

/** 스테이지 번호(1부터)에 따른 난이도 배수 묶음. */
export function stageScales(stage) {
  const n = Math.max(stage - 1, 0);
  return {
    hp: 1 + STAGE.HP_PER_STAGE * n,
    count: 1 + STAGE.COUNT_PER_STAGE * n,
    speed: 1 + STAGE.SPEED_PER_STAGE * n,
    spawnInterval: Math.pow(STAGE.SPAWN_INTERVAL_PER_STAGE, n),
    scrap: 1 + STAGE.SCRAP_PER_STAGE * n,
  };
}

/** 제자리 섞기(피셔-예이츠). 같은 종류가 몰려 나오지 않게 한다. */
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * 웨이브 하나의 스폰 목록을 만든다.
 * @param {number} stage 스테이지 번호(1부터)
 * @param {number} wave 웨이브 번호(1부터, WAVE_TABLE 길이까지)
 * @returns {{queue: string[], spawnInterval: number}} 내보낼 순서와 간격
 */
export function buildWave(stage, wave) {
  const scales = stageScales(stage);
  const entry = WAVE_TABLE[Math.min(wave, WAVE_TABLE.length) - 1];

  const queue = [];
  for (const [key, base] of Object.entries(entry)) {
    const count = Math.max(1, Math.round(base * scales.count));
    for (let i = 0; i < count; i++) queue.push(key);
  }

  return {
    queue: shuffle(queue),
    spawnInterval: Math.max(
      WAVE.SPAWN_INTERVAL * scales.spawnInterval,
      WAVE.SPAWN_INTERVAL_MIN
    ),
  };
}

/** 스테이지별 보스 능력치. */
export function bossStats(stage) {
  const n = Math.max(stage - 1, 0);
  return {
    hp: Math.round(BOSS.BASE_HP * (1 + BOSS.HP_PER_STAGE * n)),
    descendSpeed: BOSS.DESCEND_SPEED * (1 + BOSS.DESCEND_SPEED_PER_STAGE * n),
    scrap: Math.round(BOSS.SCRAP_DROP * (1 + BOSS.SCRAP_PER_STAGE * n)),
  };
}
