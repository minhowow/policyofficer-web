import type { Browser, BrowserContext, Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { analysisHref, repoHref } from "@/lib/service/href";
import { syntheticRepositories, syntheticStore } from "@/lib/service/synthetic";
import { jsonFiles, readJson } from "../helpers";
import {
  borderContrast,
  closeChrome,
  contrast,
  focusRingContrast,
  inkContrast,
  launchChrome,
  openPage,
  particleBreaks,
  pixelAt,
  pixelsOf,
  serveSite,
  textContrast,
  type ContrastScan,
  type ParticleBreak,
  type Site,
} from "./site";

// 글꼴·간격·색(ROADMAP 9번)에서 쪽마다 재는 것. 재디자인 D7 에서 모든 쪽과 D2~D6 의 새 부품으로 넓혔고, 2026-11-25(web17)에 결과
// 보기·데모·사례·정책 쪽·조문별 검사 기록이 사이트에서 빠져 지금 있는 쪽만 잰다.
//
// 두 테마의 명도 대비(9번의 완료 조건). 모든 쪽 종류를 밝은 테마와 어두운 테마, 좁은 화면(375px)과 넓은 화면(1280px)으로 열어,
// 그려진 글자 조각마다 글자색과 그 뒤에 실제로 깔린 바탕색의 명도 대비가 4.5:1 이상인지 잰다(tests/browser/site.ts 의
// `textContrast`. 쪽마다 한 번의 evaluate). 큰 글자라고 3:1 로 낮추지 않는다. 접힌 채로 한 번, 접어 둔 것을 모두 펼친 채로 한 번
// 잰다. 쪽 종류는 첫 화면(진행 중·대기 줄), 검색(빈 상태, 결과, 0건), 저장소 쪽마다, 분석 쪽마다(AI 검토 결과, 프로필과 걸리는 의무만,
// 걸리는 의무 0, 진행 중, 대기, 실패), 조문 도감(의무 지도), 없는 주소의 쪽(404)이다. 펼친 자동 완성 목록(상태 줄, 고른 줄)과 좁은
// 화면의 펼친 메뉴도 잰다. 좁은 화면에서 감추는 저장소 쪽 표의 칸은 넓은 화면에서만 그려진다.
//
// 재는 쪽마다 그 쪽에 있어야 할 부품(배지, 이름표, 점, 제재 표지와 거르개 단추, 세 단의 머리 등)의 선택자를 적어 두고, 그 가운데
// 하나라도 그려지지 않았으면 실패한다. 부품이 없어지거나 이름이 바뀌어 그 부품을 재지 않고 통과하는 일이 없게 한다.
//
// 실패하면 어느 쪽(무엇을 열었는지, 접힌 채인지)·어느 글(요소와 글의 앞부분)·몇 대 1 인지(글자색과 바탕색)가 실패 글에 남는다.
//
// 인쇄: 어두운 테마에서 인쇄해도 밝은 색으로 찍힌다(흰 종이 위에서 잰다). 화면에서 고르는 데만 쓰는 것(검색창과 펼침 목록, 좁은
// 화면의 메뉴)은 찍지 않는다. 의무 체크리스트의 인쇄용 보기는 tests/browser/sanction.test.ts·export.test.ts 가 본다.
//
// 강제 색 모드(윈도의 고대비 테마 등)에서 배지·이름표·제재 표지·점과 고른 것·지금 쪽·초점·아이콘이 드러나는지와, 사이트가 쓴 글에서
// 닫는 따옴표·괄호 뒤의 조사가 줄 머리로 떨어지지 않는지도 여기서 본다(9번의 첫 검토 뒤에 더했고, D7 에서 새 쪽과 부품으로 넓혔다).

let site: Site;
let browser: Browser;
const contexts: BrowserContext[] = [];
/** 쪽에서 난 오류(잡히지 않은 예외, 콘솔의 오류 줄). 시험마다 비어 있어야 한다. */
const problems: string[] = [];

beforeAll(async () => {
  site = await serveSite();
  try {
    browser = await launchChrome();
  } catch (error) {
    await site.close();
    throw error;
  }
});

/** 없는 주소의 쪽. 서버는 이 주소에 404 상태로 Next 의 기본 404 쪽을 내준다. */
const NOT_FOUND = "/no-such-page/";
/** 브라우저가 404 응답마다 콘솔에 남기는 줄. 없는 주소의 쪽을 일부러 열었을 때만 봐준다. */
const NOT_FOUND_CONSOLE = "콘솔: Failed to load resource: the server responded with a status of 404 (Not Found)";

afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  // 404 로 돌아온 요청은 일부러 연 없는 주소뿐이어야 하고, 봐주는 콘솔 줄도 그 수만큼이다.
  const missing = site.requests.splice(0).filter((request) => request.status === 404);
  expect(missing.map((request) => request.url).filter((url) => url !== NOT_FOUND)).toEqual([]);
  const left = problems.splice(0);
  for (let i = 0; i < missing.length; i += 1) {
    const at = left.indexOf(NOT_FOUND_CONSOLE);
    if (at !== -1) left.splice(at, 1);
  }
  expect(left).toEqual([]);
});

afterAll(async () => {
  await closeChrome(browser);
  await site?.close();
});

type Scheme = "light" | "dark";
const SCHEMES: Scheme[] = ["light", "dark"];
/** 좁은 화면과 넓은 화면. */
const WIDTHS = [375, 1280] as const;
const EVERY = SCHEMES.flatMap((scheme) => WIDTHS.map((width) => [scheme, width] as [Scheme, number]));

const open = (pathname: string, colorScheme: Scheme, width = 375, height = 720) =>
  openPage(browser, site, pathname, { viewport: { width, height }, colorScheme, contexts, problems });

const go = (page: Page, pathname: string) => page.goto(`${site.origin}${pathname}`, { waitUntil: "networkidle" });

// ── 분석 서비스의 쪽(합성 저장소. 시험의 사이트는 SERVICE_STORE=synthetic 으로 돈다) ──

const REPOSITORIES = syntheticRepositories().map(({ repository }) => repository);
const REPO_PAGES = REPOSITORIES.map((r) => repoHref(r.owner, r.name));
const ANALYSES: { pathname: string; status: string }[] = [];
for (const r of REPOSITORIES) {
  for (const analysis of await syntheticStore.listAnalyses(r.owner, r.name)) {
    ANALYSES.push({ pathname: analysisHref(r.owner, r.name, analysis.id), status: analysis.status });
  }
}
/** 첫 화면(진행 중·대기 줄), 검색 빈 상태, 결과, 0건(한글 자판으로 친 질의). */
const FRONT_PAGES = ["/", "/search/", "/search/?q=example", "/search/?q=ㅁㅁ"];
/**
 * AI 검토 결과가 있는 끝난 분석(생성형 AI 채팅 합성 저장소): 한 줄, 코드에서 확인된 것(카드), 더 살펴볼 것(제재 거르개 단추, 행 목록),
 * 접어 둔 흐름 그림·하는 일·닫은 의무·검증 정보.
 */
