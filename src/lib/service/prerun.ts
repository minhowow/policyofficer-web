import jobtalkReview from "@data/analyses/vactor0911-jobtalk-bbfb3ab.review.json";

/**
 * 이 사이트의 실행기가 아니라 CLI 로 미리 돌려 넣은 분석(2026-11-25 오너 지시: 포스터의 QR 이 그 저장소 쪽으로 온다). 모델을 다시
 * 부르지 않고 그 결과를 분석 기록으로 둔다(`src/server/db/seed.ts`, 실제 GitHub 에 묻는 서버에서만). 쪽은 미리 돌린 결과임을 밝힌다
 * (docs/commitments.md 의 1). 결과 JSON 은 CLI 가 낸 그대로다(data/analyses/, 고치지 않는다).
 */
export interface Prerun {
  /** 분석 id(고정, `isAnalysisId` 의 꼴). */
  id: string;
  owner: string;
  name: string;
  commit: string;
  branch: string;
  /** 돌린 날(한국 표준시). */
  ranOn: string;
  /** 돌린 때. 끝은 결과 파일이 쓰인 때이고, 시작은 거기서 결과의 `run.seconds` 를 뺀 때다. */
  startedAt: string;
  finishedAt: string;
  /** CLI 의 review 결과(2판). */
  review: unknown;
}

export const PRERUNS: readonly Prerun[] = [
  {
    // Vactor0911/jobtalk 을 CLI handoff-w13-1(784d45f)로 2026-11-24 에 돌린 review(조사 haiku 5.5, 반박 sonnet 5.5, 155.1초).
    id: "jbtk24nv7q",
    owner: "Vactor0911",
    name: "jobtalk",
    commit: "bbfb3ab14534907ff4618c563ff92a6354da97a1",
    branch: "main",
    ranOn: "2026-11-24",
    startedAt: "2026-11-24T04:39:39Z",
    finishedAt: "2026-11-24T04:42:14Z",
    review: jobtalkReview,
  },
];

/** 미리 돌려 넣은 분석이면 그 기록. */
export function prerunOf(id: string): Prerun | null {
  return PRERUNS.find((run) => run.id === id) ?? null;
}
