// 전투 튜닝 값 모음.
// 연사 속도·탄속·히트스톱·흔들림·자석 가속도 같은 "감각" 수치와
// 웨이브 구성·난이도 배수 같은 "규칙" 수치를 전부 여기서만 만진다.
// 다른 파일에는 수치를 흩어 두지 않는다.

/**
 * 자동 사격의 공통 규칙. 테크가 바뀌어도 이 배분은 그대로다.
 *
 * 위력은 머지 보드가 정한다(WEAPON 참고). 보드가 넘겨주는 "총 공격력"이 1이면
 * 테크의 기본값 그대로 나가고, 총 공격력이 오르면 초당 피해량도 정비례해 오른다.
 * 그 몫은 연사와 한 발의 무게로 나눠 갖는다. 그래야 세진 것이 눈에 보인다.
 *
 *   연사 배수    = 총 공격력 ^ FIRE_RATE_EXP  (FIRE_RATE_MAX에서 멈춤)
 *   한 발 대미지 = 테크 DAMAGE × 총 공격력 ÷ 연사 배수
 *   초당 피해량  = 테크 DAMAGE ÷ 테크 FIRE_INTERVAL × 총 공격력  (연사 배수와 무관)
 */
export const GUN = {
  FIRE_RATE_EXP: 0.18, // 연사 배수 = 총 공격력 ^ 0.18. 나머지는 한 발의 대미지로 간다.
  FIRE_RATE_MAX: 2.0, // 연사는 여기까지만. 그 위로는 탄이 굵어지는 쪽으로만 간다.

  // 탄 연출은 구간 계단이 아니라 연속 보간이다. 아래 값에서 최대치에 닿는다.
  VISUAL_POWER_MAX: 24,
  BULLET_WIDTH_MAX: 2.4, // 최대 굵기 배수
  BULLET_LENGTH_MAX: 1.7, // 최대 길이 배수

  MUZZLE_FLASH_TIME: 0.05, // 총구 화염 지속(초). 두세 프레임
  MUZZLE_FLASH_POOL: 8,
};

/**
 * 무기 테크. 격납고에서 순서대로 해금하고, 해금한 것 중 하나를 골라 장착한다.
 * 테크는 전역 설정이다. 보드의 모든 칸과 주포가 고른 테크의 형태로 바뀐다.
 * 머지 레벨 체계와 보조 화력 공식은 건드리지 않는다. 테크는 "탄의 성질"만 바꾼다.
 *
 * 배열 순서가 곧 해금 순서이자 화면 순서다.
 *
 * ## 단일 표적 초당 피해량(총 공격력 1 기준) = DAMAGE ÷ FIRE_INTERVAL
 *
 * | 테크 | 단일 DPS | 덤 |
 * | --- | --- | --- |
 * | 발칸 | 10.0 | 없음. 대신 한 표적에 가장 강하다. |
 * | 레이저 | 9.4 | 일직선상의 적을 전부 뚫는다(줄이 둘이면 18.8). |
 * | 미사일 | 9.4 | 반경 1.5 안의 다른 적에게 50% 스플래시 |
 * | 플라즈마 | 9.5 | 반경 2.2 안의 다른 적에게 55% 스플래시 |
 *
 * 넷의 단일 DPS를 나란히 맞춘 것은 일부러다. 위로 올라갈수록 세지는 것이 아니라
 * 뭉친 적에게 세지는 것이 값이다. 발칸은 보스처럼 홑몸인 표적에 여전히 가장 낫다.
 */