const REVIEWED = ANALYSES.find((a) => a.pathname === analysisHref("example-studio", "genai-chat", "4qqa6fdx2h"))!.pathname;
/** 검토 결과가 없는 끝난 분석(광고 푸시): 프로필과 걸리는 의무까지만. */
const PROFILED = ANALYSES.find((a) => a.pathname === analysisHref("example-org", "night-push", "64y4jdtazh"))!.pathname;
const RUNNING = ANALYSES.find((a) => a.status === "running")!.pathname;
const FAILED = ANALYSES.find((a) => a.status === "failed")!.pathname;

/**
 * 그 선택자마다 그려진 요소의 수. 그려졌다는 것은 자리를 차지하고(1px 넘게), 보이고, 닫힌 details 의 안(이름 summary 는 빼고)이
 * 아니라는 것이다. 이 수가 0 인 선택자는 그 쪽에서 재지 못한 것이다.
 */
const drawnCounts = (page: Page, selectors: string[]) =>
  page.evaluate(
    (list) =>
      list.map((selector) =>
        [...document.querySelectorAll(selector)].filter((el) => {
          const box = el.getBoundingClientRect();
          if (box.width <= 1 || box.height <= 1 || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
          for (let fold = el.closest("details:not([open])"); fold; fold = fold.parentElement?.closest("details:not([open])") ?? null) {
            if (!fold.querySelector(":scope > summary")?.contains(el)) return false;
          }
          return true;
        }).length,
      ),
    selectors,
  );

/** 잰 것을 모아 둔다. 기준에 못 미친 것은 어느 쪽의 무엇인지와 함께 적는다. */
class Scans {
  readonly low: string[] = [];
  /** 부품 선택자마다 그려진 채로 잰 횟수(접힌 채의 재기에서 센다). */
  readonly parts = new Map<string, number>();
  measured = 0;
  lowest = Infinity;

  add(where: string, scan: ContrastScan): void {
    this.measured += scan.measured;
    this.lowest = Math.min(this.lowest, scan.lowest);
    for (const entry of scan.low) {
      this.low.push(`${where}: ${entry.what} "${entry.text}" ${entry.ratio}:1 (글자 ${entry.color} / 바탕 ${entry.background})`);
    }
    if (scan.lowCount > scan.low.length) this.low.push(`${where}: 그 밖에 ${scan.lowCount - scan.low.length}곳`);
  }

  /** 그 쪽에 지금 그려진 부품을 센다(아래 `expectParts` 가 본다). */
  async count(page: Page, parts: string[]): Promise<void> {
    const counts = await drawnCounts(page, parts);
    parts.forEach((part, i) => this.parts.set(part, (this.parts.get(part) ?? 0) + counts[i]));
  }

  /**
   * 접힌 채로 한 번 재고, 접어 둔 것을 모두 펼친 채로 한 번 더 잰다. 잰 뒤에 머리글의 펼치는 메뉴는 다시 닫는다(열린 메뉴가 본문의
   * 위쪽을 덮는다). `parts` 는 이 쪽에서 셀 부품이다(접힌 채로 센다). `openParts` 는 접어 둔 것 안에만 있는 부품이다(펼친 채로 센다).
   */
  async both(page: Page, where: string, parts: string[] = [], openParts: string[] = []): Promise<void> {
    await this.count(page, parts);
    this.add(`${where} (접힌 채)`, await textContrast(page));
    await page.evaluate(() => {
      for (const details of document.querySelectorAll("details")) details.open = true;
    });
    await this.count(page, openParts);
    this.add(`${where} (펼친 채)`, await textContrast(page));
    await page.evaluate(() => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>("details.menu")) menu.open = false;
    });
  }

  /** 적어 둔 부품이 모두 한 번 이상 그려진 채로 재어졌다. 하나라도 없으면 그 선택자를 적고 실패한다. */
  expectParts(parts: string[], what: string): void {
    expect(parts.filter((part) => !(this.parts.get(part)! > 0)), `${what}: 그려지지 않아 재지 못한 부품`).toEqual([]);
  }
}

/** 테마가 실제로 바뀌었는지(같은 색을 두 번 잰 것이 아닌지): 쪽의 바탕이 어두운 테마에서는 어둡고 밝은 테마에서는 밝다. */
async function expectScheme(page: Page, scheme: Scheme): Promise<void> {
  const dark = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
  expect(dark).toBe(scheme === "dark");
  const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const channels = body.match(/\d+/g)!.slice(0, 3).map(Number);
  expect(Math.max(...channels) < 60).toBe(scheme === "dark");
}

/** 기준에 못 미친 것이 없고, 잰 것이 있다. */
function expectReadable(scans: Scans, what: string): void {
  expect(scans.low, `${what}: 명도 대비가 4.5:1 에 못 미친 글`).toEqual([]);
  expect(scans.measured, what).toBeGreaterThan(0);
  expect(scans.lowest, what).toBeGreaterThanOrEqual(4.5);
}

// ── 쪽마다 있어야 할 부품(그려지지 않으면 실패한다) ──

/** 첫 화면·검색·저장소 쪽: 최근 분석 줄의 상태 점과 단계 점, 합성 예시 이름표, 검색 결과 줄, 0건 화면, 최신 분석 상자, 배지 넷, 아이콘. */
const FRONT_PARTS = [".act-mark", ".act-trail", ".tag", ".sr-list", ".empty-block", ".latest", ".badge", ".badge-running", ".badge-failed", ".badge-queued", "svg.ic"];
/**
 * 분석 쪽: 배지 넷, 이름표, 진행 상자의 단계 점, 멈춘 분석의 0의 뜻(굵게), 아이콘. AI 검토 결과(2026-11-25 web18: 한 줄의 하는 일과
 * 실행 정보, 두 구획의 머리, 카드의 사실·'도구가 파일에서 확인함'·확인할 질문, 제재 주의 문구, 제재 거르개 단추 셋, 체크리스트 묶음
 * 머리와 행, 행의 제재 표지, 접어 둔 구획의 머리)와, 검토 결과가 없는 분석의 세 단(맨 위 요약, 단의 머리, 기능 이름, 걸리는 의무의
 * 묶음 머리와 그 수).
 */
const ANALYSIS_PARTS = [
  ".badge",
  ".badge-running",
  ".badge-failed",
  ".badge-queued",
  ".tag",
  ".step-dot",
  ".zero-line",
  "svg.ic",
  ".rv-what",
  ".rv-run",
  ".rv-sec-h",
  ".rv-fact",
  ".rv-checked",
  ".rv-card-q",
  ".sanc-caution",
  ".sanc-filter",
  ".ck-hd",
  ".rv-row > summary",
  ".sanc",
  ".rv-fold-h",
  ".overview",
  ".tier-hd",
  ".ft-name",
  ".ob > summary",
  ".ob-n",
];
/** 분석 쪽에서 접어 둔 것 안에만 있는 부품(펼친 채로 센다): AI 검토 결과의 흐름 그림의 마디, 검증 정보의 문장과 회색 한 줄. */
const ANALYSIS_OPEN_PARTS = [".flow-node", ".rv-verify-say", ".rv-verify-meta"];
/** 조문 도감: 메타 한 줄, 한 줄 풀이, 제재 주의 문구, 걸러 보기, 법령 묶음의 수, 의무 줄, 제재 표지의 세 무게와 느낌표, 아이콘. */
const POLICY_PARTS = [".pi-meta", ".dm-lead", ".sanc-caution", ".dm-filter", ".dm-n", ".count", ".duty-row > summary", ".sanc-0", ".sanc-1", ".sanc-2", ".sanc-mark", "svg.ic"];

