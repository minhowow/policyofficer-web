import type { Browser, BrowserContext, Page, Request } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dutyAnchor, dutyFeatureHref, dutyMap, fullArticle, lawGroups, type DutyMap } from "@/lib/duties";
import { readJson } from "../helpers";
import {
  accessibleNames,
  closeChrome,
  cssDrawn,
  launchChrome,
  newPage,
  NO_STORAGE,
  openPage,
  overflow,
  scrollThrough,
  serveSite,
  settle,
  stored,
  textContrast,
  undrawn as undrawnIn,
  type OpenOptions,
  type Site,
} from "./site";

// 조문 도감(`/policy/`, 의무 지도)을 실제 브라우저로 열어 본다. 빌드된 사이트를 127.0.0.1 에 띄우고(next start) 이 컴퓨터의
// Chrome(헤드리스)으로 연다. 빌드된 HTML 을 읽는 시험(served-files.test.ts)이 볼 수 없는 것을 본다: 메타 한 줄과 정적 규칙이
// 없는 것, 글이 실제로 그려지는지, CSS 가 그린 글, 쪽이 스스로 내는 요청, 법제처 링크를 눌렀을 때, 화면 낭독기에 읽히는 링크의
// 이름, 걸러 보기(기능·법령, 주소의 ?f=), 주소의 자리(#duty-…), 좁은 화면의 가로 넘침. 두 테마의 명도 대비는 colors.test.ts 도 잰다.
//
// 2026-11-25(web17)에 정책 쪽(/policy/<이름>/), 정적 규칙의 블록, 상태의 뜻(#status)과 검사에 들지 않는 것(#scope)을 걷었다. 그
// 시험들(조문 원문, 규칙의 자리, 결과 화면의 규칙 링크, 원문 해시)도 함께 걷었다.
//
// 법제처 링크의 주소는 data/duty-map.json 을 직접 읽은 것과 견준다(소스가 읽어 들인 것과 견주면, 읽어 들이는 곳이 값을 고쳤을 때
// 쪽과 기대값이 함께 달라져 통과한다).

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

afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  expect(problems.splice(0)).toEqual([]);
});

// 시험이 실패해도 띄운 것은 닫는다.
afterAll(async () => {
  await closeChrome(browser);
  await site?.close();
});

const INDEX = "/policy/";
/** data/duty-map.json 을 파일에서 직접 읽은 것. 법제처 주소를 견준다. */
const mapFile = readJson("data", "duty-map.json") as DutyMap;
const urlOf = (id: string) => mapFile.duties.find((duty) => duty.id === id)?.url ?? null;
const groups = lawGroups();
/** 쪽에 나오는 차례의 의무. */
const ordered = groups.flatMap((group) => group.duties);

const open = (pathname: string, options: Pick<OpenOptions, "viewport" | "colorScheme"> = {}) =>
  openPage(browser, site, pathname, { ...options, contexts, problems });

/** 본문의 접어 둔 것을 모두 펼친다(의무 줄과 그 안의 제재 원문). 머리글의 펼치는 메뉴는 펼치지 않는다(본문 위에 떠서 글을 덮는다). */
const openAll = (page: Page) =>
  page.evaluate(() => {
    for (const details of document.querySelectorAll("main details")) (details as HTMLDetailsElement).open = true;
  });

/** 일부러 화면에서만 가린 것: 화면 낭독기용 글과, 고른 보기만 그려지는 고르기 상자의 보기들. */
const VEILED = ".visually-hidden, .dm-filter select";

/** 요소의 이름 가운데 눈에 보이는 글. 화면 낭독기에만 읽히는 글(.visually-hidden)은 뺀다. */
const shownNames = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((all) =>
    all.map((el) =>
      [...el.childNodes]
        .filter((node) => !(node instanceof Element && node.classList.contains("visually-hidden")))
        .map((node) => node.textContent ?? "")
        .join("")
        .trim(),
    ),
  );

