// 전투 튜닝 값 모음.
// 연사 속도·탄속·히트스톱·흔들림·자석 가속도 같은 "감각" 수치와
// 웨이브 구성·난이도 배수 같은 "규칙" 수치를 전부 여기서만 만진다.
// 다른 파일에는 수치를 흩어 두지 않는다.

/** 발칸(자동 사격) */
export const VULCAN = {
  FIRE_INTERVAL: 0.1, // 발사 간격(초). 0.1 = 초당 10발
  BULLET_SPEED: 26, // 탄속(월드 단위/초)
  BULLET_LIFE: 0.9, // 탄 수명(초). 화면 위로 벗어날 만큼만 살려 둔다.
  BULLET_DAMAGE: 1,
  POOL_SIZE: 48, // 탄환 풀 크기

  MUZZLE_FLASH_TIME: 0.05, // 총구 화염 지속(초). 두세 프레임
  MUZZLE_FLASH_POOL: 8,
};

/** 전투 평면의 경계. 적이 태어나고 사라지는 자리를 정한다. */
export const FIELD = {
  SPAWN_Y: 12, // 화면 위 스폰 높이
  SPAWN_Y_JITTER: 2.5,
  SPAWN_X_RATIO: 0.85, // 화면 반폭 대비 스폰 x 범위
  DESPAWN_Y: -11, // 방어선을 지나쳐도 남아 있는 적을 거두는 안전망
  DEFENSE_LINE_Y: -6.2, // 이 선을 넘으면 플레이어가 피해를 입는다.
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
    HP: 3,
    SPEED_MIN: 1.9,
    SPEED_MAX: 3.1,
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
    SPEED_MIN: 1.0,
    SPEED_MAX: 1.5,
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
    SPEED_MIN: 1.4,
    SPEED_MAX: 2.0,
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
 */
export const WAVE_TABLE = [
  { INTERCEPTOR: 5 },
  { INTERCEPTOR: 7 },
  { INTERCEPTOR: 6, SAUCER: 2 },
  { INTERCEPTOR: 8, SAUCER: 3 },
  { INTERCEPTOR: 6, GUNSHIP: 2 },
  { INTERCEPTOR: 8, SAUCER: 4 },
  { INTERCEPTOR: 8, GUNSHIP: 2, SAUCER: 3 },
  { INTERCEPTOR: 10, GUNSHIP: 3 },
  { INTERCEPTOR: 9, GUNSHIP: 2, SAUCER: 5 },
  { INTERCEPTOR: 12, GUNSHIP: 4, SAUCER: 4 },
];

/** 웨이브 진행 규칙 */
export const WAVE = {
  SPAWN_INTERVAL: 0.55, // 웨이브 안에서 한 기씩 내보내는 간격(초)
  SPAWN_INTERVAL_MIN: 0.16, // 스테이지가 올라도 이보다 촘촘해지지는 않는다.
  ALIVE_MAX: 14, // 동시 생존 상한. 넘으면 스폰을 미룬다.

  REST_TIME: 1.3, // 웨이브를 비우고 다음 웨이브까지 쉬는 시간(초)
  INTRO_TIME: 1.0, // 웨이브 배너를 띄우는 시간(초)
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

  BASE_HP: 170, // 스테이지 1 기준 HP. 발칸 초당 10 기준으로 17초쯤 걸린다.
  HP_PER_STAGE: 0.45, // HP 배수 = 1 + 0.45 × (스테이지 - 1)

  SPAWN_Y: 15, // 화면 밖 위쪽에서 등장
  DESCEND_SPEED: 0.55, // 아주 천천히 내려온다(월드 단위/초). 방어선까지 27초쯤.
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

  SCATTER_SPEED: 4.2, // 처음 흩어지는 속도
  SCATTER_TIME: 0.26, // 흩어지는 시간(초). 지나면 자석 시작
  SCATTER_DRAG: 4.0,

  MAGNET_ACCEL: 52, // 기체 쪽으로 끌려가는 가속도
  MAGNET_MAX_SPEED: 30,
  PICKUP_RADIUS: 0.55, // 흡수 판정 반지름

  SIZE: 0.38,
  COLOR: 0x9dff9a,
  ABSORB_FLASH_TIME: 0.12, // 흡수 시 작은 플래시 지속(초)
};

/** 저장 키(localStorage). 아웃게임 상점이 이 값을 읽어 간다. */
export const STORAGE_KEYS = {
  TOTAL_SCRAP: 'starstrike.totalScrap', // 누적 스크랩
  BEST_STAGE: 'starstrike.bestStage', // 최고 도달 스테이지
  BEST_WAVE: 'starstrike.bestWave', // 그 스테이지에서 도달한 웨이브
};
