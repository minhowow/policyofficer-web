import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PolicyIndexPage from "@/app/policy/page";
import { ChecklistSheet } from "@/components/review/ChecklistSheet";
import { ReviewView } from "@/components/review/ReviewView";
import { dutyAnchor, dutyMap, sanctionOf } from "@/lib/duties";
import { lawArticle } from "@/lib/duties/article";
import { byWeight, SANCTION_TEXT, SANCTION_TIERS, sanctionTier, type Sanction } from "@/lib/duties/sanction";
import { parseReview } from "@/lib/review";
import { checklistDoc, checklistMarkdown, type ChecklistSource } from "@/lib/review/checklist";
import { confirmedItems } from "@/lib/review/pick";
import { analysisHref, checklistMarkdownHref } from "@/lib/service/href";
import { PRERUNS } from "@/lib/service/prerun";
import { SITE } from "@/lib/site";
import { elementsOf, textOf } from "./helpers";
import { FIXTURE_SANCTIONS, withoutSanctions, withoutSanctionsMarkdown } from "./sanctions";
import { BANNED_WORDING } from "./wording";

// 의무마다 법에 적힌 제재(2026-11-24 오너 승인). 의무 지도에 시험용 레코드(tests/fixtures/sanctions.jsonl)를 붙여 그린다. 미리 돌려 넣은
// 분석 jobtalk(src/lib/service/prerun.ts, 2026-11-24)의 체크리스트 의무 가운데 아홉에 레코드가 있다(코드에서 본 것 일곱, 해당 여부부터
// 하나, 해당 없음 하나).
vi.mock("@data/duty-map.json", async (importOriginal) => {
  const { withFixtureSanctions } = await import("./sanctions");
  const original = (await importOriginal()) as { default: Parameters<typeof withFixtureSanctions>[0] };
  return { default: withFixtureSanctions(original.default) };
});

const prerun = PRERUNS[0];
const review = parseReview(prerun.review)!;
const code = { htmlUrl: `https://github.com/${prerun.owner}/${prerun.name}`, commit: prerun.commit };
/** 내보내기의 출처 줄(분석 쪽의 내보내기와 같은 모양. 사실 줄은 미리 돌린 결과와 그날). */
const source: ChecklistSource = { repo: `${prerun.owner}/${prerun.name}`, htmlUrl: code.htmlUrl, commit: prerun.commit, facts: [`${SITE.prerun} ${prerun.ranOn}`] };
const fixtures = Object.values(FIXTURE_SANCTIONS);
/** 제재 표의 몫을 뺀 나머지에 쓰지 않는 말이 없다(HTML 은 요소째, 마크다운은 줄째 뺀다). */
const expectNoBanned = (rest: string) => {
  for (const [pattern, why] of BANNED_WORDING) expect(pattern.test(rest), `${pattern} — ${why}`).toBe(false);
};
/** 의무의 법·조문 줄. */
const lawOf = (duty: string) => {
  const item = review.checklist.find((i) => i.duty === duty)!;
  return lawArticle(item.law, item.article);
};
/** 그린 체크리스트에서 갈래 하나(더 살펴볼 것의 세 갈래는 섹션, 닫은 의무는 접는 묶음)의 의무 차례. 행의 자리(의무 id)로 가린다. */
const orderIn = (html: string, open: string) =>
  elementsOf(elementsOf(html, open)[0], '<li class="rv-item"').map((li) => /<details class="rv-row" id="duty-([^"]+)"/.exec(li)![1]);
/** 그린 체크리스트에서 의무 한 건의 행(카드에 오른 의무면 없다). */
const rowIn = (html: string, duty: string) => elementsOf(html, '<li class="rv-item"').find((li) => li.includes(`id="${dutyAnchor(duty)}"`))!;
/** 그린 결과에서 '코드에서 확인된 것' 카드 한 장(2026-11-25 web18). */
const cardIn = (html: string, duty: string) => elementsOf(html, `<li class="rv-card" id="${dutyAnchor(duty)}"`)[0];

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
    expect(SANCTION_TEXT.heavy).toBe("징역·과징금이 걸리는 항목");
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

  it("시험 도우미는 제재 표의 몫을 자리째 뺀다. 같은 글이 다른 자리에 실리면 가리지 않는다", () => {
    const html = '<p class="rv-duty">근거가 있을 때만 [과징금 매출 3%]</p><span class="sanc sanc-0"><span class="sanc-mark">!</span> 과징금 매출 3%</span>';
    expect(textOf(withoutSanctions(html))).toBe("근거가 있을 때만 [과징금 매출 3%]");
    const md = "- [ ] **법 제1조** · 과징금 매출 3% (반박이 바꿈)\n  - 의무: 과태료 메모\n  - 제재: 3천만원 이하의 과태료 · 시험법 제1조\n    > 원문";
    expect(withoutSanctionsMarkdown(md)).toBe("- [ ] **법 제1조** (반박이 바꿈)\n  - 의무: 과태료 메모");
  });
});

