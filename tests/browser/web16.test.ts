import type { Browser, BrowserContext, Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dutyAnchor } from "@/lib/duties";
import { parseReview } from "@/lib/review";
import { analysisHref } from "@/lib/service/href";
import genaiChatReview from "@contract/review/genai-chat.review.json";
import { closeChrome, launchChrome, openPage, serveSite, type OpenOptions, type Site } from "./site";

// 결과 쪽을 "요약 → 한 줄 목록 → 누르면 펼침"으로(2026-11-25 web16, SOFTCON 심사 대비)를 실제 브라우저로 본다. 사례 쪽과 정적 검사의
// 보조 줄·기록 단추·데모 링크는 같은 날 web17 에서 걷었다. 보는 쪽은 review 가 있는 합성 분석 하나다.

let site: Site;
let browser: Browser;
const contexts: BrowserContext[] = [];
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

afterAll(async () => {
  await closeChrome(browser);
  await site?.close();
});

const open = (pathname: string, options: Omit<OpenOptions, "contexts" | "problems"> = {}) => openPage(browser, site, pathname, { ...options, contexts, problems });

/** review 가 있는 합성 분석(example-studio/genai-chat). */
const REVIEWED = analysisHref("example-studio", "genai-chat", "4qqa6fdx2h");

/** 첫 화면에 보이는 것: 요약 부품들의 아래 끝과, 아래 끝이 화면 안에 든 행(접힌 두 줄)의 수. */
const firstScreen = (page: Page) =>
  page.evaluate(() => {
    const bottom = (selector: string) => [...document.querySelectorAll(selector)].map((el) => Math.round(el.getBoundingClientRect().bottom));
    const rows = [...document.querySelectorAll("#rv-checklist .rv-item > details > summary")].map((el) => el.getBoundingClientRect().bottom);
    return {
      height: window.innerHeight,
      big: bottom(".rv-sum .rv-big")[0],
      buttons: bottom(".rv-sum .sanc-filter"),
      caution: bottom(".rv-sum .sanc-caution")[0],
      rows: rows.filter((b) => b <= window.innerHeight).length,
      rowBottoms: rows.map(Math.round),
    };
  });

/** 그 합성 분석의 review(손으로 만든 합성 예시). 행을 고르는 데 쓴다. */
const review = parseReview(genaiChatReview)!;
/** 인용이 둘 이상인 확인할 것 하나(펼치면 첫 인용만 보이고 나머지는 접힌다)와, 그것과 다른 확인할 것 하나. */
const CITED = review.checklist.find((item) => item.status === "seen-in-code" && item.citations.filter((cite) => cite.ok).length > 1)!;
const OTHER = review.checklist.find((item) => item.status === "check-outside")!;

describe("요약과 목록: 첫 화면", () => {
  // 심사위원은 포스터의 QR 로 분석 쪽에 들어온다(휴대폰 포함).
  it("1280×800: 요약과 체크리스트 행 5개 이상. 확인할 것은 모두 두 화면(1600px) 안", async () => {
    const { page } = await open(REVIEWED, { viewport: { width: 1280, height: 800 } });
    const at = await firstScreen(page);
    expect(at.big).toBeLessThanOrEqual(800);
    expect(at.buttons).toHaveLength(3);
    for (const b of at.buttons) expect(b).toBeLessThanOrEqual(800);
    expect(at.caution).toBeLessThanOrEqual(800);
    expect(at.rows).toBeGreaterThanOrEqual(5);
    // 확인할 것의 세 갈래(열린 목록)의 마지막 행까지 두 화면 안.
    const last = await page.evaluate(() => {
      const sections = [...document.querySelectorAll("#rv-checklist > section.ck")];
      const rows = sections.flatMap((section) => [...section.querySelectorAll(".rv-item > details > summary")]);
      return rows.length === 0 ? 0 : rows.at(-1)!.getBoundingClientRect().bottom + window.scrollY;
    });
    expect(last).toBeLessThanOrEqual(1600);
  });

  it("390×844: 요약·제재 단추·주의 문구·첫 행이 첫 화면에 보이고 가로로 넘치지 않는다", async () => {
    for (const colorScheme of ["light", "dark"] as const) {
      const { page } = await open(REVIEWED, { viewport: { width: 390, height: 844 }, colorScheme });
      const at = await firstScreen(page);
      expect(at.big, colorScheme).toBeLessThanOrEqual(844);
      expect(at.buttons).toHaveLength(3);
      for (const b of at.buttons) expect(b, colorScheme).toBeLessThanOrEqual(844);
      expect(at.caution, colorScheme).toBeLessThanOrEqual(844);
      expect(at.rows, colorScheme).toBeGreaterThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    }
  });

  it("행을 누르면 그 자리에서 펼쳐지고, 주소의 #의무id 로 들어오면 그 행이 펼쳐져 있다. 모두 펼치기·모두 접기", async () => {
    expect(CITED, "인용이 둘 이상인 확인할 것이 합성 예시에 없습니다").toBeDefined();
    expect(OTHER, "저장소 밖에서 확인할 것이 합성 예시에 없습니다").toBeDefined();
    const { page } = await open(`${REVIEWED}#${dutyAnchor(CITED.duty)}`);
    const row = page.locator(`#${dutyAnchor(CITED.duty)}`);
    await expect.poll(() => row.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
    await expect.poll(() => row.evaluate((el) => el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < window.innerHeight)).toBe(true);
    expect(await row.locator(".cite-text").first().innerText()).toContain(CITED.citations.find((cite) => cite.ok)!.text);
    const other = page.locator(`#${dutyAnchor(OTHER.duty)}`);
    expect(await other.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    await other.locator("> summary").click();
    expect(await other.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
    const states = () => page.evaluate(() => [...document.querySelectorAll<HTMLDetailsElement>("#rv-checklist details.rv-row")].map((el) => el.open));
    await page.getByRole("button", { name: "모두 펼치기" }).click();
    expect((await states()).every(Boolean)).toBe(true);
    await page.getByRole("button", { name: "모두 접기" }).click();
    expect((await states()).some(Boolean)).toBe(false);
  });
});
