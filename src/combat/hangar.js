import { PERKS } from './tuning.js';
import { perkValue } from './perks.js';

// 격납고: 죽어야 열리는 상점.
//
// 사망 결과 화면의 [격납고]가 이 화면을 열고, [출격]이 스테이지 1부터 새 판을 연다.
// 죽음이 곧 상점 입장이라는 리듬이 로그라이트의 보상 고리다.
//
// 이 파일은 그리기와 누르기만 맡는다. 퍽 레벨은 perks.js가, 누적 스크랩은 game.js가 들고 있다.
// 여기서는 물어보고 시킬 뿐이다.
//
// 보이는 규칙은 보드와 같다. 설명 문장을 두지 않고 수치로 말한다.
// 채워진 시안 버튼은 [출격] 하나뿐이고, 카드의 가격 버튼은 테두리형이라 위계가 갈린다.

/** 퍽 아이콘. 외부 이미지 없이 인라인 SVG로만 그린다. */
const ICONS = {
  // 공격력: 위로 솟는 탄두와 양옆의 분사
  power:
    '<path d="M12 2.2c2.3 2.7 3.5 5.8 3.5 9.2v3.9h-7v-3.9c0-3.4 1.2-6.5 3.5-9.2z"/>' +
    '<rect x="10.4" y="16.6" width="3.2" height="5.2" rx="1.4"/>' +
    '<rect x="4.9" y="12.6" width="2" height="7.4" rx="1"/>' +
    '<rect x="17.1" y="12.6" width="2" height="7.4" rx="1"/>',

  // 장갑: 겹쳐 붙인 선체 판
  armor:
    '<rect x="2.6" y="4.6" width="18.8" height="4.2" rx="1.6"/>' +
    '<rect x="4" y="10" width="16" height="4.2" rx="1.6"/>' +
    '<rect x="5.4" y="15.4" width="13.2" height="4.2" rx="1.6"/>',

  // 보호막: 방패. HUD의 보호막 표시도 같은 모양을 쓴다.
  shield: '<path d="M12 2.2 20.2 5.4v6.4c0 4.4-3.2 8.2-8.2 10-5-1.8-8.2-5.6-8.2-10V5.4z"/>',

  // 시작 무기: 발칸 실루엣 위에 얹힌 상승 표시
  start:
    '<path d="M12 1.4 15.6 5.3H8.4z"/>' +
    '<rect x="10.5" y="6.6" width="3" height="7.4" rx="1.2"/>' +
    '<rect x="8.4" y="8" width="7.2" height="1.7" rx=".85"/>' +
    '<path d="M6.2 13.2h11.6l1.5 5.1a1.5 1.5 0 0 1-1.44 1.92H6.14A1.5 1.5 0 0 1 4.7 18.3z"/>',

  // 정예 보급: 반짝임
  elite:
    '<path d="M11 2.6c.85 4.3 2.6 6.5 6.9 7.4-4.3.9-6.05 3.1-6.9 7.4-.85-4.3-2.6-6.5-6.9-7.4 4.3-.9 6.05-3.1 6.9-7.4z"/>' +
    '<path d="M18.2 14c.42 2.1 1.28 3.2 3.4 3.6-2.12.4-2.98 1.5-3.4 3.6-.42-2.1-1.28-3.2-3.4-3.6 2.12-.4 2.98-1.5 3.4-3.6z"/>',
};

/** 스크랩 마름모. 상단 HUD·구매 버튼과 같은 도형이다. */
const SCRAP_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 2.4 21.6 12 12 21.6 2.4 12z M12 7.2 7.2 12 12 16.8 16.8 12z"/></svg>';

function svg(body) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

