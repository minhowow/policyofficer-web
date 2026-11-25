import type { Browser, BrowserContext } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { analysisHref, checklistHref, checklistMarkdownHref } from "@/lib/service/href";
import { SITE } from "@/lib/site";
import { closeChrome, launchChrome, NO_STORAGE, openPage, overflow, serveSite, stored, textContrast, type Site } from "./site";

// 의무 체크리스트 내보내기(2026-11-13 오너 지시)를 빌드된 사이트에서 Chrome 으로 연다: 결과 쪽의 링크 둘, 마크다운 파일(같은 사이트의
// /api/), 인쇄용 보기(인쇄하면 종이만). 2026-11-25 web17 에서 첫 화면의 사례 한 건과 사례 쪽(41곳 평가, 사례의 내보내기)을 걷어,
// review 가 있는 합성 분석의 내보내기만 본다.

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

const open = (pathname: string, width: number, colorScheme: "light" | "dark" = "light") =>
  openPage(browser, site, pathname, { viewport: { width, height: 900 }, colorScheme, contexts, problems });

/** 합성 미리보기에서 review 결과가 있는 끝난 분석(생성형 AI 채팅 합성 저장소). */
const REVIEWED = { owner: "example-studio", name: "genai-chat", id: "4qqa6fdx2h" };
/** review 결과가 없는 끝난 분석(아동 가입 합성 저장소). */
const PROFILE_ONLY = { owner: "example-org", name: "kids-signup", id: "wtk33e9zuf" };

describe("첫 화면", () => {
  it("공개 사례 한 건이 지나는 길(따라가 보기)이 없다(web17 에서 걷었다)", async () => {
    const { page, outside } = await open("/", 1280);
    expect(await page.locator(".home-case, .hc-items, .hc-src").count()).toBe(0);
    expect(await page.locator("a[href^='/cases/']").count()).toBe(0);
    expect(outside).toEqual([]);
  });
});

describe("의무 체크리스트 내보내기", () => {
  it("분석 쪽(합성 예시의 review 결과): 체크리스트 머리의 링크 둘, 마크다운 파일은 받기로 내려온다", async () => {
    const { page, outside } = await open(analysisHref(REVIEWED.owner, REVIEWED.name, REVIEWED.id), 1280);
    const links = page.locator(".rv-export a");
    expect(await links.evaluateAll((as) => as.map((a) => [a.getAttribute("href"), a.hasAttribute("download")]))).toEqual([
      [checklistMarkdownHref(REVIEWED.id), true],
      [checklistHref(REVIEWED.owner, REVIEWED.name, REVIEWED.id), false],
    ]);
    // 같은 머리에 모두 펼치기 단추가 있다(링크가 아니다).
    expect(await page.locator(".rv-export").getByRole("button", { name: "모두 펼치기" }).count()).toBe(1);
    const response = await fetch(`${site.origin}${checklistMarkdownHref(REVIEWED.id)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="checklist-[A-Za-z0-9._-]+\.md"$/);
    const text = await response.text();
    expect(text).toContain(`# 의무 체크리스트 · ${REVIEWED.owner}/${REVIEWED.name}`);
    expect(text).toContain(SITE.record.lead);
    expect(text).toContain("합성 예시");
    // 받기를 누르면 파일이 내려온다(같은 사이트의 /api/).
    const [download] = await Promise.all([page.waitForEvent("download"), links.first().click()]);
    expect(download.suggestedFilename()).toMatch(/^checklist-.+\.md$/);
    expect(outside).toEqual([]);
  });

  it("인쇄용 보기 링크를 누르면 그 쪽으로 간다. review 가 없는 분석에는 인쇄용 보기도 마크다운 파일도 없다", async () => {
    const { page, outside } = await open(analysisHref(REVIEWED.owner, REVIEWED.name, REVIEWED.id), 1280);
    await page.locator(".rv-export a", { hasText: "인쇄용 보기" }).click();
    await page.waitForURL(`${site.origin}${checklistHref(REVIEWED.owner, REVIEWED.name, REVIEWED.id)}`);
    await page.locator(".ck-sheet").waitFor();
    expect(await page.locator(".ck-facts").textContent()).toContain("합성 예시");
    // review 가 없는 분석은 쪽에 내보내기 링크가 없고, 주소로 열어도 없다.
    await page.goto(`${site.origin}${analysisHref(PROFILE_ONLY.owner, PROFILE_ONLY.name, PROFILE_ONLY.id)}`, { waitUntil: "networkidle" });
    expect(await page.locator(".rv-export").count()).toBe(0);
    expect((await fetch(`${site.origin}${checklistHref(PROFILE_ONLY.owner, PROFILE_ONLY.name, PROFILE_ONLY.id)}`)).status).toBe(404);
    expect((await fetch(`${site.origin}${checklistMarkdownHref(PROFILE_ONLY.id)}`)).status).toBe(404);
    expect(outside).toEqual([]);
  });

  it.each(["light", "dark"] as const)("인쇄용 보기(%s): 종이에 모든 갈래가 펼쳐져 있고, 인쇄하면 머리글·도구 줄 없이 종이만 흰 바탕에 나온다", async (scheme) => {
    const { page, outside } = await open(checklistHref(REVIEWED.owner, REVIEWED.name, REVIEWED.id), 375, scheme);
    expect(await page.locator(".ck-sheet h1").textContent()).toBe(`의무 체크리스트 · ${REVIEWED.owner}/${REVIEWED.name}`);
    expect(await page.locator(".ck-sheet details").count()).toBe(0);
    expect(await page.locator(".ck-group h2").count()).toBeGreaterThan(2);
    expect(await page.locator(".ck-tools a").first().getAttribute("href")).toBe(analysisHref(REVIEWED.owner, REVIEWED.name, REVIEWED.id));
    expect(await overflow(page)).toMatchObject({ page: 0, over: [] });
    expect((await textContrast(page, { root: "main" })).low).toEqual([]);
    await page.emulateMedia({ media: "print" });
    expect(await page.locator(".site-header").isVisible()).toBe(false);
    expect(await page.locator(".ck-tools").isVisible()).toBe(false);
    expect(await page.locator(".ck-sheet").isVisible()).toBe(true);
    expect(await page.locator(".ck-sheet").evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual([
      "rgb(255, 255, 255)",
      "rgb(0, 0, 0)",
    ]);
    expect(outside).toEqual([]);
    expect(await stored(page)).toEqual(NO_STORAGE);
  });
});
