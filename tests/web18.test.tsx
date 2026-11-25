import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewView } from "@/components/review/ReviewView";
import { dutyAnchor, dutyMap, sanctionOf } from "@/lib/duties";
import { byWeight, SANCTION_TEXT, sanctionTier } from "@/lib/duties/sanction";
import { parseReview, type Review, type ReviewItem } from "@/lib/review";
import { CONFIRMED_MAX, confirmedItems, isConfirmed } from "@/lib/review/pick";
import { CHECKS, checkCount, firstSentence } from "@/lib/review/text";
import { checklistHref, checklistMarkdownHref } from "@/lib/service/href";
import { PRERUNS } from "@/lib/service/prerun";
import { elementsOf, readJson, textOf } from "./helpers";
import { withoutSanctions } from "./sanctions";
import { BANNED_WORDING } from "./wording";

// 결과 쪽을 "확실한 것만 크게"(2026-11-25 web18, 오너 지시: "확실한 것만 내세워서 비중을 크게 잡아 밀어야 한다"). 위에서부터 한 줄(하는
// 일과 실행 정보) → 코드에서 확인된 것(카드 3건 안팎) → 더 살펴볼 것(한 줄 행) → 접은 구획(흐름, 하는 일, 닫은 의무, 검증 정보)이다.
// 자료는 미리 돌려 넣은 분석 jobtalk(src/lib/service/prerun.ts)과 합성 예시(contract/review/genai-chat.review.json)이고, 제재는 실제 의무
// 지도(data/duty-map.json)의 것이다. 분석 쪽처럼 코드 링크와 내보내기 주소를 주고 그린다.

const prerun = PRERUNS[0];
const review = parseReview(prerun.review)!;
const code = { htmlUrl: "https://github.com/Vactor0911/jobtalk", commit: prerun.commit };
const exportLinks = { markdown: checklistMarkdownHref(prerun.id), print: checklistHref(prerun.owner, prerun.name, prerun.id) };
const render = (r: Review, recheck: string[] = []) => renderToStaticMarkup(<ReviewView review={r} code={code} exportLinks={exportLinks} recheck={recheck} />);
const html = render(review);
const sample = () => readJson("contract", "review", "genai-chat.review.json") as Record<string, unknown>;

/** 그린 결과의 카드(코드에서 확인된 것) 의무 id, 화면 차례대로. */
const cardIds = (h: string) => elementsOf(h, '<li class="rv-card"').map((li) => /^<li class="rv-card" id="duty-([^"]+)"/.exec(li)![1]);
/** 그린 결과의 행(더 살펴볼 것·닫은 의무) 의무 id, 화면 차례대로. */
const rowIds = (h: string) => [...h.matchAll(/<details class="rv-row" id="duty-([^"]+)"/g)].map((m) => m[1]);
/** 그린 결과에서 `open` 으로 시작하는 첫 요소. */
const first = (h: string, open: string) => elementsOf(h, open)[0];
/** 카드 한 장. */
const cardIn = (h: string, duty: string) => first(h, `<li class="rv-card" id="${dutyAnchor(duty)}"`);
const ids = (items: readonly ReviewItem[]) => items.map((item) => item.duty);
/** 결과 JSON 의 사본에 CLI 가 고른 '먼저 볼 것'(`summary.highlights`, handoff-w13-5 부터)을 넣어 읽는다. */
const withHighlights = (highlights: unknown[]) => {
  const data = prerun.review as { summary: Record<string, unknown> };
  return parseReview({ ...data, summary: { ...data.summary, highlights } })!;
};
/** 체크리스트 항목만 바꾼 사본. */
const mapItems = (r: Review, f: (item: ReviewItem) => ReviewItem): Review => ({ ...r, checklist: r.checklist.map(f) });