describe("조문 도감의 글", () => {
  it("메타 한 줄은 CLI 커밋과 AI 검토가 묻는 의무·법령·기능의 수다. 정적 규칙(정책 쪽 링크, #status·#scope, 정적 규칙 블록)은 없다", async () => {
    const { page } = await open(INDEX);
    expect((await page.locator(".pi-meta").textContent())?.replace(/\s+/g, " ").trim()).toBe(
      `CLI ${dutyMap.cli.commit.slice(0, 7)} AI 검토가 묻는 의무 ${dutyMap.asked} 법령 ${groups.length} 기능 ${dutyMap.features.length}`,
    );
    await openAll(page);
    expect(await page.locator("main").textContent()).not.toContain("정적 규칙");
    expect(await page.locator("#status, #scope, .dr-static, .dr-static-link, article.policy-page").count()).toBe(0);
    // 정책 쪽(/policy/<이름>/)으로 가는 링크가 어디에도 없다. 조문 도감으로 가는 것은 머리글의 /policy/ 뿐이다.
    const policyLinks = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!).filter((href) => /^\/policy\/[^?#]/.test(href)),
    );
    expect(policyLinks).toEqual([]);
  });

  it("접어 둔 곳 밖의 글은 모두 그려진다(접힌 채, 그리고 앞의 줄 몇 개를 펼친 채)", async () => {
    const { page } = await open(INDEX, { viewport: { width: 375, height: 800 } });
    const closed = await undrawnIn(page, { root: "main", veiled: VEILED });
    expect(closed.undrawn).toEqual([]);
    // 접힌 줄의 이름(제목, 제재 표지, 조문, 기능)이 220줄 모두 있다.
    expect(closed.texts).toBeGreaterThan(dutyMap.asked * 3);
    // 펼친 안쪽: 법령 묶음마다 첫 줄(제재 원문까지).
    await page.evaluate(() => {
      for (const section of document.querySelectorAll(".dm-law")) {
        const row = section.querySelector<HTMLDetailsElement>("details.duty-row");
        if (!row) continue;
        row.open = true;
        for (const inner of row.querySelectorAll("details")) inner.open = true;
      }
    });
    const opened = await undrawnIn(page, { root: "main", veiled: VEILED });
    expect(opened.undrawn).toEqual([]);
    expect(opened.texts).toBeGreaterThan(closed.texts);
  });

  it("CSS 가 그린 글이 없다: 쪽에 실린 꾸밈의 규칙에도, 화면에 그려진 것에도 (틀 밖까지)", async () => {
    // CSS 는 HTML 에 없는 글을 그린다(`::before`·`::after`·`::marker` 의 content, 글로 적은 목록 표시). 조문 도감이 그려도 되는
    // 것은 목록 표시(점, 없음, 접어 둔 것의 꺾쇠)뿐이다. 의무·조문·제재를 풀이하는 글은 CSS 로 그리지 않는다.
    const { page } = await open(INDEX);
    const MARKERS = ["disc", "circle", "none", "disclosure-closed", "disclosure-open"];
    for (const state of ["접힌 채", "펼친 채"]) {
      if (state === "펼친 채") await openAll(page);
      const read = await cssDrawn(page, { markers: MARKERS });
      expect(read.rules, state).toEqual([]);
      expect(read.drawn, state).toEqual([]);
      expect(read.read.rules, state).toBeGreaterThan(0);
      expect(read.read.elements, state).toBeGreaterThan(await page.locator(".duty-row *").count());
    }
    // 대조: 같은 방법으로, CSS 가 글을 그리면 잡힌다. 연 쪽에만 꾸밈을 넣어 본다(소스는 그대로다).
    await page.addStyleTag({
      content:
        '.brand::before { content: ""; } .no-such-class::after { content: "다른 쪽의 것"; } ' +
        '.dr-title::after { content: " (풀이)"; } .dr-title:hover::before { content: "올렸을 때만 "; } ' +
        '@media print { .dr-facts dt::marker { content: "※ "; } } ul.sanc-items { list-style-type: "→ "; }',
    });
    const control = await cssDrawn(page);
    expect(control.rules).toEqual([
      '.dr-title::after { content: " (풀이)" }',
      '.dr-title:hover::before { content: "올렸을 때만 " }',
      '.dr-facts dt::marker { content: "※ " }',
      'ul.sanc-items { list-style-type: "→ " }',
    ]);
    expect(control.drawn[0]).toBe('span.dr-title::after content: " (풀이)"');
    expect(control.drawn).toContain('ul.sanc-items list-style-type: "→ "');
  });
});

