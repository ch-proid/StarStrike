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

export class HUD {
  /**
   * @param {{onNextStage: () => void, onRetry: () => void}} handlers
   */
  constructor({ onNextStage, onRetry }) {
    this.el = {
      progress: $('progress'),
      scrap: $('scrap-count'),

      hp: $('line-hp'),
      hpFill: $('hp-fill'),
      hpText: $('hp-text'),

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
      clearTotal: $('clear-total'),

      gameOver: $('screen-game-over'),
      overReach: $('over-reach'),
      overScrap: $('over-scrap'),
      overTotal: $('over-total'),
      overBest: $('over-best'),
    };

    $('btn-next-stage')?.addEventListener('click', onNextStage);
    $('btn-retry')?.addEventListener('click', onRetry);

    this.bannerTime = 0;
    this.stage = 1;
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

  showStageClear({ stage, scrap, total }) {
    setText(this.el.clearStage, stage);
    setText(this.el.clearScrap, scrap);
    setText(this.el.clearTotal, total);
    show(this.el.stageClear, true);
  }

  showGameOver({ stage, wave, isBoss, scrap, total, bestStage, bestWave }) {
    const reach = isBoss ? `${stage}-B` : `${stage}-${wave}`;
    const best = bestStage > 0 ? `${bestStage}-${bestWave}` : '-';

    setText(this.el.overReach, reach);
    setText(this.el.overScrap, scrap);
    setText(this.el.overTotal, total);
    setText(this.el.overBest, best);
    show(this.el.gameOver, true);
  }

  hideScreens() {
    show(this.el.stageClear, false);
    show(this.el.gameOver, false);
  }

  /** 배너 타이머만 돌린다. 히트스톱과 무관해야 하므로 실제 dt를 받는다. */
  update(dt) {
    if (this.bannerTime <= 0) return;

    this.bannerTime -= dt;
    if (this.bannerTime <= 0) this.hideBanner();
  }
}