describe("두 테마의 명도 대비: 그려진 글자마다 4.5:1 이상", () => {
  it.each(EVERY)("%s %ipx: 첫 화면(진행 중·대기 줄), 검색(빈 상태, 결과, 0건), 저장소 쪽마다", async (scheme, width) => {
    const scans = new Scans();
    const pages = [...FRONT_PAGES, ...REPO_PAGES];
    const { page } = await open(pages[0], scheme, width);
    await expectScheme(page, scheme);
    for (const pathname of pages) {
      if (pathname !== pages[0]) await go(page, pathname);
      await scans.both(page, `${scheme} ${width} ${pathname}`, FRONT_PARTS);
    }
    expectReadable(scans, `${scheme} ${width}`);
    scans.expectParts(FRONT_PARTS, `${scheme} ${width}`);
  });

  it.each(EVERY)("%s %ipx: 분석 쪽마다(AI 검토 결과, 프로필과 의무만, 의무 0, 진행 중, 대기, 실패)", async (scheme, width) => {
    expect([...new Set(ANALYSES.map((a) => a.status))].sort()).toEqual(["failed", "queued", "running", "succeeded"]);
    const scans = new Scans();
    const { page } = await open(ANALYSES[0].pathname, scheme, width);
    await expectScheme(page, scheme);
    for (const { pathname, status } of ANALYSES) {
      if (pathname !== ANALYSES[0].pathname) await go(page, pathname);
      await scans.both(page, `${scheme} ${width} ${pathname} (${status})`, ANALYSIS_PARTS, ANALYSIS_OPEN_PARTS);
    }
    expectReadable(scans, `${scheme} ${width}`);
    scans.expectParts([...ANALYSIS_PARTS, ...ANALYSIS_OPEN_PARTS], `${scheme} ${width}`);
  });

  it.each(EVERY)("%s %ipx: 조문 도감(의무 지도), 없는 주소의 쪽(404)", async (scheme, width) => {
    const scans = new Scans();
    // 없는 주소에는 Next 의 기본 404 쪽이 뜬다. 사이트의 머리와 바닥글이 있고, 본문은 Next 의 기본 화면이다
    // (그 쪽이 싣는 body 의 색을 사이트의 색이 이긴다. src/app/globals.css 의 html body).
    const pages = ["/policy/", NOT_FOUND];
    const { page } = await open(pages[0], scheme, width);
    await expectScheme(page, scheme);
    for (const pathname of pages) {
      if (pathname !== pages[0]) await go(page, pathname);
      await scans.both(page, `${scheme} ${width} ${pathname}`, POLICY_PARTS);
    }
    expectReadable(scans, `${scheme} ${width}`);
    scans.expectParts(POLICY_PARTS, `${scheme} ${width}`);
  });

  it.each(EVERY)("%s %ipx: 펼친 자동 완성 목록(무리 머리, 고른 줄, 상태 줄)과 좁은 화면의 펼친 메뉴", async (scheme, width) => {
    const scans = new Scans();
    // 검색 쪽 본문의 검색창. 합성 미리보기는 GitHub 을 부르지 않아 상태 줄이 `GitHub 에 묻지 않음(합성 미리보기)` 이다.
    const inputs: [string, string][] = [["/search/", "#search-page-q"]];
    // 넓은 화면에서는 머리글의 검색창(본문에 검색창이 없는 쪽에서 보인다)도, 좁은 화면에서는 첫 화면의 검색창도 연다.
    inputs.push(width === 1280 ? ["/policy/", ".site-header input[role=combobox]"] : ["/", "#home-q"]);
    const { page } = await open(inputs[0][0], scheme, width);
    await expectScheme(page, scheme);
    const POPUP = [".cbx-pop", ".cbx-grp-h", '.cbx-opt[aria-selected="true"]', ".cbx-opt:not([aria-selected=\"true\"])", ".cbx-status"];
    for (const [pathname, input] of inputs) {
      if (pathname !== inputs[0][0]) await go(page, pathname);
      const box = page.locator(input);
      await box.focus();
      await page.keyboard.type("exa");
      await page.locator(".cbx-pop:not([hidden]) .cbx-status").waitFor();
      await page.keyboard.press("ArrowDown");
      await page.locator('.cbx-pop:not([hidden]) .cbx-opt[aria-selected="true"]').waitFor();
      await scans.count(page, POPUP);
      scans.add(`${scheme} ${width} ${pathname} ${input} 의 펼침 목록`, await textContrast(page, { root: ".cbx-pop:not([hidden])" }));
      // 고른 줄의 띠(안쪽 2px)는 고른 줄의 바탕과 3:1 넘게 갈린다(docs/redesign.md 5장).
      const look = await page.locator('.cbx-pop:not([hidden]) .cbx-opt[aria-selected="true"]').evaluate((el) => {
        const style = getComputedStyle(el);
        return { band: /rgba?\([^)]*\)/.exec(style.boxShadow)?.[0] ?? "", bg: style.backgroundColor };
      });
      expect(contrast(look.band, look.bg), `${scheme} ${width} ${pathname} 고른 줄의 띠`).toBeGreaterThanOrEqual(3);
      await page.keyboard.press("Escape");
    }
    scans.expectParts(POPUP, `${scheme} ${width}`);
    if (width === 375) {
      // 좁은 화면의 펼친 메뉴(머리글의 `메뉴`). 구조 쪽에서 열어 지금 쪽 표시(굵게)도 잰다.
      await go(page, "/how/");
      await page.locator("details.menu > summary").click();
      await scans.count(page, [".menu-pop", '.menu-pop a[href="/how/"]']);
      scans.add(`${scheme} 375 /how/ 펼친 메뉴`, await textContrast(page, { root: ".site-header" }));
      scans.expectParts([".menu-pop", '.menu-pop a[href="/how/"]'], `${scheme} 375 메뉴`);
    }
    expectReadable(scans, `${scheme} ${width}`);
  });
});