export class Hangar {
  /**
   * @param {import('./perks.js').PerkState} perks
   * @param {object} handlers
   * @param {() => number} handlers.getTotal 지금 쓸 수 있는 누적 스크랩
   * @param {(cost: number) => boolean} handlers.spend 차감 요청. 모자라면 false
   * @param {() => void} handlers.onLaunch [출격]
   */
  constructor(perks, { getTotal, spend, onLaunch }) {
    this.perks = perks;
    this.getTotal = getTotal;
    this.spend = spend;

    this.screen = document.getElementById('screen-hangar');
    this.totalEl = document.getElementById('hangar-total');
    this.list = document.getElementById('perk-list');

    /** @type {Record<string, {card: HTMLElement, dots: HTMLElement[], value: HTMLElement, buy: HTMLElement}>} */
    this.cards = {};

    this.#build();

    this.list?.addEventListener('click', (e) => {
      const btn = e.target.closest?.('.perk-buy');
      if (btn && !btn.disabled) this.#buy(btn.dataset.id);
    });

    document.getElementById('btn-launch')?.addEventListener('click', onLaunch);
  }

  // --- 만들기 --------------------------------------------------------------

  /** 카드 다섯 장을 한 번만 만들어 두고, 이후에는 값만 갈아 끼운다. */
  #build() {
    if (!this.list) return;

    for (const perk of PERKS) {
      const card = document.createElement('div');
      card.className = 'perk';

      const dots = Array.from(
        { length: perk.MAX_LEVEL },
        () => '<i class="dot"></i>'
      ).join('');

      card.innerHTML =
        `<span class="perk-icon">${svg(ICONS[perk.ID] ?? '')}</span>` +
        '<span class="perk-body">' +
        `<span class="perk-head"><span class="perk-name">${perk.NAME}</span>` +
        `<span class="perk-dots">${dots}</span></span>` +
        '<span class="perk-value"></span>' +
        '</span>' +
        `<button class="perk-buy" type="button" data-id="${perk.ID}"></button>`;

      this.list.appendChild(card);

      this.cards[perk.ID] = {
        card,
        dots: Array.from(card.querySelectorAll('.dot')),
        value: card.querySelector('.perk-value'),
        buy: card.querySelector('.perk-buy'),
      };
    }
  }

  // --- 여닫기 --------------------------------------------------------------

  open() {
    this.#refresh();
    this.screen?.classList.remove('hidden');
    this.screen?.scrollTo?.(0, 0);
  }

  close() {
    this.screen?.classList.add('hidden');
  }

  get isOpen() {
    return this.screen ? !this.screen.classList.contains('hidden') : false;
  }

  // --- 구매 ---------------------------------------------------------------

  #buy(id) {
    if (!id || this.perks.isMax(id)) return;

    const cost = this.perks.costOf(id);
    if (!this.spend(cost)) return; // 모자라면 아무 일도 일어나지 않는다.

    this.perks.raise(id);
    this.#refresh();
    this.#flash(id);
  }

  /** 산 카드가 한 번 번쩍인다. 보드의 합성 연출과 같은 되감기 수법을 쓴다. */
  #flash(id) {
    const card = this.cards[id]?.card;
    if (!card) return;

    card.classList.remove('bought');
    void card.offsetWidth; // 지우지 말 것. 이 한 줄이 애니메이션을 되감는다.
    card.classList.add('bought');
  }

  // --- 그리기 --------------------------------------------------------------

  #refresh() {
    const total = this.getTotal();
    if (this.totalEl) this.totalEl.textContent = String(total);

    for (const perk of PERKS) {
      const ui = this.cards[perk.ID];
      if (!ui) continue;

      const level = this.perks.levelOf(perk.ID);
      const max = this.perks.isMax(perk.ID);
      const cost = this.perks.costOf(perk.ID);

      for (let i = 0; i < ui.dots.length; i++) {
        ui.dots[i].classList.toggle('on', i < level);
      }

      // 지금 값 → 다음 값. 최대 레벨이면 지금 값만 남는다.
      ui.value.innerHTML = max
        ? `<b>${perkValue(perk.ID, level)}</b>`
        : `<b>${perkValue(perk.ID, level)}</b><i>→</i><em>${perkValue(perk.ID, level + 1)}</em>`;

      if (max) {
        ui.buy.innerHTML = '<span class="max">MAX</span>';
        ui.buy.disabled = true;
        ui.buy.classList.add('maxed');
      } else {
        ui.buy.innerHTML = `${SCRAP_ICON}<span>${cost}</span>`;
        ui.buy.disabled = total < cost;
        ui.buy.classList.remove('maxed');
      }
    }
  }
}
