import type { Browser, BrowserContext } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { analysisHref } from "@/lib/service/href";
import { closeChrome, launchChrome, openPage, serveSite, type OpenOptions, type Site } from "./site";

// 결과 쪽을 "요약 → 한 줄 목록 → 누르면 펼침"으로(2026-11-25 web16, SOFTCON 심사 대비)를 실제 브라우저로 본다.

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

describe("a. 쳐내기", () => {
  it("review 가 있는 분석 쪽: 조문별 검사 기록 단추는 머리가 아니라 접힌 보조 줄 안에 있고, 누르면 그 자리에 기록이 나온다", async () => {
    const { page } = await open(REVIEWED);
    expect(await page.locator(".report-head .record-btn").count()).toBe(0);
    const aux = page.locator("details.aux");
    expect(await aux.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    expect(await aux.locator("> summary").innerText()).toMatch(/^보조 · 정적 검사 발견 \d+건( · .+)? · AI 검토가 코드에서 본 것 \d+건 자세히$/);
    const button = aux.getByRole("button", { name: "조문별 검사 기록 인쇄용", exact: true });
    expect(await button.isVisible()).toBe(false);
    await aux.locator("> summary").click();
    await button.click();
    await page.locator(".record").waitFor();
    expect(await button.getAttribute("aria-pressed")).toBe("true");
    // 기록을 보이는 동안 가리는 것은 이 구역의 정적 검사 화면뿐이다. 위의 review 화면(체크리스트)은 그대로 보인다.
    expect(await page.locator("details.aux .report").isVisible()).toBe(false);
    expect(await page.locator("#rv-checklist").isVisible()).toBe(true);
    // 인쇄: 기록이 보이면 기록만 나온다. 기록을 연 채 보조 줄을 접으면 기록은 화면에 없으므로 쪽을 그대로 찍는다.
    const printed = async () => {
      await page.emulateMedia({ media: "print" });
      const shown = await page.evaluate(() => ({
        record: document.querySelector(".record")?.checkVisibility() ?? false,
        checklist: document.querySelector("#rv-checklist")!.checkVisibility(),
      }));
      await page.emulateMedia({ media: "screen" });
      return shown;
    };
    expect(await printed()).toEqual({ record: true, checklist: false });
    await aux.locator("> summary").click();
    expect(await printed()).toEqual({ record: false, checklist: true });
    await aux.locator("> summary").click();
    await button.click();
    await expect.poll(() => page.locator(".record").count()).toBe(0);
    expect(await page.locator("details.aux .report").isVisible()).toBe(true);
  });

  it("머리글 메뉴에 데모가 없고, 구조 쪽 맨 아래 링크 하나가 데모로 잇는다", async () => {
    const { page } = await open("/how/");
    expect(await page.locator(".site-header a[href='/demo/']").count()).toBe(0);
    const link = page.locator("main .how-demo a");
    expect(await link.innerText()).toBe("정적 규칙만 쓰는 모습(합성 예시)");
    await link.click();
    await page.waitForURL(`${site.origin}/demo/`);
  });
});
