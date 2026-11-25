import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CasePage from "@/app/cases/[slug]/page";
import { ReviewView } from "@/components/review/ReviewView";
import { casesFile } from "@/lib/cases";
import { dutyAnchor } from "@/lib/duties";
import { SANCTION_TEXT } from "@/lib/duties/sanction";
import { parseReview } from "@/lib/review";
import { costText, modelLabel, toolCheck } from "@/lib/review/text";
import { SITE } from "@/lib/site";
import { elementAt, elementsOf, readJson, textOf } from "./helpers";

// 결과 쪽을 "요약 → 한 줄 목록 → 누르면 펼침"으로(2026-11-25 web16, SOFTCON 심사 대비). 자료는 사례 jobtalk(2026-11-12 실측)과
// 합성 예시(contract/review/genai-chat.review.json)다.

const casePage = async (slug: string) => renderToStaticMarkup(await CasePage({ params: Promise.resolve({ slug }) }));
const jobtalk = () => casesFile.cases.find((c) => c.slug === "jobtalk")!;

describe("a. 쳐내기", () => {
  it("모델 id 는 머리 한 줄에 이름으로 줄여 적는다(꼴이 다르면 그대로)", () => {
    expect(modelLabel("claude-haiku-5-5")).toBe("Haiku 5.5");
    expect(modelLabel("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("none")).toBe("none");
    expect(modelLabel("gpt-4o-mini")).toBe("gpt-4o-mini");
  });

  it("비용에는 구성을 붙인다: 질문 기록이 있으면 돈이 든 단계, 없으면 조사와(반박이 돌았으면) 반박", () => {
    const run = parseReview(jobtalk().review)!.run;
    // 사례 4곳은 이해 단계를 앞 결과에서 되살렸다(조사 $0.11 + 반박 $1.09, ~/.cache/policypack-eval/review-w11-6-2026-11-12).
    expect(run.stageUsd).toBeNull();
    expect(costText(run)).toBe("조사+반박 $1.20");
    expect(costText({ ...run, verificationCounts: { "not-run": 30 } })).toBe("조사 $1.20");
    expect(costText({ ...run, stageUsd: { understand: 0.0138, investigate: 0.1477 } })).toBe("기능 파악+조사 $1.20");
    expect(costText({ ...run, stageUsd: { understand: 0, investigate: 0.11, rebut: 1.09 } })).toBe("조사+반박 $1.20");
    // 질문 기록은 결과의 run.questions 에서 읽는다.
    const sample = readJson("contract", "review", "genai-chat.review.json") as { run: Record<string, unknown> };
    const withQuestions = parseReview({
      ...sample,
      run: { ...sample.run, questions: [{ stage: "understand", usd: 0.01 }, { stage: "investigate", usd: 0.2 }, { stage: "investigate", usd: 0.3 }] },
    })!;
    expect(withQuestions.run.stageUsd).toEqual({ understand: 0.01, investigate: 0.5 });
    // 질문 기록이 없어도 이해 단계를 새로 돌렸다고 적힌 결과(합성 예시)면 기능 파악을 넣는다.
    expect(costText(parseReview(sample)!.run)).toBe("기능 파악+조사+반박 $1.42");
  });

  it("사례 쪽 머리는 회색 한 줄(미리 돌린 결과 · 날 · 커밋 · 조사 · 반박)이고, CLI·비용·시간·판정 규칙은 검증 정보로 옮겼다", async () => {
    const html = await casePage("jobtalk");
    const head = textOf(elementAt(html, html.indexOf('<div class="case-head">')));
    expect(head).toContain(`${SITE.cases.prerun} ${casesFile.reviewRun.ranOn} 커밋 bbfb3ab 조사 Haiku 5.5 반박 Sonnet 5.5`);
    for (const moved of ["CLI", "비용", "걸린 시간", SITE.cases.regate]) expect(head).not.toContain(moved);
    const verify = textOf(elementAt(html, html.indexOf('<section class="box info rv-verify"')));
    expect(verify).toContain("조사+반박 $1.20 (상한 $5)");
    expect(verify).toContain("조사 claude-haiku-5-5 · 반박 claude-sonnet-5-5");
    expect(verify).toContain("CLI f4967db");
    expect(verify).toContain(`${SITE.cases.regate} · 규칙 CLI 2a24d94`);
  });

  it("정적 검사 구역은 보조 한 줄로 접는다: 규칙만의 수와 AI 검토가 코드에서 본 것의 수. 그 줄의 0 에는 '0이어도'를 붙이지 않는다", async () => {
    const html = await casePage("jobtalk");
    expect(html).not.toContain("정적 검사와 AI 판정");
    const at = html.indexOf('<details class="aux" id="aux">');
    expect(at).toBeGreaterThan(html.indexOf('<section class="box info rv-verify"'));
    const aux = elementAt(html, at);
    const summary = textOf(elementAt(aux, aux.indexOf("<summary>")));
    expect(summary).toBe("보조 · 우리 정적 규칙만으로는 0건 · AI 검토가 코드에서 본 것 11건 자세히");
    expect(summary).not.toContain(SITE.zeroIsNotClearance);
    // 펼치면 지금까지의 구역 전체(규칙만 / AI 를 켠 뒤, 정책별 결과)가 있고, 규칙만 상자의 0 에는 그 뜻이 붙어 있다.
    for (const kept of ["규칙만", "AI 를 켠 뒤", "정책별 결과", SITE.zeroIsNotClearance]) expect(textOf(aux)).toContain(kept);
  });
});

describe("b. 요약과 목록", () => {
  it("쪽의 차례: 머리 → 요약 → 1 의무 체크리스트 → 2 이 저장소가 하는 일 → 3 개인정보 흐름 → 검증 정보 → 보조(정적 검사)", async () => {
    const html = await casePage("jobtalk");
    const at = (needle: string) => {
      const i = html.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at('<div class="case-head">'),
      at('<section class="rv-sum"'),
      at('id="tier-1">'),
      at('id="tier-2">'),
      at('id="tier-3">'),
      at('<section class="box info rv-verify"'),
      at('<details class="aux" id="aux">'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const heads = elementsOf(html, '<h2 class="tier-hd"').map(textOf);
    expect(heads).toEqual(["1의무 체크리스트", "2이 저장소가 하는 일", "3개인정보 흐름"]);
  });

  it("요약: 큰 글씨 확인할 것 N건, 회색 한 줄(감지된 기능 · 걸릴 수 있는 의무 · 외부로 보냄 ↓), 주의 문구 한 번. 점수·비율·예상 금액은 없다", async () => {
    const html = await casePage("jobtalk");
    const sum = elementsOf(html, '<section class="rv-sum"')[0];
    expect(textOf(elementsOf(sum, '<p class="rv-big">')[0])).toBe("확인할 것 17건");
    const meta = elementsOf(sum, '<p class="rv-meta">')[0];
    expect(textOf(meta)).toBe(
      "감지된 기능 6가지 · 걸릴 수 있는 의무 111개 중 · 외부로 보냄: Gmail SMTP 메일 발송 · OpenAI Responses API (gpt-4o-mini) ↓개인정보 흐름으로",
    );
    expect(meta).toContain('href="#tier-3"');
    expect(sum.split(SANCTION_TEXT.note)).toHaveLength(2);
    expect(textOf(sum)).not.toMatch(/점|%|등급|원|가장/);
  });

  it("'외부로 보냄'은 화살표가 들어오는 외부 마디만이다(외부에서 받기만 하는 마디는 넣지 않고, 없으면 그 조각이 없다)", () => {
    const sample = readJson("contract", "review", "genai-chat.review.json") as { data_flow: { nodes: { id: string; kind: string; label: string }[]; edges: { from: string; to: string }[] } };
    const flow = sample.data_flow;
    const outward = flow.nodes.filter((node) => node.kind === "external" && flow.edges.some((edge) => edge.to === node.id)).map((node) => node.label);
    expect(outward.length).toBeGreaterThan(0);
    const meta = (data: unknown) => textOf(elementsOf(renderToStaticMarkup(<ReviewView review={parseReview(data)!} />), '<p class="rv-meta">')[0]);
    expect(meta(sample)).toContain(`외부로 보냄: ${outward.join(" · ")}`);
    // 외부 마디로 들어오는 화살표를 모두 뒤집으면(외부에서 받기만 한다) 그 조각이 없다.
    const inbound = { ...sample, data_flow: { ...flow, edges: flow.edges.map((edge) => (flow.nodes.find((node) => node.id === edge.to)?.kind === "external" ? { ...edge, from: edge.to, to: edge.from } : edge)) } };
    expect(meta(inbound)).not.toContain("외부로 보냄");
  });

  it("행: 접힌 두 줄(어기면 칸 · 짧은 제목 · 인용한 자리 / 조문 · 제재)이고, 주소의 자리는 의무 id 다. 목록 아래 보지 못한 것 한 줄", async () => {
    const html = await casePage("jobtalk");
    const review = parseReview(jobtalk().review)!;
    const rows = elementsOf(html, '<li class="rv-item"');
    expect(rows).toHaveLength(review.checklist.length);
    const row = rows.find((li) => li.includes(`id="${dutyAnchor("pipa-28-8-1")}"`))!;
    expect(row).toMatch(/^<li class="rv-item" data-tier="0"><details class="rv-row" id="duty-pipa-28-8-1"><summary>/);
    expect(textOf(elementsOf(row, '<span class="rv-r1">')[0])).toBe("!과징금국외 제공·처리위탁·보관은 별도 동의·처리방침 공개 등 근거가 있을 때만chatController.ts:135");
    expect(textOf(elementsOf(row, '<span class="rv-r2">')[0])).toBe("개인정보 보호법 제28조의8제1항(시행령 제29조의7) · 어기면 · 과징금 매출 3%");
    // 해당 여부부터 확인할 항목: 제재 앞에 '해당되면'.
    const child = rows.find((li) => li.includes(`id="${dutyAnchor("pipa-22-2-1")}"`))!;
    expect(textOf(elementsOf(child, '<span class="rv-r2">')[0])).toMatch(/ · 해당되면 · 어기면 · 징역 5년 · 과징금 매출 3%$/);
    const unseen = textOf(elementsOf(html, '<p class="hint rv-unseen">')[0]);
    expect(unseen).toBe("이번 검토가 보지 못한 것 — 저장소 밖(처리방침·약관·배포 설정) · 읽지 않는 파일(.env 등) · 판단 못 한 의무 0건");
    // 목록 위: 모두 펼치기 · 마크다운으로 받기 · 인쇄용 보기.
    expect(textOf(elementsOf(html, '<p class="rv-export">')[0])).toBe("모두 펼치기마크다운으로 받기인쇄용 보기");
  });
});

describe("c. 펼친 카드의 차례와 '도구 확인' 줄", () => {
  const sample = () => readJson("contract", "review", "genai-chat.review.json") as Record<string, unknown>;

  it("도구 확인: 인용(받은 수와 받지 않은 까닭), '없다' 검색(다시 돌려 같은 수), 반박 결과로만 만든다. 없는 조각은 빼고 '고치는 법'은 없다", () => {
    const cite = (ok: boolean, why = "grounded") => ({ file: "a.ts", line: 1, text: "x", ok, why });
    const search = (ok: boolean) => ({ pattern: "p", path: ".", claimed: 1, found: ok ? 1 : 2, ok });
    expect(toolCheck({ citations: [cite(true), cite(true)], searches: [search(true), search(true)], verification: "upheld" })).toEqual([
      "인용 2줄이 파일에 그대로 있음",
      "'없다' 검색 2개를 다시 돌려 같음",
      "반박 후 유지",
    ]);
    expect(toolCheck({ citations: [cite(true), cite(true), cite(false, "test-file")], searches: [search(true), search(false)], verification: "not-run" })).toEqual([
      "인용 3줄 중 2줄만 받음(1줄: 테스트·설정 파일)",
      "'없다' 검색 2개 중 1개를 다시 돌려 같음(1개는 같지 않음)",
    ]);
    expect(toolCheck({ citations: [cite(false, "not-found"), cite(false, "too-short")], searches: [], verification: "overturned" })).toEqual([
      "인용 2줄 모두 받지 않음(1줄: 파일에 없는 줄, 1줄: 너무 짧은 조각)",
      "반박이 뒤집음",
    ]);
    // 프로필 신호(기능이 있다는 파일)는 모델의 인용이 아니라 세지 않는다. 아무 조각도 없으면 줄을 두지 않는다.
    expect(toolCheck({ citations: [cite(true, "profile")], searches: [], verification: "" })).toEqual([]);
  });

  it("펼친 카드는 포스터의 차례다: 조문·표지 → 본 것 → 인용(첫 하나, 나머지는 접음) → 없는 것 → 도구 확인 → 확인할 질문 → 어기면 → 찾아본 말·자세히", async () => {
    const html = await casePage("jobtalk");
    const li = elementsOf(html, '<li class="rv-item"').find((item) => item.includes(`id="${dutyAnchor("pipa-28-8-1")}"`))!;
    const body = elementsOf(li, '<div class="rv-body">')[0];
    const at = (needle: string) => {
      const i = body.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at('<p class="rv-law">'),
      at('<span class="lbl">본 것</span>'),
      at('<ul class="cites">'),
      at("인용 1개 더"),
      at('<span class="lbl">없는 것</span>'),
      at('<span class="lbl">도구 확인</span>'),
      at('<span class="lbl">확인할 질문</span>'),
      at('<div class="sanc-detail">'),
      at("찾아본 말 2개"),
      at("<summary>자세히</summary>"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(textOf(elementsOf(body, '<p class="ask-line rv-tool">')[0])).toBe("도구 확인 인용 2줄이 파일에 그대로 있음 · '없다' 검색 2개를 다시 돌려 같음 · 반박 후 유지");
    // 첫 인용은 펼치자마자 보인다: 파일:줄, 코드 한 줄, 커밋 고정 링크.
    const first = elementsOf(body, '<ul class="cites">')[0];
    expect(textOf(first)).toContain("backend/src/controllers/chatController.ts:135");
    expect(textOf(first)).toContain("openai.responses.create");
    expect(first).toContain("/blob/bbfb3ab14534907ff4618c563ff92a6354da97a1/backend/src/controllers/chatController.ts#L135");
  });

  it("검증 정보는 문장으로, 그 아래 회색 한 줄에 모델·비용(구성)·시간·CLI·판정 규칙", async () => {
    const html = await casePage("jobtalk");
    const verify = elementsOf(html, '<section class="box info rv-verify"')[0];
    expect(textOf(elementsOf(verify, '<p class="rv-verify-say">')[0])).toBe(
      "인용 69줄 모두 파일에서 글자 그대로 확인 · '없다' 검색 93개를 도구가 다시 돌림 → 88개 같음, 5개는 달라 '해당 없음'으로 쓰지 않음 · 반박 유지 25 · 뒤집음 1 · 반박 안 함 4",
    );
    expect(textOf(elementsOf(verify, '<p class="rv-verify-meta">')[0])).toBe(
      `조사 claude-haiku-5-5 · 반박 claude-sonnet-5-5조사+반박 $1.20 (상한 $5)177초 (상한 1500초)CLI f4967db${SITE.cases.regate} · 규칙 CLI 2a24d94`,
    );
    expect(parseReview(sample())).not.toBeNull();
  });
});
