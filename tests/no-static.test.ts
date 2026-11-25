import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readJson, root, walk } from "./helpers";

// docs/commitments.md 의 1(2026-11-25 오너 지시): 규칙 기반 검사(scan, 정책 팩 kr-core, Semgrep)를 폐기했다. 사이트는 AI 검토만 보이고,
// 화면·메타데이터·README 에 그 검사를 가리키는 말을 두지 않는다. CLI·모델이 쓴 글(의무 지도의 '걸리는 코드', 검토 답)은 고치지 않고
// 그대로 실으므로 여기서 보지 않는다. 이 시험은 흔한 실수(옛 글이 남거나 옛 자료가 되살아나는 것)를 잡는 그물이다.

/** 적용을 마친 DB 마이그레이션. 이미 돈 기록이라 고치지 않는다. */
const APPLIED_MIGRATION = /^src\/server\/db\/migrations\/0[^/]*\.sql$/;

describe("폐기한 규칙 기반 검사(scan)", () => {
  it("src/ 의 파일과 README 에 '정적'이라는 말이 없다 (적용을 마친 DB 마이그레이션은 기록이라 뺀다)", () => {
    const files = walk("src").filter((file) => !APPLIED_MIGRATION.test(file.split(path.sep).join("/")));
    expect(files.length).toBeGreaterThan(50);
    for (const file of [...files, "README.md"]) {
      expect(readFileSync(path.join(root, file), "utf8").includes("정적"), file).toBe(false);
    }
  });

  it("그 검사의 자료(팩 메타데이터)가 되살아나지 않았다", () => {
    expect(existsSync(path.join(root, "data", "pack-meta.json"))).toBe(false);
  });

  it("의무 지도에 정적 규칙(정책)의 자취가 없다 (의무마다 정책, 정책마다 내용을 싣는 의무)", () => {
    const map = readJson("data", "duty-map.json") as { duties: Record<string, unknown>[] } & Record<string, unknown>;
    expect(map.duties.length).toBeGreaterThan(0);
    expect("policyHome" in map).toBe(false);
    for (const duty of map.duties) expect("policies" in duty, String(duty.id)).toBe(false);
  });
});