describe("1. 한 줄: 하는 일과 실행 정보", () => {
  it("쪽의 맨 처음: AI 설명의 첫 문장, 그 아래 '조사 모델 · 반박 모델 · 걸린 시간'. 확인할 것이 있으면 0의 뜻은 없다", () => {
    const lead = first(html, '<div class="rv-lead">');
    expect(html.startsWith(`<div class="review">${lead}<section class="rv-confirmed"`)).toBe(true);
    expect(review.profile.summary.startsWith("JobTalk은 진로 상담 웹 서비스다. ")).toBe(true);
    expect(textOf(first(lead, '<p class="rv-what">'))).toBe("JobTalk은 진로 상담 웹 서비스다.");
    // 155.1초, 조사 claude-haiku-5-5, 반박 claude-sonnet-5-5.
    expect(textOf(first(lead, '<p class="rv-run">'))).toBe("조사 Haiku 5.5 · 반박 Sonnet 5.5 · 2분 35초");
    expect(html).not.toContain("zero-note");
    // AI 설명이 없으면 그 줄 없이 실행 정보만.
    const bare = first(render({ ...review, profile: { ...review.profile, summary: "" } }), '<div class="rv-lead">');
    expect(bare).not.toContain("rv-what");
    expect(bare).toContain('<p class="rv-run">');
  });
});

