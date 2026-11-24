import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { articleLabel, dutyAnchor, dutyMap, featureName, fullArticle, policyHomeDuty, type LawGroup, type MapDuty } from "@/lib/duties";
import { SANCTION_TIERS, sanctionTier } from "@/lib/duties/sanction";
import { findPolicy, policyHref, ruleHref } from "@/lib/pack";
import { HASH_MISMATCH_NOTE } from "@/lib/pack/guide";
import type { PolicyMeta } from "@/lib/pack/types";
import { DutyFilter } from "./DutyFilter";
import { DutyRows, type DutyRowData } from "./DutyRows";

/**
 * 조문 도감의 의무 지도(2026-11-15 오너 결정). 빌드할 때 그린다. 법령마다 AI 검토가 묻는 의무를 줄로 싣는다. 줄을 펼치면 의무 한
 * 줄, 걸리는 기능과 코드, 법제처 링크, 그리고 정적 규칙이 있는 의무에는 그 규칙(정책)의 질문·근거 조문·규칙 목록이 들어 있다(전에는
 * 조문 도감의 목록이 이 정책 여섯이었다. 대안까지 다 적은 정책 쪽 `/policy/<정책>/` 은 결과 화면의 규칙 링크가 그대로 잇는다).
 * 걸러 보기는 `DutyFilter`(브라우저 부품, 어디에도 요청하지 않음)가 줄의 `data-f`(기능)·`data-s`(제재의 무게, 2026-11-24)와 묶음의
 * `data-l`(법령)로 한다. 의무마다 법에 적힌 제재의 표지와 조문은 제재 표가 있는 판에서만 있다. 줄은
 * `DutyRows` 가 짧은 글로 받아 그린다(쪽을 옮겨 올 때 받는 내용을 줄이려고). 글은 여기서 고른다.
 */
export function DutyMap({ groups }: { groups: LawGroup[] }) {
  const features = dutyMap.features;
  const featureIndex = new Map(features.map((feature, i) => [feature.id, i]));
  const tierOf = (duty: MapDuty) => (duty.sanction ? sanctionTier(duty.sanction) : -1);
  const index = groups.flatMap((group, l) =>
    group.duties.map((duty) => [featureIndex.get(duty.feature) ?? -1, l, tierOf(duty)] as [number, number, number]),
  );
  const sanctioned = dutyMap.duties.some((duty) => duty.sanction);
  const statics: Record<string, ReactNode> = {};
  const rows = groups.map((group) => ({
    name: group.name,
    rows: group.duties.map((duty) => {
      const row = rowOf(duty, group.name, featureIndex.get(duty.feature) ?? -1);
      const policy = duty.policies.map((id) => findPolicy(id)).find((p): p is PolicyMeta => Boolean(p));
      if (policy && !row.jump) statics[row.id] = <StaticRule policy={policy} />;
      return row;
    }),
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
      <DutyRows groups={rows} statics={statics} />
    </>
  );
}

/** 의무 한 줄에 싣는 글. 정책 하나가 의무 둘을 가리키면 정책의 내용은 팩에 적힌 첫 의무에 싣고, 둘째 의무는 그리로 잇는다. */
function rowOf(duty: MapDuty, group: string, f: number): DutyRowData {
  const policy = duty.policies.map((id) => findPolicy(id)).find((p): p is PolicyMeta => Boolean(p));
  const home = policy ? policyHomeDuty(policy.id) : null;
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
    rule: Boolean(policy),
    jump: policy && home && home.id !== duty.id ? { title: policy.title, id: dutyAnchor(home.id), full: fullArticle(home) } : null,
    sanction: duty.sanction ?? null,
  };
}

/**
 * 정적 규칙(정책 팩 kr-core 의 정책 하나). 정책 쪽 머리의 것(제목·id·개발자에게 할 질문)과 근거 조문(팩 메타데이터의 원문, 대표
 * 조문만 펼침), 규칙마다 첫 대안의 알리는 말(정책 쪽의 그 규칙 자리로 잇는다). 대안·적용 질문까지 다 적은 것은 정책 쪽에 있다.
 */
function StaticRule({ policy }: { policy: PolicyMeta }) {
  return (
    <section className="dr-static" aria-label={`정적 규칙 ${policy.title}`}>
      <p className="dr-static-h">
        <span className="tag">정적 규칙</span> <b>{policy.title}</b> <code translate="no">{policy.id}</code>
      </p>
      {policy.ask_developer && (
        <div className="pd-q">
          <p className="lbl">개발자에게 할 질문</p>
          <p className="question">{policy.ask_developer}</p>
        </div>
      )}
      <ul className="dr-legal">
        {policy.legal.map((legal, i) => (
          <li key={`${legal.label}:${i}`}>
            {legal.text ? (
              <details className="fold" open={i === 0}>
                <summary>{legal.label}</summary>
                {legal.text_sha256_matches === false && <p className="notice notice-warn">{HASH_MISMATCH_NOTE}</p>}
                <pre className="statute">{legal.text}</pre>
              </details>
            ) : (
              <span>{legal.label}</span>
            )}
          </li>
        ))}
      </ul>
      <ul className="dr-rules">
        {policy.rules.map((rule, i) => (
          <li key={`${rule.id}:${i}`}>
            {rule.id ? <Link href={ruleHref(policy.id, rule.id)}>{rule.alternatives[0]?.message ?? rule.id}</Link> : (rule.alternatives[0]?.message ?? "")}{" "}
            {rule.id && <code translate="no">{rule.id}</code>}
          </li>
        ))}
      </ul>
      <p className="dr-more">
        <Link href={policyHref(policy.id)}>
          규칙 {policy.rules.length}개의 대안·질문 자세히
          <Icon name="chevron-right" />
        </Link>
      </p>
    </section>
  );
}
