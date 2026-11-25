import type { Metadata } from "next";
import { DutyMap } from "@/components/policy/DutyMap";
import { dutyMap, lawGroups } from "@/lib/duties";
import { SANCTION_TEXT } from "@/lib/duties/sanction";

export const metadata: Metadata = { title: "조문 도감" };

/**
 * 조문 도감 = 의무 지도(2026-11-15 오너 결정). 빌드할 때 그린다.
 *
 * - 한 줄: 의무 지도의 몇 개를 AI 검토가 묻고, 나머지는 왜 묻지 않는지(`data/duty-map.json` 에서 센다).
 * - 메타 한 줄: 의무를 옮긴 CLI 커밋, AI 검토가 묻는 의무·법령·기능의 수.
 * - 법령마다 AI 검토가 묻는 의무(`DutyMap`). 기능·법령·제재로 걸러 보고, 의무마다 법에 적힌 제재의 표지가 있다(위에 주의 문구 한 번).
 */
export default function PolicyIndexPage() {
  const groups = lawGroups();
  const krcore = dutyMap.duties.filter((duty) => !duty.candidate).length;
  const sanctioned = dutyMap.duties.some((duty) => duty.sanction);
  return (
    <>
      {/* data-page: 머리글이 지금 쪽(조문 도감)을 표시하는 데 쓴다(CSS :has. 머리글의 HTML 은 모든 쪽에서 같다). */}
      <h1 data-page="policy">조문 도감</h1>
      <p className="pi-meta">
        <span>
          CLI <code translate="no">{dutyMap.cli.commit.slice(0, 7)}</code>
        </span>{" "}
        <span>AI 검토가 묻는 의무 {dutyMap.asked}</span> <span>법령 {groups.length}</span> <span>기능 {dutyMap.features.length}</span>
      </p>
      <p className="dm-lead">
        의무 지도 {dutyMap.total}개 가운데 AI 검토가 묻는 것은 검토 후보 {dutyMap.candidates}개
        {krcore > 0 && `와, 검토 후보는 아니지만 CLI 가 따로 정해 함께 묻는 의무 ${krcore}개`}입니다. 나머지 {dutyMap.notAsked.total}개는 공공기관·금융회사 같은 지위에
        걸리는 의무 {dutyMap.notAsked.status}개와, 조사 확신이 높지 않거나 조문 대조가 맞지 않은 의무 {dutyMap.notAsked.other}개라 묻지
        않습니다.
      </p>
      {/* 의무 줄의 제재 표지(2026-11-24)는 법에 적힌 최대 제재다. 그 주의 문구를 한 번 둔다. */}
      {sanctioned && <p className="hint sanc-caution">{SANCTION_TEXT.note}</p>}

      <DutyMap groups={groups} />
    </>
  );
}
