/**
 * 의무마다 법에 적힌 제재(2026-11-24 오너 승인). CLI 의 제재 표(`src/policypack/profile/sanctions.jsonl`, 실행기의 고정 커밋)를
 * `scripts/export-duty-map.mjs` 가 의무 지도(data/duty-map.json)의 의무마다 `sanction` 으로 옮긴다. 무게(class)는 AI 가 정하지
 * 않는다. 법령 원문의 벌칙·과징금·과태료 조문으로 CLI 쪽 표가 정했고, 화면은 그 조문과 원문 인용을 함께 싣는다.
 *
 * 이 사이트에서 제재의 말(제재 갈래 이름과 고정 문구)은 이 파일에만 적는다(docs/commitments.md 1장. 소스의 문구 시험이 이 파일만
 * 그 말을 받는다). 표지·상세·걸러 보기는 여기의 말과 표의 글을 그대로 쓴다. 표지는 언제나 '어기면'으로 시작한다(단정하지 않는다).
 * 브라우저 부품도 불러 쓰므로 의무 지도(JSON)는 불러오지 않는다(찾기는 `lib/duties` 의 `sanctionOf`).
 */

/** 제재의 갈래. 이 차례가 무거운 차례다(정렬 차례). */
export const SANCTION_CLASSES = ["징역", "과징금", "벌금", "과태료", "명령", "없음"] as const;
export type SanctionClass = (typeof SANCTION_CLASSES)[number];

/** 제재 조문 하나. */
export interface SanctionItem {
  /** 징역(징역형이 있는 벌칙) · 벌금(벌금형만) · 과징금 · 과태료. */
  kind: string;
  /** direct: 이 의무를 어긴 것 자체 · order: 시정명령 등을 따르지 않았을 때만. */
  via: "direct" | "order";
  /** 걸리는 조건(예: 개인정보가 유출되면). */
  condition: string | null;
  /** 그 조문의 제재 문구. */
  penalty: string;
  /** 그 조문이 있는 법의 정식 이름과 조·항·호. */
  law: string;
  clause: string;
  /** 법제처 주소. */
  url: string | null;
  /** 그 호(또는 항)의 원문(공백만 정리). */
  quote: string;
}

export interface Sanction {
  class: SanctionClass;
  /** 표지·요약에 쓰는 짧은 말(가장 무거운 것 한두 개). */
  label: string;
  /** 정액 상한 가운데 가장 큰 값(원). 같은 갈래 안에서 큰 것을 먼저 놓을 때만 쓴다. */
  maxWon: number | null;
  items: SanctionItem[];
  /** 사람에게 보일 한 줄 보충. */
  note: string | null;
  /** 대조한 법령 원문의 기준일. */
  asOf: string;
}

/** 표지의 세 무게: 0 강조(징역·과징금), 1 보통(벌금·과태료), 2 흐림(명령·없음). 걸러 보기의 차례이기도 하다. */
export type SanctionTier = 0 | 1 | 2;

export const SANCTION_TIERS: readonly { label: string; classes: readonly SanctionClass[] }[] = [
  { label: "징역·과징금", classes: ["징역", "과징금"] },
  { label: "벌금·과태료", classes: ["벌금", "과태료"] },
  { label: "명령·없음", classes: ["명령", "없음"] },
];

export function sanctionTier(sanction: Sanction): SanctionTier {
  return SANCTION_TIERS.findIndex((tier) => tier.classes.includes(sanction.class)) as SanctionTier;
}

/** 화면의 고정 문구. */
export const SANCTION_TEXT = {
  /** 표지. */
  badge: (label: string) => `어기면 · ${label}`,
  /** 맨 위 요약의 이름(확인할 것 가운데 강조 갈래의 수). */
  heavy: `어기면 ${SANCTION_TIERS[0].label}이 걸리는 항목`,
  /** 요약 근처에 한 번 두는 주의 문구. */
  note: "법에 적힌 최대 제재입니다. 위반 판정이 아니며, 실제 부과는 위반 사실과 규모에 따라 다릅니다.",
  /** 항목 상세의 이름표. */
  head: "어기면",
  /** 시정명령 등을 따르지 않았을 때만 오는 제재. */
  order: "시정명령 등을 따르지 않았을 때",
  /** 조문 원문(접어 둔다). */
  quote: "원문",
  /** 조문 도감의 걸러 보기. */
  filter: "제재",
  all: "모든 제재",
} as const;

/** 제재 조문 하나가 걸리는 때: 시정명령 등을 따르지 않았을 때만 오는 제재와 조건. 없으면 빈 글. */
export function sanctionWhen(item: SanctionItem): string {
  return [item.via === "order" ? SANCTION_TEXT.order : null, item.condition].filter(Boolean).join(", ");
}

/** 무거운 것 먼저: 갈래 차례, 같은 갈래면 정액 상한이 큰 것. 제재가 없는(표에 없는) 의무는 맨 뒤다. */
function rank(sanction: Sanction | null): [number, number] {
  if (!sanction) return [SANCTION_CLASSES.length, 0];
  return [SANCTION_CLASSES.indexOf(sanction.class), -(sanction.maxWon ?? -1)];
}

/** 무거운 차례로 늘어놓는다. 같은 무게끼리는 받은 차례 그대로다(안정 정렬). */
export function byWeight<T>(list: readonly T[], sanctionOf: (item: T) => Sanction | null): T[] {
  return list
    .map((item, i) => ({ item, i, r: rank(sanctionOf(item)) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i)
    .map((entry) => entry.item);
}