describe("2. 코드에서 확인된 것", () => {
  it("jobtalk: pipa-29-1 · pipa-28-8-1 · safety-std-5-6. 코드에서 본 것 가운데 반박을 견디고 도구가 인용을 받은 것, 무거운 제재 차례, 기능마다 하나 먼저", () => {
    const picked = confirmedItems(review, review.checklist);
    expect(ids(picked)).toEqual(["pipa-29-1", "pipa-28-8-1", "safety-std-5-6"]);
    expect(cardIds(html)).toEqual(ids(picked));
    expect(textOf(first(html, '<h2 class="rv-sec-h" id="rv-confirmed-h">'))).toBe("코드에서 확인된 것 3건");
    for (const item of picked) {
      expect(item.status, item.duty).toBe("seen-in-code");
      expect(item.verification, item.duty).toBe("upheld");
      expect(item.citations.some((cite) => cite.ok && cite.why !== "profile"), item.duty).toBe(true);
    }
    // 기능마다 하나: 공통 · 외부 전송 · 로그인. 같은 공통 기능의 safety-std-7-4·safety-std-6-3(같은 무게)은 카드에 오르지 않는다.
    expect(picked.map((item) => item.feature)).toEqual(["common", "external-transfer", "auth"]);
    const candidates = review.checklist.filter(isConfirmed);
    expect(candidates).toHaveLength(11);
    expect(ids(candidates)).toEqual(expect.arrayContaining(["safety-std-7-4", "safety-std-6-3"]));
    // 무거운 차례로 보이고, 카드에 오르지 않은 후보 가운데 카드보다 무거운 것은 없다.
    const tierOf = (item: ReviewItem) => {
      const sanction = sanctionOf(item.duty);
      return sanction ? sanctionTier(sanction) : 3;
    };
    const tiers = picked.map(tierOf);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    const rest = candidates.filter((item) => !picked.includes(item)).map(tierOf);
    expect(Math.max(...tiers)).toBeLessThanOrEqual(Math.min(...rest));
  });

  it("기능이 모자라 하나씩으로 셋이 차지 않으면 남은 차례로 채운다(모든 후보가 한 기능이면 무거운 차례로 앞의 셋)", () => {
    const one = mapItems(review, (item) => ({ ...item, feature: "same" }));
    const picked = confirmedItems(one, one.checklist);
    expect(picked).toHaveLength(CONFIRMED_MAX);
    expect(ids(picked)).toEqual(ids(byWeight(one.checklist.filter(isConfirmed), (item) => sanctionOf(item.duty)).slice(0, CONFIRMED_MAX)));
    // 후보가 하나뿐이면 한 장.
    const lone = mapItems(review, (item) => (item.duty === "pipa-15-2" ? item : { ...item, verification: "not-run" }));
    expect(cardIds(render(lone))).toEqual(["pipa-15-2"]);
  });

  it("CLI 가 고른 '먼저 볼 것'(summary.highlights)이 있으면 그 차례 그대로 쓴다: 이 결과에 있는 의무만, 3건까지. 빈 목록이면 고르지 않는다", () => {
    expect(review.summary.highlights).toBeNull();
    // 문자열과 {duty} 꼴을 모두 읽는다. 무거운 차례가 아니라 CLI 가 고른 차례다. 결과에 없는 의무는 건너뛴다.
    const over = withHighlights(["pipa-15-2", { duty: "aiact-31-1" }, "없는-의무"]);
    expect(over.summary.highlights).toEqual(["pipa-15-2", "aiact-31-1", "없는-의무"]);
    const h = render(over);
    expect(cardIds(h)).toEqual(["pipa-15-2", "aiact-31-1"]);
    expect(textOf(first(h, '<h2 class="rv-sec-h" id="rv-confirmed-h">'))).toBe("코드에서 확인된 것 2건");
    // 스스로 고를 때의 카드(pipa-29-1 등)는 더 살펴볼 것의 행으로 돌아가고, 고른 것은 행에서 빠진다.
    const more = rowIds(first(h, '<section class="rv-more"'));
    expect(more).toEqual(expect.arrayContaining(["pipa-29-1", "pipa-28-8-1", "safety-std-5-6"]));
    expect(more).not.toContain("pipa-15-2");
    expect(more).not.toContain("aiact-31-1");
    expect(ids(confirmedItems(withHighlights(["aiact-31-2", "tcra-3-2", "pipa-15-2", "aiact-31-1"]), review.checklist))).toEqual([
      "aiact-31-2",
      "tcra-3-2",
      "pipa-15-2",
    ]);
    // 빈 목록: CLI 가 먼저 볼 것이 없다고 한 것이라 웹이 따로 고르지 않는다.
    const none = render(withHighlights([]));
    expect(cardIds(none)).toEqual([]);
    expect(first(none, '<section class="rv-confirmed"')).toContain('<p class="tier-none">없음</p>');
  });

  it("확인할 것의 다른 두 갈래(저장소 밖에서, 해당 여부부터), 품목 묶음, 반박하지 않았거나 뒤집힌 것, 받은 인용이 없는 것은 카드가 되지 않는다", () => {
    const synthetic = parseReview(sample())!;
    // 합성 예시의 pipa-28-8-1 은 코드에서 본 것이지만 반박이 뒤집었다.
    expect(synthetic.checklist.find((item) => item.duty === "pipa-28-8-1")!.verification).toBe("overturned");
    const variants: [string, Review][] = [
      ["jobtalk", review],
      ["합성 예시", synthetic],
      // 반박을 견디고 인용이 받아진 채로 갈래만 바꾸어도 카드가 아니다.
      ["해당 여부부터", mapItems(review, (item) => (item.status === "seen-in-code" ? { ...item, status: "check-applicability" } : item))],
      ["저장소 밖에서", mapItems(review, (item) => (item.status === "seen-in-code" ? { ...item, status: "check-outside" } : item))],
      ["품목 묶음", mapItems(review, (item) => ({ ...item, group: "goods" }))],
      ["반박 안 함", mapItems(review, (item) => ({ ...item, verification: "not-run" }))],
      ["반박이 뒤집음", mapItems(review, (item) => ({ ...item, verification: "overturned" }))],
      ["인용을 받지 않음", mapItems(review, (item) => ({ ...item, citations: item.citations.map((cite) => ({ ...cite, ok: false })) }))],
      ["기능 신호뿐", mapItems(review, (item) => ({ ...item, citations: item.citations.map((cite) => ({ ...cite, why: "profile" })) }))],
    ];
    for (const [name, r] of variants) {
      const picked = confirmedItems(r, r.checklist);
      for (const item of picked) expect(isConfirmed(item), `${name}: ${item.duty}`).toBe(true);
      const h = renderToStaticMarkup(<ReviewView review={r} />);
      const statusOf = new Map(r.checklist.map((item) => [item.duty, item.status]));
      for (const duty of cardIds(h)) expect(statusOf.get(duty), `${name}: ${duty}`).toBe("seen-in-code");
      if (name !== "jobtalk" && name !== "합성 예시") expect(cardIds(h), name).toEqual([]);
    }
  });

  it("후보가 없으면 '없음'(지어내지 않는다). 확인할 것은 모두 더 살펴볼 것에 남고, 제재 주의 문구는 그 자리에 한 번", () => {
    const none = mapItems(review, (item) => ({ ...item, verification: "not-run" }));
    const h = render(none);
    const confirmed = first(h, '<section class="rv-confirmed"');
    expect(textOf(first(confirmed, '<h2 class="rv-sec-h" id="rv-confirmed-h">'))).toBe("코드에서 확인된 것 0건");
    expect(confirmed).not.toContain("rv-cards");
    expect(confirmed).toContain('<p class="tier-none">없음</p>');
    expect(textOf(first(h, '<h2 class="rv-sec-h" id="rv-more-h">'))).toBe(`더 살펴볼 것 ${checkCount(none.checklist)}건`);
    expect(rowIds(first(h, '<section class="rv-more"'))).toHaveLength(16);
    expect(h.split(SANCTION_TEXT.note)).toHaveLength(2);
    expect(confirmed).toContain(SANCTION_TEXT.note);
  });

  it("카드 한 장의 차례: 본 사실 → 인용 한 줄 → '도구가 파일에서 확인함' → 조문(법제처) → 짧은 제목과 표지 → 확인할 질문 → 찾지 못한 것 → 자세히", () => {
    for (const duty of cardIds(html)) {
      const card = cardIn(html, duty);
      const at = (needle: string) => {
        const i = card.indexOf(needle);
        expect(i, `${duty}: ${needle}`).toBeGreaterThan(-1);
        return i;
      };
      const order = [
        at('<p class="rv-fact">'),
        at('<div class="rv-card-cite"><ul class="cites">'),
        at('<p class="rv-checked">도구가 파일에서 확인함</p>'),
        at('<div class="rv-card-duty"><p class="rv-law">'),
        at('<p class="rv-card-title"><span class="rv-duty">'),
        at('<span class="sanc sanc-'),
        at('<p class="ask-line rv-card-q"><span class="lbl">확인할 질문</span> '),
        at('<p class="ask-line rv-card-missing"><span class="lbl">찾지 못한 것</span> '),
        at('<details class="f-more"><summary>자세히</summary>'),
      ];
      expect([...order].sort((a, b) => a - b), duty).toEqual(order);
      // 카드 겉의 인용은 한 줄이고, '자세히'가 카드의 끝이다. 그 안은 펼친 상세 그대로다(본 것, 도구 확인, 제재 등).
      expect(elementsOf(first(card, '<div class="rv-card-cite">'), '<li class="cite">'), duty).toHaveLength(1);
      const more = first(card, '<details class="f-more"><summary>자세히</summary>');
      expect(card.endsWith(`${more}</li>`), duty).toBe(true);
      expect(more, duty).toContain('<div class="rv-body">');
      expect(more, duty).toContain('<span class="lbl">도구 확인</span>');
      // 카드의 제목은 의무 지도의 짧은 제목이다.
      expect(textOf(first(card, '<span class="rv-duty">')), duty).toBe(dutyMap.duties.find((entry) => entry.id === duty)!.title);
    }
  });

  it("pipa-28-8-1 카드: 본 사실은 조사 답의 걸리는 조건 그대로, 인용은 chatController.ts:135 한 줄과 커밋 고정 링크, 의무는 국외 이전", () => {
    const item = review.checklist.find((entry) => entry.duty === "pipa-28-8-1")!;
    expect(item.condition).toBe("이용자 입력을 해외 사업자(OpenAI) API로 전송함");
    const card = cardIn(html, "pipa-28-8-1");
    expect(textOf(first(card, '<p class="rv-fact">'))).toBe("이용자 입력을 해외 사업자(OpenAI) API로 전송함");
    const cite = first(card, '<div class="rv-card-cite">');
    expect(textOf(cite)).toContain("backend/src/controllers/chatController.ts:135");
    expect(textOf(cite)).toContain("openai.responses.create");
    expect(cite).toContain(`href="https://github.com/Vactor0911/jobtalk/blob/${prerun.commit}/backend/src/controllers/chatController.ts#L135"`);
    expect(cite).toContain("(GitHub, 새 창, 커밋 bbfb3ab 에 고정)");
    const duty = first(card, '<div class="rv-card-duty">');
    expect(textOf(first(duty, '<p class="rv-law">'))).toMatch(/^개인정보 보호법 제28조의8제1항\(시행령 제29조의7\)법제처/);
    expect(textOf(first(duty, '<p class="rv-card-title">'))).toBe("국외 제공·처리위탁·보관은 별도 동의·처리방침 공개 등 근거가 있을 때만 ! 과징금 매출 3%");
  });

  it("조사 답에 걸리는 조건이 없으면 본 사실은 까닭의 첫 문장이다(합성 예시)", () => {
    const synthetic = parseReview(sample())!;
    const h = renderToStaticMarkup(<ReviewView review={synthetic} />);
    const picked = confirmedItems(synthetic, synthetic.checklist);
    expect(cardIds(h)).toEqual(ids(picked));
    expect(picked.length).toBeGreaterThan(0);
    for (const item of picked) {
      expect(item.condition, item.duty).toBe("");
      expect(textOf(first(cardIn(h, item.duty), '<p class="rv-fact">')), item.duty).toBe(firstSentence(item.reason)[0]);
    }
  });

  it("다시 검토 중인 의무는 카드가 되지 않는다(닫은 의무의 '다시 검토 중'에 이름만)", () => {
    const h = render(review, ["pipa-29-1"]);
    expect(cardIds(h)).not.toContain("pipa-29-1");
    expect(cardIds(h)).toHaveLength(3);
    expect(first(h, '<details class="rv-group rv-recheck">')).toContain(`id="${dutyAnchor("pipa-29-1")}"`);
  });
});