export const WEAPON_TECH = [
  {
    ID: 'vulcan',
    NAME: '발칸',
    COST: 0, // 처음부터 열려 있다.
    FIRE_INTERVAL: 0.1, // 총 공격력 1일 때의 발사 간격(초). 0.1 = 초당 10발
    DAMAGE: 1, // 총 공격력 1일 때 탄 한 발의 대미지
    SPEED: 26, // 탄속(월드 단위/초)
    LIFE: 0.9, // 탄 수명(초). 화면 위로 벗어날 만큼만 살려 둔다.
    POOL_SIZE: 64, // 풀 크기. 최대 연사 × 탄 수명보다 넉넉히 잡는다.
  },
  {
    ID: 'laser',
    NAME: '레이저',
    // 스테이지 4 벽에서 죽는 한 판이 대략 2,000. 두 판이면 손에 들어온다.
    COST: 2500,
    FIRE_INTERVAL: 0.085,
    DAMAGE: 0.8, // 한 발은 발칸보다 가볍다. 대신 뚫는다.
    SPEED: 40,
    LIFE: 0.62,
    POOL_SIZE: 64,
    PIERCE: true, // 한 발이 일직선상의 적을 전부 뚫는다(같은 적은 한 번만).
  },
  {
    ID: 'missile',
    NAME: '미사일',
    COST: 8000, // 예닐곱 판 거리
    FIRE_INTERVAL: 0.34, // 느리고
    DAMAGE: 3.2, // 한 발이 무겁다
    SPEED: 15, // 처음에는 느리게 나가 휘는 것이 보인다.
    LIFE: 2.2,
    POOL_SIZE: 24,
    HOMING: {
      TURN: 5.0, // 조향 속도 상한(라디안/초). 낮을수록 크게 휜다.
      ACCEL: 16, // 날면서 붙는 가속(월드 단위/초²)
      MAX_SPEED: 26,
    },
    SPLASH: { RADIUS: 1.5, RATIO: 0.5 }, // 맞은 적 둘레의 좁은 폭발
  },
  {
    ID: 'plasma',
    NAME: '플라즈마',
    COST: 25000, // 스무 판 남짓. 마지막 목표다.
    FIRE_INTERVAL: 0.2,
    DAMAGE: 1.9,
    SPEED: 19,
    LIFE: 1.3,
    POOL_SIZE: 40,
    SPLASH: { RADIUS: 2.2, RATIO: 0.55 }, // 넓게 터진다
  },
];

/**
 * 전투 평면의 경계. 적이 태어나고 사라지는 자리를 정한다.
 * 화면 아래를 머지 보드가 차지하므로, 전장은 예전보다 짧다.
 * 그만큼 적 속도(ENEMY_TYPES)도 함께 낮춰 잡아 반응할 시간을 지켰다.
 */
export const FIELD = {
  SPAWN_Y: 6.2, // 화면 위 스폰 높이. 화면 윗변(대략 5.5)보다 조금 위다.
  SPAWN_Y_JITTER: 1.8,
  SPAWN_X_RATIO: 0.85, // 화면 반폭 대비 스폰 x 범위
  DESPAWN_Y: -11, // 방어선을 지나쳐도 남아 있는 적을 거두는 안전망
  DEFENSE_LINE_Y: -6.2, // 이 선을 넘으면 플레이어가 피해를 입는다.
};

/**
 * 화면 구성. 머지 보드가 아래를 차지한 만큼 3D 전장을 위로 올린다.
 * 실제 계산은 main.js의 applyFraming()이 한다.
 *
 * 게임 전체는 세로 한 칼럼(폰 프레임) 안에서만 돈다. 렌더러와 카메라 비율도
 * 창이 아니라 이 칼럼을 기준으로 잡아, PC와 폰이 같은 구도를 보게 한다.
 */
export const VIEW = {
  BOARD_TOP_MARGIN: 1.4, // 보드 윗변과 방어선 사이에 두는 여유(월드 단위)
  BOARD_RATIO_MAX: 0.42, // 보드가 화면을 이보다 더 차지한다고 보지는 않는다(가로 화면 방어)
  FRAME_MAX_WIDTH: 500, // 폰 칼럼의 최대 폭(px). index.html의 --frame-max와 같아야 한다.
};

/**
 * 방어선 연출.
 * 전장 아래를 가로지르는 시안 띠다. 평소에는 은은히 숨 쉬고,
 * 적이 넘으면 그 자리에서 붉게 출렁인다. 보스 즉사선도 같은 선을 쓴다.
 */
export const DEFENSE = {
  COLOR: 0x5fe6ff, // 평상시 시안
  BREACH_COLOR: 0xff4a5e, // 뚫렸을 때의 붉은색

  CORE_HEIGHT: 0.09, // 밝은 심지 두께(월드 단위)
  GLOW_HEIGHT: 1.05, // 아래위로 번지는 글로우 두께
  CORE_OPACITY: 0.72,
  GLOW_OPACITY: 0.22,

  BREATH_PERIOD: 2.6, // 숨 쉬듯 밝기가 오르내리는 주기(초)
  BREATH_DEPTH: 0.22, // 그 진폭(0~1)

  BREACH_TIME: 0.5, // 붉게 물들었다 돌아오는 시간(초)
  WOBBLE_AMP: 0.26, // 뚫린 순간 선이 위아래로 출렁이는 폭
  WOBBLE_FREQ: 30, // 출렁임 주기(라디안/초)

  RIPPLE_SIZE: 3.2, // 뚫린 자리에 번지는 붉은 빛무리 크기
  RIPPLE_TIME: 0.42,
  RIPPLE_POOL: 8,
};

