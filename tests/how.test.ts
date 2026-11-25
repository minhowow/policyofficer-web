import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { figureSvg, type Figure } from "@/lib/how/draw";
import { buildFigures, CLI_PIN, TRACE, traceData, traceSourceLine } from "@/lib/how/figures";
import { REVIEW_STATUS_LABEL } from "@/lib/report/status";
import { PRERUNS } from "@/lib/service/prerun";
import { REVIEW_INNER, SCAN_PART_LABEL } from "@/lib/service/steps";
import { SITE } from "@/lib/site";
import { root } from "./helpers";

// 구조 쪽(/how/)의 그림(2026-11-13 오너 지시). 포스터·보고서용 파일(docs/figures/)은 사이트와 같은 자료로 뽑는다
// (scripts/export-figures.mjs). 자료를 고치고 다시 뽑지 않으면 여기서 걸린다. PNG 는 SVG 를 Chrome 으로 그린 것이라 견주지 않는다.
// 따라가 보기는 미리 돌려 넣은 분석(src/lib/service/prerun.ts 의 jobtalk, 2026-11-24)을 읽는다. 규칙 검사(scan)를 폐기한 뒤(2026-11-25
// 오너 지시) 쉬운 판과 자세한 판은 둘씩이다.

const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const texts = (figure: Figure, small = true) =>
  figure.shapes.flatMap((shape) => (shape.kind === "text" && (small || shape.cls !== "hw-small") ? [shape.text] : []));
const boxes = (figure: Figure) => figure.shapes.filter((shape) => shape.kind === "rect" && shape.cls.startsWith("hw-box") && shape.id !== undefined);
const prerun = PRERUNS[0];
const { simple, trace, detailed } = buildFigures(prerun);
const all = [...simple, trace, ...detailed];

describe("구조 쪽의 그림", () => {
  it.each(all.map((figure) => [figure.file, figure] as const))("%s: docs/figures 의 SVG 가 사이트의 그림과 같다", (file, figure) => {
    expect(read(`docs/figures/${file}.svg`)).toBe(figureSvg(figure));
  });

  it("그림은 쉬운 판 둘, 따라가 보기 하나, 자세한 판 둘이다. 폐기한 규칙 검사의 낱말이 어느 그림에도 없다", () => {
    expect(all.map((figure) => figure.file)).toEqual(["analysis-path-simple", "analysis-flow-simple", "trace-jobtalk", "analysis-path", "analysis-flow"]);
    for (const figure of all) {
      // 그림 안의 글, 그림 아래의 글, 좁은 화면의 목록(묶음 이름, 항목의 제목·딱지·줄) 모두.
      const listed = figure.list.flatMap((section) => [
        section.title ?? "",
        ...section.items.flatMap((item) => [item.via ?? "", item.tag ?? "", item.title, ...item.lines]),
      ]);
      for (const text of [figure.title, ...texts(figure), ...figure.notes, ...listed]) expect(text, figure.file).not.toMatch(/정적|kr-core|Semgrep|\bscan\b/i);
    }
  });

  it("검토의 여섯 단계 이름이 쉬운 판·따라가 보기·진행 표시에서 같다(포스터와 같은 이름. 2026-11-25 web16 d)", () => {
    const SIX = ["기능 파악", "의무 고르기", "의무별 조사", "반박", "직접 대조", "체크리스트"];
    const flow = simple.find((figure) => figure.file === "analysis-flow-simple")!;
    expect(flow.list[0].items.map((item) => item.title)).toEqual(SIX);
    expect(trace.list.flatMap((section) => section.items.map((item) => item.title))).toEqual(SIX.map((name, i) => `${"①②③④⑤⑥"[i]} ${name}`));
    expect(SCAN_PART_LABEL.profile).toBe(SIX[0]);
    expect(REVIEW_INNER).toBe(SIX.slice(1, 5).join(" → "));
  });

  it("쉬운 판은 상자 7개 이하이고, 숫자·커밋·모델 이름·CLI 낱말이 없다(명령 이름은 작은 글씨로만)", () => {
    expect(simple.map((figure) => figure.file)).toEqual(detailed.map((figure) => `${figure.file}-simple`));
    for (const figure of simple) {
      expect(boxes(figure).length, figure.file).toBeLessThanOrEqual(7);
      for (const text of texts(figure, false)) {
        expect(text, figure.file).not.toMatch(/[0-9]|haiku|sonnet|claude|gpt|kr-core|semgrep|review|scan|profile|handoff|관문|\$/i);
        expect(text, figure.file).not.toContain(CLI_PIN.commit);
      }
    }
  });

  it("자세한 판은 상자 12개 이하이고 글은 3~4줄이다. 그림마다 좁은 화면의 목록이 있다", () => {
    for (const figure of detailed) {
      expect(boxes(figure).length, figure.file).toBeLessThanOrEqual(12);
      expect(figure.notes.length, figure.file).toBeGreaterThanOrEqual(3);
      expect(figure.notes.length, figure.file).toBeLessThanOrEqual(4);
    }
    for (const figure of all) expect(figure.list.flatMap((section) => section.items).length, figure.file).toBeGreaterThan(0);
  });

  it("따라가 보기는 미리 돌려 넣은 분석의 결과를 그대로 옮기고, 미리 돌린 결과라고 밝힌다", () => {
    const { item, feature } = traceData(prerun);
    const drawn = texts(trace).join("\n");
    expect(item.duty).toBe(TRACE.duty);
    for (const part of [feature.name, `${item.law} ${item.article}`, REVIEW_STATUS_LABEL[item.status]]) expect(drawn).toContain(part);
    // AI 가 댄 줄은 관문을 통과한 인용 그대로(위치와 글).
    const cite = item.citations.find((c) => c.ok)!;
    expect(drawn).toContain(`${cite.file}:${cite.line}`);
    expect(drawn).toContain(cite.text.trim());
    // 다시 센 검색의 줄 수와 반박 결과도 자료에서 온다.
    for (const search of item.searches) expect(drawn).toContain(`${search.found}줄`);
    expect(item.verification.result).toBe("upheld");
    expect(drawn).toContain("유지");
    // 출처 줄: 저장소 · 커밋 · 미리 돌린 결과와 그날, 모델 id.
    expect(traceSourceLine(prerun)).toBe(
      `Vactor0911/jobtalk · 커밋 bbfb3ab · ${SITE.prerun} 2026-11-24 (조사 claude-haiku-5-5 · 반박 claude-sonnet-5-5)`,
    );
  });

  it("그림의 CLI 고정 커밋은 수집본과 실행기의 것과 같다", () => {
    const manifest = JSON.parse(read("contract/cli-current/MANIFEST.json")) as { cli: { commit: string } };
    expect(manifest.cli.commit).toBe(CLI_PIN.commit);
    expect(read(".github/workflows/analyze.yml")).toMatch(new RegExp(`CLI_COMMIT: ${CLI_PIN.commit}[0-9a-f]{33}\\n`));
    expect(texts(detailed[0]).join("\n")).toContain(CLI_PIN.commit);
    expect(texts(detailed[0]).join("\n")).toContain(CLI_PIN.tag);
  });

  it("CLI 그림의 체크리스트는 사이트의 상태 이름을 쓴다", () => {
    const drawn = texts(detailed[1]).join("");
    for (const label of Object.values(REVIEW_STATUS_LABEL)) {
      for (const part of label.split(" · ")) expect(drawn, label).toContain(part);
    }
  });
});