describe("3. 더 살펴볼 것", () => {
  it("카드에 오른 의무를 뺀 확인할 것: 코드에서 본 것 → 저장소 밖에서 → 해당 여부부터. 카드의 의무는 어디에도 행으로 없다", () => {
    const more = first(html, '<section class="rv-more"');
    expect(textOf(first(more, '<h2 class="rv-sec-h" id="rv-more-h">'))).toBe("더 살펴볼 것 13건");
    expect([...more.matchAll(/<section class="ck ck-check rv-([a-z-]+)">/g)].map((m) => m[1])).toEqual(["seen-in-code", "check-outside", "check-applicability"]);
    const rows = rowIds(more);
    const cards = cardIds(html);
    expect(rows).toHaveLength(checkCount(review.checklist) - cards.length);
    for (const duty of cards) expect(rowIds(html), duty).not.toContain(duty);
    // 카드와 행을 합치면 확인할 것 16건이 빠짐없이 한 번씩이다.
    const checks = review.checklist.filter((item) => CHECKS.includes(item.status) && item.group !== "goods").map((item) => item.duty);
    expect([...cards, ...rows].sort()).toEqual([...checks].sort());
    // 갈래 차례대로 늘어선다(갈래 안은 무거운 제재 차례).
    const statusOf = new Map(review.checklist.map((item) => [item.duty, item.status]));
    const order = rows.map((duty) => CHECKS.indexOf(statusOf.get(duty)!));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 자리: 코드에서 확인된 것 다음, 접은 구획 앞.
    expect(html.indexOf('<section class="rv-more"')).toBeGreaterThan(html.indexOf('<section class="rv-confirmed"'));
    expect(html.indexOf('<section class="rv-more"') + more.length).toBeLessThanOrEqual(html.indexOf('<details class="rv-fold"'));
    // 모든 행은 접혀 있다.
    expect(more).not.toMatch(/<details class="rv-row"[^>]* open/);
  });

  it("빈 갈래는 두지 않는다(저장소 밖에서 확인할 것이 없으면 그 갈래가 없다)", () => {
    const h = render({ ...review, checklist: review.checklist.filter((item) => item.status !== "check-outside") });
    const more = first(h, '<section class="rv-more"');
    expect([...more.matchAll(/<section class="ck ck-check rv-([a-z-]+)">/g)].map((m) => m[1])).toEqual(["seen-in-code", "check-applicability"]);
  });
});

