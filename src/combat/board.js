import { BOARD, WEAPON } from './tuning.js';

// 머지 보드: 화면 아래쪽에 깔린 무기 합성 판.
//
// 보드는 규칙 하나로 굴러간다. 같은 레벨 둘을 겹치면 한 레벨 위 무기가 되고,
// 그중 가장 높은 무기가 주포로 장착된다. 나머지는 쏘지 않는 대신
// 합산 공격력의 일부(WEAPON.SUPPORT_RATIO)를 보조 화력으로 주포에 얹는다.
// 그래서 중간 합성도 곧바로 화력 상승으로 느껴진다.
//
// 이 파일은 데이터(칸에 무엇이 있는가)와 조작(끌어다 놓기)과 표시를 한꺼번에 맡는다.
// 대신 재화는 건드리지 않는다. 스크랩 지갑은 game.js가 들고, 여기서는 물어보고 시킬 뿐이다.

/**
 * 무기를 끌고 있는 동안은 기체 조종을 멈춰야 한다.
 * 보드 밖까지 끌고 나가면 손가락이 화면 위쪽으로 올라가는데,
 * 그때마다 기체가 따라 움직이면 조작이 엉킨다. ship.js가 이 값을 본다.
 */
export const boardInput = { dragging: false };

/** 레벨 하나의 공격력. 레벨이 오를수록 기하급수로 커진다. */
export function weaponPower(level) {
  return WEAPON.BASE_POWER * Math.pow(WEAPON.POWER_PER_LEVEL, level - 1);
}

/** 분해할 때 돌려받는 스크랩. */
export function refundOf(level) {
  return Math.round(WEAPON.REFUND_BASE * Math.pow(WEAPON.REFUND_PER_LEVEL, level - 1));
}

/** 레벨대(1~3, 4~6, 7~9, 10~)마다 타일 위 표식이 한 겹씩 늘어난다. */
function markOf(level) {
  return '▲'.repeat(Math.min(Math.ceil(level / 3), 4));
}

