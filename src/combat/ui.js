// HTML 오버레이 조작. 캔버스 위에 얹힌 HUD와 결과 화면을 여닫는 일만 한다.
// 마크업과 모양은 index.html에 있고, 여기서는 값과 표시 여부만 갈아 끼운다.
// 게임 규칙은 전혀 모른다. game.js가 시키는 대로 그린다.

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
      stage: $('stage-label'),
      wave: $('wave-label'),
      scrap: $('scrap-count'),

      hp: $('player-hp'),
      hpFill: $('player-hp-fill'),
      hpText: $('player-hp-text'),

      bossHp: $('boss-hp'),
      bossHpFill: $('boss-hp-fill'),

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
  }

  setStage(stage) {
    setText(this.el.stage, `STAGE ${stage}`);
  }

  setWave(wave, total) {
    setText(this.el.wave, `WAVE ${wave} / ${total}`);
  }

  /** 보스전에는 웨이브 번호 대신 BOSS를 띄운다. */
  setWaveBoss() {
    setText(this.el.wave, 'BOSS');
  }

  setScrap(count) {
    setText(this.el.scrap, count);
  }

  setHp(hp, maxHp) {
    const shown = Math.max(Math.ceil(hp), 0);
    setFill(this.el.hpFill, hp / maxHp);
    setText(this.el.hpText, `${shown}/${maxHp}`);
    // 체력이 4분의 1 아래로 떨어지면 바 색을 붉게 바꿔 위험을 알린다.
    this.el.hp?.classList.toggle('low', hp / maxHp <= 0.25);
  }

  showBossHp(visible) {
    show(this.el.bossHp, visible);
  }

  setBossHp(hp, maxHp) {
    setFill(this.el.bossHpFill, hp / maxHp);
  }

  /**
   * 화면 가운데에 잠깐 글자를 띄운다.
   * @param {string} title 큰 글자
   * @param {string} sub 아래 작은 글자
   * @param {number} time 표시 시간(초)
   * @param {boolean} danger 보스 경고처럼 붉게 깜빡일지
   */
  banner(title, sub, time, danger = false) {
    setText(this.el.bannerTitle, title);
    setText(this.el.bannerSub, sub);
    this.el.banner?.classList.toggle('danger', danger);
    show(this.el.banner, true);
    this.bannerTime = time;
  }

  hideBanner() {
    this.bannerTime = 0;
    show(this.el.banner, false);
  }

  showStageClear({ stage, scrap, total }) {
    setText(this.el.clearStage, stage);
    setText(this.el.clearScrap, scrap);
    setText(this.el.clearTotal, total);
    show(this.el.stageClear, true);
  }

  showGameOver({ stage, wave, isBoss, scrap, total, bestStage, bestWave }) {
    const reach = isBoss ? `STAGE ${stage} · BOSS` : `STAGE ${stage} · WAVE ${wave}`;
    const best = bestStage > 0 ? `STAGE ${bestStage} · WAVE ${bestWave}` : '-';

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
