import { REVIEW_STATUS_LABEL } from "@/lib/report/status";
import type { ReviewItem, ReviewStatus } from "./index";

/**
 * review 체크리스트의 글을 고르는 일. 결과 화면(`components/review/ReviewView.tsx`)과 체크리스트 내보내기(`checklist.ts`: 마크다운
 * 파일, 인쇄용 보기)가 같은 말을 쓴다.
 */

/** 확인할 것의 세 갈래. */
export const CHECKS: readonly ReviewStatus[] = ["seen-in-code", "check-outside", "check-applicability"];

/** 갈래 이름의 짧은 꼴(`확인할 것 · 코드에서 본 것` → `코드에서 본 것`). 요약이 이미 '확인할 것 N건'이라 목록의 갈래 머리는 뒤만 적는다. */
export function shortStatus(status: ReviewStatus): string {
  return REVIEW_STATUS_LABEL[status].split(" · ").at(-1)!;
}

/** 확인할 것(세 갈래)의 수. 묻지 않은 품목 의무(group goods)는 세지 않는다(화면의 '확인할 것' 머리와 같은 수). */
export function checkCount(items: readonly ReviewItem[]): number {
  return items.filter((item) => CHECKS.includes(item.status) && item.group !== "goods").length;
}

/**
 * 화면에 싣지 않는 처분의 말(docs/commitments.md 1장: 처분 사례와 그 액수를 화면에 싣지 않는다). 의무 한 줄에 이 말이 들면 그 줄은
 * 적지 않고 법·조문·법제처 링크만 둔다. 소스의 문구 시험(tests/commitments.test.ts)이 이 낱말을 글자 그대로 막으므로 글자 번호로
 * 적는다(tests/wording.ts 의 처분·액수 줄과 같은 세 낱말).
 */
export const SANCTION = new RegExp(
  [
    [0xacfc, 0xc9d5, 0xae08],
    [0xacfc, 0xd0dc, 0xb8cc],
    [0xbc8c, 0xae08],
  ]
    .map((codes) => String.fromCodePoint(...codes))
    .join("|"),
);

/**
 * 관문이 모델의 답을 바꾼 까닭(`ReviewItem.gate`)을 이 사이트의 상태 이름으로. 모르는 까닭이면 적지 않는다. condition-present 는
 * 조건이 코드에서 확인됐을 때(기능 신호나 관문을 통과한 인용, 상태 '코드에서 본 것')와 AI 의 말뿐일 때(상태 '해당 여부부터')를 가른다.
 */
export function gateText(item: ReviewItem): string | undefined {
  const na = REVIEW_STATUS_LABEL["not-applicable"];
  const seen = REVIEW_STATUS_LABEL["seen-in-code"].split(" · ").at(-1);
  switch (item.gate) {
    case "condition-present":
      return item.status === "seen-in-code"
        ? `걸리는 조건이 코드에 있어 AI 가 낸 '${na}'을 받지 않았습니다.`
        : `AI 가 걸리는 조건이 있다고 답해 '${na}'을 받지 않았습니다.`;
    case "no-condition":
      return `걸리는 조건이 없다는 근거가 없어 AI 가 낸 '${na}'을 받지 않았습니다.`;
    case "name-or-default":
      return `AI 가 댄 줄이 이름·기본값뿐이라 '${REVIEW_STATUS_LABEL["evidence-found"]}'으로 받지 않았습니다.`;
    // CLI 2a24d94 부터.
    case "audience":
      return `이용자가 누구인지(아동·미성년자·청소년)에 걸리는 의무라 AI 가 낸 '${na}'을 받지 않았습니다.`;
    case "missing-check":
      return `나이·본인·지역을 확인하는 장치가 없다는 것은 그런 이용자가 없다는 근거가 아니라 AI 가 낸 '${na}'을 받지 않았습니다.`;
    case "applies-unknown":
      return `AI 가 걸리는지 모른다고 답해 '${REVIEW_STATUS_LABEL["check-applicability"].split(" · ").at(-1)}'으로 옮겼습니다.`;
    // CLI handoff-w11-13 까지 더해진 까닭.
    case "free-input":
      return `걸리는 조건이 이용자가 자유 입력에 넣을 수 있다는 추측뿐이라 AI 가 낸 '${seen}'을 받지 않았습니다.`;
    case "other-side":
      return `저장소가 서버만 또는 화면만이라 반대쪽이 하는 의무를 '${REVIEW_STATUS_LABEL["check-outside"].split(" · ").at(-1)}'으로 옮겼습니다.`;
    case "prohibition":
      return `금지 의무인데 금지된 행위 자체를 보인 줄이 없어 AI 가 낸 '${seen}'을 받지 않았습니다.`;
    case "same-model":
      return `조사와 반박이 같은 모델이라 '${REVIEW_STATUS_LABEL["evidence-found"]}'으로 올리는 반박을 받지 않았습니다.`;
    case "remaining-gap":
      return `AI 가 '${REVIEW_STATUS_LABEL["evidence-found"]}'이라 답하면서 남은 부족한 점을 적어 '${seen}'으로 옮겼습니다.`;
    default:
      return undefined;
  }
}