describe("쪽이 스스로 내는 요청이 없다", () => {
  it("맨 아래까지 내리고, 접어 둔 것을 모두 펼치고, 걸러 보고, 법제처 링크에 마우스를 올려도 요청이 없다. 브라우저 저장소에도 두지 않는다", async () => {
    const start = site.requests.length;
    const { context, page, outside } = await open(INDEX, { viewport: { width: 1280, height: 900 } });
    const seen: string[] = [];
    context.on("request", (request) => seen.push(`${request.method()} ${request.url()}`));

    // 쪽을 열 때의 요청은 서버에 적힌다(머리 링크의 프리페치까지). 이 시험이 요청을 본다는 뜻이다.
    await settle(site, page);
    const loading = site.requests.slice(start).map((request) => request.url);
    expect(loading[0]).toBe(INDEX);
    expect(loading.some((url) => url.startsWith("/how/"))).toBe(true);
    const mark = { server: site.requests.length, browser: seen.length };

    // 앞의 줄 몇 개는 눌러서 펼치고(브라우저의 펼침), 나머지는 한꺼번에 편다(줄과 제재 원문이 470개 남짓이다).
    const rows = page.locator(".duty-row > summary");
    for (let i = 0; i < 6; i++) await rows.nth(i).click();
    expect(await page.locator(".duty-row[open]").count()).toBe(6);
    await openAll(page);
    expect(await page.locator("main details:not([open])").count()).toBe(0);
    await scrollThrough(page, 30);
    // 걸러 보기는 쪽 안에서만 한다(주소도 그대로다).
    const selects = page.locator(".dm-filter select");
    await selects.nth(0).selectOption(String(dutyMap.features.findIndex((feature) => feature.id === "genai")));
    await selects.nth(1).selectOption("0");
    for (const select of await selects.all()) await select.selectOption("-1");
    expect(page.url()).toBe(`${site.origin}${INDEX}`);
    // 법제처 링크에는 마우스를 올리기만 한다. 앞의 법령 묶음 열다섯에서 첫 줄의 링크(조문과 제재 조문). 모두 올리면 이 시험 하나가
    // 창 하나의 한도(28초)에 가까워진다.
    let hovered = 0;
    for (const section of (await page.locator(".dm-law").all()).slice(0, 15)) {
      for (const link of await section.locator(".duty-row").first().locator("a.ob-ext").all()) {
        await link.hover();
        hovered += 1;
      }
    }
    await settle(site, page);

    expect(site.requests.slice(mark.server)).toEqual([]);
    expect(seen.slice(mark.browser)).toEqual([]);
    expect(hovered).toBeGreaterThan(15);
    expect(outside).toEqual([]);
    expect(await stored(page)).toEqual(NO_STORAGE);
  });

  it("법제처 링크는 눌러야 나간다: 누르면 새 창이 의무 지도의 주소로 가려 하고, 어느 쪽에서 왔는지는 싣지 않는다", async () => {
    const duty = ordered.find((entry) => urlOf(entry.id) !== null);
    expect(duty, "법제처 주소가 있는 의무가 의무 지도에 없습니다").toBeDefined();
    const url = urlOf(duty!.id)!;
    const { context, page, outside } = await open(INDEX);
    const requests: Request[] = [];
    context.on("request", (request) => requests.push(request));
    const row = page.locator(`#${dutyAnchor(duty!.id)}`);
    await row.locator(":scope > summary").click();
    const link = row.locator(".dr-facts a.ob-ext");
    expect(await link.getAttribute("href")).toBe(url);
    expect(await link.getAttribute("target")).toBe("_blank");
    expect(await link.getAttribute("rel")).toBe("noopener noreferrer");
    // 화면 낭독기에는 새 창이라는 것과 어느 조문의 링크인지가 함께 읽힌다. 눈에는 "법제처"만 보인다.
    expect(await accessibleNames(context, page, link)).toEqual([`법제처 (새 창, ${fullArticle(duty!)})`]);
    expect(await shownNames(page, `#${dutyAnchor(duty!.id)} .dr-facts a.ob-ext`)).toEqual(["법제처"]);
    expect(outside).toEqual([]);

    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    const wanted = new URL(url).href;
    await expect.poll(() => outside.length, { timeout: 5_000 }).toBeGreaterThan(0);
    // 가로채기가 막은 새 창의 오류 쪽을 Chrome 이 1초쯤 뒤에 스스로 다시 읽는다(오류 쪽 자동 다시 읽기. 부하가 없어도 4초 안에
    // 두 번 적힌다). 그래서 적힌 횟수가 아니라, 적힌 것이 모두 그 주소이고 모두 새 창이 옮겨 가려는 요청인지를 본다.
    expect(new Set(outside)).toEqual(new Set([wanted]));
    const sent = requests.filter((entry) => !entry.url().startsWith(`${site.origin}/`));
    expect(sent.length).toBeGreaterThan(0);
    for (const request of sent) {
      expect(request.url()).toBe(wanted);
      expect(request.isNavigationRequest()).toBe(true);
      expect(request.frame().page()).toBe(popup);
      expect(Object.keys(await request.allHeaders())).not.toContain("referer");
    }
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    expect(new Set(outside)).toEqual(new Set([wanted]));
    // 연 쪽은 그대로다(펼친 줄도).
    expect(page.url()).toBe(`${site.origin}${INDEX}`);
    expect(await row.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
  });

  it("시험용 Chrome 은 127.0.0.1 밖의 이름을 풀지 못한다 (링크를 눌러도 그 서버로 연결이 생기지 않는다)", async () => {
    // 위 시험의 가로채기는 HTTP 요청만 막는다. 새 창이 옮겨 가기 시작할 때 그 출처로 여는 연결은 Chrome 을 띄울 때의 옵션이
    // 막는다(site.ts 의 NO_OUTSIDE_NAMES). 그 옵션이 듣는지를 이 컴퓨터를 가리키는 다른 이름(localhost)으로 본다.
    const { page } = await newPage(browser, site, { contexts, problems, intercept: false });
    expect((await page.goto(`${site.origin}${INDEX}`))?.status()).toBe(200);
    const { port } = new URL(site.origin);
    const reach = (host: string) =>
      page.evaluate(
        (url) =>
          fetch(url, { mode: "no-cors" }).then(
            () => "닿음",
            () => "닿지 않음",
          ),
        `http://${host}:${port}${INDEX}`,
      );
    expect(await reach("127.0.0.1")).toBe("닿음");
    expect(await reach("localhost")).toBe("닿지 않음");
    await expect.poll(() => problems.length, { timeout: 3_000 }).toBeGreaterThan(0);
    expect(problems.splice(0)).toEqual(["콘솔: Failed to load resource: net::ERR_NAME_NOT_RESOLVED"]);
  });
});

describe("화면 낭독기에 읽히는 이름 (Chrome 의 접근성 트리)", () => {
  it("법제처 링크는 어느 조문의 것인지와 새 창이라는 것이 함께 읽힌다. 그 글은 눈에 보이지 않는다", async () => {
    const { context, page } = await open(INDEX, { viewport: { width: 375, height: 667 } });
    // 닫힌 details 안의 것은 접근성 트리에 없다. 모두 펼친 채로 읽는다.
    await openAll(page);
    // 의무의 조문 링크: 의무마다 그 조문(법령 이름과 조문)이 읽힌다.
    const facts = await accessibleNames(context, page, ".dr-facts a.ob-ext");
    expect(facts).toEqual(ordered.filter((duty) => urlOf(duty.id) !== null).map((duty) => `법제처 (새 창, ${fullArticle(duty)})`));
    // 제재 조문의 링크도 같은 꼴이다.
    const sanctions = await accessibleNames(context, page, ".sanc-detail a.ob-ext");
    expect(sanctions.length).toBeGreaterThan(0);
    for (const name of sanctions) expect(name).toMatch(/^법제처 \(새 창, \S.*\)$/);
    // 눈에는 "법제처"만 보인다. 앞말과 "(새 창, …)"은 1px 로 잘려 있다.
    expect(new Set(await shownNames(page, "main a.ob-ext"))).toEqual(new Set(["법제처"]));
    const hidden = await page.locator("main .visually-hidden").evaluateAll((all) =>
      all.map((el) => Math.max(el.getBoundingClientRect().width, el.getBoundingClientRect().height)),
    );
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((size) => size <= 1)).toBe(true);
  });
});

