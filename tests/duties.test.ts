import { describe, expect, it } from "vitest";
import { articleLabel, dutyAnchor, dutyFeatureHref, dutyMap, fullArticle, lawGroups, policyHomeDuty } from "@/lib/duties";
import { lawArticle } from "@/lib/duties/article";
import { packMeta } from "@/lib/pack";
import { SANCTION } from "@/lib/review/text";
import { BANNED_WORDING } from "./wording";

// 의무 지도(조문 도감, 2026-11-15 오너 결정)의 자료: data/duty-map.json 은 scripts/export-duty-map.mjs 가 CLI 의 기능–의무 표에서
// 옮긴 것이다. 이 시험은 옆 폴더의 CLI 저장소 없이 돈다(옮긴 자료가 화면의 약속을 지키는지만 본다).

describe("의무 지도의 자료", () => {
  it("의무 id 는 한 번씩이고 기능은 기능 목록에 있다. 기능마다 의무가 하나 이상이고, 합이 AI 검토가 묻는 의무의 수다", () => {
    const ids = dutyMap.duties.map((duty) => duty.id);
    expect(new Set(ids).size).toBe(ids.length);
    const features = new Set(dutyMap.features.map((feature) => feature.id));
    for (const duty of dutyMap.duties) expect(features.has(duty.feature), duty.id).toBe(true);
    for (const feature of dutyMap.features) expect(dutyMap.duties.some((duty) => duty.feature === feature.id), feature.id).toBe(true);
    // 지위(공공기관·금융회사 같은 주체의 지위)로 걸리는 의무는 묻지 않으므로 목록에 없다.
    expect(features.has("status")).toBe(false);
    expect(dutyMap.asked).toBe(dutyMap.duties.length);
  });

  it("제재(2026-11-24)는 고정 커밋의 제재 표에서 옮긴 것이고(미리 보기용 파일로 만든 자료는 커밋하지 않는다), 모든 의무에 있거나 모두 없다", () => {
    const sanctioned = dutyMap.duties.filter((duty) => duty.sanction !== undefined);
    if (sanctioned.length === 0) {
      expect(dutyMap.cli.sanctions ?? null).toBeNull();
      return;
    }
    expect(dutyMap.cli.sanctions).toBe("git");
    expect(sanctioned).toHaveLength(dutyMap.duties.length);
    for (const duty of dutyMap.duties) {
      const sanction = duty.sanction!;
      expect(sanction, duty.id).not.toBeNull();
      expect([...sanction.label].length, duty.id).toBeLessThanOrEqual(32);
      for (const item of sanction.items) {
        if (item.url) expect(item.url.startsWith("https://www.law.go.kr/"), duty.id).toBe(true);
        expect(item.quote.trim().length, duty.id).toBeGreaterThan(0);
      }
    }
  });

  it("정적 규칙 팩의 정책은 모두 의무 지도의 의무를 가리키고, 정책이 붙은 의무는 팩의 정책만 가리킨다. 정책마다 내용을 싣는 의무는 팩에 적힌 첫 의무다", () => {
    for (const policy of packMeta.policies) expect(policyHomeDuty(policy.id)?.policies, policy.id).toContain(policy.id);
    // 국외 이전 정책(제28조의8, 제26조)은 표의 차례로는 제26조가 먼저지만 팩에 적힌 첫 의무는 제28조의8 이다.
    expect(policyHomeDuty("kr.pipa.28-8")?.id).toBe("pipa-28-8-1");
    expect(dutyMap.duties.findIndex((duty) => duty.id === "pipa-26-2")).toBeLessThan(dutyMap.duties.findIndex((duty) => duty.id === "pipa-28-8-1"));
    for (const policy of packMeta.policies) expect(dutyMap.duties.some((duty) => duty.policies.includes(policy.id)), policy.id).toBe(true);
    const known = new Set(packMeta.policies.map((policy) => policy.id));
    for (const duty of dutyMap.duties) for (const id of duty.policies) expect(known.has(id), `${duty.id} → ${id}`).toBe(true);
  });

  it("화면에 싣는 글(제목, 의무 한 줄, 걸리는 코드)에 쓰지 않는 말과 처분의 말이 없다. 제목 끝의 조사자 메모([…])는 뗐다", () => {
    for (const duty of dutyMap.duties) {
      for (const text of [duty.title, duty.duty, duty.trigger]) {
        if (text === null) continue;
        for (const [pattern, why] of BANNED_WORDING) expect(pattern.test(text), `${duty.id}: ${why}`).toBe(false);
        expect(SANCTION.test(text), duty.id).toBe(false);
      }
      if (duty.title) expect(duty.title, duty.id).not.toMatch(/\[[^\]]*\]$/);
      // 벌칙이 있는지 없는지의 조사자 메모(의무 한 줄 끝의 괄호)는 뗐다.
      if (duty.duty) expect(duty.duty, duty.id).not.toMatch(/\([^()]*벌칙[^()]*\)$/);
      if (duty.url) expect(duty.url.startsWith("https://www.law.go.kr/"), duty.id).toBe(true);
    }
  });

  it("법령 이름과 조문(fullArticle, lawArticle): '시행령'을 두 번 적지 않는다(CLI handoff-w13-2 전의 표·결과에는 조문 앞에 '시행령 '이 붙어 있다)", () => {
    const law = "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령";
    expect(lawArticle(law, "시행령 제27조제1항(법 제34조제1항)")).toBe(`${law} 제27조제1항(법 제34조제1항)`);
    expect(lawArticle(law, "제27조제1항(법 제34조제1항)")).toBe(`${law} 제27조제1항(법 제34조제1항)`);
    expect(lawArticle("근로기준법 시행규칙", "시행규칙 제2조")).toBe("근로기준법 시행규칙 제2조");
    expect(lawArticle("개인정보 보호법", "시행령 제30조")).toBe("개인정보 보호법 시행령 제30조");
    expect(lawArticle("개인정보 보호법", "")).toBe("개인정보 보호법");
    const decree = dutyMap.duties.find((duty) => duty.law.endsWith(" 시행령"))!;
    expect(fullArticle({ ...decree, article: `시행령 ${decree.article}` })).toBe(fullArticle(decree));
    for (const duty of dutyMap.duties) {
      expect(fullArticle(duty), duty.id).not.toMatch(/(시행령|시행규칙) \1/);
      expect(fullArticle(duty).endsWith(duty.article.replace(/^(시행령|시행규칙) /, "")), duty.id).toBe(true);
    }
  });

  it("법령 묶음은 의무를 빠짐없이 한 번씩 담고, 법에 묶은 시행령·시행규칙의 조문에는 법령 이름을 붙이되 '시행령'을 두 번 적지 않는다", () => {
    const groups = lawGroups();
    expect(groups.flatMap((group) => group.duties.map((duty) => duty.id)).sort()).toEqual(dutyMap.duties.map((duty) => duty.id).sort());
    for (const group of groups) {
      for (const duty of group.duties) {
        const label = articleLabel(duty, group.name);
        expect(label.endsWith(duty.article), duty.id).toBe(true);
        expect(label, duty.id).not.toMatch(/(시행령|시행규칙) \1/);
        if (duty.lawShort !== group.name) expect(label.startsWith(`${group.name} `), duty.id).toBe(true);
      }
    }
  });

  it("주소: 쪽 안의 자리는 의무 id 에서만, 기능으로 거른 주소는 ?f=<기능 id>", () => {
    expect(dutyAnchor("pipa-22-2-1")).toBe("duty-pipa-22-2-1");
    // 한글이 든 id 는 글자 번호로 바꾼다(주소에 그대로 두면 퍼센트 부호로 바뀐다).
    expect(dutyAnchor("elec-safety-34의5-2")).toBe("duty-elec-safety-34_c758_5-2");
    const anchors = dutyMap.duties.map((duty) => dutyAnchor(duty.id));
    for (const anchor of anchors) expect(anchor).toMatch(/^duty-[A-Za-z0-9_-]+$/);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(dutyFeatureHref("ad-send")).toBe("/policy/?f=ad-send");
  });
});
