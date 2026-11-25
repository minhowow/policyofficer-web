import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CHECKLIST_LABEL } from "@/lib/report/status";
import { repoHref } from "@/lib/service/href";
import { ANALYSIS_STATUS_LABEL, formatKst } from "@/lib/service/steps";
import type { AnalysisStatus, RepositoryActivity, RepositoryHit, ReviewFacts, ReviewPlan } from "@/lib/service/types";
import { SITE } from "@/lib/site";

/**
 * 분석 서비스의 작은 부품. 데이터를 불러오지 않으므로 브라우저에서 도는 검색 쪽도 쓴다.
 */

/** 분석의 상태 표. 결과의 판정 칩(`StatusChip`)과 모양을 달리한다(네모, 테두리). 분석이 어디까지 갔는지만 말한다. */
export function AnalysisBadge({ status }: { status: AnalysisStatus }) {
  return <span className={`badge badge-${status}`}>{ANALYSIS_STATUS_LABEL[status]}</span>;
}

/** 저장소 이름. owner 는 옅게, 이름은 굵게(GitHub 과 같은 위계). */
export function RepoName({ owner, name }: { owner: string; name: string }) {
  return (
    <>
      <span className="repo-owner">{owner}</span>
      <span className="repo-slash"> / </span>
      <strong className="repo-name">{name}</strong>
    </>
  );
}

/** 날짜만(한국 표준시). "2026-11-03" */
function kstDate(iso: string): string {
  return formatKst(iso).slice(0, 10);
}

/**
 * 검색 결과의 한 줄(목업 search). 줄 전체가 저장소 쪽으로 가는 링크다. 이름(굵게), 설명 한 줄, 그리고 오른쪽에 언어, 이 사이트의
 * 분석 수, 가장 나중의 분석 날짜. 데이터에 있는 것만 적는다(GitHub 이 준 설명·언어, DB 의 분석).
 */
export function RepoRow({ hit }: { hit: RepositoryHit }) {
  const { repository: repo, analyses, latest } = hit;
  return (
    <li>
      <Link href={repoHref(repo.owner, repo.name)} className="sr-row repo-row">
        <span className="sr-name repo-link" translate="no">
          <RepoName owner={repo.owner} name={repo.name} />
        </span>
        <span className="sr-facts">
          {repo.language && <span>{repo.language}</span>}
          {latest ? (
            <>
              <span>분석 {analyses}회</span>
              <span>
                최근 <time dateTime={latest.requestedAt}>{kstDate(latest.requestedAt)}</time>
              </span>
            </>
          ) : (
            <span>분석된 적 없음</span>
          )}
        </span>
        <Icon name="chevron-right" />
        {repo.description && <span className="sr-desc">{repo.description}</span>}
      </Link>
    </li>
  );
}

/**
 * 이 사이트에서 분석된 저장소의 한 줄(검색 0건 화면, 목업 search-empty). 분석 수, 가장 나중의 분석 날짜, 그리고 보이는 분석의
 * 수(끝남, `doneCount`) 또는 상태. 설명은 기록에 있을 때만(운영 DB 의 기록에는 없다).
 */
/** 기능 이름이 든 줄인지(비었다는 말이 아닌지). 화면 낭독기에 '감지된 기능:'을 앞에 붙일 때 쓴다. */
const list = (line: string) => line !== NO_FEATURE_LINE && line !== NO_SIGNAL_LINE && !line.startsWith("AI 가 뺀 기능");

export function AnalyzedRow({ activity, review = null }: { activity: RepositoryActivity; review?: ReviewFacts | null }) {
  const { repository: repo, analysis, analyses, latestAt } = activity;
  const done = analysis.status === "succeeded" ? doneCount(analysis.review, review) : null;
  return (
    <li>
      <Link href={repoHref(repo.owner, repo.name)} className="sr-row repo-row">
        <span className="sr-name repo-link" translate="no">
          <RepoName owner={repo.owner} name={repo.name} />
        </span>
        <span className="sr-facts">
          <span>분석 {analyses}회</span>
          <span>
            최근 <time dateTime={latestAt}>{kstDate(latestAt)}</time>
          </span>
          {done ? (
            <span>{done}</span>
          ) : (
            <span>{ANALYSIS_STATUS_LABEL[analysis.status]}</span>
          )}
        </span>
        <Icon name="chevron-right" />
        {repo.description && <span className="sr-desc">{repo.description}</span>}
      </Link>
    </li>
  );
}

