import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CasePage from "@/app/cases/[slug]/page";
import PolicyIndexPage from "@/app/policy/page";
import { ChecklistSheet } from "@/components/review/ChecklistSheet";
import { ReviewView } from "@/components/review/ReviewView";
import { findCase } from "@/lib/cases";
import { caseChecklist } from "@/lib/cases/checklist";
import { dutyMap, sanctionOf } from "@/lib/duties";
import { byWeight, SANCTION_TEXT, SANCTION_TIERS, sanctionTier, type Sanction } from "@/lib/duties/sanction";
import { parseReview } from "@/lib/review";
import { checklistDoc, checklistMarkdown } from "@/lib/review/checklist";
import { elementsOf, textOf } from "./helpers";
import { FIXTURE_SANCTIONS, withoutSanctions } from "./sanctions";
import { BANNED_WORDING } from "./wording";

// 의무마다 법에 적힌 제재(2026-11-24 오너 승인). 의무 지도에 시험용 레코드(tests/fixtures/sanctions.jsonl)를 붙여 그린다. 사례 jobtalk 의
// 체크리스트 의무 가운데 아홉에 레코드가 있다(코드에서 본 것 여섯, 따로 확인할 것 하나, 해당 여부부터 하나, 해당 없음 하나).
vi.mock("@data/duty-map.json", async (importOriginal) => {
  const { withFixtureSanctions } = await import("./sanctions");
  const original = (await importOriginal()) as { default: Parameters<typeof withFixtureSanctions>[0] };
  return { default: withFixtureSanctions(original.default) };
});

const jobtalk = findCase("jobtalk")!;
const review = parseReview(jobtalk.review)!;
const fixtures = Object.values(FIXTURE_SANCTIONS);
const expectNoBanned = (text: string) => {
  const rest = withoutSanctions(text, fixtures);
  for (const [pattern, why] of BANNED_WORDING) expect(pattern.test(rest), `${pattern} — ${why}`).toBe(false);
};
/** 그린 체크리스트에서 갈래 하나(코드에서 본 것은 섹션, 나머지는 접는 묶음)의 의무 차례. 항목의 법·조문 줄로 가린다. */
const lawOf = (duty: string) => {
  const item = review.checklist.find((i) => i.duty === duty)!;
  return `${item.law} ${item.article}`;
};
const orderIn = (html: string, open: string) =>
  elementsOf(elementsOf(html, open)[0], '<li class="rv-item"').map((li) => {
    const law = textOf(elementsOf(li, '<p class="rv-law">')[0]);
    return review.checklist.find((item) => law.startsWith(`${item.law} ${item.article}`))!.duty;
  });

describe("제재 표의 모양과 무게", () => {
  it("의무 지도의 의무마다 제재가 붙고(레코드가 없으면 null), 무게는 셋으로 가른다", () => {
    expect(sanctionOf("tcra-3-2")?.label).toBe("징역 5년 · 과징금 매출 3%");
    expect(sanctionOf("pipa-15-2")).toBeNull();
    expect(sanctionOf("없는-의무")).toBeNull();
    expect(dutyMap.duties.filter((duty) => duty.sanction).length).toBe(fixtures.length);
    const tiers = Object.fromEntries(Object.entries(FIXTURE_SANCTIONS).map(([id, s]) => [id, sanctionTier(s)]));
    expect(tiers).toEqual({
      "tcra-3-2": 0,
      "pipa-26-2": 0,
      "pipa-22-2-1": 0,
      "pipa-34-2-1": 0,
      "pipa-29-1": 1,
      "safety-std-5-6": 1,
      "safety-std-7-4": 1,
      "dincl-19-2": 2,
      "aiact-31-2": 2,
    });
    expect(SANCTION_TIERS.map((tier) => tier.label)).toEqual(["징역·과징금", "벌금·과태료", "명령·없음"]);
    expect(SANCTION_TEXT.heavy).toBe("어기면 징역·과징금이 걸리는 항목");
  });

  it("무거운 차례: 징역 > 과징금 > 벌금 > 과태료 > 명령 > 없음 > 표에 없음, 같은 갈래면 정액 상한이 큰 것, 그다음은 받은 차례", () => {
    const s = (cls: Sanction["class"], maxWon: number | null): Sanction => ({ class: cls, label: "", maxWon, items: [], note: null, asOf: "" });
    const list: [string, Sanction | null][] = [
      ["a", null],
      ["b", s("과태료", 10)],
      ["c", s("없음", null)],
      ["d", s("과태료", 30)],
      ["e", s("징역", null)],
      ["f", s("명령", 5)],
      ["g", s("과징금", null)],
      ["h", s("과태료", 30)],
      ["i", s("벌금", 1)],
      ["j", null],
      ["k", s("과태료", null)],
    ];
    expect(byWeight(list, ([, x]) => x).map(([id]) => id)).toEqual(["e", "g", "i", "d", "h", "b", "k", "f", "c", "a", "j"]);
  });
});

