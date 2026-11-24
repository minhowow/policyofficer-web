import type { Browser, BrowserContext } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { findCase } from "@/lib/cases";
import { dutyAnchor, dutyMap, sanctionOf } from "@/lib/duties";
import { SANCTION_TIERS } from "@/lib/duties/sanction";
import { parseReview } from "@/lib/review";
import { closeChrome, launchChrome, openPage, overflow, serveSite, type OpenOptions, type Site } from "./site";

// 의무마다 법에 적힌 제재(2026-11-24 오너 승인)를 실제 브라우저로 본다: 사례 쪽의 맨 위 요약(누르면 그 항목만 남고 첫 항목으로
// 옮겨 가며 '모두 보기'로 돌아온다), 좁은 화면에서 표지가 제목 아래로 내려가고 가로로 넘치지 않는지(두 테마), 조문 도감의 제재
// 거르개가 기능 거르개(?f=)와 함께 듣는지, 인쇄용 보기의 표지가 흑백(검은 선·기호)으로 찍히는지. 의무 지도에 제재가 없는 판이면
// 그 어느 것도 화면에 없어야 한다.

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
const CASE = "jobtalk";
const review = parseReview(findCase(CASE)!.review)!;
const CHECKS = ["seen-in-code", "check-outside", "check-applicability"];
/** 확인할 것 가운데 강조 무게(징역·과징금)의 제재가 걸리는 항목. */
const heavy = review.checklist.filter((item) => {
  const sanction = sanctionOf(item.duty);
  return sanction !== null && ["징역", "과징금"].includes(sanction.class) && CHECKS.includes(item.status) && item.group !== "goods";
});

describe.runIf(sanctioned)("제재가 있는 판", () => {
  it("사례 쪽: 요약의 수를 누르면 그 항목만 남고 첫 항목으로 옮겨 가며, '모두 보기'로 돌아온다", async () => {
    const { page } = await open(`/cases/${CASE}/`);
    const button = page.locator(".overview .sanc-filter");
    await expect.poll(() => button.textContent()).toBe(`어기면 징역·과징금이 걸리는 항목 ${heavy.length}건`);
    const visible = () =>
      page.evaluate(() => [...document.querySelectorAll("#rv-checklist .rv-item")].filter((item) => item.checkVisibility()).map((item) => item.hasAttribute("data-heavy")));
    await button.click();
    await expect.poll(visible).toEqual(heavy.map(() => true));
    expect(await button.getAttribute("aria-pressed")).toBe("true");
    await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute("data-heavy") ?? false)).toBe(true);
    // 거르는 동안 갈래의 수(거르지 않은 수)는 감춘다.
    expect(await page.locator("#rv-checklist .ck-n").evaluateAll((nodes) => nodes.filter((node) => (node as HTMLElement).checkVisibility()).length)).toBe(0);
    await page.locator(".overview .sanc-all").focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await visible()).length).toBeGreaterThan(heavy.length);
    expect(await button.getAttribute("aria-pressed")).toBe("false");
    // '모두 보기'는 사라지므로 초점은 요약의 단추로 돌아온다.
    expect(await page.evaluate(() => document.activeElement?.className)).toBe("sanc-filter");
  });

  it.each(["light", "dark"] as const)("360px(%s): 표지는 제목 아래, 가로로 넘치지 않는다(사례 쪽과 조문 도감)", async (colorScheme) => {
    for (const pathname of [`/cases/${CASE}/`, "/policy/"]) {
      const { page } = await open(pathname, { viewport: { width: 360, height: 800 }, colorScheme });
      await page.evaluate(() => {
        for (const details of document.querySelectorAll("details")) details.open = true;
      });
      // 개인정보 흐름 그림은 제 상자 안에서 가로로 밀린다(service.test.ts 와 같다).
      expect(await overflow(page, ".flow-scroll"), pathname).toMatchObject({ page: 0, over: [] });
      const below = await page.evaluate(() =>
        [...document.querySelectorAll(".rv-title, .dr-head")].flatMap((head) => {
          const title = head.querySelector(".rv-duty, .dr-title");
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

  it("조문 도감: 정적 규칙의 이동 링크가 제재 거르개에 감춰진 줄을 가리키면 거른 것을 풀고 그 줄을 펼쳐 옮긴다", async () => {
    const tier = (id: string) => {
      const sanction = dutyMap.duties.find((duty) => duty.id === id)!.sanction!;
      return SANCTION_TIERS.findIndex((t) => t.classes.includes(sanction.class));
    };
    const pair = Object.entries(dutyMap.policyHome)
      .flatMap(([policy, home]) => dutyMap.duties.filter((duty) => duty.id !== home && duty.policies.includes(policy)).map((duty) => ({ from: duty.id, to: home })))
      .find(({ from, to }) => tier(from) !== tier(to));
    expect(pair, "무게가 다른 두 의무를 잇는 정적 규칙이 의무 지도에 없습니다").toBeDefined();
    const { page } = await open("/policy/");
    await page.locator(".dm-filter select").nth(2).selectOption(String(tier(pair!.from)));
    const target = page.locator(`#${dutyAnchor(pair!.to)}`);
    await expect.poll(() => target.isVisible()).toBe(false);
    const from = page.locator(`#${dutyAnchor(pair!.from)}`);
    await from.locator(":scope > summary").click();
    await from.locator(".dr-static-link a").click();
    await expect.poll(() => target.isVisible()).toBe(true);
    expect(await target.evaluate((row) => (row as HTMLDetailsElement).open)).toBe(true);
    expect(await page.locator(".dm-filter select").nth(2).inputValue()).toBe("-1");
    await expect.poll(() => page.evaluate((id) => document.activeElement?.id === id, dutyAnchor(pair!.to))).toBe(true);
  });

  it("인쇄용 보기: 표지는 검은 선과 기호로 찍힌다(강조는 굵은 글·두꺼운 선·느낌표)", async () => {
    const { page } = await open(`/cases/${CASE}/checklist/`);
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
    for (const pathname of [`/cases/${CASE}/`, "/policy/", `/cases/${CASE}/checklist/`]) {
      const { page } = await open(pathname);
      expect(await page.locator(".sanc, .sanc-filter, .sanc-caution").count(), pathname).toBe(0);
    }
    const { page } = await open("/policy/");
    expect(await page.locator(".dm-filter select").count()).toBe(2);
  });
});