/**
 * 자동 조준.
 *
 * 플레이어는 전장을 만지지 않는다. 기체가 스스로 표적을 고르고 그 밑으로 간다.
 * 표적은 "방어선에 가장 가까운 적"이 먼저다. 놓치면 아프기 때문이다.
 * 표적이 자주 바뀌면 기체가 갈팡질팡하므로, 새 표적이 SWITCH_MARGIN만큼
 * 더 급할 때만 갈아탄다.
 */
export const AIM = {
  MOVE_SPEED: 11, // 목표 x로 따라붙는 감쇠 계수(클수록 빠르다)
  MAX_ROLL: 0.42, // 따라갈 때 기우는 최대 각도(라디안)
  ROLL_GAIN: 0.32, // 이동 속도 대비 기울기

  SWITCH_MARGIN: 1.2, // 새 표적이 이만큼 더 아래에 있어야 갈아탄다(월드 단위)
  LEAD_TIME_MAX: 0.4, // 흔들리는 적을 앞질러 겨누는 시간 상한(초)
  DEAD_ZONE: 0.05, // 이보다 가까우면 다 맞춘 것으로 보고 멈춘다.
};

/** 적 공통 연출 */
export const ENEMY = {
  FLASH_TIME: 0.045, // 흰색 번쩍임 지속(초). 두세 프레임
};

/**
 * 적 종류별 기본값.
 * HP·수는 스테이지 배수(STAGE)가 곱해져 커진다.
 *   - INTERCEPTOR: 약하고 빠른 다수. 웨이브의 뼈대다.
 *   - GUNSHIP: 느리고 단단한 중형. 놓치면 방어선 피해가 크다.
 *   - SAUCER: 좌우로 흔들리며 내려와 조준을 어렵게 한다.
 *
 * POOL_SIZE는 종류마다 WAVE.ALIVE_MAX보다 크게 잡는다.
 * 그래야 웨이브가 한 종류로 몰려도 스폰이 빈손으로 돌아오지 않는다.
 */
export const ENEMY_TYPES = {
  INTERCEPTOR: {
    HP: 3, // 총 공격력 1(레벨 1 무기 하나)일 때 세 발
    SPEED_MIN: 1.6,
    SPEED_MAX: 2.6,
    HIT_RADIUS: 0.62,
    POOL_SIZE: 20,
    SCRAP_MIN: 2,
    SCRAP_MAX: 3,
    BREACH_DAMAGE: 6, // 방어선 통과 피해
    CRASH_DAMAGE: 10, // 기체 충돌 피해
    SWAY_AMP: 0,
    SWAY_FREQ: 0,
    SPIN: 0,
  },
  GUNSHIP: {
    HP: 12,
    SPEED_MIN: 0.85,
    SPEED_MAX: 1.3,
    HIT_RADIUS: 1.0,
    POOL_SIZE: 16,
    SCRAP_MIN: 5,
    SCRAP_MAX: 7,
    BREACH_DAMAGE: 16,
    CRASH_DAMAGE: 22,
    SWAY_AMP: 0,
    SWAY_FREQ: 0,
    SPIN: 0,
  },
  SAUCER: {
    HP: 6,
    SPEED_MIN: 1.2,
    SPEED_MAX: 1.7,
    HIT_RADIUS: 1.05,
    POOL_SIZE: 16,
    SCRAP_MIN: 3,
    SCRAP_MAX: 5,
    BREACH_DAMAGE: 10,
    CRASH_DAMAGE: 14,
    SWAY_AMP: 2.4, // 좌우 흔들림 폭(월드 단위)
    SWAY_FREQ: 1.5, // 흔들림 속도(라디안/초)
    SPIN: 1.1, // 제자리 회전(라디안/초)
  },
};

