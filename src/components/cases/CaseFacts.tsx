import { casesFile, modelId, type CaseData } from "@/lib/cases";
import { parseReview } from "@/lib/review";
import { commitLink, shortCommit } from "@/lib/service/href";
import { modelLabel } from "@/lib/review/text";
import { SITE } from "@/lib/site";

/**
 * 사례들의 사실 줄(사례 목록 쪽, review 2판의 실측, 2026-11-12 오너 지시): 미리 돌린 결과라는 것, 돌린 날, 조사 모델과 반박 모델, CLI
 * 커밋, 그리고 판정 규칙만 다시 건 결과면 그 사실. 모델은 결과에 실린 그대로다.
 */
export function CaseFacts({ cases }: { cases: CaseData[] }) {
  const { regate } = casesFile.reviewRun;
  const runs = cases.map((c) => parseReview(c.review)?.run).filter((run) => run !== undefined);
  const investigate = [...new Set(runs.map((run) => run.models.investigate))].join(", ");
  const verify = [...new Set(runs.map((run) => run.models.verify))].join(", ");
  return (
    <>
      <p className="pi-meta">
        <span>{SITE.cases.prerun}</span>{" "}
        <span>
          <time dateTime={casesFile.reviewRun.ranOn}>{casesFile.reviewRun.ranOn}</time>
        </span>{" "}
        <span>
          조사 <code translate="no">{investigate}</code>
        </span>{" "}
        <span>
          반박 <code translate="no">{verify}</code>
        </span>{" "}
        <span>
          CLI <code translate="no">{casesFile.reviewRun.cli}</code>
        </span>
      </p>
      {/* 모델 답은 그대로 두고 뒤 판의 판정 규칙만 다시 건 결과(2026-11-12 오너 지시). */}
      {regate && (
        <p className="pi-meta">
          <span>{SITE.cases.regate}</span>{" "}
          <span>
            규칙 CLI <code translate="no">{regate.cli}</code>
          </span>
        </p>
      )}
    </>
  );
}

/**
 * 사례 쪽 머리의 회색 한 줄(2026-11-25 web16): 미리 돌린 결과 · 돌린 날 · 커밋 · 조사 모델 · 반박 모델. 모델은 이름으로 줄여 적고(id 는
 * 검증 정보에), CLI 커밋·비용·걸린 시간·판정 규칙만 다시 적용한 사실은 쪽 아래 검증 정보로 옮겼다(`caseRunNote`).
 */
export function CaseHeadLine({ one }: { one: CaseData }) {
  const run = parseReview(one.review)?.run;
  return (
    <p className="pi-meta">
      <span>{SITE.cases.prerun}</span>{" "}
      <span>
        <time dateTime={casesFile.reviewRun.ranOn}>{casesFile.reviewRun.ranOn}</time>
      </span>{" "}
      <span>
        커밋{" "}
        <a href={commitLink(one.htmlUrl, one.commit) ?? undefined} target="_blank" rel="noopener noreferrer">
          <code translate="no">{shortCommit(one.commit)}</code>
        </a>
      </span>
      {run && (
        <>
          {" "}
          <span>조사 {modelLabel(run.models.investigate)}</span> <span>반박 {modelLabel(run.models.verify)}</span>
        </>
      )}
    </p>
  );
}

/** 사례 쪽 검증 정보에 함께 적는 실행의 사실: 결과를 낸 CLI 커밋과, 판정 규칙만 다시 건 결과면 그 사실과 규칙의 CLI 커밋. */
export function caseRunNote(): { cli: string; regate: string | null } {
  const { cli, regate } = casesFile.reviewRun;
  return { cli, regate: regate ? regate.cli : null };
}

/** 앞서 돌린 정적 검사 + AI 판정(`--agent`)의 사실 한 줄: 돌린 날, 찾는 모델과 재확인 모델, CLI 커밋, 검사한 파일 수. */
export function EarlierFacts({ one }: { one: CaseData }) {
  return (
    <p className="pi-meta">
      <span>
        <time dateTime={casesFile.ranOn}>{casesFile.ranOn}</time>
      </span>{" "}
      <span>
        찾기 <code translate="no">{modelId(one.finder)}</code>
      </span>{" "}
      <span>
        재확인 <code translate="no">{modelId(one.rechecker)}</code>
      </span>{" "}
      <span>
        CLI <code translate="no">{casesFile.cli.commit}</code>
      </span>{" "}
      <span>검사한 파일 {one.files}개</span>
    </p>
  );
}