/**
 * 반박 줄(검증 정보): 유지·뒤집음과 근거 없는 뒤집기 거절, 반박하지 않은 항목의 수. 반박을 '코드에서 본 것'·'충족 근거 있음'에만 건
 * 결과(run.rebut_scope found)면 그렇다고 덧붙인다. 화면과 내보낸 파일이 같은 말을 쓴다.
 */
export function rebutLine(run: { verificationCounts: Record<string, number>; rebutScope: string | null }): string {
  const v = run.verificationCounts;
  const parts = [`유지 ${v.upheld ?? 0}`, `뒤집음 ${v.overturned ?? 0}`];
  if (v["overturn-ungrounded"]) parts.push(`근거 없는 뒤집기 거절 ${v["overturn-ungrounded"]}`);
  if (v["not-run"]) parts.push(`반박 안 함 ${v["not-run"]}`);
  const scope =
    run.rebutScope === "found"
      ? ` (반박은 '${REVIEW_STATUS_LABEL["seen-in-code"].split(" · ").at(-1)}'·'${REVIEW_STATUS_LABEL["evidence-found"]}'에만)`
      : "";
  return `${parts.join(" · ")}${scope}`;
}

/**
 * 모델 id 를 머리 한 줄에 적는 이름으로(`claude-haiku-5-5` → `Haiku 5.5`, 2026-11-25 web16). 그 꼴이 아니면 id 그대로다. 검증 정보에는
 * id 를 그대로 적는다.
 */
export function modelLabel(id: string): string {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(id);
  return match ? `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]}.${match[3]}` : id;
}

/** 실행 단계의 이름(비용의 구성에 쓴다). */
const STAGE_LABEL: Record<string, string> = { understand: "기능 파악", investigate: "조사", rebut: "반박" };

/**
 * 비용 어림과 그 구성(`조사+반박 $1.20`, 2026-11-25 web16). 구성은 결과의 질문 기록에서 돈이 든 단계다. 기록이 없는 결과는 이해
 * 단계를 새로 돌렸다고 적힌 결과면 기능 파악, 그리고 조사와, 반박이 한 건이라도 돈 결과면 반박이다.
 */
export function costText(run: {
  usdEstimate: number;
  stageUsd: Record<string, number> | null;
  understandReused: boolean | null;
  verificationCounts: Record<string, number>;
}): string {
  const v = run.verificationCounts;
  const stages = run.stageUsd
    ? Object.keys(STAGE_LABEL).filter((stage) => (run.stageUsd![stage] ?? 0) > 0)
    : [...(run.understandReused === false ? ["understand"] : []), "investigate", ...((v.upheld ?? 0) + (v.overturned ?? 0) + (v["overturn-ungrounded"] ?? 0) > 0 ? ["rebut"] : [])];
  const parts = stages.map((stage) => STAGE_LABEL[stage]);
  return `${parts.length > 0 ? `${parts.join("+")} ` : ""}$${run.usdEstimate.toFixed(2)}`;
}

/** 관문이 받지 않은 인용의 까닭(CLI 의 citation `why`)을 사이트의 말로. */
const REJECTED: Record<string, string> = {
  "test-file": "테스트·설정 파일",
  "too-short": "너무 짧은 조각",
  "bare-word": "너무 짧은 조각",
  empty: "너무 짧은 조각",
  "comment-only": "주석",
  "trailing-comment": "주석",
  "not-found": "파일에 없는 줄",
};

