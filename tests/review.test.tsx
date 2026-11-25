import Ajv from "ajv/dist/2020";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewView } from "@/components/review/ReviewView";
import { parseReview } from "@/lib/review";
import { gateText, shortStatus } from "@/lib/review/text";
import { layoutFlow } from "@/lib/review/flow";
import { evalFigureSvg, type EvalFile } from "@/lib/eval/figure";
import { REVIEW_GOODS_LABEL, REVIEW_RECHECK_LABEL, REVIEW_STATUS_LABEL } from "@/lib/report/status";
import { PRERUNS } from "@/lib/service/prerun";
import { SITE } from "@/lib/site";
import { readFileSync } from "node:fs";
import path from "node:path";
import { elementAt, elementsOf, readJson, textOf } from "./helpers";
import { withoutSanctions } from "./sanctions";
import { BANNED_WORDING } from "./wording";

/** 그린 HTML 에 쓰지 않는 말이 없다. 제재 표의 몫(표지·주의 문구·제재 조문, 2026-11-24)은 자리째 빼고 본다. */
const expectNoBanned = (html: string) => {
  const rest = textOf(withoutSanctions(html));
  for (const [pattern, why] of BANNED_WORDING) expect(pattern.test(rest), why).toBe(false);
};

// review 2판(policyofficer review, CLI e12e6ba)의 결과를 읽는 부품과 화면(2026-11-11 오너 지시). 자료는 손으로 만든 합성 예시다.
const sample = () => readJson("contract", "review", "genai-chat.review.json") as Record<string, unknown>;