/**
 * 웨이브 구성표.
 * 배열 한 칸이 웨이브 하나다. 값은 스테이지 1 기준 적 수이고,
 * 스테이지가 오르면 STAGE.COUNT_PER_STAGE 만큼 불어난다.
 *
 * 첫 두 웨이브를 두껍게 잡은 것은 페이싱 때문이다.
 * 시작 5초 안에 첫 처치, 15초 안에 첫 구매가 되려면 초반부터 적이 끊이지 않아야 한다.
 * 스테이지 1 전체는 90~120초를 노린다.
 */
export const WAVE_TABLE = [
  { INTERCEPTOR: 8 },
  { INTERCEPTOR: 10 },
  { INTERCEPTOR: 9, SAUCER: 2 },
  { INTERCEPTOR: 10, SAUCER: 3 },
  { INTERCEPTOR: 8, GUNSHIP: 2 },
  { INTERCEPTOR: 10, SAUCER: 4 },
  { INTERCEPTOR: 9, GUNSHIP: 2, SAUCER: 3 },
  { INTERCEPTOR: 11, GUNSHIP: 3 },
  { INTERCEPTOR: 10, GUNSHIP: 2, SAUCER: 5 },
  { INTERCEPTOR: 12, GUNSHIP: 4, SAUCER: 4 },
];

/** 웨이브 진행 규칙 */
export const WAVE = {
  SPAWN_INTERVAL: 0.42, // 웨이브 안에서 한 기씩 내보내는 간격(초)
  SPAWN_INTERVAL_MIN: 0.12, // 스테이지가 올라도 이보다 촘촘해지지는 않는다.
  ALIVE_MAX: 16, // 동시 생존 상한. 넘으면 스폰을 미룬다.

  REST_TIME: 0.55, // 웨이브를 비우고 다음 웨이브까지 쉬는 시간(초)
  INTRO_TIME: 0.7, // 웨이브 배너를 띄우는 시간(초)
};

/** 스테이지 난이도 배수 */
export const STAGE = {
  WAVES_PER_STAGE: WAVE_TABLE.length, // 스테이지 하나 = 웨이브 10개 + 보스

  HP_PER_STAGE: 0.4, // 적 HP 배수 = 1 + 0.4 × (스테이지 - 1)
  COUNT_PER_STAGE: 0.15, // 적 수 배수 = 1 + 0.15 × (스테이지 - 1)
  SPEED_PER_STAGE: 0.05, // 적 속도 배수 = 1 + 0.05 × (스테이지 - 1)
  SPAWN_INTERVAL_PER_STAGE: 0.92, // 스폰 간격 배수 = 0.92 ^ (스테이지 - 1)
  SCRAP_PER_STAGE: 0.2, // 스크랩 배수 = 1 + 0.2 × (스테이지 - 1)
};

/** 플레이어 기체 */
export const PLAYER = {
  MAX_HP: 100,
  STAGE_CLEAR_HEAL: 30, // 스테이지를 넘길 때 돌려받는 체력. 온전히 낫지는 않는다.
  HIT_RADIUS: 0.9, // 적과의 충돌 판정 반지름

  INVULN_TIME: 0.9, // 피격 후 무적 시간(초)
  BLINK_INTERVAL: 0.09, // 무적 동안 깜빡이는 주기(초)
  HURT_FLASH_TIME: 0.12, // 붉게 번쩍이는 시간(초)
  HURT_FLASH_COLOR: 0xff3b3b,

  // 합성으로 주포가 세지는 순간의 파워업 플래시. 수치 보너스를 몸으로 느끼게 하는 장치다.
  POWER_FLASH_TIME: 0.2, // 기체가 푸르게 번쩍이는 시간(초)
  POWER_FLASH_COLOR: 0x9fe8ff,
  POWER_POP: 0.16, // 번쩍이는 동안 커지는 비율
  POWER_BURST_SIZE: 3.4, // 기체 둘레에서 터지는 빛무리 크기
  POWER_BURST_TIME: 0.26,
  POWER_SHAKE_STRENGTH: 0.22,
  POWER_SHAKE_TIME: 0.18,

  HURT_SHAKE_STRENGTH: 0.55, // 피격 시 화면 흔들림
  HURT_SHAKE_TIME: 0.3,
  HURT_STOP_TIME: 0.06, // 피격 히트스톱

  DEATH_DEBRIS_BURSTS: 4, // 사망 폭발의 파편 버스트 횟수
  DEATH_SHAKE_STRENGTH: 1.2,
  DEATH_SHAKE_TIME: 0.8,
  DEATH_TIME: 1.5, // 폭발 연출부터 결과 화면까지의 시간(초)
};

