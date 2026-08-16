import { ADS } from './tuning.js';

// 보상형 광고.
//
// 광고 호출은 전부 이 파일 하나를 지난다. 게임 쪽은 어떤 광고망을 쓰는지 모른다.
// `showRewarded(placement)`를 부르고, 끝난 뒤 'completed'인지 'aborted'인지만 본다.
// 그래서 광고망을 갈아 끼워도 게임 코드는 한 줄도 바뀌지 않는다.
//
// ## 지금 들어 있는 것
//
// 가짜 광고다. 화면을 덮고 3초를 센 뒤 [보상 받기]를 연다. 그 전에는 [닫기]뿐이고,
// 닫으면 'aborted'가 나가 보상이 없다. 루프가 도는지만 확인하려는 장치다.
//
// 이 화면의 마크업과 스타일을 index.html이 아니라 여기 둔 것은 일부러다.
// 가짜 제공자만의 비계라서, 실제 SDK로 갈아 끼우는 날 이 파일과 함께 사라져야 한다.
// (관리자 패널 dev-panel.js와 같은 이유다.)
//
// ## 갈아 끼우는 자리
//
// 포털(Poki·CrazyGames 등)에 입점하면 아래 RealAdProvider 주석대로 클래스를 하나 더 만들고,
// 파일 맨 아래 `export const ads = ...` 한 줄만 바꾼다. 그 밖에 손댈 곳은 없다.
// placement 문자열('revive' | 'triple' | 'levelup')을 함께 받아 두는 것도 그때를 위해서다.
// 포털 SDK는 대개 광고 자리 이름별로 노출·완료를 집계한다.

/** 광고가 끝난 뒤의 결과. 게임 쪽은 이 둘만 본다. */
export const AD_RESULT = {
  COMPLETED: 'completed', // 끝까지 봤다. 보상을 준다.
  ABORTED: 'aborted', // 중간에 닫았거나 띄우지 못했다. 보상은 없다.
};

/** 카운트다운 링의 반지름(px). 둘레를 dasharray로 쓴다. */
const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const STYLE = `
#ad-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  background: rgba(2, 3, 8, 0.94);
  backdrop-filter: blur(4px);
}

#ad-overlay.hidden { display: none; }

/* 광고임을 알리는 라벨. 게임 UI의 강조색을 쓰지 않는다. */
#ad-overlay .ad-label {
  position: absolute;
  top: 18px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: var(--track-wide);
  color: rgba(190, 210, 232, 0.42);
}

#ad-overlay .ad-ring {
  position: relative;
  width: 64px;
  height: 64px;
}

#ad-overlay .ad-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

#ad-overlay .ad-ring circle {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
}

#ad-overlay .ad-ring .track { stroke: rgba(255, 255, 255, 0.1); }

#ad-overlay .ad-ring .bar {
  stroke: var(--ad);
  stroke-dasharray: ${RING_LENGTH};
  filter: drop-shadow(0 0 6px var(--ad-line));
}

#ad-overlay .ad-count {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  color: var(--ad);
}

#ad-overlay button {
  min-width: 148px;
  padding: 12px 18px;
  border: 0;
  border-radius: var(--r-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
}

/* 아직 못 받는다: 닫기만 있다. */
#ad-overlay .ad-close {
  color: var(--text-dim);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--hairline);
}

/* 다 봤다: 보상 버튼이 켜진다. 이 화면에서 눌러야 할 것은 이것 하나다. */
#ad-overlay .ad-claim {
  color: #1b0733;
  background: var(--ad);
  box-shadow: 0 6px 20px var(--ad-soft);
}

#ad-overlay button:active { transform: translateY(1px); }
`;

/**
 * 가짜 광고 제공자.
 * 실제 광고 대신 카운트다운 화면을 띄운다. 인터페이스는 실제 SDK와 같다.
 */
class FakeAdProvider {
  constructor() {
    /** 관리자 패널이 켜는 즉시 완료. 카운트다운을 0초로 만든다. */
    this.instant = false;

    this.root = null;
    this.settle = null; // 지금 열려 있는 광고를 끝내는 함수
    this.timer = 0;
    this.tick = 0;
  }

