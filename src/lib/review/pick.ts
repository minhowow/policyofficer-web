import { sanctionOf } from "@/lib/duties";
import { byWeight } from "@/lib/duties/sanction";
import type { Review, ReviewItem } from "./index";

/** 결과 쪽의 '코드에서 확인된 것' 카드 수(2026-11-25 web18: 3건 안팎). */
export const CONFIRMED_MAX = 3;

/** 카드가 될 수 있는 항목: 코드에서 본 것이고, 반박을 견뎠고(upheld), 도구가 받은 인용(기능 신호가 아닌 것)이 있다. */
export function isConfirmed(item: ReviewItem): boolean {
  return (
    item.status === "seen-in-code" &&
    item.group !== "goods" &&
    item.verification === "upheld" &&
    item.citations.some((cite) => cite.ok && cite.why !== "profile")
  );
}

/**
 * 결과 쪽 맨 위에 크게 둘 '코드에서 확인된 것'(2026-11-25 web18, 오너 지시: 확실한 것만 크게). CLI 가 고른 '먼저 볼 것'
 * (`summary.highlights`, handoff-w13-5 부터)이 있으면 그 차례 그대로 쓴다(이 목록에 있고 `isConfirmed` 인 항목만. 해당 여부부터·저장소
 * 밖에서는 어느 쪽으로도 카드에 오르지 않는다). 없으면 같은 규칙으로 고른다:
 * `isConfirmed` 인 항목을 무거운 제재 차례로 늘어놓고, 기능마다 하나씩 먼저, 그다음 남은 차례로 `CONFIRMED_MAX` 건까지. 보이는
 * 차례는 무거운 차례다. 후보가 없으면 빈 배열(지어내지 않는다).
 */
export function confirmedItems(review: Review, items: readonly ReviewItem[]): ReviewItem[] {
  if (review.summary.highlights) {
    return review.summary.highlights.flatMap((duty) => items.filter((item) => item.duty === duty && isConfirmed(item))).slice(0, CONFIRMED_MAX);
  }
  const ordered = byWeight(items.filter(isConfirmed), (item) => sanctionOf(item.duty));
  const picked: ReviewItem[] = [];
  const features = new Set<string>();
  for (const item of ordered) {
    if (picked.length >= CONFIRMED_MAX) break;
    if (features.has(item.feature)) continue;
    features.add(item.feature);
    picked.push(item);
  }
  for (const item of ordered) {
    if (picked.length >= CONFIRMED_MAX) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return ordered.filter((item) => picked.includes(item));
}