/** 보스 정거장(스테이지 끝의 타임어택) */
export const BOSS = {
  SCALE: 0.9, // 전투 평면에 맞춘 크기(반지름 3.4 단위쯤)
  HIT_RADIUS: 3.2,

  // 스테이지 1 기준 HP. 보드를 알뜰히 키우면 스테이지 1 끝에서 총 공격력 3쯤(초당 30)이 되고,
  // 그 화력으로 15초쯤 걸린다. 보스가 내려오는 27초 안에 잡으려면 보드를 키워야 한다.
  // 이 수치가 "무기를 사야 하는 이유"를 정하는 손잡이다.
  BASE_HP: 560,
  HP_PER_STAGE: 0.45, // HP 배수 = 1 + 0.45 × (스테이지 - 1)

  SPAWN_Y: 8.2, // 화면 밖 위쪽에서 등장
  DESCEND_SPEED: 0.3, // 아주 천천히 내려온다(월드 단위/초). 방어선까지 27초쯤.
  DESCEND_SPEED_PER_STAGE: 0.04, // 스테이지마다 조금씩 빨라진다.
  KILL_LINE_Y: 0.2, // 보스 중심이 이 아래로 오면(=아랫단이 기체에 닿으면) 즉사
  SPIN: 0.35, // 고리 회전(라디안/초)

  WARNING_TIME: 2.0, // "WARNING" 경고 연출 시간(초)

  // 피격 불꽃: 몸통 전체를 번쩍이면 초당 열 발을 맞는 동안 하얀 덩어리로 보인다.
  // 그래서 맞은 자리에 작은 불꽃만 튀긴다.
  IMPACT_SIZE: 1.5,
  IMPACT_TIME: 0.12, // 불꽃 지속(초)
  IMPACT_POOL: 12,

  HIT_SHAKE_STRENGTH: 0.07, // 보스를 때릴 때의 잔잔한 흔들림
  HIT_SHAKE_TIME: 0.08,

  SCRAP_DROP: 40, // 처치 보상 스크랩 조각 수
  SCRAP_PER_STAGE: 0.25, // 보상 배수 = 1 + 0.25 × (스테이지 - 1)

  DEATH_TIME: 1.8, // 다단 폭발 연출 길이(초)
  DEATH_BURSTS: 9, // 폭발 횟수
  DEATH_BURST_RADIUS: 2.6, // 폭발이 흩어지는 반경
  DEATH_STOP_TIME: 0.18, // 처치 순간의 강한 히트스톱
  DEATH_SHAKE_STRENGTH: 1.4,
  DEATH_SHAKE_TIME: 1.2,
};

/** 처치 순간의 타격 연출 */
export const HIT = {
  STOP_TIME: 0.05, // 히트스톱: 게임 시간 정지(초)
  SHAKE_STRENGTH: 0.3, // 화면 흔들림 세기
  SHAKE_TIME: 0.22, // 화면 흔들림 지속(초)
};

/** 파괴 파편 */
export const DEBRIS = {
  POOL_SIZE: 160,
  PER_KILL: 14, // 한 번 터질 때 파편 수
  SPEED_MIN: 3,
  SPEED_MAX: 9.5,
  DRAG: 3.2, // 감속 계수(클수록 빨리 멎는다)
  LIFE_MIN: 0.22,
  LIFE_MAX: 0.46,
  SIZE: 0.45, // 파편 스프라이트 크기
  COLOR_WARM: 0xffab48, // 주황
  COLOR_COOL: 0x7fe9ff, // 시안
};

