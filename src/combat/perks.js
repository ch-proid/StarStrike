import { PERKS, PLAYER, STORAGE_KEYS, WEAPON } from './tuning.js';

// 아웃게임 퍽의 상태.
//
// 레벨은 localStorage에 JSON 한 덩어리로 남는다. 값은 여기서만 읽고 쓴다.
// 이 파일은 화면을 모른다. 격납고 화면(hangar.js)이 물어보고 그린다.
//
// 퍽이 실제 전투에 닿는 자리는 effects 하나뿐이다.
// game.js가 판을 시작할 때 그 값을 한 번 읽어 화력·체력·보호막·보드에 나눠 준다.

/** 퍽 정의를 id로 찾는다. */
const BY_ID = new Map(PERKS.map((p) => [p.ID, p]));

/** localStorage가 막힌 환경(사생활 보호 모드 등)에서도 게임은 굴러가야 한다. */
function load() {
  const levels = {};
  for (const perk of PERKS) levels[perk.ID] = 0;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PERKS);
    if (!raw) return levels;

    const saved = JSON.parse(raw);
    for (const perk of PERKS) {
      const n = Math.floor(Number(saved?.[perk.ID]));
      // 저장된 값을 그대로 믿지 않는다. 모르는 키는 버리고, 범위 밖은 접어 넣는다.
      if (Number.isFinite(n) && n > 0) levels[perk.ID] = Math.min(n, perk.MAX_LEVEL);
    }
  } catch {
    /* 읽을 수 없으면 처음 시작한 것으로 본다. */
  }

  return levels;
}

function save(levels) {
  try {
    localStorage.setItem(STORAGE_KEYS.PERKS, JSON.stringify(levels));
  } catch {
    /* 저장할 수 없어도 진행은 막지 않는다. */
  }
}

export class PerkState {
  constructor() {
    /** @type {Record<string, number>} 퍽 id별 레벨. 0이면 아직 사지 않은 것이다. */
    this.levels = load();
  }

  levelOf(id) {
    return this.levels[id] ?? 0;
  }

  isMax(id) {
    return this.levelOf(id) >= (BY_ID.get(id)?.MAX_LEVEL ?? 0);
  }

  /** 다음 레벨 가격. 최대 레벨이면 0. */
  costOf(id) {
    const perk = BY_ID.get(id);
    if (!perk || this.isMax(id)) return 0;

    const raw = perk.COST_BASE * Math.pow(perk.COST_GROWTH, this.levelOf(id));
    return Math.round(raw / 10) * 10; // 10 단위로 끊어 읽기 쉽게 한다.
  }

  /** 레벨을 한 칸 올리고 저장한다. 재화 차감은 부르는 쪽이 먼저 끝내 둔다. */
  raise(id) {
    if (this.isMax(id)) return false;

    this.levels[id] = this.levelOf(id) + 1;
    save(this.levels);
    return true;
  }

  /**
   * 지금 레벨이 전투에 주는 값 전부.
   * 판을 시작할 때 game.js가 한 번 읽어 간다.
   */
  get effects() {
    const power = BY_ID.get('power');
    const armor = BY_ID.get('armor');
    const elite = BY_ID.get('elite');

    return {
      powerMul: Math.pow(1 + power.PER_LEVEL, this.levelOf('power')),
      maxHp: PLAYER.MAX_HP + armor.PER_LEVEL * this.levelOf('armor'),
      shields: this.levelOf('shield'),
      startLevel: Math.min(WEAPON.START_LEVEL + this.levelOf('start'), WEAPON.MAX_LEVEL),
      eliteChance: elite.PER_LEVEL * this.levelOf('elite'),
    };
  }
}

/**
 * 카드에 적을 효과 수치. 레벨을 넣으면 그 레벨에서의 값이 문자열로 나온다.
 * 설명 문장 대신 이 수치가 말을 한다.
 */
export function perkValue(id, level) {
  const perk = BY_ID.get(id);

  switch (id) {
    case 'power':
      return `×${Math.pow(1 + perk.PER_LEVEL, level).toFixed(2)}`;
    case 'armor':
      return String(PLAYER.MAX_HP + perk.PER_LEVEL * level);
    case 'shield':
      return String(level);
    case 'start':
      return `Lv ${Math.min(WEAPON.START_LEVEL + level, WEAPON.MAX_LEVEL)}`;
    case 'elite':
      return `${Math.round(perk.PER_LEVEL * level * 100)}%`;
    default:
      return String(level);
  }
}
