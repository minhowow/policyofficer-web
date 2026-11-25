import "server-only";
import { PRERUNS } from "@/lib/service/prerun";
import type { Database } from "./index";

/**
 * 미리 돌린 분석(`lib/service/prerun.ts`)을 분석 기록으로 넣는다(2026-11-25 오너 지시). 실제 GitHub 에 묻는 서버에서만 부른다
 * (`getDatabase`. 시험의 DB, 로컬 미리보기, 가짜 GitHub 에는 넣지 않는다: 그곳의 저장소는 합성이다). 한 번만 넣는다: 넣은 표시를
 * `schema_migrations` 에 `seed:<id>` 로 남기고, 표시가 있으면(지웠더라도) 다시 넣지 않는다. 결과 JSON 은 실행기 콜백이 두는 것과 같은
 * 꼴(한 줄 JSON)이다. 단계의 시각은 돌린 때 하나로 채운다(queued·fetch 는 0초, 검사 단계가 돌린 시간). 실행기를 거치지 않았으므로
 * 실행 기록(runner_run_*)과 보낸 때(dispatched_at)는 비운다(하루 review 한도에 세지 않는다).
 */
export async function seedPreruns(db: Database): Promise<void> {
  for (const run of PRERUNS) {
    const mark = `seed:${run.id}`;
    await db.transaction(async (tx) => {
      const done = await tx.query("SELECT 1 FROM schema_migrations WHERE name = $1", [mark]);
      if (done.rows.length > 0) return;
      const steps = [
        { name: "queued", startedAt: run.startedAt, endedAt: run.startedAt },
        { name: "fetch", startedAt: run.startedAt, endedAt: run.startedAt },
        { name: "scan", startedAt: run.startedAt, endedAt: run.finishedAt },
        { name: "finish", startedAt: run.finishedAt, endedAt: run.finishedAt },
      ];
      const tool = (run.review as { tool?: { version?: unknown } }).tool?.version;
      await tx.query(
        `INSERT INTO analyses (id, owner, repo, repo_key, commit_sha, branch, status, requested_at, finished_at, steps, tool_version)
         VALUES ($1, $2, $3, $4, $5, $6, 'succeeded', $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
        [
          run.id,
          run.owner,
          run.name,
          `${run.owner.toLowerCase()}/${run.name.toLowerCase()}`,
          run.commit,
          run.branch,
          run.startedAt,
          run.finishedAt,
          JSON.stringify(steps),
          typeof tool === "string" ? tool : null,
        ],
      );
      await tx.query("INSERT INTO results (analysis_id, json, profile, review) VALUES ($1, NULL, NULL, $2) ON CONFLICT (analysis_id) DO NOTHING", [
        run.id,
        JSON.stringify(run.review),
      ]);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [mark]);
    });
  }
}