/** 스크랩(처치 보상) */
export const SCRAP = {
  POOL_SIZE: 96,

  SCATTER_SPEED: 3.6, // 처음 흩어지는 속도
  SCATTER_TIME: 0.16, // 흩어지는 시간(초). 지나면 곧장 기체로 날아온다.
  SCATTER_DRAG: 5.0,

  // 자석에는 반경이 없다. 어디서 떨어지든 전부 기체로 온다.
  // 가속만 주면 접선 속도가 남아 조각이 기체 둘레를 맴돈다. 그래서 가속이 아니라
  // "가고 싶은 속도"로 방향째 끌어당긴다. 그러면 반드시 수렴한다.
  MAGNET_SPEED: 15, // 기체 쪽으로 향하는 기준 속도
  MAGNET_SPEED_GAIN: 1.4, // 멀수록 빨라진다: 속도 = MAGNET_SPEED + 거리 × 이 값
  MAGNET_MAX_SPEED: 34,
  MAGNET_TURN: 9, // 지금 속도를 목표 속도로 꺾는 세기(클수록 곧게 온다)
  PICKUP_RADIUS: 0.7, // 흡수 판정 반지름

  SIZE: 0.38,
  COLOR: 0x9dff9a,
  ABSORB_FLASH_TIME: 0.12, // 흡수 시 작은 플래시 지속(초)
};

/** 머지 보드의 크기. 칸 수를 바꾸면 그리드 모양도 따라 바뀐다. */
export const BOARD = {
  COLS: 4,
  ROWS: 3,
};

/**
 * 무기의 레벨 체계. 어떤 테크를 골라도 이 공식은 그대로다(WEAPON_TECH 참고).
 *
 * 보드에서 가장 레벨이 높은 무기 하나가 주포로 장착된다.
 * 나머지 무기들의 합산 공격력 중 SUPPORT_RATIO 만큼이 보조 화력으로 주포에 더해진다.
 * 보조 화력은 따로 탄이 나가지 않는 수치 보너스지만, 주포의 굵기·연사·색으로 체감시킨다.
 *
 *   총 공격력 = 주포 공격력 + (나머지 합산 공격력 × SUPPORT_RATIO)
 *   무기 공격력 = BASE_POWER × POWER_PER_LEVEL ^ (레벨 - 1)
 */
export const WEAPON = {
  MAX_LEVEL: 12, // 여기까지 합성된다. 그 위로는 합성 대신 자리 맞바꿈.
  BASE_POWER: 1, // 레벨 1 무기 하나 = 총 공격력 1 = 예전의 발칸 그대로
  POWER_PER_LEVEL: 1.6,
  SUPPORT_RATIO: 0.25,
  MIN_POWER: 0.35, // 보드를 다 비워도 기체에 달린 예비 발칸은 남는다.

  START_LEVEL: 1, // 판을 시작할 때 공짜로 주는 무기 레벨. 주포가 비는 일을 막는다.

  // 첫 무기는 싸다. 시작 15초 안에 한 번은 사 봐야 보드가 무엇인지 알게 된다.
  BUY_COST: 18, // 첫 구매 가격(스크랩)
  BUY_COST_GROWTH: 1.28, // 살 때마다 곱해지는 배수. 한 판 안에서만 누적된다.
  REFUND_BASE: 8, // 레벨 1 분해 환급
  REFUND_PER_LEVEL: 1.9, // 환급 = REFUND_BASE × 1.9 ^ (레벨 - 1)
};

/**
 * 아웃게임 퍽(격납고).
 *
 * 죽으면 격납고가 열리고, 누적 스크랩으로 영구 성장을 산다.
 * 배열 순서가 곧 화면에 놓이는 순서다.
 *
 *   가격(레벨 n → n+1) = COST_BASE × COST_GROWTH ^ n   (10 단위로 반올림)
 *
 * 가격 곡선의 기준은 실제 수입이다. 스테이지 1을 온전히 돌면 스크랩 400 언저리가 들어온다.
 * 그래서 첫 판이 끝나면 싼 퍽 두세 개의 1레벨을 살 수 있고,
 * 스테이지 3에서 두세 번 죽으며 3000쯤 모으면 주요 퍽을 2~3레벨 올려 벽을 넘게 된다.
 *
 * 최대 레벨이 퍽마다 다른 것은 효과의 무게가 다르기 때문이다.
 * 공격력·장갑은 조금씩 오래 오르고, 보호막·시작 무기·정예 보급은 한 레벨이 크게 바뀐다.
 */
