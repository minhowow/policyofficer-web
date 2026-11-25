import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReviewView } from "@/components/review/ReviewView";
import { AnalysisDashboard } from "@/components/service/AnalysisDashboard";
import { ActivityList } from "@/components/service/activity";
import { AnalysisTitle, Failed, HistoryTable, InProgress, PROGRESS_NOTE, RequestAction, StepList } from "@/components/service/analysis";
import { LiveAnalysis, POLL_MS } from "@/components/service/LiveAnalysis";
import { movingText } from "@/components/service/RequestButton";
import { RepoRow } from "@/components/service/parts";
import { LatestAnalysis } from "@/components/service/repository";
import { SearchHome, SearchResults } from "@/components/service/SearchResults";
import { keepArticle } from "@/components/text";
import { dutyFeatureHref, dutyMap } from "@/lib/duties";
import { parseProfile } from "@/lib/profile";
import { parseReview } from "@/lib/review";
import { checklistDoc } from "@/lib/review/checklist";
import { NO_FEATURES, NO_JUDGEMENT } from "@/components/result/Tiers";
import { analysisHref, commitLink, fileLink, repoHref, repoKey, searchHref, shortCommit } from "@/lib/service/href";
import { ID_ALPHABET, ID_LENGTH, isAnalysisId, newAnalysisId } from "@/lib/service/id";
import { pickActivity } from "@/lib/service/activity";
import { hangulToQwerty } from "@/lib/service/keyboard";
import { placeAt, placeOf, placeText, readPlace } from "@/lib/service/queue";
import { matchRepositories } from "@/lib/service/search";
import { activeLabel, activeStep, duration, finishedAt, formatKst, scanParts, STEP_ORDER, stepState } from "@/lib/service/steps";
import { syntheticRepositories, syntheticStore as store } from "@/lib/service/synthetic";
import type { Analysis, Repository, ReviewFacts } from "@/lib/service/types";
import { SITE } from "@/lib/site";
import { closedDetailsAt, elementAt, elementsOf, readJson, textOf } from "./helpers";
import { BANNED_WORDING } from "./wording";

// 분석 서비스(방향 B): 데이터 모델, 합성 저장소(SERVICE_STORE=synthetic 의 미리보기), 주소, 그리고 쪽의 부품. 운영 구현
// (DB + GitHub)은 tests/server-store.test.ts, 브라우저에서만 드러나는 것(이동, 넘침, 대비, 요청)은 tests/browser/service.test.ts 가 본다.

// 브라우저 부품(요청 단추, 진행 다시 읽기)은 Next 의 라우터를 쓴다. 부품 시험에는 라우터가 없어 빈 것으로 바꿔 끼운다
// (누르고 다시 읽는 것은 브라우저 시험이 본다: tests/browser/service-db.test.ts).
vi.mock("next/navigation", async (original) => ({
  ...((await original()) as typeof import("next/navigation")),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }),
}));

const repos = syntheticRepositories();
const analyses = (await Promise.all(repos.map(({ repository: r }) => store.listAnalyses(r.owner, r.name)))).flat();

/** 끝난 합성 분석마다 그 프로필 수집본의 표본(contract/cli-current/profile/<표본>.json). */
const PROFILE_SOURCES: Record<string, string> = {
  wtk33e9zuf: "kids-signup.main",
  "87q82b6jbu": "kids-signup.fixed",
  "64y4jdtazh": "night-push.main",
  "4qqa6fdx2h": "genai-chat.main",
  mruw8xjzjw: "genai-chat.fixed",
  w7bc479x2u: "plain.main",
};
const profileOf = (sample: string) => parseProfile(readJson("contract", "cli-current", "profile", `${sample}.json`))!;
/** 손으로 만든 review 2판 합성 예시(생성형 AI 채팅 합성 저장소에만 있다). */
const syntheticReview = parseReview(readJson("contract", "review", "genai-chat.review.json"))!;

describe("합성 저장소는 인터페이스 뒤에 있다", () => {
  it("합성 구현은 합성이라고 밝힌다", () => {
    expect(store.synthetic).toBe(true);
  });

  it("분석 요청은 합성 미리보기라 받지 않는다고 정직하게 돌려준다", async () => {
    expect(await store.requestAnalysis("example-org", "kids-signup")).toMatchObject({ ok: false, reason: "no-server" });
    expect(await store.requestAnalysis("nobody", "nothing")).toMatchObject({ ok: false, reason: "not-found" });
    expect(store.requestsClosed()).toBe(SITE.service.noServer);
  });

  it("저장소는 대소문자를 가리지 않고 찾는다", async () => {
    expect((await store.getRepository("Example-Org", "KIDS-SIGNUP"))?.name).toBe("kids-signup");
    expect(await store.getRepository("example-org", "nothing")).toBeNull();
  });
});

