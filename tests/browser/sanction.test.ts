import type { Browser, BrowserContext } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dutyMap, sanctionOf } from "@/lib/duties";
import { SANCTION_TIERS } from "@/lib/duties/sanction";
import { parseReview } from "@/lib/review";
import { analysisHref, checklistHref } from "@/lib/service/href";
import genaiChatReview from "@contract/review/genai-chat.review.json";
import { closeChrome, launchChrome, openPage, overflow, serveSite, type OpenOptions, type Site } from "./site";

// 의무마다 법에 적힌 제재(2026-11-24 오너 승인)를 실제 브라우저로 본다: review 가 있는 합성 분석 쪽의 맨 위 요약(누르면 그 항목만
// 남고 첫 항목으로 옮겨 가며 '모두 보기'로 돌아온다), 좁은 화면에서 표지가 제목 아래로 내려가고 가로로 넘치지 않는지(두 테마), 조문
// 도감의 제재 거르개가 기능 거르개(?f=)와 함께 듣는지, 인쇄용 보기의 표지가 흑백(검은 선·기호)으로 찍히는지. 의무 지도에 제재가 없는
// 판이면 그 어느 것도 화면에 없어야 한다. 2026-11-25 web17 에서 사례 쪽을 걷어, 사례 쪽에서 보던 것을 합성 분석 쪽으로 옮겼다.
// 합성 예시의 의무 id 는 대부분 의무 지도에 없어 제재가 붙지 않는다. 그래서 무게마다의 수는 적어 두지 않고 review 와 의무 지도에서 센다.

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

const sanctioned = dutyMap.duties.some((duty) => duty.sanction);
/** review 가 있는 합성 분석(생성형 AI 채팅 합성 저장소)과 그 인쇄용 보기. */
const REVIEWED = analysisHref("example-studio", "genai-chat", "4qqa6fdx2h");
const PRINT = checklistHref("example-studio", "genai-chat", "4qqa6fdx2h");
const review = parseReview(genaiChatReview)!;
const CHECKS = ["seen-in-code", "check-outside", "check-applicability"];
/** 확인할 것 가운데 강조 무게(징역·과징금)의 제재가 걸리는 항목. */
const heavy = review.checklist.filter((item) => {
  const sanction = sanctionOf(item.duty);
  return sanction !== null && ["징역", "과징금"].includes(sanction.class) && CHECKS.includes(item.status) && item.group !== "goods";
});