describe("결과 쪽의 표지·정렬·거르개 (미리 돌린 jobtalk)", () => {
  const html = renderToStaticMarkup(<ReviewView review={review} code={code} />);
  // 시험용 제재로 고른 '코드에서 확인된 것' 카드(web18): 무거운 차례, 기능마다 하나 먼저. tcra-3-2(징역, 가입), pipa-26-2(과징금, 외부
  // 전송), safety-std-7-4(벌금, 공통). 같은 공통 기능의 pipa-29-1(과태료)은 카드에 오르지 않는다.
  const CARDS = ["tcra-3-2", "pipa-26-2", "safety-std-7-4"];
  /** 펼친 상세(카드의 '자세히'와 행이 함께 쓴다)의 표지: 조문 줄에 의무마다 하나. */
  const bodyBadges = elementsOf(html, '<div class="rv-body">').flatMap((body) =>
    elementsOf(body, '<span class="sanc ').filter((b) => /^<span class="sanc sanc-\d">/.test(b)),
  );

  it("카드: 제재가 무거운 차례로 셋, 제목 옆에 표지(코드에서 본 것이라 '해당되면' 없이). 카드에 오른 의무는 행이 아니다", () => {
    expect(confirmedItems(review, review.checklist).map((item) => item.duty)).toEqual(CARDS);
    const cards = elementsOf(html, '<li class="rv-card"');
    expect(cards.map((card) => /^<li class="rv-card" id="duty-([^"]+)"/.exec(card)![1])).toEqual(CARDS);
    const titles = cards.map((card) => elementsOf(card, '<p class="rv-card-title">')[0]);
    expect(titles.map((title) => textOf(elementsOf(title, '<span class="sanc ')[0]))).toEqual([
      `! ${FIXTURE_SANCTIONS["tcra-3-2"].label}`,
      `! ${FIXTURE_SANCTIONS["pipa-26-2"].label}`,
      FIXTURE_SANCTIONS["safety-std-7-4"].label,
    ]);
    for (const title of titles) expect(textOf(title)).not.toContain(SANCTION_TEXT.ifApplies);
    expect(titles[0]).toContain('<span class="sanc sanc-0"><span class="sanc-mark" aria-hidden="true">!</span> ' + FIXTURE_SANCTIONS["tcra-3-2"].label);
    expect(titles[2]).toContain(`<span class="sanc sanc-1">${FIXTURE_SANCTIONS["safety-std-7-4"].label}`);
    for (const duty of CARDS) expect(rowIn(html, duty), duty).toBeUndefined();
  });

  it("행의 제재 칸은 제재 갈래 한 낱말(강조만 느낌표), 둘째 줄은 조문 · 표지 말('어기면' 없이), 펼친 상세의 조문 줄에 표지. 강조는 기호와 굵은 모양, 보통·흐림은 다른 모양이다", () => {
    // 펼친 상세의 표지(조문 줄): 의무마다 하나. 카드는 제목 옆에 하나 더 있다.
    expect(bodyBadges).toHaveLength(fixtures.length);
    expect(elementsOf(html, '<span class="sanc ').filter((b) => /^<span class="sanc sanc-\d">/.test(b))).toHaveLength(fixtures.length + CARDS.length);
    for (const badge of bodyBadges) expect(textOf(badge)).not.toContain("어기면");
    const heavy = bodyBadges.filter((b) => b.startsWith('<span class="sanc sanc-0">'));
    expect(heavy.length).toBe(4);
    for (const badge of heavy) expect(badge).toContain('<span class="sanc-mark" aria-hidden="true">!</span>');
    expect(bodyBadges.filter((b) => b.startsWith('<span class="sanc sanc-1">')).map(textOf)).toEqual(
      expect.arrayContaining(["과태료 3천만원", "과태료 1천만원", "벌금 3천만원"]),
    );
    expect(bodyBadges.filter((b) => b.startsWith('<span class="sanc sanc-2">')).map(textOf).sort()).toEqual(["시정명령 불이행 시 과태료", "제재 조항 없음"]);
    // 제재 칸(행에만): 갈래 한 낱말, 강조 무게만 느낌표. 화면 낭독기에도 그 낱말 그대로 읽힌다('어기면'은 2026-11-25 오너 지시로 뺐다).
    const columns = elementsOf(html, '<span class="sanc sanc-').filter((b) => b.includes(" rv-sev"));
    expect(columns).toHaveLength(fixtures.length - CARDS.length);
    for (const column of columns) {
      const word = textOf(column).replace(/^!/, "");
      expect(["징역", "과징금", "벌금", "과태료", "명령", "없음"]).toContain(word);
      expect(column).not.toContain("aria-label");
      expect(column.includes("sanc-mark"), word).toBe(column.startsWith('<span class="sanc sanc-0 rv-sev"'));
    }
    // 둘째 줄: 조문 · 표지 말. 해당 여부부터 확인할 항목은 '해당되면' 한정어가 앞에 온다.
    const second = (duty: string) => textOf(elementsOf(rowIn(html, duty), '<span class="rv-r2">')[0]);
    expect(second("pipa-29-1")).toBe(`${lawOf("pipa-29-1")} · 과태료 3천만원`);
    expect(second("pipa-22-2-1")).toBe(`${lawOf("pipa-22-2-1")} · ${SANCTION_TEXT.ifApplies} · ${FIXTURE_SANCTIONS["pipa-22-2-1"].label}`);
    expect(second("pipa-15-2")).toBe(lawOf("pipa-15-2"));
  });

  it("더 살펴볼 것은 세 갈래 안에서 무거운 차례로, 같은 무게는 지금 차례(코드에서 본 것은 요약이 고른 다섯 먼저). 모두 열린 목록이다", () => {
    // 요약이 고른 다섯은 pipa-29-1, safety-std-7-4, safety-std-6-3, tcra-3-2, pipa-15-2 이다. 그 위에 징역 > 과징금 > 벌금 > 과태료
    // (같은 갈래면 정액 상한이 큰 것) > 명령 > 없음 > 표에 없음. 카드에 오른 셋은 빠진다.
    const seen = orderIn(html, '<section class="ck ck-check rv-seen-in-code">');
    expect(seen).toEqual(["pipa-29-1", "safety-std-5-6", "dincl-19-2", "aiact-31-2", "safety-std-6-3", "pipa-15-2", "aiact-31-1", "pipa-28-8-1"]);
    expect(orderIn(html, '<section class="ck ck-check rv-check-applicability">')[0]).toBe("pipa-22-2-1");
    expect(orderIn(html, '<details class="rv-group rv-not-applicable">')[0]).toBe("pipa-34-2-1");
    // 행·카드의 제목은 의무 지도의 짧은 제목(조문 도감과 같은 글)이다.
    expect(textOf(elementsOf(rowIn(html, "pipa-29-1"), '<span class="rv-name">')[0])).toBe(dutyMap.duties.find((duty) => duty.id === "pipa-29-1")!.title);
    const card = elementsOf(html, '<li class="rv-card"')[0];
    expect(textOf(elementsOf(card, '<span class="rv-duty">')[0])).toBe(dutyMap.duties.find((duty) => duty.id === "tcra-3-2")!.title);
  });

  it("더 살펴볼 것 머리의 제재 거르개 셋(더 살펴볼 것의 행 가운데 그 무게의 수, 해당 없음의 과징금은 세지 않는다). 누르면 그 무게의 행만. 주의 문구는 카드 아래 한 번", () => {
    const top = elementsOf(html, '<div class="rv-more-top">')[0];
    const buttons = elementsOf(top, "<button").filter((b) => b.includes("sanc-filter")).map(textOf);
    expect(buttons).toEqual([`!${SANCTION_TIERS[0].label} 1`, `${SANCTION_TIERS[1].label} 2`, `${SANCTION_TIERS[2].label} 2`]);
    expect(top).toContain('aria-controls="rv-checklist"');
    expect(html).toContain('<div class="rv-check" id="rv-checklist">');
    expect(html).toContain('<div id="rv-checklist-band" class="rv-band-slot"></div>');
    // 행의 무게 표시: 확인할 것의 pipa-22-2-1 과 닫은 의무의 pipa-34-2-1(카드의 둘은 행이 아니다).
    expect(html.match(/ data-tier="0"/g)).toHaveLength(2);
    expect(html.split(SANCTION_TEXT.note)).toHaveLength(2);
    const confirmed = elementsOf(html, '<section class="rv-confirmed"')[0];
    expect(confirmed).toContain(SANCTION_TEXT.note);
    expect(confirmed.indexOf(SANCTION_TEXT.note)).toBeGreaterThan(confirmed.lastIndexOf('<li class="rv-card"'));
    expect(html.indexOf(SANCTION_TEXT.note)).toBeLessThan(html.indexOf('id="rv-checklist"'));
  });

  it("항목 상세: 제재 조문마다 걸리는 때·제재 문구·법과 조항·법제처 링크, 원문은 접어 둔다. 보충 한 줄(카드는 '자세히' 안에)", () => {
    const detail = elementsOf(cardIn(html, "pipa-26-2"), '<div class="sanc-detail">')[0];
    const lines = elementsOf(detail, '<p class="sanc-line">').map(textOf);
    expect(lines[0]).toBe("3천만원 이하의 과태료 시험법 제75조제2항제3호 법제처(새 창, 시험법 제75조제2항제3호)");
    expect(lines[1]).toMatch(/^개인정보가 유출되면 전체 매출액의 100분의 3 이하의 과징금 시험법 제64조의2제1항 법제처/);
    expect(detail).toContain('<details class="sanc-quote"><summary>원문</summary><blockquote class="statute">(시험용 원문. 실제 조문이 아닙니다)</blockquote></details>');
    expect(textOf(detail)).toContain("고의·중과실·반복이면 매출 10%까지");
    // 카드의 제재 조문은 접힌 '자세히' 안에만 있다(카드 겉에는 표지만).
    expect(elementsOf(cardIn(html, "pipa-26-2"), '<details class="f-more"><summary>자세히</summary>')[0]).toContain('<div class="sanc-detail">');
    expect(textOf(elementsOf(rowIn(html, "dincl-19-2"), '<p class="sanc-line">')[0])).toMatch(/^시정명령 등을 따르지 않았을 때 3천만원 이하의 과태료/);
    // 제재 조항이 없는 의무는 표지만 있다.
    expect(rowIn(html, "aiact-31-2")).toContain('<span class="sanc sanc-2">');
    expect(rowIn(html, "aiact-31-2")).not.toContain("sanc-detail");
  });

  it("징역·과징금 항목이 더 살펴볼 것에 없으면 그 거르개는 0(누를 수 없이), 제재가 붙은 의무가 하나도 없으면 거르개·주의 문구·표지가 없다", () => {
    const light = parseReview({
      ...(prerun.review as object),
      checklist: (prerun.review as { checklist: { duty: string }[] }).checklist.filter((item) => !["tcra-3-2", "pipa-26-2", "pipa-22-2-1"].includes(item.duty)),
    })!;
    const zero = renderToStaticMarkup(<ReviewView review={light} />);
    // 강조 무게의 단추는 0 이고 누를 수 없다.
    const first = elementsOf(zero, '<button type="button" class="sanc-filter sf-0"')[0];
    expect(textOf(first)).toBe(`!${SANCTION_TIERS[0].label} 0`);
    expect(first).toContain('disabled=""');
    expect(zero).toContain(SANCTION_TEXT.note);
    const bare = parseReview({
      ...(prerun.review as object),
      checklist: (prerun.review as { checklist: { duty: string }[] }).checklist.filter((item) => !FIXTURE_SANCTIONS[item.duty]),
    })!;
    const plain = renderToStaticMarkup(<ReviewView review={bare} />);
    // 카드는 있지만(제재가 없는 의무도 코드에서 확인됐으면 카드다) 표지가 없다.
    expect(elementsOf(plain, '<li class="rv-card"').length).toBeGreaterThan(0);
    expect(plain).not.toContain("sanc-filter");
    expect(plain).not.toContain(SANCTION_TEXT.note);
    expect(plain).not.toContain('class="sanc');
  });

  it("그린 결과 전체(코드 링크와 함께): 표지가 붙고, 제재 표의 몫을 빼면 쓰지 않는 말이 없다", () => {
    expect(bodyBadges).toHaveLength(fixtures.length);
    expect(textOf(elementsOf(html, '<button type="button" class="sanc-filter sf-0"')[0])).toBe(`!${SANCTION_TIERS[0].label} 1`);
    expectNoBanned(textOf(withoutSanctions(html)));
  });
});