describe("결과 체크리스트의 표지·정렬·요약 (사례 jobtalk)", () => {
  const html = renderToStaticMarkup(<ReviewView review={review} />);

  it("항목 제목 옆에 '어기면 · 표지 말'. 강조는 기호와 굵은 모양, 보통·흐림은 다른 모양이다", () => {
    const badges = elementsOf(html, '<span class="sanc ');
    expect(badges.map(textOf)).toHaveLength(fixtures.length);
    for (const badge of badges) expect(textOf(badge)).toMatch(/^(! )?어기면 · /);
    const heavy = badges.filter((b) => b.startsWith('<span class="sanc sanc-0">'));
    expect(heavy.length).toBe(4);
    for (const badge of heavy) expect(badge).toContain('<span class="sanc-mark" aria-hidden="true">!</span>');
    expect(badges.filter((b) => b.startsWith('<span class="sanc sanc-1">')).map(textOf)).toEqual(
      expect.arrayContaining(["어기면 · 과태료 3천만원", "어기면 · 과태료 1천만원", "어기면 · 벌금 3천만원"]),
    );
    expect(badges.filter((b) => b.startsWith('<span class="sanc sanc-2">')).map(textOf).sort()).toEqual(["어기면 · 시정명령을 어기면 과태료", "어기면 · 제재 조항 없음"]);
    // 표지는 제목(의무 한 줄)과 한 묶음에 있다(좁은 화면에서는 CSS 가 제목 아래로 내린다).
    for (const title of elementsOf(html, '<div class="rv-title">').filter((t) => t.includes('class="sanc '))) expect(title).toMatch(/^<div class="rv-title">(<p class="rv-duty">[\s\S]*?<\/p> )?<span class="sanc /);
  });

  it("상태 묶음 안에서 무거운 차례로, 같은 무게는 지금 차례(코드에서 본 것은 요약이 고른 다섯 먼저). 펼쳐 둔 다섯은 그 차례의 앞 다섯이다", () => {
    const seen = orderIn(html, '<section class="ck ck-check">');
    expect(seen).toEqual([
      "tcra-3-2",
      "pipa-26-2",
      "pipa-29-1",
      "safety-std-5-6",
      "dincl-19-2",
      "aiact-31-2",
      "safety-std-6-3",
      "pipa-15-2",
      "aiact-31-1",
      "pipa-28-8-1",
      "pipa-28-8-2",
    ]);
    const lead = elementsOf(html, '<ol class="rv-items">')[0];
    expect(elementsOf(lead, '<li class="rv-item"')).toHaveLength(5);
    expect(lead).toContain(lawOf("dincl-19-2"));
    expect(lead).not.toContain(lawOf("aiact-31-2"));
    expect(orderIn(html, '<details class="rv-group rv-check-applicability">')[0]).toBe("pipa-22-2-1");
    expect(orderIn(html, '<details class="rv-group rv-not-applicable">')[0]).toBe("pipa-34-2-1");
  });

  it("맨 위 요약: 확인할 것 가운데 징역·과징금이 걸리는 항목의 수(해당 없음의 과징금은 세지 않는다), 누르면 그 항목만. 주의 문구는 한 번", () => {
    const overview = elementsOf(html, '<p class="overview">')[0];
    expect(textOf(overview)).toContain("어기면 징역·과징금이 걸리는 항목 3건");
    expect(overview).toContain('aria-controls="rv-checklist"');
    expect(html).toContain('<div class="rv-check" id="rv-checklist">');
    expect(html.match(/ data-heavy=""/g)).toHaveLength(3);
    expect(html.split(SANCTION_TEXT.note)).toHaveLength(2);
    expect(html.indexOf(SANCTION_TEXT.note)).toBeLessThan(html.indexOf('id="rv-checklist"'));
  });

  it("항목 상세: 제재 조문마다 걸리는 때·제재 문구·법과 조항·법제처 링크, 원문은 접어 둔다. 보충 한 줄", () => {
    const li = elementsOf(html, '<li class="rv-item"').find((item) => item.includes(lawOf("pipa-26-2")))!;
    const detail = elementsOf(li, '<div class="sanc-detail">')[0];
    const lines = elementsOf(detail, '<p class="sanc-line">').map(textOf);
    expect(lines[0]).toBe("3천만원 이하의 과태료 시험법 제75조제2항제3호 법제처(새 창, 시험법 제75조제2항제3호)");
    expect(lines[1]).toMatch(/^개인정보가 유출되면 전체 매출액의 100분의 3 이하의 과징금 시험법 제64조의2제1항 법제처/);
    expect(detail).toContain('<details class="sanc-quote"><summary>원문</summary><blockquote class="statute">(시험용 원문. 실제 조문이 아닙니다)</blockquote></details>');
    expect(textOf(detail)).toContain("고의·중과실·반복이면 매출 10%까지");
    const order = elementsOf(html, '<li class="rv-item"').find((item) => item.includes(lawOf("dincl-19-2")))!;
    expect(textOf(elementsOf(order, '<p class="sanc-line">')[0])).toMatch(/^시정명령 등을 따르지 않았을 때 3천만원 이하의 과태료/);
    // 제재 조항이 없는 의무는 표지만 있다.
    const none = elementsOf(html, '<li class="rv-item"').find((item) => item.includes(lawOf("aiact-31-2")))!;
    expect(none).not.toContain("sanc-detail");
  });

  it("징역·과징금 항목이 확인할 것에 없으면 요약은 0건(누르는 단추 없이), 제재가 붙은 의무가 하나도 없으면 요약·주의 문구·표지가 없다", () => {
    const light = parseReview({
      ...(jobtalk.review as object),
      checklist: (jobtalk.review as { checklist: { duty: string }[] }).checklist.filter((item) => !["tcra-3-2", "pipa-26-2", "pipa-22-2-1"].includes(item.duty)),
    })!;
    const zero = renderToStaticMarkup(<ReviewView review={light} />);
    expect(textOf(elementsOf(zero, '<p class="overview">')[0])).toContain("어기면 징역·과징금이 걸리는 항목 0건");
    expect(zero).not.toContain("sanc-filter");
    expect(zero).toContain(SANCTION_TEXT.note);
    const bare = parseReview({
      ...(jobtalk.review as object),
      checklist: (jobtalk.review as { checklist: { duty: string }[] }).checklist.filter((item) => !FIXTURE_SANCTIONS[item.duty]),
    })!;
    const plain = renderToStaticMarkup(<ReviewView review={bare} />);
    expect(plain).not.toContain(SANCTION_TEXT.heavy);
    expect(plain).not.toContain(SANCTION_TEXT.note);
    expect(plain).not.toContain('class="sanc');
  });

  it("사례 쪽 전체: 표지가 붙고, 제재 표의 몫을 빼면 쓰지 않는 말이 없다", async () => {
    const page = renderToStaticMarkup(await CasePage({ params: Promise.resolve({ slug: "jobtalk" }) }));
    expect(elementsOf(page, '<span class="sanc ')).toHaveLength(fixtures.length);
    expect(textOf(page)).toContain("어기면 징역·과징금이 걸리는 항목 3건");
    expectNoBanned(textOf(page));
  });
});

describe("체크리스트 내보내기(마크다운·인쇄용 보기)의 제재", () => {
  const found = caseChecklist(jobtalk)!;
  const doc = found.doc;

  it("화면과 같은 차례·같은 수", () => {
    expect(doc.overview.heavy).toBe(3);
    expect(doc.groups[0].entries.map((entry) => entry.duty).slice(0, 6)).toEqual(["tcra-3-2", "pipa-26-2", "pipa-29-1", "safety-std-5-6", "dincl-19-2", "aiact-31-2"]);
    expect(checklistDoc({ ...review, checklist: review.checklist.filter((item) => !FIXTURE_SANCTIONS[item.duty]) }).overview.heavy).toBeNull();
  });

  it("마크다운: 항목 줄에 표지, 아래에 제재 조문과 원문, 머리에 요약과 주의 문구", () => {
    const text = checklistMarkdown(doc, found.source);
    expect(text).toContain("어기면 징역·과징금이 걸리는 항목 3건");
    expect(text.split(SANCTION_TEXT.note)).toHaveLength(2);
    expect(text).toMatch(/^- \[ \] \*\*약관의 규제에 관한 법률 제3조제2항\*\* · 어기면 · 징역 5년 · 과징금 매출 3%$/m);
    expect(text).toContain("  - 어기면: 개인정보가 유출되면 전체 매출액의 100분의 3 이하의 과징금 · 시험법 제64조의2제1항 (법제처: ");
    expect(text).toContain("    > (시험용 원문. 실제 조문이 아닙니다)");
    expectNoBanned(text);
  });

  it("인쇄용 보기: 항목 줄에 표지(색 없이 기호·테두리로), 제재 조문과 원문을 펼쳐 싣는다", () => {
    const sheet = renderToStaticMarkup(<ChecklistSheet doc={doc} source={found.source} back="/cases/jobtalk/" markdown="/api/cases/jobtalk/checklist/" />);
    const first = elementsOf(sheet, '<li class="ck-entry">')[0];
    expect(textOf(elementsOf(first, '<p class="ck-law">')[0])).toBe("약관의 규제에 관한 법률 제3조제2항 ! 어기면 · 징역 5년 · 과징금 매출 3%");
    expect(first).toContain('<span class="sanc sanc-0"><span class="sanc-mark" aria-hidden="true">!</span> 어기면 · ');
    expect(elementsOf(first, '<p class="ck-quote">')).toHaveLength(2);
    expect(textOf(sheet)).toContain(SANCTION_TEXT.note);
    expectNoBanned(textOf(sheet));
  });
});

describe("조문 도감의 표지와 제재 거르개", () => {
  const html = renderToStaticMarkup(<PolicyIndexPage />);

  it("의무 줄마다 표지(제목 옆), 줄에 data-s(무게), 표에 없는 의무는 -1", () => {
    const rows = elementsOf(html, '<details class="duty-row"');
    expect(rows).toHaveLength(dutyMap.duties.length);
    const tagged = rows.filter((row) => row.includes('<span class="sanc '));
    expect(tagged).toHaveLength(fixtures.length);
    for (const row of tagged) expect(row).toMatch(/<span class="dr-head"><span class="dr-title">[^<]*<\/span> <span class="sanc sanc-[012]">/);
    expect(rows.filter((row) => row.includes('data-s="0"'))).toHaveLength(4);
    expect(rows.filter((row) => row.includes('data-s="-1"'))).toHaveLength(dutyMap.duties.length - fixtures.length);
    const row = rows.find((r) => r.includes(" 어기면 · 과태료 3천만원 · 유출되면 과징금<"))!;
    expect(row).toContain('<div class="sanc-detail">');
  });

  it("제재 거르개: 모든 제재 / 징역·과징금 / 벌금·과태료 / 명령·없음(수), 기능·법령 거르개와 함께 있다", () => {
    const filter = elementsOf(html, '<div class="dm-filter">')[0];
    const selects = elementsOf(filter, "<select");
    expect(selects).toHaveLength(3);
    expect(elementsOf(selects[2], "<option").map(textOf)).toEqual(["모든 제재", "징역·과징금 (4)", "벌금·과태료 (3)", "명령·없음 (2)"]);
    expect(textOf(filter)).toContain(`의무 ${dutyMap.duties.length}`);
  });
});
