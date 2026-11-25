import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewView } from "@/components/review/ReviewView";
import { dutyAnchor } from "@/lib/duties";
import { SANCTION_TEXT } from "@/lib/duties/sanction";
import { parseReview } from "@/lib/review";
import { costText, modelLabel, toolCheck } from "@/lib/review/text";
import { checklistHref, checklistMarkdownHref } from "@/lib/service/href";
import { PRERUNS } from "@/lib/service/prerun";
import { elementsOf, readJson, textOf } from "./helpers";

// 결과 쪽을 "요약 → 한 줄 목록 → 누르면 펼침"으로(2026-11-25 web16, SOFTCON 심사 대비). 자료는 미리 돌려 넣은 분석 jobtalk
// (src/lib/service/prerun.ts, CLI handoff-w13-1 로 2026-11-24 에 돌린 것)과 합성 예시(contract/review/genai-chat.review.json)다. 제재는
// 실제 의무 지도(data/duty-map.json)의 것이다. 분석 쪽처럼 코드 링크와 내보내기 주소를 주고 그린다.

const prerun = PRERUNS[0];
const review = parseReview(prerun.review)!;
const html = renderToStaticMarkup(
  <ReviewView
    review={review}
    code={{ htmlUrl: "https://github.com/Vactor0911/jobtalk", commit: prerun.commit }}
    exportLinks={{ markdown: checklistMarkdownHref(prerun.id), print: checklistHref(prerun.owner, prerun.name, prerun.id) }}
  />,
);
const rowOf = (duty: string) => elementsOf(html, '<li class="rv-item"').find((li) => li.includes(`id="${dutyAnchor(duty)}"`))!;