describe("체크리스트 내보내기(마크다운·인쇄용 보기)의 제재", () => {
  const doc = checklistDoc(review);
  const html = renderToStaticMarkup(<ReviewView review={review} code={code} />);

  it("화면과 같은 차례·같은 수: 내보낸 것은 카드에 오른 것까지 모두 싣고, 카드를 빼면 더 살펴볼 것의 차례와 같다", () => {
    expect(doc.overview.heavy).toBe(3);
    const cards = elementsOf(html, '<li class="rv-card"').map((card) => /^<li class="rv-card" id="duty-([^"]+)"/.exec(card)![1]);
    const exported = doc.groups[0].entries.map((entry) => entry.duty);
    expect(cards.every((duty) => exported.includes(duty))).toBe(true);
    expect(exported.filter((duty) => !cards.includes(duty))).toEqual(orderIn(html, '<section class="ck ck-check rv-seen-in-code">'));
    expect(exported.slice(0, 7)).toEqual(["tcra-3-2", "pipa-26-2", "safety-std-7-4", "pipa-29-1", "safety-std-5-6", "dincl-19-2", "aiact-31-2"]);
    expect(checklistDoc({ ...review, checklist: review.checklist.filter((item) => !FIXTURE_SANCTIONS[item.duty]) }).overview.heavy).toBeNull();
  });

  it("마크다운: 항목 줄에 표지, 아래에 제재 조문과 원문, 머리에 요약과 주의 문구", () => {
    const text = checklistMarkdown(doc, source);
    expect(text).toContain("징역·과징금이 걸리는 항목 3건");
    expect(text).not.toContain("어기면");
    expect(text.split(SANCTION_TEXT.note)).toHaveLength(2);
    expect(text).toMatch(/^- \[ \] \*\*약관의 규제에 관한 법률 제3조제2항\*\* · 징역 5년 · 과징금 매출 3%$/m);
    expect(text).toContain("  - 제재: 개인정보가 유출되면 전체 매출액의 100분의 3 이하의 과징금 · 시험법 제64조의2제1항 (법제처: ");
    expect(text).toContain("    > (시험용 원문. 실제 조문이 아닙니다)");
    expectNoBanned(withoutSanctionsMarkdown(text));
  });

  it("인쇄용 보기: 항목 줄에 표지(색 없이 기호·테두리로), 제재 조문과 원문을 펼쳐 싣는다", () => {
    const sheet = renderToStaticMarkup(
      <ChecklistSheet doc={doc} source={source} back={analysisHref(prerun.owner, prerun.name, prerun.id)} markdown={checklistMarkdownHref(prerun.id)} />,
    );
    const first = elementsOf(sheet, '<li class="ck-entry">')[0];
    expect(textOf(elementsOf(first, '<p class="ck-law">')[0])).toBe("약관의 규제에 관한 법률 제3조제2항 ! 징역 5년 · 과징금 매출 3%");
    expect(first).toContain('<span class="sanc sanc-0"><span class="sanc-mark" aria-hidden="true">!</span> 징역 5년');
    expect(elementsOf(first, '<p class="ck-quote">')).toHaveLength(2);
    expect(textOf(sheet)).toContain(SANCTION_TEXT.note);
    expectNoBanned(textOf(withoutSanctions(sheet)));
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
    const row = rows.find((r) => r.includes("</span> 과태료 3천만원 · 유출되면 과징금<"))!;
    expect(row).toContain('<div class="sanc-detail">');
  });

  it("제재 거르개: 모든 제재 / 징역·과징금 / 벌금·과태료 / 명령·없음(수), 기능·법령 거르개와 함께 있다", () => {
    const filter = elementsOf(html, '<div class="dm-filter">')[0];
    const selects = elementsOf(filter, "<select");
    expect(selects).toHaveLength(3);
    expect(elementsOf(selects[2], "<option").map(textOf)).toEqual(["모든 제재", "징역·과징금 (4)", "벌금·과태료 (3)", "명령·없음 (2)"]);
    expect(textOf(filter)).toContain(`의무 ${dutyMap.duties.length}`);
    // 주의 문구는 쪽 머리의 한 줄 뒤에 한 번.
    expect(html.split(SANCTION_TEXT.note)).toHaveLength(2);
    expect(html.indexOf(SANCTION_TEXT.note)).toBeLessThan(html.indexOf('<div class="dm-filter">'));
  });
});
