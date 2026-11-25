import type { Browser, BrowserContext, Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dutyAnchor } from "@/lib/duties";
import { parseReview } from "@/lib/review";
import { confirmedItems } from "@/lib/review/pick";
import { analysisHref } from "@/lib/service/href";
import genaiChatReview from "@contract/review/genai-chat.review.json";
import { closeChrome, launchChrome, openPage, overflow, serveSite, type OpenOptions, type Site } from "./site";

// 결과 쪽을 실제 브라우저로 본다. 2026-11-25 web16 에서 "요약 → 한 줄 목록 → 누르면 펼침"으로 했고, 같은 날 web18(오너 지시: 확실한
// 것만 크게)에서 맨 위를 "한 줄(하는 일·실행 정보) → 코드에서 확인된 것(카드 3건 안팎) → 더 살펴볼 것(한 줄 행 목록)"으로 바꿨다.
// 보는 쪽은 review 가 있는 합성 분석 하나다. 심사위원은 포스터의 QR 로 이 쪽에 들어온다(휴대폰 포함).

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

/** 그 합성 분석의 review(손으로 만든 합성 예시). 카드와 행을 고르는 데 쓴다. */
const review = parseReview(genaiChatReview)!;
/** 코드에서 확인된 것(카드)의 의무 id. 분석 쪽은 다시 검토 중인 의무를 넘기지 않는다(`AnalysisDashboard`). */
const CARDS = confirmedItems(review, review.checklist).map((item) => item.duty);
/** 카드에 오르지 않은 확인할 것(더 살펴볼 것의 행) 가운데, 받은 인용이 둘 이상인 것(펼치면 첫 인용만 보이고 나머지는 접힌다)과 저장소 밖에서 확인할 것. */
const okCites = (item: (typeof review.checklist)[number]) => item.citations.filter((cite) => cite.ok && cite.why !== "profile");
const CITED = review.checklist.find((item) => item.status === "seen-in-code" && item.group !== "goods" && !CARDS.includes(item.duty) && okCites(item).length > 1)!;
const OTHER = review.checklist.find((item) => item.status === "check-outside" && item.group !== "goods" && !CARDS.includes(item.duty))!;

/**
 * 첫 화면(스크롤 전)에 보이는 것: 한 줄(.rv-lead)의 아래 끝, 카드마다 위 끝과 사실(.rv-fact)·첫 인용·확인할 질문(.rv-card-q)의 아래 끝.
 * 없는 것은 null 이다.
 */
const firstScreen = (page: Page) =>
  page.evaluate(() => {
    const edge = (el: Element | null | undefined, side: "top" | "bottom") => (el ? Math.round(el.getBoundingClientRect()[side]) : null);
    return {
      lead: edge(document.querySelector(".review > .rv-lead"), "bottom"),
      cards: [...document.querySelectorAll(".rv-confirmed ol.rv-cards > li.rv-card")].map((card) => ({
        id: card.id,
        top: edge(card, "top"),
        fact: edge(card.querySelector(".rv-fact"), "bottom"),
        cite: edge(card.querySelector(".rv-card-cite .cite"), "bottom"),
        question: edge(card.querySelector(".rv-card-q"), "bottom"),
      })),
    };
  });

