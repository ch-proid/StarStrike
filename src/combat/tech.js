import { STORAGE_KEYS, WEAPON_TECH } from './tuning.js';

// 무기 테크의 상태.
//
// 발칸 → 레이저 → 미사일 → 플라즈마. 순서대로만 열리고, 연 것 중 하나를 장착한다.
// 테크는 전역 설정이라 판이 바뀌어도 남는다. localStorage에 JSON 한 덩어리로 저장한다.
//
// 이 파일은 화면을 모른다. 격납고 화면(hangar.js)이 물어보고 그린다.
// 전투에 닿는 자리는 currentId 하나뿐이고, game.js가 판을 시작할 때 한 번 읽는다.

const ORDER = WEAPON_TECH.map((t) => t.ID);
const BY_ID = new Map(WEAPON_TECH.map((t) => [t.ID, t]));
const FIRST = ORDER[0]; // 발칸. 처음부터 열려 있다.

/** localStorage가 막힌 환경(사생활 보호 모드 등)에서도 게임은 굴러가야 한다. */
function load() {
  const state = { unlocked: new Set([FIRST]), equipped: FIRST };

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TECH);
    if (!raw) return state;

    const saved = JSON.parse(raw);
    const list = Array.isArray(saved?.unlocked) ? saved.unlocked : [];

    // 저장된 값을 그대로 믿지 않는다. 순서를 건너뛴 해금은 거기서 끊는다.
    for (let i = 1; i < ORDER.length; i++) {
      if (!list.includes(ORDER[i])) break;
      state.unlocked.add(ORDER[i]);
    }

    if (typeof saved?.equipped === 'string' && state.unlocked.has(saved.equipped)) {
      state.equipped = saved.equipped;
    }
  } catch {
    /* 읽을 수 없으면 처음 시작한 것으로 본다. */
  }

  return state;
}

export class TechState {
  constructor() {
    const state = load();
    /** @type {Set<string>} 해금한 테크 id */
    this.unlocked = state.unlocked;
    /** @type {string} 장착 중인 테크 id */
    this.equipped = state.equipped;
  }

  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  isEquipped(id) {
    return this.equipped === id;
  }

  /** 바로 다음 차례인가. 앞의 테크를 열기 전에는 살 수 없다. */
  isNext(id) {
    const i = ORDER.indexOf(id);
    if (i <= 0 || this.isUnlocked(id)) return false;
    return this.isUnlocked(ORDER[i - 1]);
  }

  costOf(id) {
    return BY_ID.get(id)?.COST ?? 0;
  }

  /** 지금 장착한 테크의 정의. 전투 수치는 전부 여기서 나온다. */
  get current() {
    return BY_ID.get(this.equipped) ?? BY_ID.get(FIRST);
  }

  /** 해금하고 곧바로 장착한다. 재화 차감은 부르는 쪽이 먼저 끝내 둔다. */
  unlock(id) {
    if (!this.isNext(id)) return false;

    this.unlocked.add(id);
    this.equipped = id;
    this.#save();
    return true;
  }

  /** 넷을 한꺼번에 연다. 관리자 패널(dev-panel.js)만 쓴다. 장착은 그대로 둔다. */
  unlockAll() {
    for (const id of ORDER) this.unlocked.add(id);
    this.#save();
  }

  /** 이미 연 테크로 갈아 끼운다. 다음 출격부터 적용된다. */
  equip(id) {
    if (!this.isUnlocked(id) || this.equipped === id) return false;

    this.equipped = id;
    this.#save();
    return true;
  }

  #save() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.TECH,
        JSON.stringify({
          unlocked: ORDER.filter((id) => this.unlocked.has(id)),
          equipped: this.equipped,
        })
      );
    } catch {
      /* 저장할 수 없어도 진행은 막지 않는다. */
    }
  }
}
