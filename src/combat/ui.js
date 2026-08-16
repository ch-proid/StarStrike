// HTML 오버레이 조작. 캔버스 위에 얹힌 HUD와 결과 화면을 여닫는 일만 한다.
// 마크업과 모양은 index.html에 있고, 여기서는 값과 표시 여부만 갈아 끼운다.
// 게임 규칙은 전혀 모른다. game.js가 시키는 대로 그린다.
//
// 표시 원칙은 "적을수록 좋다"다.
//   위쪽 한 줄에 진행(1-2)과 스크랩만 둔다.
//   체력은 방어선에 붙여, 무엇을 지키고 있는지와 얼마나 남았는지를 한자리에서 읽게 한다.
//   피해는 글이 아니라 연출로 알린다. 붉은 비네트가 번쩍이고 숫자가 떠오른다.

/** id로 요소를 찾아 둔다. 없으면 null이 들어가고, 아래 함수들이 알아서 넘긴다. */
function $(id) {
  return document.getElementById(id);
}

function setText(el, value) {
  if (el) el.textContent = String(value);
}

/** 0~1 비율만큼 채운다. 폭 대신 transform을 써서 매 프레임 레이아웃을 다시 계산하지 않는다. */
function setFill(el, ratio) {
  if (el) el.style.transform = `scaleX(${Math.max(Math.min(ratio, 1), 0)})`;
}

function show(el, visible) {
  if (el) el.classList.toggle('hidden', !visible);
}

/**
 * 보호막 표시에 쓰는 방패 도형. 격납고 카드의 아이콘과 같은 모양이다.
 * SVG를 span으로 한 겹 감싼 것은 애니메이션을 되감기 위해서다.
 * SVG 요소에는 offsetWidth가 없어 강제 재계산이 걸리지 않는다.
 */
const SHIELD_PIP =
  '<span class="pip"><svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 2.2 20.2 5.4v6.4c0 4.4-3.2 8.2-8.2 10-5-1.8-8.2-5.6-8.2-10V5.4z"/></svg></span>';

export class HUD {
  /**
   * @param {object} handlers
   * @param {() => void} handlers.onNextStage [다음 스테이지]
   * @param {() => void} handlers.onHangar [격납고]
   * @param {() => void} handlers.onRevive [▶ 부활]
   * @param {() => void} handlers.onBoostScrap [▶ ×3]. 어느 화면인지는 game.js가 안다.
   */
  constructor({ onNextStage, onHangar, onRevive, onBoostScrap }) {
    this.el = {
      progress: $('progress'),
      scrap: $('scrap-count'),

      hp: $('line-hp'),
      hpFill: $('hp-fill'),
      hpText: $('hp-text'),
      shields: $('shield-pips'),

      bossHp: $('boss-hp'),
      bossHpFill: $('boss-hp-fill'),

      fx: $('fx'),
      vignette: $('vignette'),

      banner: $('banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),

      stageClear: $('screen-stage-clear'),
      clearStage: $('clear-stage'),
      clearScrap: $('clear-scrap'),
      clearScrapRow: $('clear-scrap-row'),
      clearTotal: $('clear-total'),
      clearAdRow: $('btn-ad-clear-scrap')?.parentElement ?? null,
      adClearScrap: $('btn-ad-clear-scrap'),

      gameOver: $('screen-game-over'),
      overReach: $('over-reach'),
      overScrap: $('over-scrap'),
      overScrapRow: $('over-scrap-row'),
      overTotal: $('over-total'),
      overBest: $('over-best'),
      overAdRow: $('btn-ad-revive')?.parentElement ?? null,
      adRevive: $('btn-ad-revive'),
      adOverScrap: $('btn-ad-over-scrap'),
    };

    $('btn-next-stage')?.addEventListener('click', onNextStage);
    $('btn-hangar')?.addEventListener('click', onHangar);
    this.el.adRevive?.addEventListener('click', onRevive);
    this.el.adClearScrap?.addEventListener('click', onBoostScrap);
    this.el.adOverScrap?.addEventListener('click', onBoostScrap);

    this.bannerTime = 0;
    this.stage = 1;
    this.shieldMax = 0;

    /** 지금 떠 있는 결과 화면. 증폭이 어느 줄을 고쳐야 하는지 여기서 안다. */
    this.screen = null;

    /** @type {{el: HTMLElement, from: number, to: number, time: number}[]} 굴러 오르는 숫자들 */
    this.counters = [];
  }

  // --- 상단 한 줄 ----------------------------------------------------------

  setStage(stage) {
    this.stage = stage;
  }

  /** 진행 표시는 "1-2" 한 덩어리다. 라벨은 두지 않는다. */
  setWave(wave) {
    setText(this.el.progress, `${this.stage}-${wave}`);
  }

  /** 보스전에는 웨이브 번호 대신 B를 쓴다. */
  setWaveBoss() {
    setText(this.el.progress, `${this.stage}-B`);
  }

  setScrap(count) {
    setText(this.el.scrap, count);
  }

  // --- 방어선에 붙은 체력 --------------------------------------------------

  setHp(hp, maxHp) {
    setFill(this.el.hpFill, hp / maxHp);
    setText(this.el.hpText, Math.max(Math.ceil(hp), 0));
    // 4분의 1 아래로 떨어지면 붉게 바꿔 위험을 알린다.
    this.el.hp?.classList.toggle('low', hp / maxHp <= 0.25);
  }

  // --- 보호막 -------------------------------------------------------------

  /**
   * 판을 시작할 때 가진 만큼 방패를 깔아 둔다. 퍽이 없으면 자리째 사라진다.
   * 깨진 자리는 지우지 않고 흐리게 남긴다. 칸이 움직이면 무엇이 줄었는지 읽히지 않는다.
   */
  setShields(count, max) {
    const el = this.el.shields;
    if (!el) return;

    if (max !== this.shieldMax) {
      this.shieldMax = max;
      el.innerHTML = max > 0 ? SHIELD_PIP.repeat(max) : '';
    }
    show(el, max > 0);

    const pips = el.children;
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle('spent', i >= count);
      pips[i].classList.remove('breaking');
    }
  }

