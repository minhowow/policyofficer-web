import type { Metadata } from "next";
import { DutyMap } from "@/components/policy/DutyMap";
import { NotSeenList } from "@/components/result/Coverage";
import { StatusChip } from "@/components/result/StatusChip";
import { dutyMap, lawGroups } from "@/lib/duties";
import { SANCTION_TEXT } from "@/lib/duties/sanction";
import { packMeta } from "@/lib/pack";
import { NOT_IN_PACK } from "@/lib/pack/guide";
import { SCOPE_LEGEND } from "@/lib/report/scope";
import { STATUS_LEGEND, STATUS_ORDER } from "@/lib/report/status";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "조문 도감" };

/**
 * 조문 도감 = 의무 지도(2026-11-15 오너 결정). 빌드할 때 그린다.
 *
 * - 한 줄: 의무 지도의 몇 개를 AI 검토가 묻고, 나머지는 왜 묻지 않는지(`data/duty-map.json` 에서 센다).
 * - 메타 한 줄: 의무를 옮긴 CLI 커밋, 법령·기능의 수, 정적 규칙 팩과 판.
 * - 법령마다 AI 검토가 묻는 의무(`DutyMap`). 기능·법령·제재로 걸러 보고, 의무마다 법에 적힌 제재의 표지가 있다(위에 주의 문구 한 번). 정적 규칙이 있는 의무에는 표시가 있고, 펼치면 그 규칙(정책)이 있다.
 * - `#status` 상태의 뜻: 상태 7개(`STATUS_LEGEND`)와 판정 범위(`SCOPE_LEGEND`). 결과 화면의 곁칸과 데모의 표가 이리로 잇는다.
 * - `#scope` 검사에 들지 않는 파일과 정보(`SITE.notSeen`). 발견이 있는 결과의 검사 정보가 이리로 잇는다.
 */
export default function PolicyIndexPage() {
  const { pack, policies } = packMeta;
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
        <span>법령 {groups.length}</span> <span>기능 {dutyMap.features.length}</span>{" "}
        <span>
          정적 규칙 {policies.length} · 팩 {pack.id ? <code translate="no">{pack.id}</code> : NOT_IN_PACK}
        </span>
      </p>
      <p className="dm-lead">
        의무 지도 {dutyMap.total}개 가운데 AI 검토가 묻는 것은 검토 후보 {dutyMap.candidates}개
        {krcore > 0 && `와, 검토 후보는 아니지만 정적 규칙이 있어 함께 묻는 의무 ${krcore}개`}입니다. 나머지 {dutyMap.notAsked.total}개는 공공기관·금융회사 같은 지위에
        걸리는 의무 {dutyMap.notAsked.status}개와, 조사 확신이 높지 않거나 조문 대조가 맞지 않은 의무 {dutyMap.notAsked.other}개라 묻지
        않습니다.
      </p>
      {/* 의무 줄의 제재 표지(2026-11-24)는 법에 적힌 최대 제재다. 그 주의 문구를 한 번 둔다. */}
      {sanctioned && <p className="hint sanc-caution">{SANCTION_TEXT.note}</p>}

      <DutyMap groups={groups} />

      <section className="pi-sec" id="status" aria-labelledby="status-title">
        <h2 className="sec-h" id="status-title">
          상태의 뜻
        </h2>
        <dl className="box rows defs">
          {STATUS_ORDER.map((status) => (
            <div key={status}>
              <dt>
                <StatusChip status={status} />
              </dt>
              <dd>{STATUS_LEGEND[status]}</dd>
            </div>
          ))}
          {SCOPE_LEGEND.map((scope) => (
            <div key={scope.label}>
              <dt>{scope.label}</dt>
              <dd>{scope.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="pi-sec" id="scope" aria-labelledby="scope-title">
        <h2 className="sec-h" id="scope-title">
          {SITE.notSeen.title}
        </h2>
        <div className="box not-seen-box">
          <p className="hint">{SITE.notSeen.bookLead}</p>
          <NotSeenList />
        </div>
      </section>
    </>
  );
}
