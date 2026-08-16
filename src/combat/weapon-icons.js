// 무기 실루엣. 외부 이미지 없이 인라인 SVG로만 그린다.
//
// 두 곳이 쓴다. 머지 보드의 칸(board.js)과 격납고의 테크 카드(hangar.js)다.
// 같은 무기는 두 곳에서 같은 모양으로 보여야 하므로 한 파일에 모았다.
//
// 그리는 규칙은 하나다. 몸통과 손잡이는 어떤 테크에서나 같고,
// 그 위에 얹히는 **발사구**만 테크마다 다르다. 레벨이 오르면 그 발사구가
// 하나 → 둘 → 셋으로 늘고, 마지막 구간에서 측면 날개가 붙는다.
// 그래서 "무엇을 들고 있는가"(모양)와 "얼마나 키웠는가"(수)가 따로 읽힌다.

/** 몸통과 손잡이. 어떤 테크·구간에서나 같다. */
const BODY =
  '<path d="M6.2 13.2h11.6l1.5 5.1a1.5 1.5 0 0 1-1.44 1.92H6.14A1.5 1.5 0 0 1 4.7 18.3z"/>';

/** 구간 4에서 붙는 측면 날개. */
const WINGS =
  '<path d="M4.9 12.6 1.8 15.4v3.1l3.4-2.4z"/><path d="M19.1 12.6l3.1 2.8v3.1l-3.4-2.4z"/>';

/**
 * 구간별 발사구 자리. [가운데 x, 굵기] 묶음이고, 구간이 오를수록 수가 는다.
 * 가운데 것은 조금 더 길게 솟는다(RISE).
 */
const LAYOUT = [
  [[12, 3.0]],
  [
    [10.1, 2.4],
    [13.9, 2.4],
  ],
  [
    [8.4, 2.2],
    [12, 2.2],
    [15.6, 2.2],
  ],
  [
    [8.4, 2.2],
    [12, 2.2],
    [15.6, 2.2],
  ],
];

/** 구간별 머리 폭. 가로지르는 띠가 이 폭을 쓴다. */
const SPAN = [
  [8.4, 7.2],
  [7.6, 8.8],
  [6.6, 10.8],
  [6.6, 10.8],
];

/** 가운데 발사구가 더 솟는 정도(구간별). */
const RISE = [0, 0, 1.2, 1.8];

/**
 * 테크별 머리 모양.
 *   emit(cx, w, top) 발사구 하나
 *   band(x, width, tier) 발사구를 가로지르는 띠. 테크마다 두께와 자리가 다르다.
 *   TOP 발사구가 시작하는 높이. 낮을수록 길고 날카롭다.
 */
const HEAD = {
  // 발칸: 뭉툭하고 곧은 총열 + 얇은 가늠쇠
  vulcan: {
    TOP: 4.2, // 짧고 뭉툭하다
    emit: (cx, w, top) =>
      `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${14 - top}" rx="${w / 2.5}"/>`,
    band: (x, width) => `<rect x="${x}" y="6.0" width="${width}" height="1.9" rx=".95"/>`,
  },

  // 레이저: 길고 가는 방출침 + 두꺼운 집속 렌즈. 발칸보다 훨씬 뾰족하고 높다.
  laser: {
    TOP: 1.0,
    emit: (cx, w, top) =>
      `<rect x="${cx - w * 0.17}" y="${top}" width="${w * 0.34}" height="${14 - top}" rx="${w * 0.17}"/>`,
    band: (x, width) => `<rect x="${x - 0.7}" y="7.4" width="${width + 1.4}" height="3.2" rx="1.6"/>`,
  },

  // 미사일: 긴 삼각 탄두 + 발사 레일 + 옆으로 뻗은 날개
  missile: {
    TOP: 1.8,
    emit: (cx, w, top) =>
      `<path d="M${cx} ${top}l${w * 0.6} ${w * 2.1}v${14 - top - w * 2.1}h${-w * 1.2}v${-(14 - top - w * 2.1)}z"/>`,
    band: (x, width) =>
      `<rect x="${x - 0.6}" y="9.0" width="${width + 1.2}" height="2.0" rx="1"/>` +
      `<path d="M${x - 3.0} 8.6h2.4v2.8h-2.4z"/>` +
      `<path d="M${x + width + 0.6} 8.6h2.4v2.8h-2.4z"/>`,
  },

  // 플라즈마: 머리를 가득 채우는 구체. 띠는 아래로 내려 구체를 가리지 않는다.
  plasma: {
    TOP: 1.6,
    emit: (cx, w, top) => `<circle cx="${cx}" cy="${top + w * 0.92}" r="${w * 0.92}"/>`,
    band: (x, width) => `<rect x="${x}" y="9.8" width="${width}" height="2.2" rx="1.1"/>`,
  },
};

/** 레벨 구간(1~3, 4~6, 7~9, 10~). 실루엣의 발사구 수와 크기를 정한다. */
export function tierOf(level) {
  return Math.min(Math.ceil(level / 3), 4);
}

/** 몸체 없이 머리만. 아이콘과 보드 타일이 함께 쓴다. */
function head(techId, tier) {
  const art = HEAD[techId] ?? HEAD.vulcan;
  const slots = LAYOUT[tier - 1];
  const [x, width] = SPAN[tier - 1];
  const mid = (slots.length - 1) / 2;

  const emitters = slots
    .map(([cx, w], i) => art.emit(cx, w, art.TOP - (i === mid ? RISE[tier - 1] : 0)))
    .join('');

  return emitters + art.band(x, width, tier);
}

/**
 * 보드 칸에 놓이는 무기 한 벌.
 * @param {string} techId 지금 장착한 테크
 * @param {number} level 무기 레벨
 */
export function weaponSvg(techId, level) {
  const tier = tierOf(level);
  const body = BODY + (tier === 4 ? WINGS : '');
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${head(techId, tier)}${body}</svg>`;
}

/** 격납고 테크 카드의 아이콘. 구간 2(발사구 둘)로 그려 모양이 또렷하게 읽힌다. */
export function techIconSvg(techId) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${head(techId, 2)}${BODY}</svg>`;
}
