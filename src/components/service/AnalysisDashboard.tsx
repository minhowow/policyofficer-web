import type { ReactNode } from "react";
import { ObligationTier, ProfileTier, Tier } from "@/components/result/Tiers";
import { ReviewView } from "@/components/review/ReviewView";
import type { Profile } from "@/lib/profile";
import type { Review } from "@/lib/review";
import type { CodeSource } from "@/lib/service/href";
import type { ReviewPlan } from "@/lib/service/types";
import { SITE } from "@/lib/site";
import { NO_SIGNAL_LINE } from "./parts";

/**
 * 검토 결과가 없는 분석의 맨 위 한 줄: 감지된 기능 N가지 · 걸릴 수 있는 의무 M개(저장소 프로필에서). 프로필이 없으면 두지 않는다.
 * 개수만 센다.
 */
export function OverviewLine({ profile }: { profile: Profile | null }) {
  if (!profile) return null;
  return (
    <p className="overview">
      {profile.features.length === 0 ? (
        // 신호만 본 프로필(AI 검토 없음)이 아무것도 찾지 못한 것은 기능이 없다는 뜻이 아니다(2026-11-16).
        <span>{NO_SIGNAL_LINE}</span>
      ) : (
        <>
          <span>
            감지된 기능 <b>{profile.features.length}가지</b>
          </span>{" "}
          <span>
            걸릴 수 있는 의무 <b>{profile.totals.duties}개</b>
          </span>
        </>
      )}
    </p>
  );
}

/**
 * 끝난 분석의 결과 화면(분석 쪽). 같은 커밋의 review 결과가 있으면 그 화면(`ReviewView`: 한 줄 → 코드에서 확인된 것 → 더 살펴볼
 * 것 → 접어 둔 흐름·하는 일·닫은 의무·검증 정보)이고 그 아래 진행 기록을 접어 둔다. 없으면(오늘의 검토 한도에 닿았거나, 맡겼는데 받지 못했거나, 검토를 켜기 전의 분석)
 * 저장소 프로필의 하는 일과 걸릴 수 있는 의무까지 보이고 셋째 단에 그 사실을 적는다(2026-11-12 오너 지시). 2026-11-25 오너 지시로
 * 규칙 검사의 결과는 보이지 않는다.
 */
export function AnalysisDashboard({
  code,
  progress,
  profile = null,
  review = null,
  reviewPlan,
  limitDay = null,
  exportLinks,
}: {
  code: CodeSource | null;
  progress?: ReactNode;
  /** 저장소 프로필. 없으면 1·2단에 "아직 없음"이라고 적는다. */
  profile?: Profile | null;
  /** 같은 커밋의 review 결과(policyofficer review 2판). */
  review?: Review | null;
  /** 이 분석에서 review 를 어떻게 했는지(run: 맡김, stored: 같은 커밋의 것을 씀, limit: 오늘의 한도에 닿음). */
  reviewPlan?: ReviewPlan;
  /** 한도에 닿은 분석이 오늘(한국 표준시)의 것이 아니면 그날(YYYY-MM-DD). 오늘이면 null 이고 "오늘 검토 한도가 찼습니다"라고 적는다. */
  limitDay?: string | null;
  /** review 체크리스트 내보내기의 주소(마크다운 파일, 인쇄용 보기). */
  exportLinks?: { markdown: string; print: string };
}) {
  if (review) {
    return (
      <div className="tiers">
        <ReviewView review={review} code={code} exportLinks={exportLinks} />
        {progress}
      </div>
    );
  }
  const note =
    reviewPlan === "run"
      ? SITE.service.reviewMissing
      : reviewPlan === "limit"
        ? limitDay
          ? `${limitDay} 검토 한도가 차서 검토하지 않았습니다.`
          : SITE.service.reviewLimit
        : SITE.service.reviewNone;
  return (
    <div className="tiers">
      <OverviewLine profile={profile} />
      <ProfileTier profile={profile} code={code} />
      <ObligationTier profile={profile} />
      <Tier n={3} name="의무 체크리스트">
        <p className="tier-none">{note}</p>
      </Tier>
      {progress}
    </div>
  );
}