/**
 * AI 검토(신호와 AI 가 함께 기능을 정한다)가 기능을 하나도 정하지 않았을 때의 줄. 0건인 줄이 빈 줄로 보이지 않게 한다(2026-11-11 오너
 * 지시). 검토가 없는 분석에서 프로필(JS·TS 의 신호만 본다)이 찾지 못했을 때는 기능이 없다고 하지 않고 신호가 없다고 적는다(2026-11-16).
 */
export const NO_FEATURE_LINE = "감지된 기능 없음";
export const NO_SIGNAL_LINE = "기능 신호 없음";

/**
 * 감지된 기능을 목록 줄에 짧게: 앞의 둘과 나머지 수("외 N"). 기능 이름에 가운뎃점이 들어 있어 쉼표로 나눈다. 그 커밋의 review 가
 * 있으면 review 가 정한 기능을, 없으면 프로필의 기능을 쓴다. 비었으면 그렇다고 적고(위 둘), 모르면(프로필도 review 도 없던 분석)
 * null(줄에 아무것도 더하지 않는다).
 */
export function featureLine(names: string[] | null | undefined, review: ReviewFacts | null = null): string | null {
  const list = review ? review.features : names;
  if (!list) return null;
  // 신호가 잡은 기능을 AI 가 모두 뺐으면 기능이 없다고 하지 않고 그렇다고 적는다(신호와 AI 가 모두 없을 때만 '감지된 기능 없음').
  if (list.length === 0 && review && review.removed > 0) return `AI 가 뺀 기능 ${review.removed}가지`;
  if (list.length === 0) return review ? NO_FEATURE_LINE : NO_SIGNAL_LINE;
  const rest = list.length - 2;
  return list.slice(0, 2).join(", ") + (rest > 0 ? ` 외 ${rest}` : "");
}

/** 목록 줄의 감지된 기능(2026-11-11 오너 지시). 모르면 그리지 않는다. 화면 낭독기에는 무엇인지 앞에 붙인다. */
export function FeatureLine({ names, review = null, className }: { names: string[] | null | undefined; review?: ReviewFacts | null; className: string }) {
  const line = featureLine(names, review);
  if (!line) return null;
  return (
    <span className={className}>
      {list(line) && <span className="visually-hidden">감지된 기능: </span>}
      {line}
    </span>
  );
}

/** review 를 맡겼는데 결과가 없는 분석의 말(분석 쪽의 `SITE.service.reviewMissing` 과 같은 경우). */
export const REVIEW_NOT_RECEIVED = "검토 결과 받지 못함";
/** 하루 review 상한에 닿아 review 없이 돈 분석의 말. */
export const REVIEW_NOT_RUN = "검토 안 함";
/** 검토를 켜기 전에 돈 분석의 말(그 커밋의 review 가 없다). */
export const REVIEW_NONE = "검토 결과 없음";

/**
 * 목록 줄·분석 기록 표에 적는 끝난 분석의 수(AI 검토가 본체, 2026-11-15·16 오너 결정). 그 커밋의 review 가 있으면 체크리스트의
 * '확인할 것' 수. 없으면 그 까닭(맡겼는데 받지 못함, 오늘 한도로 하지 않음, 검토 결과 없음).
 */
export function doneCount(plan: ReviewPlan | undefined, review: ReviewFacts | null | undefined): string {
  if (review) return `${CHECKLIST_LABEL.check} ${review.check}건`;
  return plan === "run" ? REVIEW_NOT_RECEIVED : plan === "limit" ? REVIEW_NOT_RUN : REVIEW_NONE;
}

/** 목록 줄에 보이는 수가 0이면 그 갈래(review 의 확인할 것). 0의 뜻을 함께 둔다. */
export function zeroKind(review: ReviewFacts | null | undefined): "check" | null {
  return review?.check === 0 ? "check" : null;
}

/** 보이는 0의 갈래마다 0의 뜻(docs/commitments.md 의 1). */
export function zeroNotes(kinds: Iterable<"check" | null>): string[] {
  return new Set(kinds).has("check") ? [SITE.zeroCheckIsNotClearance] : [];
}
