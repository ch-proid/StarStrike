// 관리자 패널: 손으로 검증할 때 판을 빨리 돌리기 위한 도구.
//
// 주소에 `?dev`가 붙었을 때만 열린다. 그 밖에는 이 파일이 아예 불려 오지 않는다
// (main.js가 동적 import로 부른다). 그래서 평상시에는 DOM에도 없고 실행되지도 않는다.
//
// 게임 속을 직접 헤집지 않는다. game.js가 열어 둔 devApi 하나만 쓴다.
// 여기 없는 것은 패널도 만질 수 없다.
//
// 모양은 눈에 띄지 않는 회색조다. 게임 UI의 강조색(시안·초록·붉은색)은 쓰지 않는다.
// 패널이 게임처럼 보이면 화면을 읽을 때 방해가 되기 때문이다.

const STYLE = `
#dev-toggle {
  position: fixed;
  top: 50%;
  right: 0;
  z-index: 60;
  width: 26px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: var(--r-sm) 0 0 var(--r-sm);
  font-family: inherit;
  font-size: 14px;
  line-height: 1;
  color: rgba(220, 235, 250, 0.55);
  background: rgba(18, 24, 36, 0.72);
  box-shadow: inset 0 0 0 1px rgba(150, 195, 235, 0.16);
  cursor: pointer;
}

#dev-panel {
  position: fixed;
  top: 50%;
  right: 28px;
  z-index: 60;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 148px;
  padding: 7px;
  border-radius: var(--r-sm);
  background: rgba(12, 17, 27, 0.9);
  box-shadow: inset 0 0 0 1px rgba(150, 195, 235, 0.18);
  backdrop-filter: blur(2px);
}

#dev-panel.hidden { display: none; }

#dev-panel .dev-head {
  padding: 1px 3px 4px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: var(--track-wide);
  color: rgba(190, 210, 232, 0.4);
}

#dev-panel button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 7px;
  border: 0;
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-align: left;
  color: rgba(224, 236, 250, 0.82);
  background: rgba(255, 255, 255, 0.055);
  cursor: pointer;
}

#dev-panel button:active { transform: translateY(1px); }

#dev-panel button > i {
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  color: rgba(190, 210, 232, 0.45);
}

/* 켜진 토글만 밝아진다. 색이 아니라 밝기로 구분한다. */
#dev-panel button.on {
  color: #f2f8ff;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 0 0 1px rgba(200, 225, 250, 0.35);
}
`;

const SPEEDS = [1, 2, 4];

/**
 * 패널을 화면에 붙인다. `?dev`일 때 main.js가 한 번만 부른다.
 * @param {ReturnType<import('./game.js').Game['devApi']>} api game.js가 열어 둔 창구
 */
export function mountDevPanel(api) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'dev-panel';
  panel.className = 'hidden';
  panel.innerHTML = '<span class="dev-head">DEV</span>';

  const toggle = document.createElement('button');
  toggle.id = 'dev-toggle';
  toggle.type = 'button';
  toggle.textContent = '⚙';
  toggle.setAttribute('aria-label', '관리자 패널');
  toggle.addEventListener('click', () => panel.classList.toggle('hidden'));

  /** 버튼 한 줄. onClick이 문자열을 돌려주면 오른쪽 꼬리표에 적는다. */
  const add = (label, tail, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `<span>${label}</span><i>${tail}</i>`;
    btn.addEventListener('click', () => onClick(btn, btn.querySelector('i')));
    panel.appendChild(btn);
    return btn;
  };

  const state = api.readState();

  add('스크랩', '+1,000', () => api.addWallet(1000));
  add('누적 스크랩', '+10,000', () => api.addTotalScrap(10000));
  add('웨이브 클리어', '▸', () => api.clearWave());
  add('보스 소환', '▸', () => api.spawnBoss());
  add('스테이지', '+1', () => api.nextStage());

  add('무적', state.godMode ? 'ON' : 'OFF', (btn, tail) => {
    const on = api.toggleGodMode();
    btn.classList.toggle('on', on);
    tail.textContent = on ? 'ON' : 'OFF';
  }).classList.toggle('on', state.godMode);

  // 배속은 누를 때마다 1 → 2 → 4 → 1로 돈다. 버튼 하나로 세 상태를 다 본다.
  let speedIndex = Math.max(SPEEDS.indexOf(state.timeScale), 0);
  add('배속', `x${SPEEDS[speedIndex]}`, (btn, tail) => {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    const scale = SPEEDS[speedIndex];
    api.setTimeScale(scale);
    tail.textContent = `x${scale}`;
    btn.classList.toggle('on', scale !== 1);
  }).classList.toggle('on', SPEEDS[speedIndex] !== 1);

  add('즉시 사망', '✕', () => api.killPlayer());
  add('무기 전부 해금', '★', () => api.unlockAllTech());
  add('저장 초기화', '↺', () => {
    api.resetSave();
    location.reload();
  });

  document.body.append(toggle, panel);
}
