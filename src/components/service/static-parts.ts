import { AI_CLEARED, AI_DISMISSED } from "@/lib/report/record";
import { STATUS_LABEL } from "@/lib/report/status";
import { aiReviewRan, type ReportView } from "@/lib/report/view-model";

/**
 * review 가 있는 분석의 정적 검사 조각: '정적 검사 발견 N건'에, AI 판정자가 푼 경고와 적용 질문으로 빠진 판정이 있으면 그 수(0건이면
 * 적지 않는다. 숨기지 않는다: docs/commitments.md). 저장소 쪽의 최신 분석 상자와 분석 쪽의 접힌 보조 줄이 쓴다. 브라우저 부품이
 * 불러오는 `parts.tsx` 와 따로 둔다(결과 화면 구조를 브라우저로 보내지 않게).
 */
export function staticParts(view: ReportView): string[] {
  const parts = [`정적 검사 발견 ${view.findingCount}건`];
  if (aiReviewRan(view)) {
    if (view.aiCleared.length > 0) parts.push(`${AI_CLEARED} ${view.aiCleared.length}건`);
    if (!view.aiDismissedKnown) parts.push(`${AI_DISMISSED} ${STATUS_LABEL["pack-unknown"]}`);
    else if (view.aiDismissed.length > 0) parts.push(`${AI_DISMISSED} ${view.aiDismissed.length}건`);
  }
  return parts;
}