  /** 방금 깨진 방패 하나가 터지듯 꺼진다. @param {number} remaining 남은 수 */
  breakShield(remaining, max) {
    this.setShields(remaining, max);

    const pip = this.el.shields?.children[remaining];
    if (!pip) return;

    void pip.offsetWidth; // 지우지 말 것. 이 한 줄이 애니메이션을 되감는다.
    pip.classList.add('breaking');
  }

  showBossHp(visible) {
    show(this.el.bossHp, visible);
  }

  setBossHp(hp, maxHp) {
    setFill(this.el.bossHpFill, hp / maxHp);
  }

  // --- 피해 연출 -----------------------------------------------------------

  /** 화면 가장자리 붉은 비네트를 한 번 번쩍인다. */
  hurtFlash() {
    const el = this.el.vignette;
    if (!el) return;

    el.classList.remove('flash');
    void el.offsetWidth; // 지우지 말 것. 이 한 줄이 애니메이션을 되감는다.
    el.classList.add('flash');
  }

  /**
   * 뚫린 자리에 피해량을 잠깐 띄운다.
   * @param {number} x 프레임 안의 px 좌표
   * @param {number} y
   * @param {number} amount 깎인 체력
   */
  damage(x, y, amount) {
    const layer = this.el.fx;
    if (!layer || amount <= 0) return;

    const el = document.createElement('span');
    el.className = 'dmg';
    el.textContent = `-${Math.round(amount)}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    // 애니메이션이 끝나면 스스로 사라진다. 탭이 뒤로 가 애니메이션이 멈춘 경우를 대비해
    // 시간 제한도 함께 걸어 둔다. 숫자가 화면에 쌓이는 일은 없어야 한다.
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 1500);
    layer.appendChild(el);
  }

  // --- 배너 ---------------------------------------------------------------

  /**
   * 화면 가운데에 잠깐 글자를 띄운다.
   * @param {string} title 큰 글자
   * @param {string} sub 아래 작은 글자. 비우면 줄이 사라진다.
   * @param {number} time 표시 시간(초)
   * @param {boolean} danger 보스 경고처럼 붉게 깜빡일지
   */
  banner(title, sub, time, danger = false) {
    setText(this.el.bannerTitle, title);
    setText(this.el.bannerSub, sub);
    show(this.el.bannerSub, sub !== '');
    this.el.banner?.classList.toggle('danger', danger);
    show(this.el.banner, true);
    this.bannerTime = time;
  }

  hideBanner() {
    this.bannerTime = 0;
    show(this.el.banner, false);
  }

  // --- 결과 화면 -----------------------------------------------------------

  /** @param {boolean} canBoost 광고 3배 버튼을 보일지 */
  showStageClear({ stage, scrap, total, canBoost }) {
    this.#resetCounters();
    setText(this.el.clearStage, stage);
    setText(this.el.clearScrap, scrap);
    setText(this.el.clearTotal, total);

    this.el.clearScrapRow?.classList.remove('boosted');
    show(this.el.clearAdRow, canBoost);

    this.screen = 'clear';
    show(this.el.stageClear, true);
  }

  /**
   * @param {boolean} canRevive 광고 부활 버튼을 보일지(런당 한 번)
   * @param {boolean} canBoost 광고 3배 버튼을 보일지
   */
  showGameOver({ stage, wave, isBoss, scrap, total, bestStage, bestWave, canRevive, canBoost }) {
    const reach = isBoss ? `${stage}-B` : `${stage}-${wave}`;
    const best = bestStage > 0 ? `${bestStage}-${bestWave}` : '-';

    this.#resetCounters();
    setText(this.el.overReach, reach);
    setText(this.el.overScrap, scrap);
    setText(this.el.overTotal, total);
    setText(this.el.overBest, best);

    this.el.overScrapRow?.classList.remove('boosted');
    show(this.el.adRevive, canRevive);
    show(this.el.adOverScrap, canBoost);
    show(this.el.overAdRow, canRevive || canBoost);

    this.screen = 'over';
    show(this.el.gameOver, true);
  }

  /**
   * 광고 3배가 들어왔다. 획득과 누적이 굴러 올라가고, 그 버튼은 자리를 뜬다.
   * 값 자체는 이미 game.js가 더하고 저장했다. 여기서는 보여 주기만 한다.
   *
   * @param {number} scrap 3배가 된 획득
   * @param {number} total 차액이 더해진 누적
   * @param {number} time 굴러 오르는 시간(초)
   */
  boostScrap(scrap, total, time) {
    const clear = this.screen === 'clear';
    const scrapEl = clear ? this.el.clearScrap : this.el.overScrap;
    const totalEl = clear ? this.el.clearTotal : this.el.overTotal;
    const row = clear ? this.el.clearScrapRow : this.el.overScrapRow;

    this.#countUp(scrapEl, scrap, time);
    this.#countUp(totalEl, total, time);
    row?.classList.add('boosted');

    // 한 화면에 한 번뿐이다. 다 쓴 버튼은 남겨 두지 않는다.
    if (clear) {
      show(this.el.clearAdRow, false);
    } else {
      show(this.el.adOverScrap, false);
      show(this.el.overAdRow, !this.el.adRevive?.classList.contains('hidden'));
    }
  }

  hideScreens() {
    this.#resetCounters();
    this.screen = null;
    show(this.el.stageClear, false);
    show(this.el.gameOver, false);
  }

  // --- 굴러 오르는 숫자 -----------------------------------------------------

  /** 지금 적힌 값에서 목표까지 숫자를 굴린다. */
  #countUp(el, to, time) {
    if (!el) return;

    const from = Number(el.textContent) || 0;
    if (to === from || time <= 0) {
      setText(el, to);
      return;
    }

    this.counters.push({ el, from, to, time: 0, span: time });
  }

  /** 화면이 바뀌면 굴리던 숫자는 그 자리에서 걷는다. */
  #resetCounters() {
    this.counters.length = 0;
  }

  /** 배너 타이머와 굴러 오르는 숫자를 돌린다. 히트스톱과 무관해야 하므로 실제 dt를 받는다. */
  update(dt) {
    if (this.bannerTime > 0) {
      this.bannerTime -= dt;
      if (this.bannerTime <= 0) this.hideBanner();
    }

    for (let i = this.counters.length - 1; i >= 0; i--) {
      const c = this.counters[i];
      c.time += dt;

      const t = Math.min(c.time / c.span, 1);
      // 처음에 빠르고 끝에서 잦아든다. 숫자가 착 붙는 느낌을 준다.
      const eased = 1 - (1 - t) * (1 - t);
      setText(c.el, Math.round(c.from + (c.to - c.from) * eased));

      if (t >= 1) this.counters.splice(i, 1);
    }
  }
}