  /**
   * 보상형 광고를 띄운다.
   * @param {'revive'|'triple'|'levelup'} placement 광고 자리 이름. 지금은 기록만 남긴다.
   * @returns {Promise<'completed'|'aborted'>}
   */
  showRewarded(placement) {
    // 이미 하나가 떠 있으면 겹쳐 띄우지 않는다. 실제 SDK도 같은 규칙이다.
    if (this.settle) return Promise.resolve(AD_RESULT.ABORTED);

    this.#build();
    this.placement = placement;

    return new Promise((resolve) => {
      this.settle = (result) => {
        this.#cleanup();
        resolve(result);
      };
      this.#start();
    });
  }

  // --- 화면 -----------------------------------------------------------------

  /** 처음 한 번만 만든다. 이후에는 감췄다 다시 꺼낸다. */
  #build() {
    if (this.root) return;

    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'ad-overlay';
    root.className = 'hidden';
    root.innerHTML =
      '<span class="ad-label">광고</span>' +
      '<span class="ad-ring">' +
      '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      `<circle class="track" cx="32" cy="32" r="${RING_RADIUS}"></circle>` +
      `<circle class="bar" cx="32" cy="32" r="${RING_RADIUS}"></circle>` +
      '</svg>' +
      '<span class="ad-count"></span>' +
      '</span>' +
      '<button class="ad-close" type="button">닫기</button>';

    document.body.appendChild(root);

    this.root = root;
    this.el = {
      bar: root.querySelector('.bar'),
      count: root.querySelector('.ad-count'),
      button: root.querySelector('button'),
    };

    this.el.button.addEventListener('click', () => {
      // 버튼 하나가 두 얼굴을 한다. 다 봤으면 보상, 아직이면 닫기.
      this.settle?.(this.done ? AD_RESULT.COMPLETED : AD_RESULT.ABORTED);
    });
  }

  /**
   * 카운트다운을 건다.
   *
   * 시간은 rAF가 아니라 Date.now()와 setTimeout으로 센다. 탭이 뒤로 가면
   * requestAnimationFrame이 멈춰 광고가 영영 끝나지 않기 때문이다.
   */
  #start() {
    const seconds = this.instant ? 0 : ADS.COUNTDOWN;
    const until = Date.now() + seconds * 1000;

    this.done = false;
    this.root.classList.remove('hidden');

    // 링을 되감았다가 채운다. transition을 걸기 전에 한 번 재계산시켜야 처음부터 돈다.
    const bar = this.el.bar;
    bar.style.transition = 'none';
    bar.style.strokeDashoffset = String(RING_LENGTH);
    void bar.getBoundingClientRect(); // SVG에는 offsetWidth가 없다. 되감기는 이 줄이 맡는다.
    bar.style.transition = `stroke-dashoffset ${seconds}s linear`;
    bar.style.strokeDashoffset = '0';

    const paint = () => {
      const left = Math.max(Math.ceil((until - Date.now()) / 1000), 0);
      this.el.count.textContent = left > 0 ? String(left) : '';
    };
    paint();

    if (seconds <= 0) {
      this.#complete();
      return;
    }

    this.tick = setInterval(paint, 200);
    this.timer = setTimeout(() => this.#complete(), seconds * 1000);
  }

  /** 다 셌다. 이제 버튼이 보상 버튼으로 바뀐다. */
  #complete() {
    this.done = true;
    clearInterval(this.tick);

    this.el.count.textContent = '';
    this.el.button.textContent = '보상 받기';
    this.el.button.classList.remove('ad-close');
    this.el.button.classList.add('ad-claim');
  }

  /** 다음 광고를 위해 화면과 타이머를 처음 모습으로 되돌린다. */
  #cleanup() {
    clearTimeout(this.timer);
    clearInterval(this.tick);

    this.settle = null;
    this.done = false;

    this.root.classList.add('hidden');
    this.el.button.textContent = '닫기';
    this.el.button.classList.add('ad-close');
    this.el.button.classList.remove('ad-claim');
  }
}

// 실제 SDK를 붙이는 날의 모양:
//
// class RealAdProvider {
//   showRewarded(placement) {
//     return sdk.rewardedBreak(placement)
//       .then(() => AD_RESULT.COMPLETED)
//       .catch(() => AD_RESULT.ABORTED);
//   }
// }
//
// 그리고 아래 한 줄만 갈아 끼운다. 게임 쪽은 그대로다.

/** 게임 전체가 쓰는 광고 제공자. 갈아 끼우는 자리는 여기 한 곳이다. */
export const ads = new FakeAdProvider();