function contains(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export class MergeBoard {
  /**
   * @param {object} handlers
   * @param {() => number} handlers.getWallet 지금 쓸 수 있는 스크랩
   * @param {(cost: number) => boolean} handlers.spend 차감 요청. 모자라면 false
   * @param {(amount: number) => void} handlers.refund 분해 환급
   * @param {(power: number) => void} handlers.onPowerChange 총 공격력이 바뀔 때
   * @param {(level: number) => void} handlers.onMerge 합성이 일어난 순간(파워업 연출용)
   */
  constructor({ getWallet, spend, refund, onPowerChange, onMerge }) {
    this.getWallet = getWallet;
    this.spend = spend;
    this.refund = refund;
    this.onPowerChange = onPowerChange;
    this.onMerge = onMerge;

    this.size = BOARD.COLS * BOARD.ROWS;
    /** @type {number[]} 칸마다 무기 레벨. 0이면 빈 칸이다. */
    this.slots = new Array(this.size).fill(0);
    this.purchases = 0; // 이번 판에 산 횟수. 가격이 여기에 매여 있다.

    this.root = document.getElementById('board');
    this.grid = document.getElementById('board-grid');
    this.trash = document.getElementById('board-trash');
    this.buyBtn = document.getElementById('btn-buy');
    this.el = {
      main: document.getElementById('board-main'),
      note: document.getElementById('board-note'),
      power: document.getElementById('board-power'),
      support: document.getElementById('board-support'),
      cost: document.getElementById('buy-cost'),
    };

    this.cells = [];
    this.drag = null;
    this.buySignature = ''; // 버튼 상태를 헛되이 다시 그리지 않으려고 남겨 둔다.

    // 드래그 중에만 창에 붙였다 떼는 손잡이들
    this.onPointerMove = (e) => {
      if (this.drag && e.pointerId === this.drag.pointerId) this.#onMove(e);
    };
    this.onPointerUp = (e) => {
      if (this.drag && e.pointerId === this.drag.pointerId) this.#onUp(e);
    };
    this.onPointerCancel = (e) => {
      if (this.drag && e.pointerId === this.drag.pointerId) this.#endDrag();
    };

    this.#buildCells();
    this.#bindInput();
    this.reset();
  }

  // --- 상태 읽기 -----------------------------------------------------------

  /** 다음 무기 가격. 살 때마다 오른다. */
  get cost() {
    return Math.round(WEAPON.BUY_COST * Math.pow(WEAPON.BUY_COST_GROWTH, this.purchases));
  }

  /**
   * 보드 전체를 훑어 주포와 보조 화력을 계산한다.
   * @returns {{mainLevel: number, mainPower: number, support: number,
   *            power: number, count: number, full: boolean}}
   */
  stats() {
    let mainLevel = 0;
    let mainPower = 0;
    let sum = 0;
    let count = 0;

    for (const level of this.slots) {
      if (level <= 0) continue;

      count += 1;
      const p = weaponPower(level);
      sum += p;

      // 같은 최고 레벨이 둘이면 하나만 주포다. 나머지는 보조로 센다.
      if (level > mainLevel) {
        mainLevel = level;
        mainPower = p;
      }
    }

    const support = Math.max(sum - mainPower, 0) * WEAPON.SUPPORT_RATIO;
    const power = Math.max(mainPower + support, WEAPON.MIN_POWER);

    return { mainLevel, mainPower, support, power, count, full: count >= this.size };
  }

  get power() {
    return this.stats().power;
  }

  // --- 판 시작 -------------------------------------------------------------

  /** 새 판. 보드를 비우고 가격을 되돌린 뒤 시작 무기를 한 개 준다. */
  reset() {
    this.#endDrag(); // 끌던 무기가 남아 있으면 여기서 걷힌다.
    this.slots.fill(0);
    this.purchases = 0;
    this.slots[0] = WEAPON.START_LEVEL;

    this.#render();
    this.#refresh();
  }

  // --- 구매 ---------------------------------------------------------------

  buy() {
    const slot = this.slots.indexOf(0);
    if (slot < 0) return; // 보드가 꽉 찼다.
    if (!this.spend(this.cost)) return; // 스크랩이 모자란다.

    this.purchases += 1;
    this.slots[slot] = 1;

    this.#render();
    this.#pop(slot, false);
    this.#refresh();
  }

  /** 지갑이 바뀔 때마다 game.js가 불러 준다. 버튼 상태만 다시 본다. */
  refreshWallet() {
    this.#refreshBuyButton();
  }

  // --- 칸 만들기와 그리기 --------------------------------------------------

  #buildCells() {
    this.grid.style.gridTemplateColumns = `repeat(${BOARD.COLS}, 1fr)`;
    this.grid.style.gridTemplateRows = `repeat(${BOARD.ROWS}, 1fr)`;

    for (let i = 0; i < this.size; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = String(i);
      this.grid.appendChild(cell);
      this.cells.push(cell);
    }
  }

  /** 칸마다 무기 타일을 만들거나 지우거나 레벨만 갈아 끼운다. */
  #render() {
    for (let i = 0; i < this.size; i++) {
      const cell = this.cells[i];
      const level = this.slots[i];
      let tile = cell.firstElementChild;

      if (level <= 0) {
        if (tile) tile.remove();
        continue;
      }

      if (!tile) {
        tile = document.createElement('div');
        tile.className = 'wpn';
        tile.innerHTML = '<span class="mark"></span><span class="lv"></span>';
        cell.appendChild(tile);
      }

      this.#paint(tile, level);
    }
  }

  /** 타일 하나에 레벨을 입힌다. 색은 CSS가 data-level로 고른다. */
  #paint(tile, level) {
    tile.dataset.level = String(level);
    tile.querySelector('.mark').textContent = markOf(level);
    tile.querySelector('.lv').textContent = String(level);
  }

  /**
   * 합성·구매 순간의 작은 팝.
   * 클래스를 뗐다가 강제로 다시 계산한 뒤 붙인다. 그래야 같은 칸에서 연달아
   * 합성해도 애니메이션이 처음부터 다시 돈다.
   */
  #pop(index, flash) {
    const cell = this.cells[index];
    const tile = cell.firstElementChild;
    if (!tile) return;

    tile.classList.remove('pop');
    cell.classList.remove('flash');
    void tile.offsetWidth; // 지우지 말 것. 이 한 줄이 애니메이션을 되감는다.
    tile.classList.add('pop');
    if (flash) cell.classList.add('flash');
  }

  /** 머리줄과 구매 버튼을 한꺼번에 다시 그리고, 바뀐 화력을 밖으로 알린다. */
  #refresh() {
    const s = this.stats();

    this.el.main.innerHTML = `주포 <b>LV ${s.mainLevel || '-'}</b>`;
    this.el.power.querySelector('b').textContent = s.power.toFixed(1);
    this.el.support.textContent = s.support > 0.05 ? ` (+${s.support.toFixed(1)} 보조)` : '';

    this.#refreshBuyButton(s);
    this.onPowerChange(s.power);
  }

  #refreshBuyButton(stats = null) {
    const s = stats ?? this.stats();
    const cost = this.cost;
    const wallet = this.getWallet();

    let note = '';
    if (s.full) note = '보드가 가득 찼다 · 분해하거나 합성하자';
    else if (wallet < cost) note = `스크랩 ${cost - wallet} 더 모으면 살 수 있다`;

    const signature = `${cost}|${note}`;
    if (signature === this.buySignature) return;
    this.buySignature = signature;

    this.el.cost.textContent = String(cost);
    this.el.note.textContent = note;
    this.buyBtn.disabled = note !== '';
  }

  // --- 끌어다 놓기 ---------------------------------------------------------

  #bindInput() {
    this.grid.addEventListener('pointerdown', (e) => this.#onDown(e));
    this.buyBtn.addEventListener('click', () => this.buy());
  }

  #onDown(e) {
    if (this.drag || e.button > 0) return;

    const cell = e.target.closest?.('.cell');
    if (!cell) return;

    const from = Number(cell.dataset.index);
    if (!this.slots[from]) return;

    e.preventDefault();

    // 칸 위치는 드래그를 시작할 때 한 번만 재 둔다. 끄는 동안 보드는 움직이지 않는다.
    const rects = this.cells.map((c) => c.getBoundingClientRect());
    const box = rects[from];

    const tile = document.createElement('div');
    tile.className = 'wpn drag';
    tile.innerHTML = '<span class="mark"></span><span class="lv"></span>';
    tile.style.width = `${box.width - 6}px`;
    tile.style.height = `${box.height - 6}px`;
    this.#paint(tile, this.slots[from]);
    this.root.appendChild(tile);

    this.cells[from].classList.add('picked');

    this.drag = {
      from,
      tile,
      rects,
      trashRect: this.trash.getBoundingClientRect(),
      pointerId: e.pointerId,
      over: null,
    };

    boardInput.dragging = true;

    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);

    this.#follow(e.clientX, e.clientY);
  }

  #onMove(e) {
    e.preventDefault();
    this.#follow(e.clientX, e.clientY);
    this.#highlight(this.#hitTest(e.clientX, e.clientY));
  }

  #onUp(e) {
    const target = this.#hitTest(e.clientX, e.clientY);
    const from = this.drag.from;

    this.#endDrag();
    this.#resolve(from, target);
  }

  #endDrag() {
    if (!this.drag) return;

    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);

    this.drag.tile.remove();
    for (const cell of this.cells) cell.classList.remove('over', 'merge', 'picked');
    this.trash.classList.remove('over');

    this.drag = null;
    boardInput.dragging = false;
  }

  #follow(x, y) {
    this.drag.tile.style.left = `${x}px`;
    this.drag.tile.style.top = `${y}px`;
  }

  /** @returns {number|'trash'|null} 놓을 자리 */
  #hitTest(x, y) {
    if (contains(this.drag.trashRect, x, y)) return 'trash';

    for (let i = 0; i < this.drag.rects.length; i++) {
      if (contains(this.drag.rects[i], x, y)) return i;
    }
    return null;
  }

  /** 지금 겨누고 있는 자리를 알려 준다. 합성이 되는 자리는 금색으로 구분한다. */
  #highlight(target) {
    if (this.drag.over === target) return;
    this.drag.over = target;

    for (const cell of this.cells) cell.classList.remove('over', 'merge');
    this.trash.classList.toggle('over', target === 'trash');

    if (typeof target !== 'number' || target === this.drag.from) return;

    const level = this.slots[this.drag.from];
    const mergeable = this.slots[target] === level && level < WEAPON.MAX_LEVEL;
    this.cells[target].classList.add(mergeable ? 'merge' : 'over');
  }

  /**
   * 놓은 자리에 따라 합성·맞바꿈·이동·분해를 가른다.
   * @param {number} from 집어 든 칸
   * @param {number|'trash'|null} target 놓은 자리
   */
  #resolve(from, target) {
    const level = this.slots[from];
    if (!level || target === null || target === from) return;

    if (target === 'trash') {
      this.slots[from] = 0;
      this.#render();
      this.refund(refundOf(level));
      this.#refresh();
      return;
    }

    const other = this.slots[target];

    if (other === level && level < WEAPON.MAX_LEVEL) {
      // 합성: 한 레벨 위로 올라가고 원래 칸은 빈다.
      this.slots[target] = level + 1;
      this.slots[from] = 0;
      this.#render();
      this.#pop(target, true);
      this.#refresh();
      this.onMerge(level + 1);
      return;
    }

    // 빈 칸이면 이동, 다른 무기가 있으면 자리 맞바꿈. 둘 다 같은 한 줄이다.
    this.slots[target] = level;
    this.slots[from] = other;
    this.#render();
  }

}
