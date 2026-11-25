import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseReview, parseReviewText, reviewFactsOf } from "@/lib/review";
import { PRERUNS, prerunOf } from "@/lib/service/prerun";
import { STEP_ORDER } from "@/lib/service/steps";
import { readConfig } from "@/server/config";
import { openDatabase, type Database } from "@/server/db";
import { seedPreruns } from "@/server/db/seed";
import { createGitHub } from "@/server/github";
import { storedReviewExists } from "@/server/queue";
import { createDbStore } from "@/server/store/db";
import { createGitHubStub } from "../scripts/github-stub.mjs";
import { readJson } from "./helpers";

// 미리 돌린 분석 넣기(src/server/db/seed.ts, 2026-11-25 오너 지시). 운영에서는 getDatabase 가 실제 GitHub 에 묻는 서버에서만 부른다.
// 여기서는 메모리의 PGlite 를 openDatabase 로 열어 직접 부른다(openDatabase 는 넣지 않는다). GitHub 은 가짜다(읽기에 부르지 않는다).

const ID = "jbtk24nv7q";
const OWNER = "Vactor0911";
const REPO = "jobtalk";
const COMMIT = "bbfb3ab14534907ff4618c563ff92a6354da97a1";

let db: Database;
beforeAll(async () => {
  db = await openDatabase({ databaseUrl: null, pgliteDir: "memory://" });
});
afterAll(async () => {
  await db?.close();
});

function storeOf(database: Database) {
  const stub = createGitHubStub({ origin: "http://stub.test" });
  const config = readConfig({ GITHUB_API_BASE: "http://stub.test" });
  return createDbStore({
    db: async () => database,
    github: createGitHub({ apiBase: "http://stub.test", token: null, searchCacheSeconds: 60, repoCacheSeconds: 300, fetch: stub.fetch as typeof fetch }),
    config: { ...config, runner: { ...config.runner, kind: "local" as const } },
  });
}

describe("미리 돌린 분석 넣기 (seedPreruns)", () => {
  it("openDatabase 만으로는 넣지 않는다(시험·로컬 미리보기의 DB 는 비어 있다)", async () => {
    const rows = await db.query("SELECT id FROM analyses");
    expect(rows.rows).toEqual([]);
  });

  it("두 번 불러도 한 번만 넣는다. 끝난 분석 하나와 그 review 를 실행기 콜백이 두는 것과 같은 꼴로 둔다", async () => {
    await seedPreruns(db);
    await seedPreruns(db);
    const rows = await db.query<{
      id: string;
      owner: string;
      repo: string;
      repo_key: string;
      commit_sha: string;
      status: string;
      tool_version: string | null;
      pack_digest: string | null;
      finding_count: number | null;
      review_plan: string | null;
      dispatched_at: Date | null;
      runner_run_id: string | null;
    }>("SELECT id, owner, repo, repo_key, commit_sha, status, tool_version, pack_digest, finding_count, review_plan, dispatched_at, runner_run_id FROM analyses");
    expect(rows.rows).toEqual([
      {
        id: ID,
        owner: OWNER,
        repo: REPO,
        repo_key: "vactor0911/jobtalk",
        commit_sha: COMMIT,
        status: "succeeded",
        tool_version: "0.3.0.dev0",
        // 규칙 검사를 돌리지 않았으므로 팩 판과 발견 수는 없다. 실행기를 거치지 않았으므로 보낸 때·실행 기록도 없다(하루 한도에 세지 않는다).
        pack_digest: null,
        finding_count: null,
        review_plan: null,
        dispatched_at: null,
        runner_run_id: null,
      },
    ]);
    // 결과 행: 규칙 검사의 결과 칸과 프로필은 비고, review 는 CLI 가 낸 그대로(data/analyses/)다.
    const results = await db.query<{ analysis_id: string; json: string | null; profile: string | null; review: string | null }>(
      "SELECT analysis_id, json, profile, review FROM results",
    );
    expect(results.rows).toHaveLength(1);
    const [result] = results.rows;
    expect(result).toMatchObject({ analysis_id: ID, json: null, profile: null });
    expect(JSON.parse(result.review!)).toEqual(readJson("data", "analyses", "vactor0911-jobtalk-bbfb3ab.review.json"));
    expect(parseReviewText(result.review)).not.toBeNull();
    const marks = await db.query<{ name: string }>("SELECT name FROM schema_migrations WHERE name LIKE 'seed:%'");
    expect(marks.rows).toEqual([{ name: `seed:${ID}` }]);
  });

  it("DB 저장소 구현이 그 분석과 review 를 읽는다: 단계는 모두 끝났고, 같은 커밋의 review 로 읽히며 목록 줄의 수도 그것에서 센다", async () => {
    const store = storeOf(db);
    const review = parseReviewText((await db.query<{ review: string }>("SELECT review FROM results WHERE analysis_id = $1", [ID])).rows[0].review)!;
    expect(review).not.toBeNull();
    expect(await store.getReview(OWNER, REPO, COMMIT)).toEqual(review);
    // 대소문자를 가리지 않는다(repo_key).
    expect(await store.getReview("vactor0911", "JOBTALK", COMMIT)).toEqual(review);
    expect(await store.reviewFacts([ID])).toEqual({ [ID]: reviewFactsOf(review) });
    expect(await store.getProfile(ID)).toBeNull();
    const analysis = (await store.findAnalysis(ID))!;
    expect(analysis).toMatchObject({ id: ID, owner: OWNER, name: REPO, commit: COMMIT, branch: "main", status: "succeeded", failure: null });
    expect(analysis.steps.map((step) => step.name)).toEqual(STEP_ORDER);
    expect(analysis.steps.every((step) => step.startedAt !== null && step.endedAt !== null)).toBe(true);
    const run = prerunOf(ID)!;
    expect(analysis.requestedAt).toBe(new Date(run.startedAt).toISOString());
    expect(Date.parse(analysis.steps.find((step) => step.name === "finish")!.endedAt!)).toBe(Date.parse(run.finishedAt));
    expect((await store.listAnalyses(OWNER, REPO)).map((a) => a.id)).toEqual([ID]);
    // 같은 커밋의 저장된 review 가 있으므로 그 커밋을 다시 분석하면 review 를 맡기지 않는다(대기열이 보는 것).
    expect(await storedReviewExists(db, "vactor0911/jobtalk", COMMIT)).toBe(true);
  });

  it("넣은 표시가 있으면 그 분석을 지웠어도 다시 넣지 않는다", async () => {
    await db.query("DELETE FROM results WHERE analysis_id = $1", [ID]);
    await db.query("DELETE FROM analyses WHERE id = $1", [ID]);
    await seedPreruns(db);
    expect((await db.query("SELECT id FROM analyses")).rows).toEqual([]);
  });

  it("미리 돌린 분석의 기록은 하나이고, 그 review 는 2판으로 읽힌다", () => {
    expect(PRERUNS.map((run) => run.id)).toEqual([ID]);
    expect(parseReview(PRERUNS[0].review)).not.toBeNull();
    expect(prerunOf("zzzzzzzzzz")).toBeNull();
  });
});