describe("review 결과 (2판)", () => {
  it("합성 예시는 CLI 의 스키마(contract/schema/review.cli-2.schema.json)에 맞고, 읽으면 화면이 쓰는 필드가 다 있다", () => {
    const validate = new Ajv({ strict: false, allErrors: true }).compile(readJson("contract", "schema", "review.cli-2.schema.json") as object);
    expect(validate(sample()), JSON.stringify(validate.errors)).toBe(true);
    const review = parseReview(sample())!;
    expect(review.flow.nodes.map((n) => n.kind)).toEqual(["input", "input", "server", "server", "store", "store", "external", "external"]);
    expect(review.summary.top).toHaveLength(5);
    expect(review.checklist.map((item) => item.status)).toContain("not-applicable");
    // 판이 다르거나 모양이 다르면 읽지 않는다.
    expect(parseReview({ ...sample(), review_version: 1 })).toBeNull();
    expect(parseReview({ ...sample(), checklist: [{ duty: "x", status: "to-check" }] })).toBeNull();
  });

  it("흐름 그림: 받는 것 | 처리 | 저장·외부로 보냄. 외부로 가는 화살표만 눈에 띄게 그린다", () => {
    const review = parseReview(sample())!;
    const layout = layoutFlow(review.flow.nodes, review.flow.edges);
    expect(layout.columns.map((c) => c.title)).toEqual(["받는 것", "처리", "저장 · 외부로 보냄"]);
    const box = (id: string) => layout.boxes.find((b) => b.id === id)!;
    // 마지막 단은 저장이 위, 외부가 아래다.
    expect(Math.max(box("n5").y, box("n6").y)).toBeLessThan(Math.min(box("n7").y, box("n8").y));
    expect(layout.paths.filter((p) => p.outward).map((p) => `${p.from}>${p.to}`).sort()).toEqual(["n3>n8", "n4>n7"]);
  });

  it("체크리스트: 확인할 것의 세 갈래는 열린 목록(의무 한 건이 접힌 두 줄 행), 나머지 갈래는 그 아래에 접는다. 해당 없음은 찾아본 말과 다시 센 건수를 펼치면 보인다", () => {
    const html = renderToStaticMarkup(<ReviewView review={parseReview(sample())!} />);
    // 세 갈래는 섹션(접히지 않음)이고, 머리는 짧은 이름과 수다. 행은 저마다 접혀 있다.
    for (const [status, n] of [["seen-in-code", 6], ["check-outside", 1], ["check-applicability", 1]] as const) {
      const section = elementsOf(html, `<section class="ck ck-check rv-${status}">`)[0];
      expect(textOf(elementsOf(section, '<h3 class="ck-hd ck-hd-check">')[0]), status).toBe(`${shortStatus(status)} ${n}건`);
      expect(elementsOf(section, '<li class="rv-item"'), status).toHaveLength(n);
      expect(elementsOf(section, '<details class="rv-row"'), status).toHaveLength(n);
      expect(section, status).not.toContain("rv-group");
    }
    for (const status of ["unknown", "evidence-found", "likely-not-applicable", "not-applicable"] as const) {
      const at = html.indexOf(`<details class="rv-group rv-${status}">`);
      expect(at, status).toBeGreaterThan(html.indexOf('<div class="rv-folded">'));
      expect(textOf(elementsOf(html.slice(at), "<summary>")[0])).toBe(`${REVIEW_STATUS_LABEL[status]} 1건`);
    }
    const na = html.slice(html.indexOf('<details class="rv-group rv-not-applicable">'));
    expect(textOf(na)).toContain("찾아본 말 1개");
    expect(textOf(na)).toContain("다시 센 줄 0줄");
    // 검증 정보: 결과에 실린 수 그대로.
    const info = textOf(elementsOf(html, '<section class="box info rv-verify"')[0]);
    expect(info).toContain("인용 31줄 중 29줄을 파일에서 글자 그대로 확인, 2줄은 받지 않음");
    // 반박은 '코드에서 본 것'·'충족 근거 있음'에만 건다(실행기의 --rebut-scope found, 2026-11-15). 나머지는 '반박 안 함'으로 센다.
    expect(info).toContain(
      `반박 유지 6 · 뒤집음 1 · 반박 안 함 5 (반박은 '${REVIEW_STATUS_LABEL["seen-in-code"].split(" · ").at(-1)}'·'${REVIEW_STATUS_LABEL["evidence-found"]}'에만)`,
    );
    expect(info).toContain("$1.42 (상한 $2)");
    // 반박하지 않은 항목의 줄에는 반박 이야기가 없다(뒤집힌 항목에만 '반박이 바꿈').
    for (const item of parseReview(sample())!.checklist.filter((entry) => entry.verification === "not-run")) {
      expect(item.verificationWhy).toBe("rebut-scope");
      expect(["seen-in-code", "evidence-found"]).not.toContain(item.status);
    }
    expect(html.match(/반박이 바꿈/g)).toHaveLength(1);
  });

  it("CLI handoff-w11-13 의 덧붙인 키: AI 가 정한 플랫폼, 관문 까닭 다섯, '충족'의 남은 부족한 점. 모르는 키는 무시하고 판을 거부하지 않는다", () => {
    const data = sample();
    const validate = new Ajv({ strict: false, allErrors: true }).compile(readJson("contract", "schema", "review.cli-2.schema.json") as object);
    const profile = { ...(data.profile as Record<string, unknown>), platforms: ["server"], platforms_from: "model", platform_evidence: [] };
    const items = data.checklist as Record<string, unknown>[];
    const gated = (item: Record<string, unknown>, why: string, extra: Record<string, unknown> = {}) => {
      const first = item.first as Record<string, unknown>;
      const note = `[${why}]`;
      return { ...item, reason: `${note} 모델의 말.`, first: { ...first, ...extra, gate: { from: "evidence-found", why, note } } };
    };
    const checklist = [
      gated(items[0], "remaining-gap", { remaining: "동의 철회 화면이 없음" }),
      gated(items[1], "prohibition"),
      gated(items[2], "free-input"),
      gated(items[3], "other-side"),
      gated(items[4], "same-model"),
      ...items.slice(5),
    ].map((item) => ({ ...item, missing: item === items[0] ? undefined : (item as Record<string, unknown>).missing }));
    const next = { ...data, profile, checklist };
    expect(validate(next), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
    const review = parseReview(next)!;
    expect(review.profile.platformsFrom).toBe("model");
    expect(review.checklist.slice(0, 5).map((item) => item.gate)).toEqual(["remaining-gap", "prohibition", "free-input", "other-side", "same-model"]);
    // 남은 부족한 점은 '없는 것'으로 보인다(missing 이 비었을 때).
    expect(review.checklist[0].missing).toBe("동의 철회 화면이 없음");
    const html = renderToStaticMarkup(<ReviewView review={review} />);
    const text = textOf(html);
    expect(text).toContain("플랫폼: 서버 (AI 가 코드에서 인용과 함께 정함)");
    for (const item of review.checklist.slice(0, 5)) expect(gateText(item), item.gate!).toBeTruthy();
    expect(text).toContain("남은 부족한 점을 적어");
    expect(text).toContain("금지된 행위 자체를 보인 줄이 없어");
    expect(text).not.toContain("[remaining-gap]");
    expectNoBanned(html);
  });

  it("인용은 관문을 통과한 것만, 의무 한 줄에 처분의 말이 들면 싣지 않는다", () => {
    const data = sample();
    const checklist = (data.checklist as Record<string, unknown>[]).map((item, i) =>
      i === 0
        ? {
            ...item,
            duty_text: `시험용_의무_한_줄 \u{acfc}\u{d0dc}\u{b8cc} 대상`,
            citations: [...(item.citations as object[]), { file: "src/x.ts", line: 1, text: "REJECTED_LINE", ok: false, why: "not-found" }],
          }
        : item,
    );
    const html = renderToStaticMarkup(<ReviewView review={parseReview({ ...data, checklist })!} />);
    expect(html).not.toContain("REJECTED_LINE");
    expect(html).not.toContain("시험용_의무_한_줄");
  });

  it("흐름 그림: 내보내기만 하는 외부는 첫 단의 아래에, 같은 단 안의 화살표는 위아래로 곧게", () => {
    const node = (id: string, kind: "input" | "server" | "store" | "external") => ({ id, kind, label: id, data: [], citations: [] });
    const edge = (from: string, to: string) => ({ from, to, data: [], citations: [] });
    const layout = layoutFlow(
      [node("in", "input"), node("kakao", "external"), node("api", "server"), node("agent", "server"), node("db", "store")],
      [edge("in", "api"), edge("kakao", "api"), edge("kakao", "db"), edge("in", "agent"), edge("agent", "api"), edge("api", "db")],
    );
    const box = (id: string) => layout.boxes.find((b) => b.id === id)!;
    expect(box("kakao").x).toBe(box("in").x);
    expect(box("kakao").y).toBeGreaterThan(box("in").y);
    expect(layout.columns.map((c) => c.title)).toEqual(["받는 것", "처리", "저장"]);
    const up = layout.paths.find((p) => p.from === "agent" && p.to === "api")!;
    expect(up.d).toMatch(/^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
    expect(layout.paths.some((p) => p.outward)).toBe(false);
    // 첫 단에서 마지막 단으로 건너뛰는 화살표는 가운데 단의 상자 사이 틈으로 곧게 지나간다(상자 뒤로 지나가지 않는다).
    const skip = layout.paths.find((p) => p.from === "kakao" && p.to === "db")!;
    const through = /L([\d.]+),([\d.]+)/.exec(skip.d)!;
    expect(Number(through[1])).toBe(box("api").x + box("api").w);
    for (const id of ["api", "agent"]) {
      const b = box(id);
      expect(Number(through[2]) > b.y && Number(through[2]) < b.y + b.h, id).toBe(false);
    }
  });

  it("다시 검토 중: 짚은 의무는 상태·까닭·인용 없이 이름만 맨 아래에 접고, 갈래 수와 맨 위 한 줄의 수에서 뺀다", () => {
    const review = parseReview(sample())!;
    const held = review.checklist.find((item) => item.status === "not-applicable")!;
    const html = renderToStaticMarkup(<ReviewView review={review} recheck={[held.duty]} />);
    expect(html).not.toContain('<details class="rv-group rv-not-applicable">');
    const at = html.indexOf('<details class="rv-group rv-recheck">');
    expect(at).toBeGreaterThan(-1);
    const fold = elementAt(html, at);
    expect(textOf(elementsOf(fold, "<summary>")[0])).toBe(`${REVIEW_RECHECK_LABEL} 1건`);
    expect(textOf(fold)).toContain(held.dutyText);
    expect(textOf(fold)).not.toContain(REVIEW_STATUS_LABEL["not-applicable"]);
    expect(fold).not.toContain("rv-searches");
  });

  it("2판 덧붙임(CLI f4967db): 품목 묶음은 한 줄로 접고 확인할 것의 수에서 빼며, 관문의 메모·까닭 이름·프로필 신호의 빈 줄을 그대로 싣지 않고, 없는 것을 적는다", () => {
    const data = sample();
    const base = (data.checklist as Record<string, unknown>[])[0];
    const note = "걸리는 조건 자체가 없다는 답(applies '아니오'와 condition)이 없어 '해당 없음'으로 받지 않았습니다.";
    const named = "인용이 조문이 요구하는 행위가 아니라 이름·기본값뿐이라 '충족 근거 있음'으로 받지 않았습니다.";
    const goods = (duty: string, name: string) => ({
      ...base,
      duty,
      duty_text: `${name} 판매 의무 ${duty}`,
      status: "check-applicability",
      asked: false,
      not_answered: "goods-not-detected",
      group: "goods",
      first: null,
      verification: { result: "not-run", why: "goods-not-detected" },
      citations: [],
      searches: [],
      question: `${name}도 판매하나요? 판매한다면 이 의무가 걸립니다.`,
      reason: `${name} 판매에만 걸리는 의무입니다. 코드에서 이 품목의 신호를 찾지 못해 묻지 않았습니다.`,
    });
    const checklist = [
      {
        ...base,
        duty: "gate-no-condition",
        status: "check-applicability",
        first: { ...(base.first as object), gate: { from: "not-applicable", why: "no-condition", note } },
        reason: `${note} 모델이 쓴 말 하나. 모델이 쓴 말 둘.`,
      },
      {
        ...base,
        duty: "gate-name",
        status: "seen-in-code",
        missing: "약관 고지 화면이 없음",
        first: { ...(base.first as object), gate: { from: "evidence-found", why: "name-or-default", note: named } },
        reason: `${named} helmet 기본값으로 HSTS 를 켭니다.`,
        citations: [{ file: "src/app/signup/page.tsx", line: null, text: "", ok: true, why: "profile" }],
      },
      {
        ...base,
        duty: "gate-said",
        status: "check-applicability",
        first: { ...(base.first as object), gate: { from: "not-applicable", why: "condition-present", note: "조건 메모." } },
        reason: "조건 메모. 모델의 말.",
      },
      {
        ...base,
        duty: "gate-unknown",
        status: "check-applicability",
        first: { ...(base.first as object), gate: { from: "seen-in-code", why: "applies-unknown", note: "모름 메모." } },
        reason: "모름 메모. 제공인지 위탁인지는 개발자 판단입니다.",
      },
      { ...base, duty: "cap", status: "unknown", asked: false, first: null, not_answered: "cost-cap", reason: "저장소당 금액 상한에 걸려 묻지 못했습니다" },
      goods("liquor-1", "주류"),
      goods("books-1", "도서"),
    ];
    const review = parseReview({ ...data, checklist })!;
    expect(review.checklist.map((item) => item.gate)).toEqual(["no-condition", "name-or-default", "condition-present", "applies-unknown", null, null, null]);
    expect(review.checklist[0].reason).toBe("모델이 쓴 말 하나. 모델이 쓴 말 둘.");
    const html = renderToStaticMarkup(<ReviewView review={review} code={{ htmlUrl: "https://github.com/o/r", commit: "a".repeat(40) }} />);
    const text = textOf(html);
    for (const raw of ["goods-not-detected", "cost-cap", "applies", "condition", "충족 근거 있음"]) expect(text, raw).not.toContain(raw);
    // 품목 묶음: 목록 아래 접어 둔 갈래 가운데 한 줄. 맨 위 요약의 확인할 것은 품목 의무를 빼고 센다(4건).
    const at = html.indexOf('<details class="rv-group rv-goods">');
    expect(at).toBeGreaterThan(html.indexOf('<section class="ck ck-check rv-check-applicability">'));
    expect(textOf(elementsOf(html.slice(at), "<summary>")[0])).toBe(`${REVIEW_GOODS_LABEL} 2건`);
    expect(textOf(elementAt(html, at))).toContain("주류도 판매하나요?");
    expect(textOf(elementsOf(html, '<p class="rv-big">')[0])).toBe("확인할 것 4건");
    expect(textOf(elementsOf(html, '<section class="ck ck-check rv-check-applicability">')[0]).startsWith(`${shortStatus("check-applicability")} 3건`)).toBe(true);
    // CLI 2a24d94 의 까닭도 이 사이트의 말로(메모를 그대로 싣지 않는다).
    expect(text).toContain("AI 가 걸리는지 모른다고 답해 '해당 여부부터 확인할 것'으로 옮겼습니다.");
    expect(text).not.toContain("모름 메모.");
    // 조건이 AI 의 말뿐이면(해당 여부부터) 조건이 있다고 단정하지 않는다.
    expect(text).toContain(`AI 가 걸리는 조건이 있다고 답해 '${REVIEW_STATUS_LABEL["not-applicable"]}'을 받지 않았습니다.`);
    expect(text).not.toContain("조건 메모.");
    // 관문이 바꾼 항목: 첫 줄은 이 사이트의 상태 이름으로 적은 까닭, 모델의 말은 '자세히'에.
    expect(text).toContain(`걸리는 조건이 없다는 근거가 없어 AI 가 낸 '${REVIEW_STATUS_LABEL["not-applicable"]}'을 받지 않았습니다.`);
    expect(text).toContain(`'${REVIEW_STATUS_LABEL["evidence-found"]}'으로 받지 않았습니다.`);
    expect(text).toContain("모델이 쓴 말 하나. 모델이 쓴 말 둘.");
    expect(text).toContain("없는 것 약관 고지 화면이 없음");
    // 프로필 신호는 인용한 줄(빈 글)이 아니라 기능 신호의 파일 링크.
    expect(html).not.toContain('<code class="cite-text" translate="no"></code>');
    expect(text).toContain("기능 신호: src/app/signup/page.tsx");
    // 묻지 못한 항목은 reason 의 말만(까닭 이름을 싣지 않는다).
    expect(text).toContain("저장소당 금액 상한에 걸려 묻지 못했습니다");
  });

  it("확인할 것이 0건이면 맨 위 요약의 그 수 바로 아래에 0의 뜻을 둔다(목록 줄과 같은 수, docs/commitments.md 의 1)", () => {
    const data = sample();
    const all = (data.checklist as Record<string, unknown>[]).map((item) => ({ ...item, status: "not-applicable" }));
    const zero = parseReview({ ...data, checklist: all })!;
    const html = renderToStaticMarkup(<ReviewView review={zero} />);
    expect(textOf(elementsOf(html, '<p class="rv-big">')[0])).toBe("확인할 것 0건");
    expect(html).toContain(`<p class="hint zero-note">${SITE.zeroCheckIsNotClearance}</p>`);
    expect(html.indexOf("zero-note")).toBeGreaterThan(html.indexOf('<p class="rv-big">'));
    expect(html.indexOf("zero-note")).toBeLessThan(html.indexOf('<p class="rv-meta">'));
    // 0이 아니면 두지 않는다.
    expect(renderToStaticMarkup(<ReviewView review={parseReview(data)!} />)).not.toContain("zero-note");
  });
});

describe("미리 돌려 넣은 분석: jobtalk(CLI handoff-w13-1, 2026-11-24)", () => {
  const prerun = PRERUNS[0];
  const review = parseReview(prerun.review)!;
  const html = renderToStaticMarkup(<ReviewView review={review} code={{ htmlUrl: "https://github.com/Vactor0911/jobtalk", commit: prerun.commit }} />);

  it("결과 JSON 은 CLI 가 낸 그대로 읽힌다. 이름 바꾸기(handoff-w13-3) 전 판이라 CLI 의 스키마와 다른 것은 도구 이름(policypack)뿐이다", () => {
    const validate = new Ajv({ strict: false, allErrors: true }).compile(readJson("contract", "schema", "review.cli-2.schema.json") as object);
    const data = prerun.review as { tool: { name: string } };
    expect(data.tool.name).toBe("policypack");
    expect(validate(data)).toBe(false);
    expect(validate.errors?.map((error) => error.instancePath)).toEqual(["/tool/name"]);
    expect(validate({ ...data, tool: { ...data.tool, name: "policyofficer" } }), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
    expect(review).not.toBeNull();
    expect(review.run.models).toEqual({ investigate: "claude-haiku-5-5", verify: "claude-sonnet-5-5" });
    expect(review.run.rebutScope).toBe("found");
    expect(review.run.stageUsd).not.toBeNull();
  });

  it("갈래별 수: 확인할 것 16건(코드에서 본 것 11, 저장소 밖에서 1, 해당 여부부터 4), 나머지는 접는다", () => {
    expect(textOf(elementsOf(html, '<p class="rv-big">')[0])).toBe("확인할 것 16건");
    for (const [status, n] of [["seen-in-code", 11], ["check-outside", 1], ["check-applicability", 4]] as const) {
      const section = elementsOf(html, `<section class="ck ck-check rv-${status}">`)[0];
      expect(textOf(elementsOf(section, '<h3 class="ck-hd ck-hd-check">')[0]), status).toBe(`${shortStatus(status)} ${n}건`);
      expect(elementsOf(section, '<li class="rv-item"'), status).toHaveLength(n);
    }
    for (const [status, n] of [["likely-not-applicable", 1], ["not-applicable", 13]] as const) {
      const at = html.indexOf(`<details class="rv-group rv-${status}">`);
      expect(at, status).toBeGreaterThan(html.indexOf('<div class="rv-folded">'));
      expect(textOf(elementsOf(html.slice(at), "<summary>")[0])).toBe(`${REVIEW_STATUS_LABEL[status]} ${n}건`);
    }
    for (const status of ["unknown", "evidence-found"] as const) expect(html, status).not.toContain(`rv-group rv-${status}"`);
    expect(html).not.toContain("rv-goods");
    expect(html).not.toContain("rv-recheck");
  });

  it("흐름 그림과 커밋 고정 링크가 있고, 앞선 판의 법령 이름·제재 표지 말이 겹쳐 적히지 않는다", () => {
    expect(html).toContain('<figure class="flow">');
    expect(html).toContain(`/blob/${prerun.commit}/`);
    // 앞선 판으로 만든 결과의 조문 앞 '시행령 '이 법령 이름과 겹쳐 두 번 적히지 않고(lawArticle), 제재 표지가 '어기면'을 겹쳐
    // 적지 않는다(CLI handoff-w13-2 의 표지 말, 2026-11-24).
    expect(textOf(html)).not.toMatch(/(시행령|시행규칙) \1/);
    expect(textOf(html)).not.toContain("어기면 · 시정명령을 어기면");
    expectNoBanned(html);
  });
});

describe("공개 저장소 41곳 평가(2026-11-13)", () => {
  const evalFile = readJson("data", "eval-41.json") as EvalFile;

  it("숫자: 34/41곳, 빈 체크리스트 5곳, 인용 2,256건 중 거절 18건, $6.75. 성격별 합이 41곳이고 성격 이름에 경로가 없다", () => {
    const { total, categories } = evalFile;
    expect(total.repos).toBe(41);
    expect(categories.reduce((n, c) => n + c.repos, 0)).toBe(41);
    for (const c of categories) expect(c.kind).not.toMatch(/\//);
    expect([total.withSeenInCode, total.emptyChecklists, total.citations, total.citationsRejected, total.usd]).toEqual([34, 5, 2256, 18, 6.75]);
    // 규칙 검사를 폐기해(2026-11-25) 정적 검사의 숫자는 싣지 않는다.
    expect(JSON.stringify(evalFile)).not.toMatch(/static/i);
  });

  it("포스터 그림(docs/figures/review-results-41.svg)은 지금 데이터로 그린 것과 같다", () => {
    const svg = readFileSync(path.join(process.cwd(), "docs/figures/review-results-41.svg"), "utf8");
    expect(svg).toBe(evalFigureSvg(evalFile));
    expect(svg).toContain("34 / 41곳");
    expect(svg).not.toMatch(/정적|kr-core|Semgrep/);
  });
});