describe("키보드 초점의 둘레선", () => {
  // 둘레선과 그 바깥 바탕의 명도 대비가 3:1 이상이다. 쪽마다 Tab 으로 차례로 닿는 곳을 잰다.
  const GROUPS: [string, string[]][] = [
    ["첫 화면, 검색, 저장소, 분석 쪽", ["/", "/search/", "/search/?q=example", repoHref("example-org", "night-push"), REVIEWED, PROFILED]],
    ["조문 도감, 구조", ["/policy/", "/how/"]],
  ];
  it.each(SCHEMES.flatMap((scheme) => WIDTHS.flatMap((width) => GROUPS.map(([name, pages]) => [scheme, width, name, pages] as const))))(
    "%s %ipx: %s 에서 Tab 으로 닿는 곳",
    async (scheme, width, _name, pages) => {
      const low: string[] = [];
      let seen = 0;
      const { page } = await open(pages[0], scheme, width);
      for (const pathname of pages) {
        if (pathname !== pages[0]) await go(page, pathname);
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press("Tab");
          const ring = await focusRingContrast(page);
          if (ring.what === "(초점 없음)") continue;
          seen += 1;
          if (ring.ratio < 3) low.push(`${scheme} ${width} ${pathname} ${i + 1}번째 ${ring.what}: ${ring.ratio}:1 (${ring.color} / ${ring.background})`);
        }
      }
      expect(low).toEqual([]);
      expect(seen).toBeGreaterThanOrEqual(pages.length * 8);
    },
  );
});

describe("누르거나 고르는 것의 테두리", () => {
  // 고르기 상자, 거르개 단추, 검색창은 사이트의 색으로 그린다(9번 전에는 고르기 상자가 브라우저의 기본 모양이었다). 테두리는 나누는
  // 선(--rule)보다 짙은 --control-line 이다. 나누는 선으로 그리면 바탕과 1.3~1.6:1 이라 테두리로는 단추인 줄 보이지 않는다.
  // (D3·D4) 첫 화면의 검색창(.find), 검색 쪽의 검색창(돋보기 단추), 머리글의 검색창(넓은 화면)도 잰다. 조문 도감의 걸러 보기
  // 고르기 상자(기능, 법령, 제재)와 AI 검토 결과의 제재 거르개 단추 셋(2026-11-24. web18 부터 '더 살펴볼 것'의 머리)도 잰다.
  const CONTROLS: Record<string, string[]> = {
    "/": [".find"],
    // 검색 쪽의 입력창과 돋보기 단추는 붙인 한 덩어리다(입력창의 오른쪽 테두리가 없다). 같은 색의 테두리를 단추의 네 변으로 잰다.
    "/search/": [".search button"],
    "/policy/": [".hdr-search input", ".dm-filter select"],
    [REVIEWED]: [".sanc-filter"],
  };

  it.each(SCHEMES)("%s: 고르기 상자, 거르개 단추, 검색창의 테두리가 그 바깥 바탕과 3:1 이상이다", async (scheme) => {
    const low: string[] = [];
    const seen = new Map<string, number>();
    for (const [pathname, selectors] of Object.entries(CONTROLS)) {
      const { page } = await open(pathname, scheme, 1280);
      await expectScheme(page, scheme);
      for (const selector of selectors) {
        for (const border of await borderContrast(page, selector)) {
          seen.set(`${pathname} ${selector}`, (seen.get(`${pathname} ${selector}`) ?? 0) + 1);
          if (border.ratio < 3) low.push(`${scheme} ${pathname} ${border.what}: ${border.ratio}:1 (테두리 ${border.border} / 바탕 ${border.background})`);
        }
      }
    }
    expect(low).toEqual([]);
    // 잰 것이 있다: 세 검색창, 조문 도감의 고르기 상자 셋, 제재 거르개 단추 셋.
    expect(Object.fromEntries(seen)).toEqual({
      "/ .find": 1,
      "/search/ .search button": 1,
      "/policy/ .hdr-search input": 1,
      "/policy/ .dm-filter select": 3,
      [`${REVIEWED} .sanc-filter`]: 3,
    });
  });
});