describe("4. 접은 구획", () => {
  it("흐름 → 하는 일 → 닫은 의무 → 검증 정보 차례로 모두 접혀 있다", () => {
    const folds = elementsOf(html, '<details class="rv-fold"');
    expect(folds.map((fold) => /^<details class="rv-fold" id="([a-z-]+)">/.exec(fold)![1])).toEqual(["rv-flow", "rv-service", "rv-closed", "rv-verify"]);
    expect(folds.map((fold) => textOf(first(fold, "<summary>")))).toEqual(["개인정보 흐름", "이 저장소가 하는 일기능 6가지", "닫은 의무14건", "검증 정보"]);
    // 흐름 그림, 하는 일(AI 설명 전부), 닫은 의무(걸리지 않는 것으로 보임 1, 해당 없음 13), 검증 정보(문장과 회색 한 줄).
    expect(folds[0]).toContain('<figure class="flow">');
    expect(textOf(first(folds[1], '<p class="rv-summary">'))).toBe(review.profile.summary);
    expect([...folds[2].matchAll(/<details class="rv-group (rv-[a-z-]+)">/g)].map((m) => m[1])).toEqual(["rv-likely-not-applicable", "rv-not-applicable"]);
    const verify = first(folds[3], '<div class="rv-verify-in">');
    expect(verify).toContain('<p class="rv-verify-say">');
    expect(verify).toContain('<p class="rv-verify-meta">');
    // 쪽은 접은 구획으로 끝난다.
    expect(html.endsWith(`${folds[3]}</div>`)).toBe(true);
  });

  it("닫은 의무의 묶음 차례: 품목 → 모름 → 지킨 근거 있음 → 걸리지 않는 것으로 보임 → 해당 없음 → 다시 검토 중", () => {
    const data = sample();
    const base = (data.checklist as Record<string, unknown>[])[0];
    const goods = { ...base, duty: "liquor-1", status: "check-applicability", group: "goods", first: null, citations: [], searches: [], question: "주류도 판매하나요?" };
    const synthetic = parseReview({ ...data, checklist: [...(data.checklist as object[]), goods] })!;
    const h = renderToStaticMarkup(<ReviewView review={synthetic} recheck={["pipa-21-1"]} />);
    const closed = first(h, '<details class="rv-fold" id="rv-closed">');
    expect([...closed.matchAll(/<details class="rv-group (rv-[a-z-]+)">/g)].map((m) => m[1])).toEqual([
      "rv-goods",
      "rv-unknown",
      "rv-evidence-found",
      "rv-likely-not-applicable",
      "rv-not-applicable",
      "rv-recheck",
    ]);
    expect(textOf(first(closed, "<summary>"))).toBe("닫은 의무6건");
  });
});

