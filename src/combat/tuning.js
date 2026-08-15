// 손맛 샌드박스 튜닝 값 모음.
// 연사 속도·탄속·히트스톱·흔들림·자석 가속도 같은 "감각" 수치는 전부 여기서만 만진다.
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

/** 더미 적(요격기) */
export const ENEMY = {
  HP: 3,
  SPEED_MIN: 1.9,
  SPEED_MAX: 3.1,

  SPAWN_INTERVAL: 0.6, // 기본 스폰 간격(초)
  SPAWN_RUSH_SCALE: 0.3, // 최소 개체 수를 못 채웠을 때 간격 배율
  ALIVE_MIN: 5, // 이 아래면 서둘러 채운다.
  ALIVE_MAX: 8, // 동시 생존 상한
  POOL_SIZE: 12,

  SPAWN_Y: 12, // 화면 위 스폰 높이
  SPAWN_Y_JITTER: 2.5,
  DESPAWN_Y: -11, // 이 아래로 내려가면 회수
  SPAWN_X_RATIO: 0.85, // 화면 반폭 대비 스폰 x 범위

  HIT_RADIUS: 0.62, // 피격 판정 반지름
  FLASH_TIME: 0.045, // 흰색 번쩍임 지속(초). 두세 프레임
};

/** 처치 순간의 타격 연출 */
export const HIT = {
  STOP_TIME: 0.05, // 히트스톱: 게임 시간 정지(초)
  SHAKE_STRENGTH: 0.3, // 화면 흔들림 세기
  SHAKE_TIME: 0.22, // 화면 흔들림 지속(초)
};

/** 파괴 파편 */
export const DEBRIS = {
  POOL_SIZE: 96,
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
  POOL_SIZE: 48,
  PER_KILL_MIN: 2,
  PER_KILL_MAX: 3,

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