describe("코드에서 확인된 것과 더 살펴볼 것: 첫 화면(web18)", () => {
  it("1280×800: 한 줄과 카드 둘 이상이 첫 화면에 있고, 그 카드마다 확인할 질문까지 읽힌다", async () => {
    expect(CARDS.length, "합성 예시에 코드에서 확인된 것이 둘 이상 있어야 합니다").toBeGreaterThanOrEqual(2);
    const { page } = await open(REVIEWED, { viewport: { width: 1280, height: 800 } });
    const at = await firstScreen(page);
    expect(at.cards.map((card) => card.id)).toEqual(CARDS.map(dutyAnchor));
    expect(at.lead).not.toBeNull();
    expect(at.lead!).toBeLessThanOrEqual(800);
    // 첫 화면의 카드: 위 끝이 화면 안이고, 확인할 질문의 아래 끝까지 800 안.
    const shown = at.cards.filter((card) => card.top !== null && card.top >= 0 && card.question !== null && card.question <= 800);
    expect(shown.length, JSON.stringify(at.cards)).toBeGreaterThanOrEqual(2);
    // 카드 둘은 맨 앞의 둘이다(무거운 차례로 늘어놓았다).
    expect(shown.slice(0, 2).map((card) => card.id)).toEqual(at.cards.slice(0, 2).map((card) => card.id));
    expect(await overflow(page, ".flow-scroll")).toMatchObject({ page: 0, over: [] });
    // 더 살펴볼 것: 카드와 행을 합하면 확인할 것 모두이고, 그 마지막 행까지 두 화면(1600px) 안.
    const last = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#rv-checklist > section.ck .rv-item > details > summary")];
      return rows.length === 0 ? 0 : rows.at(-1)!.getBoundingClientRect().bottom + window.scrollY;
    });
    expect(last).toBeGreaterThan(0);
    expect(last).toBeLessThanOrEqual(1600);
  });

  it("390×844: 한 줄, 첫 카드의 사실과 첫 인용이 첫 화면에 보이고 가로로 넘치지 않는다(두 테마)", async () => {
    for (const colorScheme of ["light", "dark"] as const) {
      const { page } = await open(REVIEWED, { viewport: { width: 390, height: 844 }, colorScheme });
      expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches), colorScheme).toBe(colorScheme === "dark");
      const at = await firstScreen(page);
      expect(at.lead, colorScheme).not.toBeNull();
      expect(at.lead!, colorScheme).toBeLessThanOrEqual(844);
      const [first] = at.cards;
      expect(first, colorScheme).toBeDefined();
      expect(first.top!, colorScheme).toBeGreaterThanOrEqual(0);
      expect(first.fact, colorScheme).not.toBeNull();
      expect(first.fact!, colorScheme).toBeLessThanOrEqual(844);
      expect(first.cite, colorScheme).not.toBeNull();
      expect(first.cite!, colorScheme).toBeLessThanOrEqual(844);
      // 개인정보 흐름 그림(접어 둔 #rv-flow 안)은 제 상자(.flow-scroll) 안에서 가로로 밀린다. 닫힌 details 안도 잰다(`overflow`).
      expect(await overflow(page, ".flow-scroll"), colorScheme).toMatchObject({ page: 0, over: [] });
    }
  });

  it("개인정보 흐름: 640px 아래에서는 '외부로 보냄' 세로 목록이 보이고 그림은 '그림 보기'를 눌러야 보인다. 넓은 화면은 그림만(web16 d)", async () => {
    const visible = (page: Page, selector: string) => page.locator(selector).first().isVisible();
    for (const [width, height] of [
      [390, 844],
      [1280, 800],
    ] as const) {
      const { page } = await open(REVIEWED, { viewport: { width, height } });
      await page.locator("#rv-flow > summary").click();
      const narrow = width < 640;
      expect(await visible(page, "#rv-flow .flow-narrow"), `${width}`).toBe(narrow);
      expect(await visible(page, "#rv-flow .flow-show"), `${width}`).toBe(narrow);
      expect(await visible(page, "#rv-flow figure.flow"), `${width}`).toBe(!narrow);
      if (!narrow) continue;
      expect(await page.locator("#rv-flow .flow-out li").count()).toBe(review.flow.nodes.filter((node) => node.kind === "external").length);
      const toggle = page.getByRole("button", { name: "그림 보기" });
      await toggle.click();
      expect(await visible(page, "#rv-flow figure.flow")).toBe(true);
      expect(await page.getByRole("button", { name: "그림 접기" }).getAttribute("aria-expanded")).toBe("true");
      expect(await overflow(page, ".flow-scroll")).toMatchObject({ page: 0, over: [] });
      await page.getByRole("button", { name: "그림 접기" }).click();
      expect(await visible(page, "#rv-flow figure.flow")).toBe(false);
    }
  });

  it("행을 누르면 그 자리에서 펼쳐지고, 주소의 #의무id 로 들어오면 그 행이 펼쳐져 있다. 모두 펼치기·모두 접기", async () => {
    expect(CITED, "카드에 오르지 않고 인용이 둘 이상인 코드에서 본 것이 합성 예시에 없습니다").toBeDefined();
    expect(OTHER, "저장소 밖에서 확인할 것이 합성 예시에 없습니다").toBeDefined();
    const { page } = await open(`${REVIEWED}#${dutyAnchor(CITED.duty)}`);
    const row = page.locator(`#${dutyAnchor(CITED.duty)}`);
    // 그 자리는 더 살펴볼 것의 행이다(카드가 아니다).
    expect(await row.evaluate((el) => el.matches("#rv-checklist li.rv-item > details.rv-row"))).toBe(true);
    await expect.poll(() => row.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
    await expect.poll(() => row.evaluate((el) => el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < window.innerHeight)).toBe(true);
    expect(await row.locator(".cite-text").first().innerText()).toContain(okCites(CITED)[0].text);
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
