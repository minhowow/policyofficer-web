import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AnalysisHeader, Failed, InProgress, PROGRESS_NOTE, StepList } from "@/components/service/analysis";
import { LiveAnalysis } from "@/components/service/LiveAnalysis";
import { AnalysisDashboard } from "@/components/service/AnalysisDashboard";
import { orUnavailable } from "@/lib/service/errors";
import { placeOf } from "@/lib/service/queue";
import { analysisHref, checklistHref, checklistMarkdownHref } from "@/lib/service/href";
import { isAnalysisId } from "@/lib/service/id";
import { isRepoFullName } from "@/lib/service/names";
import { prerunOf } from "@/lib/service/prerun";
import { formatKst } from "@/lib/service/steps";
import { showsSyntheticTag } from "@/server/config";
import { getStore } from "@/server/store";

// 분석의 진행과 결과(DB)를 요청 때 읽는다.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/r/[owner]/[repo]/a/[id]">): Promise<Metadata> {
  const { owner, repo, id } = await params;
  return { title: `분석 ${id} · ${owner}/${repo}` };
}

export default async function AnalysisPage({ params }: PageProps<"/r/[owner]/[repo]/a/[id]">) {
  const { owner, repo, id } = await params;
  if (!isAnalysisId(id) || !isRepoFullName(owner, repo)) notFound();
  if (owner !== owner.toLowerCase() || repo !== repo.toLowerCase()) redirect(analysisHref(owner, repo, id));
  const store = getStore();
  const found = await orUnavailable(
    (async () => {
      const repository = await store.getRepository(owner, repo);
      const analysis = repository && (await store.getAnalysis(repository.owner, repository.name, id));
      if (!repository || !analysis) return null;
      // 저장소 프로필(1·2단). 프로필을 내지 않던 판으로 돌린 분석에는 없다(null).
      const profile = analysis.status === "succeeded" ? await store.getProfile(analysis.id) : null;
      // 같은 커밋의 review 결과(실행기에서 켰을 때만 있다. 같은 커밋은 다시 돌리지 않고 앞서 저장된 것을 보인다).
      const review = analysis.status === "succeeded" ? await store.getReview(repository.owner, repository.name, analysis.commit) : null;
      // 대기 중이면 대기열의 몇 번째인지(DB 에서 센 것). 합성은 대기열이 없다(null).
      const place = analysis.status === "queued" ? placeOf(await store.queue(), analysis.id) : null;
      return { repository, analysis, place, profile, review };
    })(),
  );
  if (!found.ok) {
    return (
      <div className="page-wide an-page">
        <h1>분석 {id}</h1>
        <p className="notice notice-warn">{found.message}</p>
      </div>
    );
  }
  if (!found.value) notFound();
  const { repository, analysis, place, profile, review } = found.value;

  // 합성 예시 이름표: 합성 미리보기이거나 가짜 GitHub 일 때(서버 설정. 저장소 기록의 synthetic 이 아니다. 가짜 GitHub 의 저장소는
  // DB 에 실제 저장소처럼 적힌다).
  const tagged = showsSyntheticTag();
  // CLI 로 미리 돌려 넣은 분석(이 사이트의 실행기를 거치지 않았다). 머리에 그렇다고 밝히고 진행 기록은 두지 않는다.
  const prerun = prerunOf(analysis.id);
  const head = (
    <>
      <AnalysisHeader repository={repository} analysis={analysis} tagged={tagged} prerunOn={prerun?.ranOn ?? null} />
    </>
  );

  if (analysis.status === "failed") {
    return (
      <div className="page-wide an-page">
        {head}
        <Failed analysis={analysis} />
      </div>
    );
  }
  if (analysis.status !== "succeeded") {
    // 대기·분석 중. 실제 분석은 브라우저 부품이 몇 초마다 다시 읽고 끝나면 이 쪽을 새로 그린다. 합성 예시는 움직이지 않는다.
    return (
      <div className="page-wide an-page">
        {store.synthetic ? (
          <>
            {head}
            <InProgress analysis={analysis} note={PROGRESS_NOTE.synthetic} />
          </>
        ) : (
          <LiveAnalysis repository={repository} analysis={analysis} place={place} tagged={tagged} />
        )}
      </div>
    );
  }

  // 끝난 분석: 같은 커밋의 review 결과(있으면)와 저장소 프로필을 그린다.
  const code = repository.htmlUrl ? { htmlUrl: repository.htmlUrl, commit: analysis.commit } : null;
  // review 하루 상한에 닿은 분석: 실행기가 받은 날(한국 표준시)이 오늘이 아니면 그날을 적는다("오늘"이 틀린 말이 되지 않게).
  const ranOn = formatKst(analysis.steps.find((step) => step.name === "fetch")?.startedAt ?? analysis.requestedAt).slice(0, 10);
  const limitDay = analysis.review === "limit" && ranOn !== formatKst(new Date().toISOString()).slice(0, 10) ? ranOn : null;
  const progress = prerun ? null : (
    <details className="lg an-steps">
      <summary>
        진행 기록 <span className="lg-name">{analysis.steps.length}단계</span>
      </summary>
      <div className="lg-body">
        <StepList analysis={analysis} />
      </div>
    </details>
  );

  return (
    <div className="page-wide an-page">
      {head}
      <AnalysisDashboard
        code={code}
        profile={profile}
        review={review}
        reviewPlan={analysis.review}
        limitDay={limitDay}
        exportLinks={{ markdown: checklistMarkdownHref(analysis.id), print: checklistHref(repository.owner, repository.name, analysis.id) }}
        progress={progress}
      />
    </div>
  );
}