describe("합성 데이터", () => {
  it("저장소는 모두 합성이고, GitHub 주소가 없으며(링크를 걸지 않는다), 이름에 점·대문자가 없다", () => {
    expect(repos.length).toBeGreaterThanOrEqual(5);
    for (const { repository } of repos) {
      expect(repository.synthetic).toBe(true);
      expect(repository.htmlUrl).toBeNull();
      // 설명에는 "합성 예시"를 적지 않는다(재디자인 D4). 합성인 것은 쪽의 이름표가 밝힌다(showsSyntheticTag, tests/server-config.test.ts).
      expect(repository.description).toBeTruthy();
      // 정적 내보내기에서 점이 든 마지막 조각은 끝 슬래시를 잃는다(src/lib/service/href.ts).
      expect(`${repository.owner}/${repository.name}`).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
      expect(repository.owner).toMatch(/^example-/);
    }
  });

  it("네 상태(대기·분석 중·끝남·실패), 분석이 여러 번인 저장소, 분석이 없는 저장소가 모두 있다", () => {
    expect(new Set(analyses.map((a) => a.status))).toEqual(new Set(["queued", "running", "succeeded", "failed"]));
    expect(repos.some((hit) => hit.analyses >= 2)).toBe(true);
    expect(repos.some((hit) => hit.analyses === 0 && hit.latest === null)).toBe(true);
  });

  it("분석 id 는 모양이 맞고 서로 겹치지 않는다", () => {
    for (const analysis of analyses) expect(isAnalysisId(analysis.id), analysis.id).toBe(true);
    expect(new Set(analyses.map((a) => a.id)).size).toBe(analyses.length);
  });

  it("단계는 차례대로 모두 있고, 상태와 맞는다", () => {
    for (const analysis of analyses) {
      expect(analysis.steps.map((step) => step.name), analysis.id).toEqual(STEP_ORDER);
      expect(analysis.commit, analysis.id).toMatch(/^[0-9a-f]{40}$/);
      const states = analysis.steps.map((step) => stepState(analysis, step));
      if (analysis.status === "succeeded") expect(states.every((s) => s === "done"), analysis.id).toBe(true);
      if (analysis.status === "running" || analysis.status === "queued") {
        expect(states.filter((s) => s === "active"), analysis.id).toHaveLength(1);
        expect(activeStep(analysis), analysis.id).not.toBeNull();
      }
      if (analysis.status === "failed") {
        expect(analysis.failure, analysis.id).not.toBeNull();
        expect(states.filter((s) => s === "failed"), analysis.id).toEqual(["failed"]);
      } else expect(analysis.failure, analysis.id).toBeNull();
    }
  });

  it("끝난 분석의 프로필은 contract/cli-current/profile 의 수집본 그대로이고, review 는 생성형 AI 채팅 합성 저장소에만 있다. 규칙 검사의 결과와 판은 없다(2026-11-25)", async () => {
    const done = analyses.filter((a) => a.status === "succeeded");
    expect(done.map((a) => a.id).sort()).toEqual(Object.keys(PROFILE_SOURCES).sort());
    for (const analysis of done) {
      expect(await store.getProfile(analysis.id), analysis.id).toEqual(profileOf(PROFILE_SOURCES[analysis.id]));
      expect(analysis.versions, analysis.id).toBeNull();
      expect(await store.getReview(analysis.owner, analysis.name, analysis.commit), analysis.id).toEqual(analysis.name === "genai-chat" ? syntheticReview : null);
    }
    for (const analysis of analyses.filter((a) => a.status !== "succeeded")) {
      expect(await store.getProfile(analysis.id), analysis.id).toBeNull();
    }
    expect("getResult" in store).toBe(false);
    expect("findingCounts" in store).toBe(false);
  });

  it("최근 분석은 저장소마다 한 줄이다: 진행 중인 분석이 있으면 그것, 없으면 가장 나중의 분석. 요청 시각 차례(나중 것이 앞)", async () => {
    const recent = await store.recentActivity(10);
    // 분석이 있는 저장소 다섯(todo-web 은 분석이 없다).
    expect(recent.map(({ repository: r }) => `${r.owner}/${r.name}`)).toEqual([
      "example-labs/shop-front",
      "example-org/night-push",
      "example-studio/genai-chat",
      "example-org/kids-signup",
      "example-labs/plain-utils",
    ]);
    // night-push 는 끝난 분석(64y4jdtazh)보다 분석 중인 것(9f4gxaqj6s)을 보인다.
    expect(recent[1].analysis).toMatchObject({ id: "9f4gxaqj6s", status: "running" });
    expect(recent[1].analyses).toBe(2);
    // genai-chat 은 실패한 분석보다 나중의 끝난 분석을 보인다.
    expect(recent[2].analysis.id).toBe("mruw8xjzjw");
    const times = recent.map(({ analysis }) => analysis.requestedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect((await store.recentActivity(4)).map(({ analysis }) => analysis.id)).toEqual(recent.slice(0, 4).map(({ analysis }) => analysis.id));
    expect(await store.recentActivity(0)).toEqual([]);
  });
});

describe("분석 id", () => {
  it("헷갈리는 글자 없이 10자리이고, 만들 때마다 다르다", () => {
    expect(ID_ALPHABET).not.toMatch(/[01ilo]/);
    const ids = Array.from({ length: 2000 }, () => newAnalysisId());
    for (const id of ids) expect(id).toMatch(new RegExp(`^[${ID_ALPHABET}]{${ID_LENGTH}}$`));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("치우치지 않게 248 이상의 바이트는 버린다", () => {
    const bytes = [255, 250, 248, 0, 30, 31, 247, 1, 2, 3, 4, 5, 6];
    let at = 0;
    const id = newAnalysisId((buffer) => buffer.map(() => bytes[at++ % bytes.length]));
    expect(id).toBe([0, 30, 0, 247 % 31, 1, 2, 3, 4, 5, 6].map((n) => ID_ALPHABET[n % 31]).join(""));
  });
});

describe("주소와 링크", () => {
  it("저장소·분석·검색 주소", () => {
    expect(repoHref("Example-Org", "Kids-Signup")).toBe("/r/example-org/kids-signup/");
    expect(analysisHref("example-org", "kids-signup", "wtk33e9zuf")).toBe("/r/example-org/kids-signup/a/wtk33e9zuf/");
    expect(repoKey("A", "B")).toBe("a/b");
    expect(searchHref("")).toBe("/search/");
    expect(searchHref("kids signup")).toBe("/search/?q=kids%20signup");
  });

  it("GitHub 의 커밋 고정 링크는 저장소 주소가 있을 때만 만든다", () => {
    const base = ["https:", "", "github.com", "someone", "repo"].join("/");
    const commit = "a".repeat(40);
    expect(commitLink(null, commit)).toBeNull();
    expect(fileLink(null, commit, "src/a.ts", 3)).toBeNull();
    expect(commitLink(base, commit)).toBe(`${base}/commit/${commit}`);
    expect(fileLink(base, commit, "src/a b/c#.ts", 12)).toBe(`${base}/blob/${commit}/src/a%20b/c%23.ts#L12`);
    expect(fileLink(base, commit, "src/a.ts", null)).toBe(`${base}/blob/${commit}/src/a.ts`);
    expect(shortCommit(commit)).toBe("aaaaaaa");
  });
});

describe("검색", () => {
  it("낱말이 모두 이름·설명·언어에 들어 있는 저장소만 남긴다. 대소문자를 가리지 않고, 빈 질의는 빈 목록이다", () => {
    const names = (q: string) => matchRepositories(repos, q).map(({ repository: r }) => `${r.owner}/${r.name}`);
    expect(names("KIDS")).toEqual(["example-org/kids-signup"]);
    expect(names("example-labs")).toEqual(["example-labs/plain-utils", "example-labs/shop-front", "example-labs/todo-web"]);
    expect(names("javascript 쇼핑몰")).toEqual(["example-labs/shop-front"]);
    expect(names("nothing-like-this")).toEqual([]);
    expect(names("   ")).toEqual([]);
  });

  it("합성 저장소의 검색은 같은 거르기다", async () => {
    const hits = matchRepositories(repos, "genai");
    expect(await store.search("genai")).toEqual({ ok: true, hits, total: hits.length });
    expect(await store.search("")).toEqual({ ok: true, hits: [], total: 0 });
  });
});

describe("시각", () => {
  it("한국 표준시로 적고, 걸린 시간을 분·초로 적는다", () => {
    expect(formatKst("2026-10-24T15:30:00Z")).toBe("2026-10-25 00:30");
    expect(duration("2026-10-24T00:00:00Z", "2026-10-24T00:04:12Z")).toBe("4분 12초");
    expect(duration("2026-10-24T00:00:00Z", "2026-10-24T00:00:09Z")).toBe("9초");
  });
});

const find = (status: Analysis["status"]) => analyses.find((a) => a.status === status)!;
const repoOf = (analysis: Analysis) => repos.find(({ repository: r }) => r.name === analysis.name)!.repository;

/** 부품 시험에는 next.config 의 trailingSlash 가 없어 Link 가 끝 슬래시를 뗀다(빌드에서는 붙는다. 브라우저 시험이 본다). */
const linked = (href: string) => `href="${href.replace(/\/$/, "")}"`;

function expectNoBannedWording(html: string): void {
  for (const [pattern, why] of BANNED_WORDING) expect(pattern.test(textOf(html)), why).toBe(false);
}

describe("부품", () => {
  it("진행 중: 진행 중인 단계가 하나이고 aria-current 로 알린다. 합성이면 고정된 순간이라는 것을 밝힌다", () => {
    const html = renderToStaticMarkup(<InProgress analysis={find("running")} note={PROGRESS_NOTE.synthetic} />);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(textOf(html)).toContain("‘AI 검토’ 단계");
    expect(textOf(html)).toContain("고정해 보인 것");
    expectNoBannedWording(html);
    // 실제 분석에는 고정된 순간이라고 적지 않는다.
    expect(textOf(renderToStaticMarkup(<InProgress analysis={find("running")} />))).not.toContain("고정해 보인 것");
  });

  it("진행 중인 실제 분석(LiveAnalysis): 머리와 단계를 그리고, 지금 단계의 줄을 화면 낭독기가 읽는다", () => {
    const running = find("running");
    const html = renderToStaticMarkup(<LiveAnalysis repository={repoOf(running)} analysis={running} />);
    expect(html).toContain(`분석 <code class="v" translate="no">${running.id}</code>`);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    // (D5) `진행` 상자 하나: 지금 단계 한 줄(role=status)과 단계 표(docs/redesign.md 3장). "누구나 볼 수 있고 끝나면 이 주소에…"와
    // "몇 초마다 다시 읽는다"는 풀이 문장은 지웠다(2.3).
    expect(html).toMatch(/<p class="live-now" role="status">지금 ‘AI 검토’ 단계<\/p>/);
    expect(textOf(html)).not.toMatch(/누구나 볼 수 있고|몇 초마다/);
    expect(textOf(html)).not.toContain("고정해 보인 것");
    expect(POLL_MS).toBe(3_000);
    expectNoBannedWording(html);
  });

  it("review 를 맡긴 분석은 진행 중에 검토에 걸리는 시간을 적는다(2026-11-12 오너 지시). 맡기지 않았거나 끝났으면 적지 않는다", () => {
    const running = find("running");
    expect(textOf(renderToStaticMarkup(<InProgress analysis={{ ...running, review: "run" }} live />))).toContain(SITE.service.reviewTakes);
    expect(textOf(renderToStaticMarkup(<LiveAnalysis repository={repoOf(running)} analysis={{ ...running, review: "run" }} />))).toContain(
      SITE.service.reviewTakes,
    );
    const off = { ...running, review: undefined, scanPart: undefined };
    for (const analysis of [off, { ...running, review: "limit" as const }, { ...running, review: "stored" as const }, { ...find("succeeded"), review: "run" as const }]) {
      expect(textOf(renderToStaticMarkup(<InProgress analysis={analysis} />))).not.toContain(SITE.service.reviewTakes);
    }
  });

  it("진행 중 부품이 끝난·멈춘 분석을 잠깐 그릴 때(다시 읽은 직후) '다음 단계를 기다린다'고 적지 않는다", () => {
    expect(textOf(renderToStaticMarkup(<InProgress analysis={find("succeeded")} />))).toContain("분석이 끝났습니다.");
    const failed = textOf(renderToStaticMarkup(<InProgress analysis={find("failed")} />));
    expect(failed).toContain("분석이 멈췄습니다.");
    expect(failed).not.toContain("기다리고");
  });

  it("실패: 다음 단계에서 멈췄다는 알림을 받아 앞 단계의 끝난 시각을 모르면, 앞 단계는 '끝남'(시각 없음)이고 멈춘 단계만 '멈춤'이다", () => {
    const at = "2026-11-03T08:00:00.000Z";
    const analysis: Analysis = {
      ...find("failed"),
      steps: STEP_ORDER.map((name) => ({ name, startedAt: name === "queued" || name === "fetch" ? at : null, endedAt: name === "fetch" ? at : null })),
      failure: { step: "fetch", reason: "시험" },
    };
    expect(analysis.steps.map((step) => stepState(analysis, step))).toEqual(["done", "failed", "notrun", "notrun"]);
    const html = renderToStaticMarkup(<StepList analysis={analysis} />);
    expect(html.match(/step-failed/g)).toHaveLength(1);
  });

  it("실패: 멈춘 단계와 까닭을 보이고, 검토할 곳이 없다는 뜻이 아니라고 적는다", () => {
    const failed = find("failed");
    const html = renderToStaticMarkup(<Failed analysis={failed} />);
    // (D5) 빨간 테두리 상자의 머리가 멈춘 단계다(목업 analysis-live #failed).
    expect(textOf(html)).toContain("‘저장소 받기·도구 설치’ 단계에서 멈춤");
    expect(html).toContain('<section class="box live-box fail-box"');
    expect(textOf(html)).toContain(failed.failure!.reason);
    expect(textOf(html)).toContain("검토할 곳이 없다는 뜻이 아닙니다");
  });

  it("단계는 넷이다. 셋째 단계는 '검토'(기능 파악과, 켰을 때 AI 검토)다. 2026-11-25 부터 규칙 검사는 없다", () => {
    const html = renderToStaticMarkup(<StepList analysis={find("succeeded")} />);
    expect([...html.matchAll(/<span class="step-name">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual([
      "대기",
      "저장소 받기·도구 설치",
      "검토",
      "정리",
    ]);
    // 실행기가 검토 단계 안의 차례를 알리기 전에 끝난 분석에는 그 차례를 적지 않는다.
    expect(html).not.toContain("step-sub");
    expect(textOf(html)).not.toContain("건너뜀");
    expect(textOf(html)).not.toMatch(/정적 검사|AI 판정/);
  });

  it("검토 단계 안의 차례: 실행기가 알린 것만으로 정한다. 알린 일이 지금이고 앞은 끝났다. AI 검토 안의 단계는 차례만 적는다", () => {
    const running = find("running");
    const scanStart = running.steps.find((step) => step.name === "scan")!.startedAt;
    const at = "2026-10-24T05:00:05Z";
    const rows = (analysis: Analysis) => scanParts(analysis).map((row) => `${row.name}:${row.state}`);
    // 알림 전: 기능 파악이 지금(검토 단계가 시작한 때부터).
    expect(rows({ ...running, scanPart: undefined })).toEqual(["profile:active", "review:waiting"]);
    expect(scanParts({ ...running, scanPart: undefined })[0].startedAt).toBe(scanStart);
    // 알림을 받았으면 그 때가 시작이다.
    expect(rows({ ...running, scanPart: { name: "profile", startedAt: at } })).toEqual(["profile:active", "review:waiting"]);
    expect(scanParts({ ...running, scanPart: { name: "profile", startedAt: at } })[0].startedAt).toBe(at);
    expect(rows(running)).toEqual(["profile:done", "review:active"]);
    expect(scanParts(running)[1].startedAt).toBe(running.scanPart!.startedAt);
    // review 를 돌리지 않는 분석: 스위치가 꺼졌으면 AI 검토 줄이 없고, 저장된 결과·하루 한도면 그 까닭을 적는다.
    expect(rows({ ...running, review: undefined, scanPart: undefined })).toEqual(["profile:active"]);
    expect(scanParts({ ...running, review: "stored", scanPart: undefined }).at(-1)).toMatchObject({ name: "review", skipped: "같은 커밋의 저장된 결과를 씀" });
    expect(scanParts({ ...running, review: "limit", scanPart: undefined }).at(-1)).toMatchObject({ name: "review", skipped: "오늘 한도가 차서 하지 않음" });
    // 검토 단계에서 멈춘 분석: 지금이던 일에서 멈췄다.
    const failed: Analysis = { ...running, status: "failed", failure: { step: "scan", reason: "시험" } };
    expect(rows(failed)).toEqual(["profile:done", "review:failed"]);
    expect(rows({ ...failed, scanPart: undefined })).toEqual(["profile:failed", "review:notrun"]);
    // 지금 하는 일의 이름과 진행 줄.
    expect(activeLabel(running)).toBe("AI 검토");
    expect(activeLabel({ ...running, scanPart: undefined })).toBe("기능 파악");
    const html = renderToStaticMarkup(<StepList analysis={running} />);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/<li class="step-item step-sub step-active" aria-current="step">/);
    expect(textOf(html)).toContain("의무 고르기 → 의무별 조사 → 반박 → 직접 대조 (이 안의 차례는 알 수 없음)");
    expect(textOf(html)).not.toMatch(/정적 검사|AI 판정/);
    // 대기 중인 분석: 검토 단계의 차례는 모두 기다림이다.
    expect(rows(find("queued"))).toEqual(["profile:waiting"]);
  });

  it("분석 요청 단추는 누를 수 없고, 바로 옆에 까닭이 있다", () => {
    const repository = repos[0].repository;
    const html = renderToStaticMarkup(<RequestAction repository={repository} closed={SITE.service.noServer} />);
    // disabled 가 아니라 aria-disabled: 키보드로 닿아 까닭을 들을 수 있다. 단추 이름은 기본 브랜치의 최신 커밋을 분석한다는 것 하나다.
    expect(html).toMatch(/<button type="button" aria-disabled="true" aria-describedby="request-off">main 최신 커밋 분석<\/button>/);
    expect(html).not.toMatch(/<button[^>]* disabled=""/);
    expect(textOf(html)).toContain(SITE.service.noServer);
  });

  it("요청을 받는 서버에서는 단추가 듣는다(같은 사이트의 /api/ 를 부르는 브라우저 부품). 까닭 자리는 비어 있다가 바뀌면 읽힌다", () => {
    const repository = repos[0].repository;
    const html = renderToStaticMarkup(<RequestAction repository={{ ...repository, defaultBranch: "develop" }} closed={null} />);
    expect(html).toMatch(/<button type="button" aria-describedby="request-note">develop 최신 커밋 분석<\/button>/);
    expect(html).not.toContain("aria-disabled");
    expect(html).toContain('<p id="request-note" class="hint" role="status"></p>');
    // 요청에 관한 풀이 문장은 두지 않는다(docs/redesign.md 2.3).
    expect(textOf(html)).toBe("develop 최신 커밋 분석");
  });

  it("GitHub 에서 보기(2026-11-16 오너 요청): 분석 요청 단추 왼쪽의 보조 단추, 새 탭(화면 낭독기에도), 요청을 받지 않을 때도 있다. 주소는 GitHub 이 준 html_url 뿐", () => {
    const real = { ...repos[0].repository, owner: "minhowow", name: "Plitsoft-SDP-Web", htmlUrl: "https://github.com/minhowow/Plitsoft-SDP-Web", synthetic: false };
    const link = '<a class="btn gh-btn" href="https://github.com/minhowow/Plitsoft-SDP-Web" target="_blank" rel="noopener noreferrer">';
    for (const closed of [null, SITE.service.noServer]) {
      const html = renderToStaticMarkup(<RequestAction repository={real} closed={closed} />);
      expect(html.indexOf(link), String(closed)).toBeGreaterThan(-1);
      // 주 단추보다 앞(왼쪽)이다. 보조 단추 모양(.btn: 테두리만)이고, 주 단추는 그대로 하나다.
      expect(html.indexOf(link)).toBeLessThan(html.indexOf("<button"));
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(textOf(elementAt(html, html.indexOf(link)))).toBe("GitHub 에서 보기 (새 탭)");
      expect(elementAt(html, html.indexOf(link))).toContain('<span class="visually-hidden"> (새 탭)</span>');
    }
    // 합성 예시(GitHub 주소가 없다)에는 두지 않는다. 주소를 이름으로 만들지 않는다.
    expect(renderToStaticMarkup(<RequestAction repository={repos[0].repository} closed={null} />)).not.toContain("gh-btn");
    expect(renderToStaticMarkup(<RequestAction repository={{ ...real, htmlUrl: null }} closed={null} />)).not.toContain("gh-btn");
    // 분석 쪽 머리(제목 줄)에도 같은 단추.
    const title = renderToStaticMarkup(<AnalysisTitle repository={real} tagged={false} />);
    expect(title).toContain(link);
    expect(title.indexOf("</h1>")).toBeLessThan(title.indexOf(link));
  });

  it("요청 단추가 옮겨 가며 적는 말: 대기열의 몇 번째인지만 적고 실행 자리의 수는 적지 않는다", () => {
    const base = { kind: "moving", reused: false, failed: false } as const;
    expect(movingText({ ...base, place: { kind: "waiting", ahead: 1, poolSize: 2, inUse: 2 } })).toBe("대기열 2번째. 분석 쪽으로 갑니다.");
    expect(movingText({ ...base, place: { kind: "waiting", ahead: 0, poolSize: 2, inUse: 0, wakeFailure: "까닭" } })).toBe(
      "대기열 1번째. 실행기를 깨우지 못해 대기열이 잠시 멈춰 있습니다. 분석 쪽으로 갑니다.",
    );
    expect(movingText({ ...base, place: { kind: "dispatched", poolSize: 2, inUse: 1 } })).toBe("실행기에 보냈습니다. 분석 쪽으로 갑니다.");
    expect(movingText({ ...base, reused: true, place: null })).toBe("같은 커밋의 분석이 이미 있어 그 분석으로 갑니다.");
    for (const place of [{ kind: "waiting", ahead: 3, poolSize: 2, inUse: 2 }, { kind: "dispatched", poolSize: 2, inUse: 2 }] as const) {
      expect(movingText({ ...base, place })).not.toMatch(/실행 자리|사용 중/);
    }
  });

  it("분석 기록 표: 분석마다 그 쪽으로 가는 링크, 상태, 짧은 커밋, 요청 시각(KST). 끝난 분석의 결과 칸은 review 가 있으면 확인할 것 수, 없으면 그 까닭", () => {
    const running = find("running");
    const repository = repoOf(running);
    const list = analyses.filter((a) => a.name === repository.name);
    const html = renderToStaticMarkup(<HistoryTable repository={repository} analyses={list} />);
    for (const analysis of list) expect(html).toContain(linked(analysisHref(repository.owner, repository.name, analysis.id)));
    expect([...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1])).toEqual(["분석", "상태", "커밋", "요청 시각 (KST)", "결과"]);
    // 끝난 night-push 분석에는 review 가 없다. 규칙 검사의 발견 수는 적지 않는다(2026-11-25).
    expect(textOf(html)).toContain("검토 결과 없음");
    expect(textOf(html)).not.toMatch(/정적 검사|발견/);
    // AI 검토가 본체(2026-11-16): review 가 있으면 확인할 것 수와 review 가 정한 기능. 맡겼는데 받지 못했으면, 한도로 하지 않았으면 그렇게.
    const done = { ...find("succeeded"), id: "aaaaaaaaa1" };
    const cell = (analysis: typeof done, reviews: Record<string, ReviewFacts | null>) =>
      renderToStaticMarkup(<HistoryTable repository={repository} analyses={[analysis]} reviews={reviews} features={{ [analysis.id]: [] }} />);
    const reviewed = cell(done, { [done.id]: { check: 11, features: ["회원 가입·개인정보 수집", "로그인·본인인증", "게시판·이용자 게시물"], removed: 0 } });
    expect(textOf(reviewed)).toContain("확인할 것 11건");
    expect(textOf(reviewed)).toContain("회원 가입·개인정보 수집, 로그인·본인인증 외 1");
    // 확인할 것이 있으면 0의 뜻은 붙지 않는다.
    expect(textOf(reviewed)).not.toContain(SITE.zeroCheckIsNotClearance);
    expect(textOf(reviewed)).not.toContain("감지된 기능 없음");
    expect(textOf(cell(done, { [done.id]: { check: 0, features: [], removed: 0 } }))).toContain(`확인할 것 0건`);
    expect(textOf(cell(done, { [done.id]: { check: 0, features: [], removed: 0 } }))).toContain(SITE.zeroCheckIsNotClearance);
    expect(textOf(cell(done, { [done.id]: { check: 0, features: [], removed: 0 } }))).toContain("감지된 기능 없음");
    expect(textOf(cell({ ...done, review: "run" }, {}))).toContain("검토 결과 받지 못함");
    expect(textOf(cell({ ...done, review: "limit" }, {}))).toContain("검토 안 함");
    // AI 가 신호의 기능을 모두 뺐으면 기능이 없다고 하지 않는다.
    expect(textOf(cell(done, { [done.id]: { check: 0, features: [], removed: 2 } }))).toContain("AI 가 뺀 기능 2가지");
    // review 가 없으면 프로필의 신호만 본 것이라 기능이 없다고 하지 않는다. 보이는 수가 없으므로 0의 뜻도 없다.
    const plain = textOf(cell(done, {}));
    expect(plain).toContain("기능 신호 없음");
    expect(plain).toContain("검토 결과 없음");
    expect(plain).not.toContain("감지된 기능 없음");
    expect(plain).not.toContain(SITE.zeroCheckIsNotClearance);
    expect(textOf(html)).toContain("AI 검토 중");
    // 합성 저장소의 커밋은 링크가 아니다.
    expect(html).not.toContain("/commit/");
  });

  it("대기열: 대기 중인 분석에 대기열의 몇 번째인지만 적는다(DB 에서 센 숫자). 실행 자리의 수는 적지 않는다. 모르면 적지 않는다", () => {
    const queued = find("queued");
    const repository = repoOf(queued);
    const snapshot = { countedAt: "2026-11-03T03:04:00.000Z", poolSize: 2, inUse: 2, waiting: ["zzzzzzzzzz", queued.id], dispatched: ["yyyyyyyyyy"], wakeFailure: null };
    const place = placeOf(snapshot, queued.id);
    expect(place).toEqual({ kind: "waiting", ahead: 1, poolSize: 2, inUse: 2 });
    expect(placeText(place!)).toBe("대기열 2번째");
    expect(placeAt(place!, snapshot.countedAt)).toBe("대기열 2번째 (12:04 KST 기준)");
    // 분석 쪽은 다시 읽으므로 대기열 줄도 화면 낭독기가 읽는다(role="status"). 센 때는 적지 않는다(늘 지금 숫자다).
    const live = renderToStaticMarkup(<InProgress analysis={queued} live place={place} />);
    // (D5) 대기 중이면 지금 단계 줄이 대기열의 자리다(목업 analysis-live #queued).
    expect(live).toMatch(/<p class="live-now" role="status">대기열 2번째<\/p>/);
    expect(textOf(live)).not.toMatch(/실행 자리|사용 중|기준/);
    // 저장소 쪽의 표는 한 번 그리고 다시 읽지 않는다. 센 때(한국 표준시 시:분)를 붙인다.
    const table = textOf(renderToStaticMarkup(<HistoryTable repository={repository} analyses={[queued]} queue={snapshot} />));
    expect(table).toContain("대기열 2번째 (12:04 KST 기준)");
    expect(table).not.toMatch(/실행 자리|사용 중/);
    // 실행기에 보낸 분석.
    const sent = placeOf({ ...snapshot, waiting: [], dispatched: [queued.id] }, queued.id)!;
    expect(textOf(renderToStaticMarkup(<InProgress analysis={queued} place={sent} />))).toContain("실행기에 보냄, 시작 기다림");
    // 대기열을 모르면(합성, 읽지 못함) 숫자를 적지 않는다. 분석 중인 분석에는 대기열을 적지 않는다.
    expect(textOf(renderToStaticMarkup(<InProgress analysis={queued} />))).not.toContain("대기열");
    expect(textOf(renderToStaticMarkup(<InProgress analysis={find("running")} place={place} />))).not.toContain("대기열");
    expect(textOf(renderToStaticMarkup(<HistoryTable repository={repository} analyses={[queued]} />))).not.toContain("대기열");
  });

  it("실행기를 깨우지 못해 대기열이 멈춰 있으면 분석 쪽에 그 사실과 까닭을 적는다(실행 자리의 수는 적지 않는다)", () => {
    const text = placeText({ kind: "waiting", ahead: 0, poolSize: 2, inUse: 0, wakeFailure: "응답 404." });
    expect(text).toBe("대기열 1번째. 실행기를 깨우지 못해 대기열이 잠시 멈춰 있습니다. 까닭: 응답 404. 2분이 지난 뒤 다시 깨워 봅니다.");
  });

  it("대기열의 자리는 서버가 준 모양일 때만 읽는다", () => {
    expect(readPlace({ kind: "waiting", ahead: 0, poolSize: 2, inUse: 2 })).toEqual({ kind: "waiting", ahead: 0, poolSize: 2, inUse: 2 });
    expect(readPlace({ kind: "dispatched", poolSize: 1, inUse: 1, extra: "x" })).toEqual({ kind: "dispatched", poolSize: 1, inUse: 1 });
    expect(readPlace({ kind: "waiting", ahead: 0, poolSize: 1, inUse: 0, wakeFailure: "까닭." })).toEqual({ kind: "waiting", ahead: 0, poolSize: 1, inUse: 0, wakeFailure: "까닭." });
    expect(readPlace({ kind: "waiting", ahead: 0, poolSize: 1, inUse: 0, wakeFailure: 3 })).toEqual({ kind: "waiting", ahead: 0, poolSize: 1, inUse: 0 });
    for (const bad of [null, "x", { kind: "waiting", poolSize: 2, inUse: 1 }, { kind: "waiting", ahead: -1, poolSize: 2, inUse: 1 }, { kind: "other", poolSize: 1, inUse: 1 }, { kind: "dispatched", poolSize: 1.5, inUse: 1 }]) {
      expect(readPlace(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("분석 기록 표: 확인할 것 0건인 끝난 분석이 있으면 표 아래에 0의 뜻을 한 번 적고, 없으면 적지 않는다", () => {
    const done = find("succeeded");
    const repository = repoOf(done);
    const list = analyses.filter((a) => a.name === repository.name);
    expect(list.filter((a) => a.status === "succeeded").length).toBeGreaterThanOrEqual(2);
    const facts = (check: number) => Object.fromEntries(list.map((a) => [a.id, { check, features: [], removed: 0 }]));
    const zero = textOf(renderToStaticMarkup(<HistoryTable repository={repository} analyses={list} reviews={facts(0)} />));
    expect(zero).toContain("확인할 것 0건");
    expect(zero.split(SITE.zeroCheckIsNotClearance)).toHaveLength(2);
    expect(textOf(renderToStaticMarkup(<HistoryTable repository={repository} analyses={list} reviews={facts(3)} />))).not.toContain(
      SITE.zeroCheckIsNotClearance,
    );
  });

  it("분석 기록 표: review 가 없거나 읽지 못한 끝난 분석은 0건이라고 적지 않는다", () => {
    const done = find("succeeded");
    const repository = repoOf(done);
    const list = analyses.filter((a) => a.name === repository.name);
    for (const reviews of [{}, Object.fromEntries(list.map((a) => [a.id, null]))]) {
      const text = textOf(renderToStaticMarkup(<HistoryTable repository={repository} analyses={list} reviews={reviews} />));
      expect(text).not.toContain("0건");
      expect(text).toContain("검토 결과 없음");
      expect(text).not.toContain(SITE.zeroCheckIsNotClearance);
    }
  });

  it("분석 기록 표: 대기열의 자리를 모르는 대기 중인 분석은 배지만 적는다('대기 중 대기 중'이 되지 않는다)", () => {
    const queued = find("queued");
    const html = renderToStaticMarkup(<HistoryTable repository={repoOf(queued)} analyses={[queued]} queue={null} />);
    expect(textOf(html).match(/대기 중/g)).toHaveLength(1);
    expect(html).not.toContain("an-row-note");
  });

  it("분석 기록 표: 단계 사이에 있는 분석 중인 분석을 '대기 중'이라고 적지 않는다", () => {
    const running = find("running");
    const between: Analysis = {
      ...running,
      steps: running.steps.map((step) => (step.name === "scan" ? { ...step, startedAt: null, endedAt: null } : step)),
    };
    expect(activeStep(between)).toBeNull();
    const text = textOf(renderToStaticMarkup(<HistoryTable repository={repoOf(running)} analyses={[between]} />));
    expect(text).not.toContain("대기 중");
    expect(text).toContain("다음 단계 기다림");
  });

  it("실패한 단계에 끝난 시각이 없으면 멈춘 시각과 걸린 시간을 적지 않는다", () => {
    const failed = find("failed");
    const open: Analysis = {
      ...failed,
      steps: failed.steps.map((step) => (step.name === failed.failure!.step ? { ...step, endedAt: null } : step)),
    };
    expect(finishedAt(failed)).not.toBeNull();
    expect(finishedAt(open)).toBeNull();
  });

  it("실패한 분석에서 시작하지 않은 단계는 '하지 않음'이고 '기다림'이 없다. 대기 중인 분석의 대기 단계는 '대기 중'이다", () => {
    const failed = find("failed");
    const failedText = textOf(renderToStaticMarkup(<StepList analysis={failed} />));
    expect(failedText).not.toContain("기다림");
    expect(failedText).toContain("하지 않음");
    const queued = find("queued");
    const html = renderToStaticMarkup(<StepList analysis={queued} />);
    expect(html).toMatch(/aria-current="step"[^]*?<span class="step-name">대기<\/span><span class="step-time">[^]*?<\/span><span class="step-state">대기 중<\/span>/);
    expect(textOf(html)).not.toContain("진행 중");
  });

  it("검색 결과의 한 줄: 줄 전체가 저장소 쪽 링크이고, 언어·분석 수·최근 분석 날짜. 분석된 적이 없는 저장소는 그렇다고 적는다", () => {
    const none = repos.find((hit) => hit.analyses === 0)!;
    expect(textOf(renderToStaticMarkup(<RepoRow hit={none} />))).toContain("분석된 적 없음");
    const some = repos.find((hit) => hit.analyses >= 2)!;
    const html = renderToStaticMarkup(<RepoRow hit={some} />);
    expect(html).toContain(linked(repoHref(some.repository.owner, some.repository.name)));
    expect(textOf(html)).toContain(`분석 ${some.analyses}회`);
    expect(textOf(html)).toContain(`최근 ${formatKst(some.latest!.requestedAt).slice(0, 10)}`);
    // 줄 안에 링크가 하나뿐이다(분석 id 로 가는 링크를 겹쳐 두지 않는다). 합성 예시 이름표는 줄이 아니라 목록의 머리에 단다.
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain('class="tag"');
  });
});

describe("대시보드", () => {
  // 분석 쪽의 결과(src/components/service/AnalysisDashboard.tsx). review 가 있으면 review 화면, 없으면 프로필의 두 단과 셋째 단의 까닭.
  // 2026-11-25 오너 지시로 규칙 검사의 결과(정책 상자, 발견 줄, 판정자)는 보이지 않는다.
  const heads = (html: string) => elementsOf(html, '<h2 class="tier-hd"').map(textOf);
  const notes = (html: string) => elementsOf(html, '<p class="tier-none">').map(textOf);
  const STATIC = /정적 검사|사람이 볼 곳|판정자|AI 가 푼 경고|발견/;

  it("review 가 있으면 review 화면(요약 → 의무 체크리스트 → 하는 일 → 흐름 → 검증 정보)이고 그 아래에 진행 기록을 둔다. 검토가 없다는 말은 없다", () => {
    const progress = <details className="an-progress-test" />;
    const links = { markdown: "/api/analyses/4qqa6fdx2h/checklist/", print: "/r/example-studio/genai-chat/a/4qqa6fdx2h/checklist/" };
    const html = renderToStaticMarkup(
      <AnalysisDashboard code={null} review={syntheticReview} profile={profileOf("genai-chat.main")} reviewPlan="run" progress={progress} exportLinks={links} />,
    );
    // review 화면 그대로다(프로필의 단을 따로 그리지 않는다).
    expect(html).toContain('<div class="tiers review">');
    expect(heads(html)).toEqual(heads(renderToStaticMarkup(<ReviewView review={syntheticReview} code={null} />)));
    expect(heads(html)).not.toContain("2걸리는 의무");
    expect(html.indexOf('<div class="tiers review">')).toBeLessThan(html.indexOf("an-progress-test"));
    for (const note of [SITE.service.reviewMissing, SITE.service.reviewLimit, SITE.service.reviewNone]) expect(textOf(html)).not.toContain(note);
    expect(html).toContain(`href="${links.markdown}"`);
    expect(html).toContain(linked(links.print));
    expect(textOf(html)).not.toMatch(/정적 검사|사람이 볼 곳|판정자/);
  });

  it("review 가 없으면 세 단: 1·2단은 CLI 의 저장소 프로필이고 없으면 '아직 없음', 3단 '의무 체크리스트'에는 검토가 없는 까닭. 서비스 기능이 없으면 그렇게 답한다", () => {
    const none = renderToStaticMarkup(<AnalysisDashboard code={null} />);
    expect(heads(none)).toEqual(["1프로필", "2걸리는 의무", "3의무 체크리스트"]);
    expect(notes(none)).toEqual(["아직 없음", "아직 없음", SITE.service.reviewNone]);
    // 프로필이 없으면 맨 위 한 줄도 없다.
    expect(none).not.toContain('<p class="overview">');
    expect(textOf(none)).not.toMatch(STATIC);

    const push = profileOf("night-push.main");
    const html = renderToStaticMarkup(<AnalysisDashboard code={null} profile={push} />);
    expect(heads(html)).toEqual(heads(none));
    expect(textOf(elementsOf(html, '<p class="overview">')[0])).toBe(`감지된 기능 ${push.features.length}가지 걸릴 수 있는 의무 ${push.totals.duties}개`);
    expect(textOf(html)).toContain(NO_JUDGEMENT);
    // 기능마다 의무의 수만 보이고, 목록은 접혀 있다.
    for (const feature of push.features) expect(textOf(html)).toContain(`${feature.name} 걸릴 수 있는 의무 ${feature.duties.count}개`);
    const at = html.indexOf('<ul class="ob-list">');
    expect(closedDetailsAt(html, at)).toEqual(['<details class="ob">']);
    // 처분의 말이 든 의무 한 줄은 싣지 않는다(법·조문·링크만).
    expect(textOf(html)).not.toMatch(/\u{ACFC}\u{C9D5}\u{AE08}|\u{ACFC}\u{D0DC}\u{B8CC}/u);
    expect(textOf(html)).not.toMatch(STATIC);
    // 사이트가 쓴 말만 본다(프로필의 의무 글은 CLI 가 낸 그대로라 법에 적힌 말이 들어 있다).
    expectNoBannedWording(none);
    // 저장소 주소가 없으면(합성 저장소) 근거 줄에 GitHub 링크가 없다.
    expect(html).not.toContain('class="gh"');

    const plain = renderToStaticMarkup(<AnalysisDashboard code={null} profile={profileOf("plain.main")} />);
    expect(textOf(plain)).toContain(NO_FEATURES);
    // 신호만 본 프로필이 아무것도 찾지 못한 것은 기능·의무가 없다는 뜻이 아니다(2026-11-16): 요약 줄과 2단도 신호의 말로.
    expect(notes(plain)).toEqual(["기능 신호가 없어 고르지 않았습니다.", SITE.service.reviewNone]);
    expect(textOf(elementsOf(plain, '<p class="overview">')[0])).toBe("기능 신호 없음");
    expect(textOf(plain)).not.toContain("감지된 기능 0가지");
  });

  it("셋째 단의 까닭: 하루 검토 한도(지난날이면 그날), 맡겼는데 받지 못함, 그 밖(저장된 review 를 쓰는데 없음, 스위치 꺼짐)은 검토 결과 없음", () => {
    const push = profileOf("night-push.main");
    const third = (props: { reviewPlan?: Analysis["review"]; limitDay?: string | null }) =>
      notes(renderToStaticMarkup(<AnalysisDashboard code={null} profile={push} {...props} />)).at(-1);
    expect(third({ reviewPlan: "limit" })).toBe(SITE.service.reviewLimit);
    // 지난날의 분석이면 "오늘"이라고 적지 않고 그날을 적는다.
    expect(third({ reviewPlan: "limit", limitDay: "2026-11-12" })).toBe("2026-11-12 검토 한도가 차서 검토하지 않았습니다.");
    expect(third({ reviewPlan: "run" })).toBe(SITE.service.reviewMissing);
    expect(third({ reviewPlan: "stored" })).toBe(SITE.service.reviewNone);
    expect(third({})).toBe(SITE.service.reviewNone);
    const limited = renderToStaticMarkup(<AnalysisDashboard code={null} profile={push} reviewPlan="limit" />);
    expect(heads(limited)).toEqual(["1프로필", "2걸리는 의무", "3의무 체크리스트"]);
  });

  it("저장소 주소가 있으면 프로필의 근거 줄마다 커밋 고정 링크를 새 창으로 걸고, 새 창과 고정한 커밋을 화면 낭독기에 알린다", () => {
    const push = profileOf("night-push.main");
    const base = ["https:", "", "github.com", "someone", "night-push"].join("/");
    const commit = "b".repeat(40);
    const html = renderToStaticMarkup(<AnalysisDashboard code={{ htmlUrl: base, commit }} profile={push} />);
    const links = [
      ...html.matchAll(
        /<a class="gh" href="([^"]+)" target="_blank" rel="noopener noreferrer">[^]*?<span class="visually-hidden">\(GitHub, 새 창, 커밋 bbbbbbb 에 고정\)<\/span><\/a>/g,
      ),
    ].map((m) => m[1]);
    const evidence = [...push.features, ...push.testOnly].flatMap((entry) => entry.evidence);
    expect(evidence.length).toBeGreaterThan(0);
    expect(links).toHaveLength(evidence.length);
    for (const [i, link] of links.entries()) expect(link).toBe(fileLink(base, commit, evidence[i].file, evidence[i].line));
  });
});

/** 합성 저장소의 Repository 가 모양을 지킨다(타입이 바뀌면 여기서 드러난다). */
const _shape: Repository = repos[0].repository;
void _shape;

describe("검색 쪽이 되뇌는 검색어 (검토 1)", () => {
  it("글은 ‘검색어’에 맞는 저장소 없음 그대로이고, 검색어는 줄을 바꿀 수 있는 조각, 마지막 글자와 ’에 만 묶는다", () => {
    const query = "a".repeat(60);
    const html = renderToStaticMarkup(<SearchResults query={query} outcome={{ ok: true, hits: [], total: 0 }} tagged={false} fakeGitHub={false} />);
    const count = html.match(/<h2 class="empty-head search-count"[^>]*>(.*?)<\/h2>/)![1];
    expect(count).toBe(`‘<span class="search-q">${"a".repeat(59)}</span><span class="nobreak">a’에</span> 맞는 저장소 없음`);
    // 검색어 전체가 줄을 바꾸지 않는 조각 안에 들어가지 않는다.
    expect(html).not.toContain(`<span class="nobreak">‘${query}`);
  });
});

describe("검색 0건 (docs/redesign.md 3장 '검색')", () => {
  const zero = (query: string, options: { fakeGitHub?: boolean; tagged?: boolean } = {}) =>
    renderToStaticMarkup(
      <SearchResults
        query={query}
        outcome={{ ok: true, hits: [], total: 0 }}
        tagged={options.tagged ?? false}
        fakeGitHub={options.fakeGitHub ?? false}
        analyzed={{ ok: true, rows: [] }}
      />,
    );

  it("한글만 친 질의에는 같은 글쇠의 영문으로 찾는 링크를 둔다. 영문이 섞이면 두지 않는다", () => {
    const html = zero("ㅁㅁ");
    expect(textOf(html)).toContain("‘ㅁㅁ’에 맞는 저장소 없음");
    expect(textOf(html)).toContain("영문 자판으로 친 ‘aa’로 찾기");
    expect(html).toMatch(/href="\/search\/?\?q=aa"/);
    expect(textOf(zero("kids ㅁ"))).not.toContain("영문 자판");
    expect(textOf(zero("zzzz"))).not.toContain("영문 자판");
  });

  it("로컬 가짜 GitHub 이면 그 사실을 한 줄로 적고(저장소 수는 적지 않는다), 아니면 적지 않는다", () => {
    expect(textOf(zero("zzzz", { fakeGitHub: true }))).toContain("로컬 가짜 GitHub: 합성 저장소만 찾습니다.");
    expect(textOf(zero("zzzz"))).not.toContain("가짜 GitHub");
    // 긴 합성 문장은 쓰지 않는다. 이름표다.
    expect(textOf(zero("zzzz", { tagged: true }))).not.toContain("합성 예시입니다");
  });

  it("그 아래에 이 사이트에서 분석된 저장소를 둔다. 끝난 분석은 review 의 확인할 것 수, 없으면 그 까닭. 확인할 것 0건이 보이면 0의 뜻을 둔다", async () => {
    const rows = await store.recentActivity(20);
    const reviews = await store.reviewFacts(rows.map(({ analysis }) => analysis.id));
    const render = (facts: Record<string, ReviewFacts | null>) =>
      renderToStaticMarkup(<SearchResults query="zzzz" outcome={{ ok: true, hits: [], total: 0 }} tagged fakeGitHub={false} analyzed={{ ok: true, rows, reviews: facts }} />);
    const html = render(reviews);
    const text = textOf(html);
    expect(text).toContain("이 사이트에서 분석된 저장소");
    expect(text).toContain("합성 예시");
    for (const { repository: r } of rows) expect(html).toContain(linked(repoHref(r.owner, r.name)));
    // 생성형 AI 채팅 합성 저장소만 review 가 있다(확인할 것 8건). 나머지 끝난 분석은 검토 결과가 없다.
    const reviewed = rows.find(({ analysis }) => reviews[analysis.id])!;
    expect(reviewed.repository.name).toBe("genai-chat");
    expect(text).toContain(`확인할 것 ${reviews[reviewed.analysis.id]!.check}건`);
    expect(text).toContain("검토 결과 없음");
    expect(text).not.toMatch(/정적 검사|발견/);
    expect(text).not.toContain(SITE.zeroCheckIsNotClearance);
    expect(textOf(render({ ...reviews, [reviewed.analysis.id]: { ...reviews[reviewed.analysis.id]!, check: 0 } }))).toContain(SITE.zeroCheckIsNotClearance);
  });

  it("결과가 있으면 결과 머리에 합성 예시 이름표를 단다(서버가 정한 tagged 일 때만)", () => {
    const hits = repos.filter((hit) => hit.repository.name.includes("kids"));
    expect(hits.length).toBeGreaterThan(0);
    const render = (tagged: boolean) =>
      renderToStaticMarkup(<SearchResults query="kids" outcome={{ ok: true, hits, total: hits.length }} tagged={tagged} fakeGitHub={false} />);
    expect(render(true)).toMatch(/<div class="sec-h">[^]*?<span class="tag">합성 예시<\/span>/);
    expect(render(false)).not.toContain('class="tag"');
    // 쪽 제목은 검색창과 같은 단 안에 있다(목업 search: 제목과 검색창 사이 16px).
    expect(render(false)).toMatch(/^<div class="search-page"><h1>저장소 검색<\/h1><form/);
  });

  it("GitHub 에 묻지 못하면 그 까닭을 그대로 적는다", () => {
    const html = renderToStaticMarkup(<SearchResults query="kids" outcome={{ ok: false, message: "상한(시험)." }} tagged={false} fakeGitHub={false} />);
    // 제목(‘kids’ 검색하지 못함)이 이미 말하므로 '검색하지 못했습니다.'를 되풀이하지 않는다(D4 검토).
    expect(textOf(html)).toContain("검색하지 못함");
    expect(textOf(html)).toContain("상한(시험).");
    expect(textOf(html)).not.toContain("검색하지 못했습니다");
  });
});

describe("조문 이름의 줄 바꿈", () => {
  it("끝의 조·항(·호)만 줄을 바꾸지 않는 조각으로 묶고 글자는 그대로다", () => {
    for (const label of [
      "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 제31조 제1항",
      "정보통신망 이용촉진 및 정보보호 등에 관한 법률 제50조 제3항",
      "개인정보 보호법 제22조의2 제1항",
      "청소년 보호법 제16조",
      "전자상거래 등에서의 소비자보호에 관한 법률 제21조 제1항 제1호",
    ]) {
      const html = renderToStaticMarkup(<>{keepArticle(label)}</>);
      expect(textOf(html)).toBe(label);
      expect(html).toMatch(/<span class="nobreak">제\d+조(의\d+)?( 제\d+항)?( 제\d+호)?<\/span>$/);
    }
    expect(renderToStaticMarkup(<>{keepArticle("개인정보 보호법 제22조의2 제1항")}</>)).toBe('개인정보 보호법 <span class="nobreak">제22조의2 제1항</span>');
    expect(keepArticle("조문 없음")).toBe("조문 없음");
  });
});

describe("영문 자판으로 옮기기 (두벌식 → QWERTY)", () => {
  it.each([
    ["ㅁㅁ", "aa"],
    ["한글", "gksrmf"],
    ["ㅏ", "k"],
    ["까치", "Rkcl"],
    ["얘기", "dOrl"],
    ["값", "rkqt"],
    ["닭", "ekfr"],
    ["와", "dhk"],
    ["뷁", "qnpfr"],
    ["의사", "dmltk"],
    ["ㄳ ㅘ", "rt hk"],
    ["ㅃ", "Q"],
  ])("%s → %s", (input, output) => {
    expect(hangulToQwerty(input)).toBe(output);
  });

  it("한글이 아닌 글자가 섞이거나 한글이 없으면 옮기지 않는다", () => {
    for (const input of ["", "  ", "kids", "kids ㅁ", "ㅁ1", "日本", "ㅁ-ㅁ"]) expect(hangulToQwerty(input), input).toBeNull();
  });
});

describe("최근 분석 고르기 (첫 화면의 줄)", () => {
  const at = (minute: number) => new Date(Date.parse("2026-11-03T00:00:00Z") + minute * 60_000).toISOString();
  const make = (id: string, repo: string, status: Analysis["status"], minute: number): Analysis => ({
    ...find("succeeded"),
    id,
    owner: repo.split("/")[0],
    name: repo.split("/")[1],
    status,
    requestedAt: at(minute),
    failure: status === "failed" ? { step: "fetch", reason: "시험" } : null,
  });

  it("저장소마다 한 줄, 진행 중인 분석이 먼저, 그다음 가장 나중의 분석. 대소문자만 다른 이름은 한 저장소다. 요청 시각 차례", () => {
    const list = [
      make("aaaaaaaaa1", "Org/One", "succeeded", 10),
      make("aaaaaaaaa2", "org/one", "running", 5),
      make("aaaaaaaaa3", "org/two", "failed", 7),
      make("aaaaaaaaa4", "org/two", "succeeded", 3),
      make("aaaaaaaaa5", "org/three", "queued", 1),
      make("aaaaaaaaa6", "org/three", "running", 2),
      make("aaaaaaaaa7", "org/four", "succeeded", 9),
    ];
    const picked = pickActivity(list, 10);
    expect(picked.map(({ analysis }) => analysis.id)).toEqual(["aaaaaaaaa7", "aaaaaaaaa3", "aaaaaaaaa2", "aaaaaaaaa6"]);
    expect(picked.map(({ analyses }) => analyses)).toEqual([1, 2, 2, 2]);
    // 보이는 분석이 앞의 것이어도 가장 나중의 요청 시각을 따로 안다.
    expect(picked[2].latestAt).toBe(at(10));
    expect(pickActivity(list, 2).map(({ analysis }) => analysis.id)).toEqual(["aaaaaaaaa7", "aaaaaaaaa3"]);
  });
});

describe("첫 화면·검색 빈 상태의 최근 분석 줄", () => {
  it("줄은 분석 쪽 링크이고, 끝난 분석은 review 의 '확인할 것' 수(없으면 그 까닭, 화면 낭독기에는 '끝남, '), 나머지는 상태 글. 분석 중이면 단계 점과 지금 단계", async () => {
    const rows = await store.recentActivity(10);
    const ids = rows.map(({ analysis }) => analysis.id);
    const reviews = await store.reviewFacts(ids);
    const features = await store.featureNames(ids);
    const checks = Object.fromEntries(Object.entries(reviews).map(([id, facts]) => [id, facts?.check ?? null]));
    const html = renderToStaticMarkup(<ActivityList rows={rows} reviews={reviews} features={features} variant="feed" />);
    for (const { repository: r, analysis } of rows) expect(html).toContain(linked(analysisHref(r.owner, r.name, analysis.id)));
    // AI 검토가 본체(2026-11-15): review 가 있는 저장소(생성형 AI 채팅 합성)는 체크리스트의 확인할 것 수, 없으면 검토 결과가 없다는 말.
    const reviewed = rows.find(({ analysis }) => analysis.status === "succeeded" && typeof checks[analysis.id] === "number")!;
    const review = (await store.getReview(reviewed.analysis.owner, reviewed.analysis.name, reviewed.analysis.commit))!;
    expect(checks[reviewed.analysis.id]).toBe(checklistDoc(review).overview.check);
    expect(html).toContain(`<span class="visually-hidden">끝남, </span>확인할 것 ${checks[reviewed.analysis.id]}건`);
    expect(html).toContain('<span class="visually-hidden">끝남, </span>검토 결과 없음');
    expect(Object.values(checks).filter((n) => n !== null)).toHaveLength(1);
    expect(textOf(html)).toContain("분석 중");
    expect(textOf(html)).toContain("대기 중");
    expect(html.match(/class="act-trail"/g)).toHaveLength(1);
    expect(textOf(html)).toContain("AI 검토");
    expect(textOf(html)).not.toMatch(/정적 검사|발견/);
    expect(textOf(html)).not.toContain(SITE.zeroCheckIsNotClearance);
  });

  it("단계 사이의 분석 중인 줄은 '다음 단계 기다림'이고, review 가 없는 끝난 줄은 0이 아니라 그 까닭이다", async () => {
    const [row] = (await store.recentActivity(10)).filter(({ analysis }) => analysis.status === "running");
    const between = { ...row, analysis: { ...row.analysis, steps: row.analysis.steps.map((step) => (step.name === "scan" ? { ...step, startedAt: null } : step)) } };
    expect(textOf(renderToStaticMarkup(<ActivityList rows={[between]} variant="feed" />))).toContain("다음 단계 기다림");
    const done = (await store.recentActivity(10)).find(({ analysis }) => analysis.status === "succeeded")!;
    for (const [plan, said] of [
      [undefined, "검토 결과 없음"],
      ["run", "검토 결과 받지 못함"],
      ["limit", "검토 안 함"],
    ] as const) {
      const text = textOf(renderToStaticMarkup(<ActivityList rows={[{ ...done, analysis: { ...done.analysis, review: plan } }]} reviews={{ [done.analysis.id]: null }} variant="box" />));
      expect(text, String(plan)).toContain(said);
      expect(text).not.toContain("0건");
      expect(text).not.toContain(SITE.zeroCheckIsNotClearance);
    }
  });

  it("검색 빈 상태: 최근 분석 상자, AI 검토가 묻는 의무(기능마다 의무 수, 조문 도감을 그 기능으로 거른 링크). 분석이 없으면 '아직 분석 없음'", async () => {
    const rows = await store.recentActivity(8);
    const reviews = await store.reviewFacts(rows.map(({ analysis }) => analysis.id));
    const html = renderToStaticMarkup(<SearchHome recent={{ ok: true, rows, reviews }} tagged />);
    expect(html.match(/class="pol-row pol-feat"/g)).toHaveLength(dutyMap.features.length);
    // 부품 시험에는 trailingSlash 가 걸리지 않아 Link 가 '/policy?f=' 로 적는다. 빌드된 쪽은 '/policy/?f=' 다.
    for (const feature of dutyMap.features) expect(html).toContain(`href="${dutyFeatureHref(feature.id).replace("/?", "?")}"`);
    expect(textOf(html)).toContain(`AI 검토가 묻는 의무 ${dutyMap.asked}`);
    expect(dutyMap.features.reduce((n, feature) => n + dutyMap.duties.filter((duty) => duty.feature === feature.id).length, 0)).toBe(dutyMap.asked);
    // 정적 규칙의 정책 목록은 곁칸에 두지 않는다(2026-11-15. 2026-11-25 부터 규칙 검사 자체가 없다).
    expect(textOf(html)).not.toContain("검사하는 정책");
    expect(textOf(html)).toContain("확인할 것 8건");
    expect(textOf(html)).not.toMatch(/정적 검사|발견/);
    expect(textOf(html)).toContain("합성 예시");
    const empty = textOf(renderToStaticMarkup(<SearchHome recent={{ ok: true, rows: [] }} tagged={false} />));
    expect(empty).toContain("아직 분석 없음");
    expect(empty).not.toContain("합성 예시");
    const down = textOf(renderToStaticMarkup(<SearchHome recent={{ ok: false, message: "DB(시험)." }} tagged={false} />));
    expect(down).toContain("DB(시험).");
  });
});

describe("저장소 쪽의 최신 분석 상자", () => {
  const done = (id: string) => analyses.find((a) => a.id === id)!;

  it("review 가 있으면(2026-11-16 오너 지시): 확인할 것 N건, 기능은 review 가 정한 것, 0의 뜻은 확인할 것이 0일 때만. 규칙 검사의 줄은 없다(2026-11-25)", () => {
    const analysis = done("w7bc479x2u");
    const render = (review: { check: number; features: string[]; removed?: number } | null, a: Analysis = analysis, features: string[] | null = []) =>
      textOf(renderToStaticMarkup(<LatestAnalysis repository={repoOf(a)} analysis={a} features={features} review={review && { removed: 0, ...review }} />));
    const text = render({ check: 11, features: ["회원 가입·개인정보 수집", "로그인·본인인증"] });
    expect(text).toContain("확인할 것 11건");
    expect(text).not.toMatch(/정적 검사|사람이 볼 곳|AI 가 푼 경고|빠진 판정|발견/);
    expect(text).not.toContain(SITE.zeroCheckIsNotClearance);
    expect(text).toContain("회원 가입·개인정보 수집, 로그인·본인인증");
    expect(text).not.toContain("감지된 기능 없음");
    expect(render({ check: 0, features: [] })).toContain(SITE.zeroCheckIsNotClearance);
    // review 가 없으면 그 까닭(검토 결과 없음, 맡겼는데 받지 못함, 한도로 하지 않음). 보이는 수가 없으므로 0의 뜻도 없다.
    for (const [plan, said] of [
      [undefined, "검토 결과 없음"],
      ["run", "검토 결과 받지 못함"],
      ["limit", "검토 안 함"],
    ] as const) {
      const none = render(null, { ...analysis, review: plan });
      expect(none, String(plan)).toContain(said);
      expect(none).not.toContain("0건");
      expect(none).not.toContain(SITE.zeroCheckIsNotClearance);
    }
    // 기능 줄: review 가 없으면 프로필의 기능. 비었거나 모르면 줄을 두지 않는다.
    expect(render(null, analysis, ["가", "나", "다"])).toContain("가, 나 외 1");
    for (const features of [[], null]) {
      expect(renderToStaticMarkup(<LatestAnalysis repository={repoOf(analysis)} analysis={analysis} features={features} />)).not.toContain("latest-feat");
    }
  });

  it("머리 줄: 배지, id, 커밋, 시각 KST, 걸린 시간(단계의 시각에서), 결과 보기", () => {
    const analysis = done("64y4jdtazh");
    const html = renderToStaticMarkup(<LatestAnalysis repository={repoOf(analysis)} analysis={analysis} />);
    const text = textOf(html);
    expect(text).toContain("최신 분석");
    expect(text).toContain("끝남");
    expect(text).toContain(analysis.id);
    expect(text).toContain(shortCommit(analysis.commit));
    expect(text).toContain(`${formatKst(analysis.requestedAt)} KST`);
    expect(text).toContain(`걸린 시간 ${duration(analysis.steps[0].startedAt!, finishedAt(analysis)!)}`);
    expect(text).toContain("검토 결과 없음");
    expect(html).toContain(linked(analysisHref(analysis.owner, analysis.name, analysis.id)));
    expect(text).toContain("결과 보기");
    expect(html).not.toMatch(/\stitle="/);
    expect(text).not.toMatch(/정적 검사|사람이 볼 곳|AI 가 푼 경고|발견/);
  });
});