describe("a. 쳐내기", () => {
  it("모델 id 는 머리 한 줄에 이름으로 줄여 적는다(꼴이 다르면 그대로)", () => {
    expect(modelLabel("claude-haiku-5-5")).toBe("Haiku 5.5");
    expect(modelLabel("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("none")).toBe("none");
    expect(modelLabel("gpt-4o-mini")).toBe("gpt-4o-mini");
  });

  it("비용에는 구성을 붙인다: 질문 기록이 있으면 돈이 든 단계, 없으면 조사와(반박이 돌았으면) 반박", () => {
    const { run } = review;
    // 미리 돌린 결과에는 질문 기록(run.questions)이 있다: 기능 파악 $0.0203, 조사 $0.0849, 반박 $0.3616(합계 어림 $0.4668).
    expect(run.stageUsd).not.toBeNull();
    expect(Object.keys(run.stageUsd!)).toEqual(["understand", "investigate", "rebut"]);
    expect(run.stageUsd!.understand).toBeCloseTo(0.0203, 6);
    expect(run.stageUsd!.investigate).toBeCloseTo(0.0849, 6);
    expect(run.stageUsd!.rebut).toBeCloseTo(0.3616, 6);
    expect(costText(run)).toBe("기능 파악+조사+반박 $0.47");
    // 돈이 들지 않은 단계는 빼고 적는다.
    expect(costText({ ...run, stageUsd: { understand: 0, investigate: 0.11, rebut: 1.09 } })).toBe("조사+반박 $0.47");
    expect(costText({ ...run, stageUsd: { understand: 0.0138, investigate: 0.1477 } })).toBe("기능 파악+조사 $0.47");
    // 질문 기록이 없으면: 이해 단계를 되살렸으면 조사와(반박이 한 건이라도 돌았으면) 반박만.
    expect(costText({ ...run, stageUsd: null, understandReused: true })).toBe("조사+반박 $0.47");
    expect(costText({ ...run, stageUsd: null, understandReused: true, verificationCounts: { "not-run": 30 } })).toBe("조사 $0.47");
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
});

describe("b. 요약과 목록", () => {
  it("차례: 요약 → 1 의무 체크리스트 → 2 이 저장소가 하는 일 → 3 개인정보 흐름 → 검증 정보", () => {
    const at = (needle: string) => {
      const i = html.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const order = [at('<section class="rv-sum"'), at('id="tier-1">'), at('id="tier-2">'), at('id="tier-3">'), at('<section class="box info rv-verify"')];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const heads = elementsOf(html, '<h2 class="tier-hd"').map(textOf);
    expect(heads).toEqual(["1의무 체크리스트", "2이 저장소가 하는 일", "3개인정보 흐름"]);
  });

  it("요약: 큰 글씨 확인할 것 N건, 회색 한 줄(감지된 기능 · 걸릴 수 있는 의무 · 외부로 보냄 ↓), 주의 문구 한 번. 점수·비율·예상 금액은 없다", () => {
    const sum = elementsOf(html, '<section class="rv-sum"')[0];
    // 코드에서 본 것 11, 저장소 밖에서 1, 해당 여부부터 4.
    expect(textOf(elementsOf(sum, '<p class="rv-big">')[0])).toBe("확인할 것 16건");
    // 실제 의무 지도의 제재로 센 무게별 수(합은 16).
    expect(elementsOf(sum, "<button").map(textOf)).toEqual(["!징역·과징금 7", "벌금·과태료 3", "명령·없음 6"]);
    const meta = elementsOf(sum, '<p class="rv-meta">')[0];
    expect(textOf(meta)).toBe("감지된 기능 6가지 · 걸릴 수 있는 의무 111개 중 · 외부로 보냄: OpenAI Responses API (외부 AI) ↓개인정보 흐름으로");
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

  it("행: 접힌 두 줄(어기면 칸 · 짧은 제목 · 인용한 자리 / 조문 · 제재)이고, 주소의 자리는 의무 id 다. 목록 아래 보지 못한 것 한 줄", () => {
    const rows = elementsOf(html, '<li class="rv-item"');
    expect(rows).toHaveLength(review.checklist.length);
    const row = rowOf("pipa-28-8-1");
    expect(row).toMatch(/^<li class="rv-item" data-tier="0"><details class="rv-row" id="duty-pipa-28-8-1"><summary>/);
    expect(textOf(elementsOf(row, '<span class="rv-r1">')[0])).toBe("!과징금국외 제공·처리위탁·보관은 별도 동의·처리방침 공개 등 근거가 있을 때만chatController.ts:135");
    expect(textOf(elementsOf(row, '<span class="rv-r2">')[0])).toBe("개인정보 보호법 제28조의8제1항(시행령 제29조의7) · 어기면 · 과징금 매출 3%");
    // 해당 여부부터 확인할 항목: 제재 앞에 '해당되면'.
    const child = rowOf("pipa-22-2-1");
    expect(textOf(elementsOf(child, '<span class="rv-r2">')[0])).toMatch(/ · 해당되면 · 어기면 · 징역 5년 · 과징금 매출 3%$/);
    // 강조 무게가 아닌 행: 느낌표 없이 갈래 한 낱말.
    expect(textOf(elementsOf(rowOf("tcra-3-2"), '<span class="rv-r1">')[0])).toBe("과태료계약 때 약관을 분명히 보여주고 사본 제공Register.tsx:793");
    const unseen = textOf(elementsOf(html, '<p class="hint rv-unseen">')[0]);
    expect(unseen).toBe("이번 검토가 보지 못한 것 — 저장소 밖(처리방침·약관·배포 설정) · 읽지 않는 파일(.env 등) · 판단 못 한 의무 0건");
    // 목록 위: 모두 펼치기 · 마크다운으로 받기 · 인쇄용 보기(분석 쪽처럼 내보내기 주소를 주었을 때).
    const exported = elementsOf(html, '<p class="rv-export">')[0];
    expect(textOf(exported)).toBe("모두 펼치기마크다운으로 받기인쇄용 보기");
    expect(exported).toContain(`href="${checklistMarkdownHref(prerun.id)}"`);
    // 내보내기 주소가 없으면 모두 펼치기만.
    expect(textOf(elementsOf(renderToStaticMarkup(<ReviewView review={review} />), '<p class="rv-export">')[0])).toBe("모두 펼치기");
  });
});

describe("c. 펼친 카드의 차례와 '도구 확인' 줄", () => {
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

  it("펼친 카드는 포스터의 차례다: 조문·표지 → 본 것 → 인용(첫 하나, 나머지는 접음) → 없는 것 → 도구 확인 → 확인할 질문 → 어기면 → 찾아본 말·자세히", () => {
    // pipa-15-2 는 열 조각이 모두 있다(인용 둘, 없는 것, 질문, 제재, 찾아본 말 하나, 자세히).
    const body = elementsOf(rowOf("pipa-15-2"), '<div class="rv-body">')[0];
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
      at("찾아본 말 1개"),
      at("<summary>자세히</summary>"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(textOf(elementsOf(body, '<p class="ask-line rv-tool">')[0])).toBe("도구 확인 인용 2줄이 파일에 그대로 있음 · '없다' 검색 1개를 다시 돌려 같음 · 반박 후 유지");
  });

  it("첫 인용은 펼치자마자 보인다: 파일:줄, 코드 한 줄, 커밋 고정 링크(따라가 보기의 의무 pipa-28-8-1)", () => {
    const body = elementsOf(rowOf("pipa-28-8-1"), '<div class="rv-body">')[0];
    expect(textOf(elementsOf(body, '<p class="ask-line rv-tool">')[0])).toBe("도구 확인 인용 2줄이 파일에 그대로 있음 · '없다' 검색 2개를 다시 돌려 같음 · 반박 후 유지");
    const first = elementsOf(body, '<ul class="cites">')[0];
    expect(textOf(first)).toContain("backend/src/controllers/chatController.ts:135");
    expect(textOf(first)).toContain("openai.responses.create");
    expect(first).toContain(`/blob/${prerun.commit}/backend/src/controllers/chatController.ts#L135`);
    // 이 의무는 모델의 말이 한 문장이라 '자세히'가 없다.
    expect(body).not.toContain("<summary>자세히</summary>");
  });

  it("검증 정보는 문장으로, 그 아래 회색 한 줄에 모델·비용(구성)·시간. CLI 판과 판정 규칙의 줄은 없다", () => {
    const verify = elementsOf(html, '<section class="box info rv-verify"')[0];
    expect(textOf(elementsOf(verify, '<p class="rv-verify-say">')[0])).toBe(
      "인용 54줄 중 53줄을 파일에서 글자 그대로 확인, 1줄은 받지 않음 · '없다' 검색 57개를 도구가 다시 돌림 → 51개 같음, 6개는 달라 '해당 없음'으로 쓰지 않음 · 반박 유지 11 · 뒤집음 0 · 반박 안 함 19 (반박은 '코드에서 본 것'·'지킨 근거 있음'에만)",
    );
    expect(textOf(elementsOf(verify, '<p class="rv-verify-meta">')[0])).toBe(
      "조사 claude-haiku-5-5 · 반박 claude-sonnet-5-5기능 파악+조사+반박 $0.47 (상한 $0.5)155초 (상한 360초)",
    );
    expect(textOf(verify)).not.toContain("CLI");
  });
});