/**
 * 펼친 상세의 '도구 확인' 줄(2026-11-25 web16): 새 자료 없이 그 의무의 인용(받은 수/모두), '없다' 검색(다시 돌려 같은 수/모두), 반박의
 * 결과로 만든다. 사실대로 쓴다: 받지 않은 인용이 있으면 그 수와 까닭, 같지 않은 검색이 있으면 그 수, 반박하지 않았으면 반박 조각이
 * 없다. 조각이 하나도 없으면 빈 배열(줄을 두지 않는다). '고치는 법'은 만들지 않는다.
 */
export function toolCheck(item: Pick<ReviewItem, "citations" | "searches" | "verification">): string[] {
  const parts: string[] = [];
  const cites = item.citations.filter((cite) => cite.why !== "profile");
  const taken = cites.filter((cite) => cite.ok).length;
  if (cites.length > 0) {
    if (taken === cites.length) parts.push(`인용 ${taken}줄이 파일에 그대로 있음`);
    else {
      const why = new Map<string, number>();
      for (const cite of cites.filter((c) => !c.ok)) {
        const label = REJECTED[cite.why] ?? "그 밖의 까닭";
        why.set(label, (why.get(label) ?? 0) + 1);
      }
      const reasons = [...why].map(([label, n]) => `${n}줄: ${label}`).join(", ");
      parts.push(taken === 0 ? `인용 ${cites.length}줄 모두 받지 않음(${reasons})` : `인용 ${cites.length}줄 중 ${taken}줄만 받음(${reasons})`);
    }
  }
  const same = item.searches.filter((search) => search.ok).length;
  if (item.searches.length > 0) {
    parts.push(
      same === item.searches.length
        ? `'없다' 검색 ${same}개를 다시 돌려 같음`
        : `'없다' 검색 ${item.searches.length}개 중 ${same}개를 다시 돌려 같음(${item.searches.length - same}개는 같지 않음)`,
    );
  }
  const rebut: Record<string, string> = {
    upheld: "반박 후 유지",
    overturned: "반박이 뒤집음",
    "overturn-ungrounded": "반박의 뒤집기는 근거가 없어 받지 않음",
  };
  if (rebut[item.verification]) parts.push(rebut[item.verification]);
  return parts;
}

/**
 * 쪽 아래 검증 정보의 문장(2026-11-25 web16): 인용을 파일에서 글자 그대로 확인한 수, '없다' 검색을 도구가 다시 돌려 같은 수와 달라
 * '해당 없음'의 근거로 쓰지 않은 수, 반박의 결과. 결과에 실린 수 그대로다.
 */
export function verifySentence(run: {
  citations: number;
  citationsRejected: number;
  searches: number;
  searchesRejected: number;
  verificationCounts: Record<string, number>;
  rebutScope: string | null;
}): string[] {
  const kept = run.citations - run.citationsRejected;
  const same = run.searches - run.searchesRejected;
  return [
    run.citationsRejected === 0
      ? `인용 ${run.citations}줄 모두 파일에서 글자 그대로 확인`
      : `인용 ${run.citations}줄 중 ${kept}줄을 파일에서 글자 그대로 확인, ${run.citationsRejected}줄은 받지 않음`,
    `'없다' 검색 ${run.searches}개를 도구가 다시 돌림 → ${same}개 같음${run.searchesRejected > 0 ? `, ${run.searchesRejected}개는 달라 '${REVIEW_STATUS_LABEL["not-applicable"]}'으로 쓰지 않음` : ""}`,
    `반박 ${rebutLine(run)}`,
  ];
}

/** 글의 첫 문장(마침표·물음표 다음 빈칸까지). 나머지가 있으면 함께 돌려준다. 글을 고치지 않는다. */
export function firstSentence(text: string): [string, string] {
  const match = /^(.+?[.?!])\s+(\S[\s\S]*)$/.exec(text.trim());
  return match ? [match[1], match[2]] : [text.trim(), ""];
}

/**
 * 묻지 못한 까닭: CLI 는 `not_answered` 에 까닭의 이름(cost-cap 등)을, `reason` 에 그 말을 싣는다. reason 이 비었을 때만 적고,
 * 이름 꼴(영문 소문자·숫자·붙임표)이면 그대로 싣지 않는다.
 */
export function notAnsweredText(item: ReviewItem): string | null {
  if (item.reason || !item.notAnswered) return null;
  return /^[a-z0-9-]+$/.test(item.notAnswered) ? "답을 받지 못했습니다." : item.notAnswered;
}
