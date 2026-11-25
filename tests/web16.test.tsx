import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CasePage from "@/app/cases/[slug]/page";
import { casesFile } from "@/lib/cases";
import { parseReview } from "@/lib/review";
import { costText, modelLabel } from "@/lib/review/text";
import { SITE } from "@/lib/site";
import { elementAt, readJson, textOf } from "./helpers";

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
    expect(verify).toContain("CLIf4967db");
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
