import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CHECKLIST_LABEL } from "@/lib/report/status";
import { analysisHref, shortCommit } from "@/lib/service/href";
import { duration, finishedAt, formatKst } from "@/lib/service/steps";
import type { Analysis, Repository, ReviewFacts } from "@/lib/service/types";
import { SITE } from "@/lib/site";
import { AnalysisBadge, FeatureLine, REVIEW_NONE, REVIEW_NOT_RECEIVED, REVIEW_NOT_RUN } from "./parts";

/** 최신 분석 상자의 감지된 기능 한 줄(있을 때만). review 가 있으면 review 가 정한 기능이다. */
const featureLineOf = (features: string[] | null, review: ReviewFacts | null) =>
  (review ? review.features : features)?.length ? (
    <p className="box-in latest-feat">
      <FeatureLine names={features} review={review} className="feat" />
    </p>
  ) : null;

/**
 * 저장소 쪽의 "최신 분석" 상자(docs/redesign.md 3장 "저장소", 목업 repo). 가장 나중에 끝난 분석 하나를 요약한다. 새로 꾸미는 정보는
 * 없다.
 *
 * - 머리 줄: 배지, 분석 id, 커밋, 요청 시각(KST), 걸린 시간(단계의 시각에서만), 그 커밋의 review 가 있으면 체크리스트의 확인할 것
 *   N건, 없으면 그 까닭(받지 못함, 오늘 한도로 하지 않음, 검토 결과 없음), 결과 보기.
 * - 본문: 감지된 기능 한 줄. 확인할 것이 0이면 0의 뜻을 둔다.
 */
export function LatestAnalysis({
  repository,
  analysis,
  features = null,
  review = null,
}: {
  repository: Repository;
  analysis: Analysis;
  /** 그 커밋의 review 의 확인할 것 수와 기능(`ServiceStore.reviewFacts`). review 가 없으면 null. */
  review?: ReviewFacts | null;
  /** 그 분석에서 감지된 기능(`ServiceStore.featureNames`). 머리 줄 아래에 짧게 적는다. */
  features?: string[] | null;
}) {
  const href = analysisHref(repository.owner, repository.name, analysis.id);
  const started = analysis.steps[0]?.startedAt ?? null;
  const ended = finishedAt(analysis);
  return (
    <section className="box latest" aria-labelledby="latest-title">
      <div className="box-hd latest-hd">
        <h2 id="latest-title">최신 분석</h2>
        <AnalysisBadge status={analysis.status} />
        <span className="latest-facts">
          <code translate="no">{analysis.id}</code>
          <span className="nw">
            <Icon name="commit" />
            <span className="visually-hidden">커밋 </span>
            <code translate="no">{shortCommit(analysis.commit)}</code>
          </span>
          <span className="nw">
            <time dateTime={analysis.requestedAt}>{formatKst(analysis.requestedAt)}</time> KST
          </span>
          {started && ended && (
            <span className="nw">
              걸린 시간 <span className="v">{duration(started, ended)}</span>
            </span>
          )}
          {review ? (
            <span className="nw">
              {CHECKLIST_LABEL.check} <span className="v">{review.check}건</span>
            </span>
          ) : (
            <span className="nw">{analysis.review === "run" ? REVIEW_NOT_RECEIVED : analysis.review === "limit" ? REVIEW_NOT_RUN : REVIEW_NONE}</span>
          )}
        </span>
        <Link href={href} className="box-end">
          결과 보기
        </Link>
      </div>
      {featureLineOf(features, review)}
      {/* 0의 뜻은 확인할 것이 0일 때만(확인할 것이 있는데 '0이어도'가 붙으면 모순으로 읽힌다. 2026-11-16 오너 지시). */}
      {review?.check === 0 && <p className="box-in zero-note">{SITE.zeroCheckIsNotClearance}</p>}
    </section>
  );
}