describe("조문 도감(의무 지도, 2026-11-15)", () => {
  // 걸러 보기(기능·법령, 주소의 ?f=), 주소의 자리(#duty-…)로 열기, 좁은 화면·어두운 테마. 줄이 220개라 모두 펼쳐 재는 것은 가장
  // 좁은 너비 하나에서만 한다(같은 때에 도는 다른 시험의 창을 늦추지 않게).
  const ROWS = 220;
  const view = (pathname: string, width = 1280, colorScheme: "light" | "dark" = "light") =>
    open(pathname, { viewport: { width, height: 900 }, colorScheme });
  /** 화면에 보이는 의무 줄의 id. */
  const visibleRows = (page: Page) =>
    page.locator(".duty-row").evaluateAll((rows) => rows.filter((row) => (row as HTMLElement).offsetParent !== null).map((row) => row.id));
  const countOf = (feature: string) => dutyMap.duties.filter((duty) => duty.feature === feature).length;

  it.each([
    [1280, "light"],
    [375, "dark"],
  ] as const)("%dpx %s: 의무가 모두 보이고(접힌 채), 가로로 넘치지 않고, 글이 바탕과 구별된다. 바깥 요청·브라우저 저장소 없음", async (width, scheme) => {
    expect(dutyMap.asked).toBe(ROWS);
    const { page, outside } = await view(INDEX, width, scheme);
    expect((await visibleRows(page)).length).toBe(dutyMap.asked);
    expect(await page.locator(".dm-n").textContent()).toBe(`의무 ${dutyMap.asked}`);
    expect(await page.locator(".duty-row[open]").count()).toBe(0);
    expect(await overflow(page)).toMatchObject({ page: 0, over: [] });
    // 펼친 안쪽의 글: 앞의 몇 줄과, 제재의 무게마다 그 무게의 첫 줄(제재 원문까지).
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll<HTMLDetailsElement>(".duty-row")];
      const firsts = ["0", "1", "2"].map((s) => rows.find((row) => row.dataset.s === s)).filter((row) => row !== undefined);
      for (const row of [...rows.slice(0, 4), ...firsts]) {
        row.open = true;
        for (const inner of row.querySelectorAll("details")) inner.open = true;
      }
    });
    expect((await textContrast(page, { root: "main" })).low).toEqual([]);
    expect(outside).toEqual([]);
    expect(await stored(page)).toEqual(NO_STORAGE);
  });

  it("320px: 모두 펼쳐도 가로로 넘치지 않는다(제재 조문의 원문, 긴 걸리는 코드)", async () => {
    const { page } = await view(INDEX, 320);
    expect(await overflow(page)).toMatchObject({ page: 0, over: [] });
    await openAll(page);
    expect(await page.locator("main details:not([open])").count()).toBe(0);
    expect(await overflow(page)).toMatchObject({ page: 0, over: [] });
  });

  it("기능으로, 법령으로, 둘을 함께 거른다. 보이는 수가 바뀌고, 맞는 의무가 없는 법령은 묶음째, 법령 묶음의 수는 감춘다. 주소는 그대로다", async () => {
    const { page } = await view(INDEX);
    const url = page.url();
    const [feature, law] = await page.locator(".dm-filter select").all();
    expect(await page.locator(".dm-law > h2 > .count").first().isVisible()).toBe(true);
    await feature.selectOption(String(dutyMap.features.findIndex((entry) => entry.id === "genai")));
    const shown = await visibleRows(page);
    expect(shown.sort()).toEqual(dutyMap.duties.filter((duty) => duty.feature === "genai").map((duty) => dutyAnchor(duty.id)).sort());
    expect(await page.locator(".dm-n").textContent()).toBe(`의무 ${countOf("genai")}`);
    const lawsShown = await page.locator(".dm-law").evaluateAll((sections) => sections.filter((s) => (s as HTMLElement).offsetParent !== null).length);
    expect(lawsShown).toBe(groups.filter((group) => group.duties.some((duty) => duty.feature === "genai")).length);
    expect(await page.locator(".dm-law > h2 > .count").evaluateAll((counts) => counts.filter((c) => (c as HTMLElement).offsetParent !== null).length)).toBe(0);
    const at = groups.findIndex((group) => group.duties.some((duty) => duty.feature === "genai"));
    await law.selectOption(String(at));
    expect((await visibleRows(page)).length).toBe(groups[at].duties.filter((duty) => duty.feature === "genai").length);
    await feature.selectOption("-1");
    expect((await visibleRows(page)).length).toBe(groups[at].duties.length);
    expect(await page.locator(".dm-n").textContent()).toBe(`의무 ${groups[at].duties.length}`);
    expect(page.url()).toBe(url);
  });

  it("주소의 ?f= 로 그 기능을 골라 연다(검색 쪽 곁칸의 기능 링크). 머리글의 '조문 도감'을 누르면(?f= 없는 주소) 거른 것이 풀린다", async () => {
    const { page } = await view(dutyFeatureHref("ad-send"));
    await page.waitForFunction(() => document.querySelector<HTMLSelectElement>(".dm-filter select")?.value !== "-1");
    expect(await page.locator(".dm-filter select").first().inputValue()).toBe(String(dutyMap.features.findIndex((entry) => entry.id === "ad-send")));
    expect((await visibleRows(page)).length).toBe(countOf("ad-send"));
    await page.locator('.site-header .hdr-nav a[href="/policy/"]').click();
    await page.waitForURL(`${site.origin}${INDEX}`);
    await page.waitForFunction(() => document.querySelector<HTMLSelectElement>(".dm-filter select")?.value === "-1");
    expect((await visibleRows(page)).length).toBe(dutyMap.asked);
  });

  it("주소의 자리(#duty-…)로 열면 그 의무 줄이 펼쳐져 창 안에 있다", async () => {
    // 쪽의 맨 끝 줄(옮겨 가야 보이는 곳)로 본다.
    const duty = ordered.at(-1)!;
    const { page } = await view(`${INDEX}#${dutyAnchor(duty.id)}`);
    await page.waitForFunction((id) => (document.getElementById(id) as HTMLDetailsElement | null)?.open === true, dutyAnchor(duty.id));
    await expect.poll(async () => (await page.locator(`#${dutyAnchor(duty.id)}`).boundingBox())!.y).toBeLessThan(900);
    const box = (await page.locator(`#${dutyAnchor(duty.id)}`).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeLessThan(900);
  });
});
