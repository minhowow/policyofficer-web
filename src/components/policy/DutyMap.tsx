import { articleLabel, dutyAnchor, dutyMap, featureName, fullArticle, type LawGroup, type MapDuty } from "@/lib/duties";
import { SANCTION_TIERS, sanctionTier } from "@/lib/duties/sanction";
import { DutyFilter } from "./DutyFilter";
import { DutyRows, type DutyRowData } from "./DutyRows";

/**
 * 조문 도감의 의무 지도(2026-11-15 오너 결정). 빌드할 때 그린다. 법령마다 AI 검토가 묻는 의무를 줄로 싣는다. 줄을 펼치면 의무 한
 * 줄, 걸리는 기능과 코드, 법제처 링크, 법에 적힌 제재가 있다. 걸러 보기는 `DutyFilter`(브라우저 부품, 어디에도 요청하지 않음)가
 * 줄의 `data-f`(기능)·`data-s`(제재의 무게, 2026-11-24)와 묶음의 `data-l`(법령)로 한다. 의무마다 법에 적힌 제재의 표지와 조문은 제재
 * 표가 있는 판에서만 있다. 줄은 `DutyRows` 가 짧은 글로 받아 그린다(쪽을 옮겨 올 때 받는 내용을 줄이려고). 글은 여기서 고른다.
 */
export function DutyMap({ groups }: { groups: LawGroup[] }) {
  const features = dutyMap.features;
  const featureIndex = new Map(features.map((feature, i) => [feature.id, i]));
  const tierOf = (duty: MapDuty) => (duty.sanction ? sanctionTier(duty.sanction) : -1);
  const index = groups.flatMap((group, l) =>
    group.duties.map((duty) => [featureIndex.get(duty.feature) ?? -1, l, tierOf(duty)] as [number, number, number]),
  );
  const sanctioned = dutyMap.duties.some((duty) => duty.sanction);
  const rows = groups.map((group) => ({
    name: group.name,
    rows: group.duties.map((duty) => rowOf(duty, group.name, featureIndex.get(duty.feature) ?? -1)),
  }));
  return (
    <>
      <DutyFilter
        features={features.map((feature) => ({ id: feature.id, name: feature.name, n: dutyMap.duties.filter((duty) => duty.feature === feature.id).length }))}
        laws={groups.map((group) => ({ name: group.name, n: group.duties.length }))}
        tiers={
          sanctioned
            ? SANCTION_TIERS.map((tier, s) => ({ name: tier.label, n: dutyMap.duties.filter((duty) => tierOf(duty) === s).length }))
            : []
        }
        index={index}
      />
      <DutyRows groups={rows} />
    </>
  );
}

/** 의무 한 줄에 싣는 글. */
function rowOf(duty: MapDuty, group: string, f: number): DutyRowData {
  return {
    id: dutyAnchor(duty.id),
    f,
    s: duty.sanction ? sanctionTier(duty.sanction) : -1,
    title: duty.title,
    article: articleLabel(duty, group),
    cond: [
      featureName(duty.feature),
      ...[duty.goods && `품목: ${duty.goods}`, duty.whenever && "이 기능이 있으면 걸림", duty.audience && "이용자 나이에 따라 걸림"].filter(
        (text): text is string => Boolean(text),
      ),
    ],
    duty: duty.duty,
    trigger: duty.trigger,
    full: fullArticle(duty),
    url: duty.url,
    sanction: duty.sanction ?? null,
  };
}