describe("인쇄", () => {
  /** 쪽마다 화면에서 고르는 데만 쓰는 것. 인쇄할 때는 찍지 않는다. */
  const CONTROLS: Record<string, string[]> = {
    "/": ["form[role=search]"],
    "/search/": ["form[role=search]"],
    "/search/?q=example": ["form[role=search]"],
    "/policy/": [".hdr-search"],
    [repoHref("example-org", "night-push")]: [".hdr-search"],
    [REVIEWED]: [".hdr-search"],
    [PROFILED]: [".hdr-search"],
  };
  /** 쪽마다 종이에 남아야 하는 결과 화면. */
  const RESULTS: Record<string, string> = {
    [REVIEWED]: ".review",
    [PROFILED]: ".overview",
  };
  const drawn = (page: Page, selectors: string[]) =>
    page.evaluate((list) => list.map((selector) => [...document.querySelectorAll(selector)].some((el) => el.getClientRects().length > 0)), selectors);

  it.each(SCHEMES)("%s 테마에서 인쇄해도 글자가 흰 종이와 계산된 바탕 위에서 4.5:1 이상이다. 고르는 데만 쓰는 것은 찍지 않는다", async (scheme) => {
    const scans = new Scans();
    // 404 쪽(Next 의 기본 화면)은 본문 안에 body 의 색을 정하는 <style> 을 싣는다. 그 어두운 테마 갈래는 인쇄에도 들어서, 사이트의
    // 색이 이기지 않으면 어두운 테마에서 인쇄할 때 흰 종이에 흰 글자(1:1)로 찍힌다(9번의 첫 검토).
    const pages = ["/", "/search/", "/search/?q=example", repoHref("example-org", "night-push"), REVIEWED, PROFILED, RUNNING, "/policy/", NOT_FOUND];
    /** 종이에 남기려고 꾸민 것을 쪽마다 센 것. 모두 합쳐 하나도 없으면 아래 단언이 아무것도 보지 않고 통과한 것이라 실패한다. */
    const marked = { dots: 0, pseudo: 0 };
    for (const pathname of pages) {
      const { page } = await open(pathname, scheme, 1280);
      // 화면에서는 고르는 것들이 그려져 있다(대조).
      const controls = CONTROLS[pathname] ?? [];
      expect(await drawn(page, controls), `${pathname} 화면`).toEqual(controls.map(() => true));
      await page.emulateMedia({ media: "print", colorScheme: scheme });
      // 인쇄할 때는 어두운 테마에서도 밝은 색이다(어두운 테마의 색은 화면에서만 듣는다).
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), pathname).toBe("rgb(255, 255, 255)");
      expect(await drawn(page, controls), `${pathname} 인쇄`).toEqual(controls.map(() => false));
      // 재디자인의 고르는 것(검색창과 펼침 목록, 좁은 화면의 메뉴와 검색 단추)은 어느 쪽에서도 찍지 않는다. 1280 에서는 펼침 목록과
      // 좁은 화면의 것이 화면에서도 그려지지 않으므로, 그려진 채로 인쇄하는 것은 아래 375px 의 시험이 본다.
      expect(await drawn(page, ["form[role=search]", ".cbx-pop", ".hdr-m", "details.menu"]), `${pathname} 인쇄`).toEqual([false, false, false, false]);
      // 결과 화면과 사이트의 머리·바닥글은 그대로 찍힌다.
      // 첫 화면에는 화면에서도 머리글이 없다(재디자인 D3: 표지와 큰 검색창이 그 자리다). 그 쪽만 머리글을 찍지 않는다.
      expect(await drawn(page, [".site-header", ".site-footer", "main"]), pathname).toEqual([pathname !== "/", true, true]);
      if (RESULTS[pathname]) expect(await drawn(page, [RESULTS[pathname]]), pathname).toEqual([true]);
      // 브라우저는 바탕색을 찍지 않는다. 채운 점은 바탕을 찍게 해서 종이에 남긴다.
      const marks = await page.evaluate(() => ({
        dots: [...document.querySelectorAll(".dot, .step-dot, .act-trail i")].map((el) => getComputedStyle(el).printColorAdjust),
        pseudo: [...document.querySelectorAll(".act-mark")].map((el) => getComputedStyle(el, "::before").printColorAdjust),
      }));
      for (const adjust of [...marks.dots, ...marks.pseudo]) expect(adjust, `${pathname} 점`).toBe("exact");
      for (const key of Object.keys(marked) as (keyof typeof marked)[]) marked[key] += marks[key].length;
      scans.add(`${scheme} 인쇄 ${pathname} (접힌 채)`, await textContrast(page, { paper: "rgb(255, 255, 255)" }));
      await page.evaluate(() => {
        for (const details of document.querySelectorAll("main details")) (details as HTMLDetailsElement).open = true;
      });
      scans.add(`${scheme} 인쇄 ${pathname} (펼친 채)`, await textContrast(page, { paper: "rgb(255, 255, 255)" }));
    }
    expectReadable(scans, `${scheme} 인쇄`);
    // 잰 것이 있다: 점(첫 화면의 단계 점, 진행 상자), 상태 점의 ::before(첫 화면).
    for (const [key, count] of Object.entries(marked)) expect(count, `${scheme} 인쇄에서 잰 ${key}`).toBeGreaterThan(0);
  });

  it.each(SCHEMES)("%s: 좁은 화면(375px)에서 펼친 자동 완성 목록, 좁은 화면의 검색 단추와 메뉴(펼친 채)를 찍지 않는다", async (scheme) => {
    // 실제 A4 인쇄는 쪽을 700px 남짓으로 짠다(좁은 화면의 규칙이 듣는 너비). 화면에서 그려진 채로 인쇄 매체로 바꿔 사라지는지 본다.
    const NARROW = [".hdr-m", ".hdr-m-search", "details.menu", ".menu-pop"];
    const { page } = await open("/policy/", scheme, 375);
    await page.locator("details.menu > summary").click();
    expect(await drawn(page, NARROW), "/policy/ 375 화면(메뉴를 편 채)").toEqual(NARROW.map(() => true));
    await page.emulateMedia({ media: "print", colorScheme: scheme });
    expect(await drawn(page, NARROW), "/policy/ 375 인쇄").toEqual(NARROW.map(() => false));
    expect(await drawn(page, [".site-header", "main"]), "/policy/ 375 인쇄").toEqual([true, true]);

    const search = await open("/search/", scheme, 375);
    await search.page.locator("#search-page-q").focus();
    await search.page.keyboard.type("exa");
    await search.page.locator(".cbx-pop:not([hidden]) .cbx-status").waitFor();
    const POPUP = ["form[role=search]", ".cbx-pop", ".cbx-status"];
    expect(await drawn(search.page, POPUP), "/search/ 375 화면(목록을 편 채)").toEqual(POPUP.map(() => true));
    await search.page.emulateMedia({ media: "print", colorScheme: scheme });
    expect(await drawn(search.page, POPUP), "/search/ 375 인쇄").toEqual(POPUP.map(() => false));
    expect(await drawn(search.page, ["main"]), "/search/ 375 인쇄").toEqual([true]);
  });
});

