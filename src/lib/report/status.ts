/**
 * 화면에 보이는 상태의 이름. 문구는 docs/commitments.md 의 표기 약속을 따른다. 점수·등급·순위는 만들지 않는다.
 */

/** 체크리스트 묶음의 이름(목록 줄·저장소 쪽의 '확인할 것 N건'). */
export const CHECKLIST_LABEL = {
  check: "확인할 것",
} as const;

/**
 * review 체크리스트(policyofficer review 2판)의 상태 이름(2026-11-11 오너 결정, docs/commitments.md 의 1). 갈래는 이 차례다. "확인할
 * 것"은 세 갈래(코드에서 본 것, 저장소 밖에서 확인할 것, 해당 여부부터 확인할 것)이고, "해당 없음"은 AI 가 낸 검색어를 도구가 저장소에서
 * 다시 돌려 건수가 맞은 것에만 쓴다. 검색으로 확인되지 않은 것은 "걸리지 않는 것으로 보임(확인 안 됨)"이다.
 */
export const REVIEW_STATUS_LABEL = {
  "seen-in-code": "확인할 것 · 코드에서 본 것",
  "check-outside": "확인할 것 · 저장소 밖에서 확인할 것",
  "check-applicability": "확인할 것 · 해당 여부부터 확인할 것",
  unknown: "모름",
  "evidence-found": "지킨 근거 있음",
  "likely-not-applicable": "걸리지 않는 것으로 보임(확인 안 됨)",
  "not-applicable": "해당 없음",
} as const;

/**
 * 사람이 답을 읽고 말이 안 된다고 짚은 의무(2026-11-12 오너 결정). 그 상태를 그대로 싣지 않고 이 이름으로 접어 둔다. CLI 가 고친
 * 다음 판에서 다시 돌린다.
 */
export const REVIEW_RECHECK_LABEL = "다시 검토 중";

/**
 * review 체크리스트에서 품목 신호가 없어 묻지 않은 품목 의무(주류·도서 등, CLI 의 group goods)를 한 줄로 묶는 이름. 갈래는 "해당
 * 여부부터 확인할 것"이지만 확인할 것의 수에 넣지 않는다.
 */
export const REVIEW_GOODS_LABEL = "특정 품목을 판다면 확인할 것";