describe("주의 문구와 낱말", () => {
  it("제재 주의 문구는 쪽에 한 번, 코드에서 확인된 것 안의 카드 뒤에 둔다", () => {
    expect(html.split(SANCTION_TEXT.note)).toHaveLength(2);
    const confirmed = first(html, '<section class="rv-confirmed"');
    const note = confirmed.indexOf(SANCTION_TEXT.note);
    expect(note).toBeGreaterThan(-1);
    const cards = first(confirmed, '<ol class="rv-cards">');
    expect(note).toBeGreaterThan(confirmed.indexOf(cards) + cards.length);
  });

  it("코드에서 확인된 것에는 점수·등급·순위·비율이 없고(제재 표의 몫인 표지·조문은 빼고 본다), 쪽 전체에 쓰지 않는 말이 없다", () => {
    const confirmed = textOf(withoutSanctions(first(html, '<section class="rv-confirmed"')));
    expect(confirmed).not.toMatch(/점수|등급|순위|%|\d+\s*점(?![가-힣])/);
    const rest = textOf(withoutSanctions(html));
    for (const [pattern, why] of BANNED_WORDING) expect(pattern.test(rest), `${pattern} — ${why}`).toBe(false);
  });
});

describe("코드를 읽고 뺀 기능 (2026-11-25 오너 지시)", () => {
  it("본문에는 뺀 기능 칸과 'AI 가 더함' 꼬리표가 없고, 검증 정보 안의 접힌 한 줄로만 남는다. 펼치면 까닭과 인용", () => {
    const removed = review.profile.features.filter((feature) => feature.removed !== null);
    expect(removed.length, "jobtalk 에 코드를 읽고 뺀 기능이 없습니다").toBeGreaterThan(0);
    expect(textOf(html)).not.toContain("AI 가 뺀 기능");
    expect(textOf(html)).not.toContain("AI 가 더함");
    // 이 저장소가 하는 일에는 남은 기능만.
    const service = first(html, '<details class="rv-fold" id="rv-service">');
    for (const feature of removed) expect(service, feature.id).not.toContain(feature.removed!.reason);
    expect(elementsOf(service, '<ul class="rv-features">')[0].match(/<li>/g)).toHaveLength(review.profile.features.length - removed.length);
    // 검증 정보 안: 접힌 한 줄, 펼치면 기능마다 이름·까닭·인용.
    const verify = first(html, '<details class="rv-fold" id="rv-verify">');
    expect(elementsOf(html, '<details class="ob ob-test rv-removed">')).toHaveLength(1);
    const line = first(verify, '<details class="ob ob-test rv-removed">');
    expect(textOf(first(line, "<summary>"))).toBe(`코드를 읽고 뺀 기능 ${removed.length}가지`);
    const items = elementsOf(line, "<li>");
    expect(items).toHaveLength(removed.length);
    removed.forEach((feature, i) => {
      expect(items[i]).toContain(feature.name);
      expect(items[i]).toContain(feature.removed!.reason);
      const cite = feature.removed!.citations.find((c) => c.ok);
      if (cite) expect(items[i]).toContain(cite.file);
    });
  });
});