describe("강제 색 모드(윈도의 고대비 테마 등)", () => {
  // 이 모드에서는 사이트의 색이 시스템 색으로 바뀐다. 바탕색은 쪽의 바탕(Canvas)으로, 그림자는 없음으로 바뀌어, 바탕이나 그림자로만
  // 그린 것은 사라진다. 그래서 계산된 꾸밈이 아니라 그려진 점을 읽는다(tests/browser/site.ts 의 `pixelAt`, `inkContrast`).
  //
  // 이 모드의 Chrome 은 글자 뒤에 쪽의 바탕색(Canvas)을 한 겹 깐다. 눌린 단추를 Highlight 로 칠하기만 하면 그 위의 글자
  // (HighlightText)가 그 바탕과 같은 색이라 보이지 않는다(9번의 첫 검토 뒤의 첫 고침이 그랬다. 계산된 색만 보는 재기는 통과했다).

  /** 강제 색 모드로 연다. 정말 그 모드인지도 본다. */
  async function forced(pathname: string, scheme: Scheme, width = 1280): Promise<Page> {
    const { page } = await open(pathname, scheme, width);
    await page.emulateMedia({ colorScheme: scheme, forcedColors: "active" });
    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches), pathname).toBe(true);
    return page;
  }

  /** 요소의 자리(창 기준). 화면 안으로 옮긴 뒤에 잰다. */
  async function rectOf(page: Page, selector: string, nth = 0) {
    const el = page.locator(selector).nth(nth);
    await el.scrollIntoViewIfNeeded();
    return el.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });
  }

  /** 네모를 화면의 점에 맞춘다(찍는 그림의 자리). */
  const snap = (clip: { x: number; y: number; width: number; height: number }) => ({
    x: Math.max(0, Math.floor(clip.x)),
    y: Math.max(0, Math.floor(clip.y)),
    width: Math.max(1, Math.round(clip.width)),
    height: Math.max(1, Math.round(clip.height)),
  });

  /**
   * 제재 거르개 단추(.sanc-filter, aria-pressed)를 하나씩 눌러 둔 채로 재어, 눌리지 않은 셋과 눌린 것마다 단추 안의 칠(왼쪽 여백의 한
   * 점)과 글자 상자 안의 가장 밝은 점과 가장 어두운 점의 대비를 돌려준다.
   */
  async function sanctionButtons(scheme: Scheme) {
    const page = await forced(REVIEWED, scheme, 375);
    const SELECTOR = ".rv-more .sanc-filter";
    const count = await page.locator(SELECTOR).count();
    expect(count).toBe(3);
    const buttons: { pressed: boolean; name: string; fill: string; ink: number }[] = [];
    const measure = async (i: number) => {
      const button = page.locator(SELECTOR).nth(i);
      await button.scrollIntoViewIfNeeded();
      const box = await button.evaluate((el) => {
        const outer = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        return {
          pressed: el.getAttribute("aria-pressed") === "true",
          name: (el.textContent ?? "").trim(),
          // 테두리(1~2px) 안쪽, 글자 왼쪽의 여백(8px) 가운데.
          fill: { x: Math.round(outer.left + 5), y: Math.round(outer.top + outer.height / 2) },
          // 글자 상자. 가장자리 2px 는 뺀다(바깥의 칠이 섞이지 않게).
          text: { x: Math.ceil(text.left) + 2, y: Math.ceil(text.top) + 2, width: Math.floor(text.width) - 4, height: Math.floor(text.height) - 4 },
        };
      });
      expect(box.text.width, `"${box.name}"`).toBeGreaterThan(8);
      buttons.push({ pressed: box.pressed, name: box.name, fill: await pixelAt(page, box.fill.x, box.fill.y), ink: await inkContrast(page, box.text) });
    };
    for (let i = 0; i < count; i++) await measure(i);
    for (let i = 0; i < count; i++) {
      const button = page.locator(SELECTOR).nth(i);
      if (await button.isDisabled()) continue;
      await button.click();
      await expect.poll(() => button.getAttribute("aria-pressed")).toBe("true");
      await measure(i);
      await button.click();
      await expect.poll(() => button.getAttribute("aria-pressed")).toBe("false");
    }
    const pressed = buttons.filter((button) => button.pressed);
    const others = buttons.filter((button) => !button.pressed);
    expect(pressed.length).toBeGreaterThan(0);
    expect(others.length).toBe(count);
    return { buttons, pressed, others };
  }

  it.each(SCHEMES)("%s: 제재 거르개 단추마다(눌린 채와 눌리지 않은 채) 글자가 바탕과 갈려 보인다 (AI 검토 결과)", async (scheme) => {
    const { buttons } = await sanctionButtons(scheme);
    for (const button of buttons) expect(button.ink, `"${button.name}" 의 글자${button.pressed ? "(눌린 채)" : ""}`).toBeGreaterThanOrEqual(4.5);
  });

  // 눌린 거르개 단추는 화면에서 강조색 테두리와 옅은 바탕으로만 갈린다. 이 모드에서는 둘 다 시스템 색으로 바뀌므로, 눌린 것은 강제 색
  // 규칙이 Highlight 로 칠한다(src/app/globals.css).
  it.each(SCHEMES)("%s: 제재 거르개 단추에서 눌린 것이 눌리지 않은 것과 다르게 칠해진다 (AI 검토 결과)", async (scheme) => {
    const { pressed, others } = await sanctionButtons(scheme);
    for (const on of pressed) {
      for (const off of others) expect(on.fill, `"${on.name}" 과 "${off.name}"`).not.toBe(off.fill);
    }
  });

  it.each(SCHEMES)("%s: 배지·이름표·제재 표지의 둘레가 보이고, 채운 점은 빈 점과 다르게 칠해진다", async (scheme) => {
    // 둘레: 요소의 위 가장자리 띠(높이 3px, 가운데 20px). 글자는 그 아래에서 시작한다. 둘레가 그려졌으면 그 띠 안에 바탕과 갈리는
    // 점이 있다(3:1 이상). 채운 알약을 바탕으로만 칠하면 이 모드에서는 띠가 바탕 한 색이다(1:1).
    const edges: [string, string][] = [
      [PROFILED, ".badge"],
      [PROFILED, ".tag"],
      [repoHref("example-studio", "genai-chat"), ".badge-failed"],
      [RUNNING, ".badge-running"],
      [REVIEWED, ".rv-row .sanc.sanc-0"],
      [REVIEWED, ".sanc-filter.sf-0"],
      ["/policy/", ".dr-head .sanc.sanc-1"],
    ];
    const low: string[] = [];
    for (const [pathname, selector] of edges) {
      const page = await forced(pathname, scheme);
      const rect = await rectOf(page, selector);
      const band = snap({ x: rect.x + rect.width / 2 - 10, y: rect.y, width: 20, height: 3 });
      const ratio = await inkContrast(page, band);
      if (ratio < 3) low.push(`${pathname} ${selector}: ${ratio.toFixed(2)}:1`);
    }
    expect(low).toEqual([]);

    // 채운 점과 빈 점: 점 한가운데의 색. 채운 점(끝난 분석, 끝난·멈춘 단계)은 시스템의 글자색이고, 빈 점(대기 중, 기다리는 단계)과
    // 쪽의 바탕은 그 색이 아니다.
    const centre = async (page: Page, selector: string) => {
      const el = page.locator(selector).first();
      await el.scrollIntoViewIfNeeded();
      const at = await el.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      return pixelAt(page, Math.floor(at.x), Math.floor(at.y));
    };
    const home = await forced("/", scheme);
    const filled = await centre(home, '.act-row[data-status="succeeded"] .act-mark');
    const queued = await centre(home, '.act-row[data-status="queued"] .act-mark');
    expect(queued, "/ 대기 중인 점과 끝난 점").not.toBe(filled);
    expect(await centre(home, ".act-trail i.done"), "/ 끝난 단계 점").toBe(filled);
    const waiting = await centre(home, ".act-trail i:not(.done):not(.now)");
    expect(waiting, "/ 기다리는 단계 점").not.toBe(filled);
    // (D7 검토) 지금 것(분석 중인 분석의 점, 단계 점의 지금 점, 진행 상자의 진행 중 단계)은 끝난 것과도 기다리는 것과도 다르게 칠해진다.
    // 화면에서는 강조색으로만 갈려, 고치기 전에는 지금 점이 끝난 점과, 진행 중 단계가 기다리는 단계와 같은 모양이었다.
    const running = await centre(home, '.act-row[data-status="running"] .act-mark');
    expect([running === filled, running === queued], "/ 분석 중인 점(끝난 점, 대기 중인 점과 견줌)").toEqual([false, false]);
    const now = await centre(home, ".act-trail i.now");
    expect([now === filled, now === waiting], "/ 지금 단계 점(끝난 점, 기다리는 점과 견줌)").toEqual([false, false]);
    const live = await forced(RUNNING, scheme);
    const active = await centre(live, ".step-active .step-dot");
    const steps = [await centre(live, ".step-done .step-dot"), await centre(live, ".step-waiting .step-dot")];
    expect(steps.map((other) => other === active), `${RUNNING} 진행 중 단계(끝난 단계, 기다리는 단계와 견줌)`).toEqual([false, false]);
    const failed = await forced(FAILED, scheme);
    expect(await centre(failed, ".step-done .step-dot"), `${FAILED} 끝난 단계`).toBe(filled);
    expect(await centre(failed, ".step-failed .step-dot"), `${FAILED} 멈춘 단계`).toBe(filled);
    expect(await centre(failed, ".step-notrun .step-dot, .step-waiting .step-dot"), `${FAILED} 하지 않은 단계`).not.toBe(filled);
    // 끝난 분석의 진행 기록은 접혀 있다(맨 아래의 '진행 기록'). 펼쳐서 본다.
    const done = await forced(REVIEWED, scheme);
    await done.locator("details.an-steps > summary").click();
    expect(await centre(done, ".step-done .step-dot"), `${REVIEWED} 끝난 단계`).toBe(filled);
  });

  it.each(SCHEMES)("%s: 고른 줄(자동 완성), 지금 쪽(머리글·좁은 화면의 메뉴)이 다르게 그려진다", async (scheme) => {
    // 자동 완성의 고른 줄: 안쪽 2px 띠(Highlight). 고른 줄과 고르지 않은 줄의 왼쪽 가장자리 한 점이 다르다.
    const search = await forced("/search/", scheme);
    await search.locator("#search-page-q").focus();
    await search.keyboard.type("exa");
    await search.locator(".cbx-pop:not([hidden]) .cbx-status").waitFor();
    await search.keyboard.press("ArrowDown");
    const rows = await search.locator(".cbx-pop:not([hidden]) .cbx-opt").evaluateAll((options) =>
      options.map((option) => {
        const rect = option.getBoundingClientRect();
        return { selected: option.getAttribute("aria-selected") === "true", x: Math.floor(rect.left + 1), y: Math.floor(rect.top + rect.height / 2) };
      }),
    );
    const picked = rows.filter((row) => row.selected);
    const rest = rows.filter((row) => !row.selected);
    expect(picked).toHaveLength(1);
    expect(rest.length).toBeGreaterThan(0);
    expect(await pixelAt(search, picked[0].x, picked[0].y)).not.toBe(await pixelAt(search, rest[0].x, rest[0].y));

    // 지금 쪽: 같은 링크(머리글의 HTML 은 모든 쪽에서 같다)를 지금 쪽일 때와 아닐 때 찍어 견준다.
    const shot = async (page: Page, selector: string) => page.screenshot({ clip: snap(await rectOf(page, selector)) });
    for (const [width, selector, open_] of [
      [1280, '.hdr-nav a[href="/how/"]', false],
      [375, '.menu-pop a[href="/how/"]', true],
    ] as const) {
      const here = await forced("/how/", scheme, width);
      const away = await forced("/policy/", scheme, width);
      if (open_) for (const page of [here, away]) await page.locator("details.menu > summary").click();
      expect((await shot(here, selector)).equals(await shot(away, selector)), `${width}px ${selector}`).toBe(false);
    }
  });

  it.each(SCHEMES)("%s: 초점이 보인다(둘레선이 그려진다)", async (scheme) => {
    // 초점: 같은 요소를 초점이 없을 때와 있을 때(키보드로 옮긴 뒤) 찍어, 그 가장자리 띠(상자 바깥 4px 부터 안쪽 3px 까지)에서 바뀐
    // 점을 센다. 둘레선(2px)이 그려지면 둘레의 1.5배보다 많은 점이 바뀐다. 이 모드에서 둘레선이 사라지면 거의 바뀌지 않는다.
    // 띠 안쪽은 세지 않는다: 입력창의 글자 커서(이 모드의 Chrome 은 커서를 숨겨도 그린다)와 아이콘의 흔들림이 거기에 있다. 띠 안의
    // 모서리 둥글림(초점의 border-radius)이나 테두리 색의 작은 바뀜(둘레 한 줄)으로는 기준을 넘지 못한다(D7 검토. 둘레선을 모두
    // 지운 쪽에 대 보면 열두 곳 모두 둘레의 1.02배 이하였다).
    // 첫 화면의 검색창은 입력창이 아니라 그 상자(.find)에 둘레선을 긋는다. 그 상자의 띠를 본다.
    const targets: [string, string, string, number][] = [
      ["/", "#home-q", ".find", 1280],
      ["/", ".act-row", ".act-row", 1280],
      ["/search/", "#search-page-q", "#search-page-q", 1280],
      ["/policy/", ".site-header input[role=combobox]", ".site-header input[role=combobox]", 1280],
      ["/policy/", '.hdr-nav a[href="/how/"]', '.hdr-nav a[href="/how/"]', 1280],
      ["/policy/", ".dm-filter select", ".dm-filter select", 1280],
      ["/policy/", ".duty-row > summary", ".duty-row > summary", 1280],
      [REVIEWED, ".rv-more .sanc-filter", ".rv-more .sanc-filter", 1280],
      [REVIEWED, ".rv-export .link-btn", ".rv-export .link-btn", 1280],
      [REVIEWED, ".rv-row > summary", ".rv-row > summary", 1280],
      [repoHref("example-org", "night-push"), ".latest a", ".latest a", 1280],
      ["/policy/", "details.menu > summary", "details.menu > summary", 375],
      ["/policy/", ".hdr-m-search", ".hdr-m-search", 375],
    ];
    const OUT = 4;
    const IN = 3;
    const weak: string[] = [];
    for (const [pathname, selector, ringed, width] of targets) {
      const page = await forced(pathname, scheme, width);
      const el = page.locator(selector).first();
      // 재는 띠(상자 바깥 4px 까지)가 창 안에 들게 요소를 창 가운데로 옮긴다. 창 끝에 걸친 채로 찍으면 그림이 잘린다(web18 에서 제재
      // 거르개 단추와 모두 펼치기가 1280×720 창의 아래 끝에 걸렸다).
      await el.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
      const rect = await rectOf(page, ringed);
      const clip = snap({ x: rect.x - OUT, y: rect.y - OUT, width: rect.width + OUT * 2, height: rect.height + OUT * 2 });
      const viewport = page.viewportSize()!;
      expect(clip.y + clip.height <= viewport.height && clip.x + clip.width <= viewport.width, `${width}px ${pathname} ${selector}: 재는 띠가 창 밖에 걸침`).toBe(true);
      const blurred = await pixelsOf(page, clip);
      expect(blurred.length, `${width}px ${pathname} ${selector}`).toBe(clip.width * clip.height);
      // 키보드로 옮긴 뒤의 초점이라야 :focus-visible 이다. Tab 을 한 번 누른 뒤 그 요소로 옮긴다.
      await page.keyboard.press("Tab");
      await el.focus();
      expect(await el.evaluate((node) => node.matches(":focus-visible")), `${pathname} ${selector}`).toBe(true);
      const focused = await pixelsOf(page, clip);
      let changed = 0;
      for (let y = 0; y < clip.height; y++) {
        for (let x = 0; x < clip.width; x++) {
          const inner = x >= OUT + IN && x < clip.width - OUT - IN && y >= OUT + IN && y < clip.height - OUT - IN;
          const i = y * clip.width + x;
          if (!inner && blurred[i].some((v, c) => v !== focused[i][c])) changed += 1;
        }
      }
      const perimeter = 2 * (rect.width + rect.height);
      if (changed < perimeter * 1.5) weak.push(`${width}px ${pathname} ${selector}: 바뀐 점 ${changed}, 둘레 ${Math.round(perimeter)}`);
    }
    expect(weak, "초점이 있어도 가장자리 띠가 거의 같은 것").toEqual([]);
  });

  it.each(SCHEMES)("%s: 선 아이콘 다섯이 바탕과 갈려 보인다", async (scheme) => {
    // 선 아이콘(검색, 접기, 다음, 새 창, 커밋): 그려진 것마다 그 상자 안의 가장 밝은 점과 가장 어두운 점이 3:1 이상이다.
    const low: string[] = [];
    const kinds = new Set<string>();
    for (const [pathname, width] of [
      ["/", 1280],
      ["/search/?q=example", 1280],
      [repoHref("example-org", "night-push"), 1280],
      [PROFILED, 1280],
      [REVIEWED, 1280],
      ["/policy/", 375],
    ] as const) {
      const page = await forced(pathname, scheme, width);
      // 새 창 아이콘(법제처 링크)은 분석 쪽의 접어 둔 것 안에 있다. AI 검토 결과의 것을 펼쳐서 본다(아이콘마다 찍으므로 한 쪽만 편다).
      if (pathname === REVIEWED) {
        await page.evaluate(() => {
          for (const details of document.querySelectorAll("main details")) (details as HTMLDetailsElement).open = true;
        });
      }
      const icons = page.locator("svg.ic");
      for (let i = 0; i < (await icons.count()); i++) {
        const icon = icons.nth(i);
        if (!(await icon.isVisible())) continue;
        const rect = await rectOf(page, "svg.ic", i);
        if (rect.width < 4 || rect.height < 4) continue;
        const name = (await icon.getAttribute("class"))!.replace("ic ", "");
        kinds.add(name);
        const ratio = await inkContrast(page, snap(rect));
        if (ratio < 3) low.push(`${width}px ${pathname} ${name}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(low).toEqual([]);
    expect([...kinds].sort()).toEqual(["ic-chevron-down", "ic-chevron-right", "ic-commit", "ic-external", "ic-search"]);
  });
});

describe("줄바꿈: 사이트가 쓴 글에서 닫는 따옴표·괄호 뒤의 조사가 줄 머리로 떨어지지 않는다", () => {
  // Chrome 은 word-break: keep-all 이어도 닫는 부호와 그 뒤의 한글 사이에서 줄을 바꾼다('‘판정 경로’ ⏎ 에', '(광고) ⏎ 를'). 사이트가
  // 쓴 글은 그 자리를 줄을 바꾸지 않는 조각으로 묶는다(src/components/text.tsx 의 keepParticles). 9번의 첫 검토에서 쪽을 두루
  // 320~1280px 의 열여섯 너비로 훑어 그런 자리를 찾았고, 찾은 자리가 나오던 너비를 여기서 다시 본다. D7 에서 재디자인의 모든 쪽
  // (첫 화면, 검색의 세 상태, 저장소, 분석의 여러 상태, 조문 도감)으로 넓혔다.
  //
  // CLI 출력의 글(저장소 프로필, AI 검토 결과)과 CLI 의 기능–의무 표에서 옮긴 의무 지도(data/duty-map.json: 의무 한 줄, 걸리는 코드,
  // 제재 조문)에도 같은 꼴이 있고 너비에 따라 줄이 바뀐다. 그 글은 손대지 않으므로 뺀다. 줄이 바뀐 글 조각이 그 파일들(의무 지도,
  // contract/cli-current/profile, contract/review 의 합성 review 예시, data/analyses 의 미리 돌린 review)에 든 글의 일부이면 그 글로 친다.
  const WIDTHS_ = [320, 344, 375, 414, 700, 1280];
  const outside: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") outside.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(readJson("data", "duty-map.json"));
  for (const dir of [["contract", "cli-current", "profile"], ["contract", "review"], ["data", "analyses"]]) {
    for (const name of jsonFiles(...dir)) collect(readJson(...dir, name));
  }
  // 사이트가 묶어 둔 조각(.nobreak) 안의 글은 짧아도 사이트가 쓴 글로 친다.
  const isOutside = (found: ParticleBreak) => !found.kept && outside.some((text) => text.includes(found.node));

  /** 지금 연 것을 너비마다 잰다(접어 둔 것을 모두 펼친다). 사이트가 쓴 글에서 줄이 바뀐 곳을 모으고, 본 자리의 수를 센다. */
  async function sweep(page: Page, where: string, own: string[]): Promise<number> {
    // 본문의 접어 둔 것을 모두 편다. 머리글의 펼치는 메뉴는 펴지 않는다(펴면 본문의 위쪽을 덮는다).
    await page.evaluate(() => {
      for (const details of document.querySelectorAll("main details")) (details as HTMLDetailsElement).open = true;
    });
    let checked = 0;
    for (const width of WIDTHS_) {
      await page.setViewportSize({ width, height: 720 });
      const result = await particleBreaks(page);
      checked += result.checked;
      for (const found of result.found.filter((entry) => !isOutside(entry))) own.push(`${width}px ${where}: ${found.what} ${found.around}`);
    }
    return checked;
  }

  /** 주소로 여는 쪽들을 차례로 훑는다. */
  async function sweepPages(pages: string[], own: string[]): Promise<number> {
    let checked = 0;
    const { page } = await open(pages[0], "light");
    for (const pathname of pages) {
      if (pathname !== pages[0]) await go(page, pathname);
      checked += await sweep(page, pathname, own);
    }
    return checked;
  }

  it("첫 화면, 검색(빈 상태, 결과, 0건), 저장소 쪽마다 (320·344·375·414·700·1280px)", async () => {
    const own: string[] = [];
    const checked = await sweepPages([...FRONT_PAGES, ...REPO_PAGES], own);
    expect(own).toEqual([]);
    // 본 자리가 있다(닫는 부호 바로 뒤에 한글이 붙은 곳: 0건 화면의 ‘ㅁㅁ’에, 영문 자판으로 친 ‘aa’로 등).
    expect(checked).toBeGreaterThan(10);
  });

  it("분석 쪽마다(AI 검토 결과, 프로필과 의무만, 의무 0, 진행 중, 대기, 실패) (320·344·375·414·700·1280px)", async () => {
    const own: string[] = [];
    const checked = await sweepPages(ANALYSES.map((analysis) => analysis.pathname), own);
    expect(own).toEqual([]);
    expect(checked).toBeGreaterThan(50);
  });

  it("조문 도감 (320·344·375·414·700·1280px)", async () => {
    const own: string[] = [];
    const checked = await sweepPages(["/policy/"], own);
    expect(own).toEqual([]);
    expect(checked).toBeGreaterThan(10);
  });

  it("대조: 묶은 조각이 줄을 바꿀 수 있게 하면 검색 0건 화면의 머리가 375px 에서 '…’ ⏎ 에 맞는'으로 끊긴다", async () => {
    // 찾는 법이 실제로 그 자리를 잡는지 본다. 이 컴퓨터의 글꼴로 잰 자리다. 9번의 첫 검토에서는 데모의 풀이로 봤다(데모는 web17 에서
    // 걷었다). 0건 화면의 머리(‘질의’에 맞는 저장소 없음)에서 질의를 길게 해 닫는 따옴표가 줄 끝에 오게 한다. 묶어 둔 채로는 끊기지
    // 않고, 묶은 조각을 풀면 그 자리에서 끊긴다.
    const { page } = await open(`/search/?q=${"가".repeat(20)}`, "light");
    const ours = async () => (await particleBreaks(page)).found.filter((entry) => !isOutside(entry)).map((entry) => entry.around);
    expect(await ours()).toEqual([]);
    await page.addStyleTag({ content: ".nobreak { white-space: normal; }" });
    expect(await ours()).toEqual(expect.arrayContaining([expect.stringContaining("’⏎에 맞는")]));
  });
});