describe.runIf(sanctioned)("제재가 있는 판", () => {
  it("분석 쪽: 요약의 제재 단추를 누르면 그 자리에서 그 무게의 행만 남고 목록 머리에 띠가 붙는다. 화면과 초점은 움직이지 않는다. '모두 보기'로 돌아온다", async () => {
    // 합성 예시에 강조 무게의 확인할 것이 없으면 이 시험은 볼 것이 없다.
    expect(heavy.length, "합성 예시의 확인할 것 가운데 징역·과징금이 걸리는 항목이 없습니다").toBeGreaterThan(0);
    const { page } = await open(REVIEWED);
    const button = page.locator(".rv-sum .sanc-filter.sf-0");
    await expect.poll(() => button.textContent()).toBe(`!${SANCTION_TIERS[0].label} ${heavy.length}`);
    const visible = () =>
      page.evaluate(() => [...document.querySelectorAll("#rv-checklist .rv-item")].filter((item) => item.checkVisibility()).map((item) => item.getAttribute("data-tier")));
    const scrolled = () => page.evaluate(() => window.scrollY);
    const before = await scrolled();
    await button.click();
    await expect.poll(visible).toEqual(heavy.map(() => "0"));
    // 화면은 목록 쪽으로 옮겨 가지 않고(2026-11-25 오너 지시), 초점은 누른 단추에 그대로다.
    await page.waitForTimeout(300);
    expect(await scrolled()).toBe(before);
    expect(await page.evaluate(() => document.activeElement?.className)).toBe("sanc-filter sf-0");
    expect(await button.getAttribute("aria-pressed")).toBe("true");
    const band = page.locator("#rv-checklist-band .rv-band");
    expect(await band.textContent()).toBe(`${SANCTION_TIERS[0].label} ${heavy.length}건만 보는 중 · 모두 보기`);
    // 거르는 동안 갈래의 수(거르지 않은 수)와 접어 둔 나머지 갈래는 감춘다.
    expect(await page.locator("#rv-checklist .ck-n").evaluateAll((nodes) => nodes.filter((node) => (node as HTMLElement).checkVisibility()).length)).toBe(0);
    expect(await page.locator("#rv-checklist .rv-folded").isVisible()).toBe(false);
    await band.getByRole("button", { name: "모두 보기" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await visible()).length).toBeGreaterThan(heavy.length);
    expect(await button.getAttribute("aria-pressed")).toBe("false");
    expect(await page.locator("#rv-checklist-band .rv-band").count()).toBe(0);
    // 띠는 사라지므로 초점은 누른 단추로 돌아온다.
    expect(await page.evaluate(() => document.activeElement?.className)).toBe("sanc-filter sf-0");
  });

  it.each(["light", "dark"] as const)("360px(%s): 가로로 넘치지 않고, 조문 도감의 표지는 제목 아래로 내려간다", async (colorScheme) => {
    for (const pathname of [REVIEWED, "/policy/"]) {
      const { page } = await open(pathname, { viewport: { width: 360, height: 800 }, colorScheme });
      await page.evaluate(() => {
        for (const details of document.querySelectorAll("details")) details.open = true;
      });
      // 개인정보 흐름 그림은 제 상자 안에서 가로로 밀린다(service.test.ts 와 같다).
      expect(await overflow(page, ".flow-scroll"), pathname).toMatchObject({ page: 0, over: [] });
      if (pathname !== "/policy/") continue;
      const below = await page.evaluate(() =>
        [...document.querySelectorAll(".dr-head")].flatMap((head) => {
          const title = head.querySelector(".dr-title");
          const badge = head.querySelector(":scope > .sanc");
          return title && badge ? [badge.getBoundingClientRect().top >= title.getBoundingClientRect().bottom - 0.5] : [];
        }),
      );
      expect(below.length, pathname).toBeGreaterThan(0);
      expect(below.every(Boolean), pathname).toBe(true);
    }
  });

  it("조문 도감: 제재 거르개는 기능 거르개(?f=)와 함께 걸린다", async () => {
    const feature = dutyMap.features.find((f) => dutyMap.duties.some((duty) => duty.feature === f.id && duty.sanction && ["징역", "과징금"].includes(duty.sanction.class)))!;
    const { page } = await open(`/policy/?f=${feature.id}`);
    const inFeature = dutyMap.duties.filter((duty) => duty.feature === feature.id);
    await expect.poll(() => page.locator(".dm-n").textContent()).toBe(`의무 ${inFeature.length}`);
    await page.locator(".dm-filter select").nth(2).selectOption("0");
    const want = inFeature.filter((duty) => ["징역", "과징금"].includes(duty.sanction!.class)).length;
    await expect.poll(() => page.locator(".dm-n").textContent()).toBe(`의무 ${want}`);
    const shown = await page.evaluate(() => [...document.querySelectorAll("details.duty-row")].filter((row) => row.checkVisibility()).map((row) => (row as HTMLElement).dataset.s));
    expect(shown).toEqual(Array.from({ length: want }, () => "0"));
  });

  it("인쇄용 보기: 표지는 검은 선과 기호로 찍힌다(강조는 굵은 글·두꺼운 선·느낌표)", async () => {
    const { page } = await open(PRINT);
    await page.emulateMedia({ media: "print", colorScheme: "dark" });
    const looks = await page.evaluate(() =>
      [...document.querySelectorAll(".ck-sheet .sanc")].map((badge) => {
        const style = getComputedStyle(badge);
        return { tier: badge.className, color: style.color, border: style.borderTopColor, width: style.borderTopWidth, weight: style.fontWeight, mark: badge.querySelector(".sanc-mark") !== null };
      }),
    );
    const strong = looks.filter((look) => look.tier === "sanc sanc-0");
    expect(strong.length).toBeGreaterThan(0);
    for (const look of strong) expect(look).toMatchObject({ color: "rgb(0, 0, 0)", border: "rgb(0, 0, 0)", width: "2px", weight: "600", mark: true });
    for (const look of looks.filter((l) => l.tier === "sanc sanc-1")) expect(look).toMatchObject({ color: "rgb(0, 0, 0)", border: "rgb(0, 0, 0)", width: "1px", mark: false });
  });
});

describe.skipIf(sanctioned)("제재가 없는 판", () => {
  it("표지·요약·거르개가 없다", async () => {
    for (const pathname of [REVIEWED, "/policy/", PRINT]) {
      const { page } = await open(pathname);
      expect(await page.locator(".sanc, .sanc-filter, .sanc-caution").count(), pathname).toBe(0);
    }
    const { page } = await open("/policy/");
    expect(await page.locator(".dm-filter select").count()).toBe(2);
  });
});