export const PERKS = [
  {
    ID: 'power',
    NAME: '공격력',
    MAX_LEVEL: 10,
    PER_LEVEL: 0.1, // 주포 최종 공격력 배수 = 1.1 ^ 레벨 (곱연산)
    COST_BASE: 150,
    COST_GROWTH: 1.5,
  },
  {
    ID: 'armor',
    NAME: '장갑',
    MAX_LEVEL: 10,
    PER_LEVEL: 15, // 최대 체력 +15
    COST_BASE: 100,
    COST_GROWTH: 1.45,
  },
  {
    ID: 'shield',
    NAME: '보호막',
    MAX_LEVEL: 5,
    PER_LEVEL: 1, // 판을 시작할 때 받는 1회용 보호막 수
    COST_BASE: 300,
    COST_GROWTH: 2.0,
  },
  {
    ID: 'start',
    NAME: '시작 무기',
    MAX_LEVEL: 5,
    PER_LEVEL: 1, // 공짜로 받는 무기 레벨 +1
    COST_BASE: 400,
    COST_GROWTH: 2.4,
  },
  {
    ID: 'elite',
    NAME: '정예 보급',
    MAX_LEVEL: 5,
    PER_LEVEL: 0.08, // 무기를 살 때 한 단계 위가 나올 확률 +8%p
    COST_BASE: 200,
    COST_GROWTH: 1.8,
  },
];

/**
 * 보호막이 깨지는 순간.
 *
 * 한 번 깨지면 짧은 유예 시간 동안은 다음 보호막이 소모되지 않는다.
 * 방어선 통과 피해는 무적을 뚫고 들어오기 때문에, 유예가 없으면
 * 한 번의 돌파에 보호막이 통째로 녹아 없어진다.
 */
export const SHIELD = {
  COLOR: 0x6fd8ff,
  BURST_RADIUS: 3.4, // 퍼져 나가는 고리의 최대 반지름(월드 단위)
  BURST_TIME: 0.36,

  GRACE_TIME: 0.8, // 깨진 뒤 다음 보호막이 소모되지 않는 시간(초)

  SHAKE_STRENGTH: 0.4,
  SHAKE_TIME: 0.24,
  STOP_TIME: 0.05,
};

/**
 * 보상형 광고.
 *
 * 광고 호출은 ads.js의 AdProvider 하나를 지난다. 여기 있는 것은 "얼마나 주는가"뿐이고,
 * "어떻게 보여 주는가"는 그쪽이 맡는다.
 *
 * 배치는 셋이다.
 *   부활   사망 결과 화면. 런당 한 번. 체력 절반으로 그 자리에서 다시 선다.
 *   3배   사망·클리어 결과 화면. 그 화면이 보여 주는 획득을 세 배로.
 *   +3    보드가 꽉 차 살 수 없을 때만. 무작위 무기 셋이 한 레벨씩 오른다.
 */
export const ADS = {
  COUNTDOWN: 3, // 가짜 광고가 세는 시간(초). 실제 SDK가 붙으면 광고 길이가 대신한다.

  REVIVE_HP_RATIO: 0.5, // 부활 직후 체력 = 최대 체력 × 이 값
  REVIVE_PER_RUN: 1, // 한 판에 부활할 수 있는 횟수

  SCRAP_MULTIPLIER: 3, // 획득 스크랩 배수
  COUNTUP_TIME: 0.7, // 숫자가 굴러 올라가는 시간(초)

  LEVELUP_COUNT: 3, // 한 번에 레벨이 오르는 무기 수
  LEVELUP_COOLDOWN: 60, // 다시 누를 수 있을 때까지의 시간(초). 실제 시간으로 센다.

  // 후순위: 광고 제거 IAP. 웹 결제 연동 부담이 커서 포털 입점 뒤로 미뤘다.
  // 붙일 자리는 여기다. 예) REMOVE_ADS_PRICE, 그리고 ads.js가 그 값을 읽어 곧바로 completed를 돌려준다.
};

/** 저장 키(localStorage). 아웃게임 상점이 이 값을 읽어 간다. */
export const STORAGE_KEYS = {
  TOTAL_SCRAP: 'starstrike.totalScrap', // 누적 스크랩
  BEST_STAGE: 'starstrike.bestStage', // 최고 도달 스테이지
  BEST_WAVE: 'starstrike.bestWave', // 그 스테이지에서 도달한 웨이브
  PERKS: 'starstrike.perks', // 격납고 퍽 레벨(JSON: { 퍽 id: 레벨 })
  TECH: 'starstrike.tech', // 무기 테크(JSON: { unlocked: [id], equipped: id })
};
