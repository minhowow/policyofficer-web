import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { parseProfile } from "@/lib/profile";
import { jsonFiles, readJson, root } from "./helpers";

// CLI 와 웹 사이의 이음매를 지킨다. 2026-11-25 규칙 기반 검사(scan)를 폐기해(CLI handoff-w13-4 부터 그 명령이 없다) 웹이 받는
// 출력은 저장소 프로필(`policyofficer profile`)과 AI 검토(`policyofficer review`, 2판) 둘이다(contract/README.md).
// 실패하면: CLI 출력이 바뀌었거나(npm run capture 뒤라면), 고정 판을 옮기면서 수집본·의무 지도·실행기 가운데 하나만 바꾼 것이다.

interface Manifest {
  captured_on: string;
  cli: { version: string; from: string; commit: string | null; committed_on: string | null; dirty: boolean | null };
  profile_command: string;
  profiles: { name: string; file: string; features: string[] }[];
}

const manifest = readJson("contract", "cli-current", "MANIFEST.json") as Manifest;
const profiles = jsonFiles("contract", "cli-current", "profile");
const entries = manifest.profiles.map((entry) => [entry.name, entry] as const);

describe("저장소 프로필 수집본 (contract/cli-current)", () => {
  it("수집본은 MANIFEST 와 프로필뿐이고, MANIFEST 가 프로필 전부를 적고 있다", () => {
    expect(readdirSync(path.join(root, "contract", "cli-current")).sort()).toEqual(["MANIFEST.json", "profile"]);
    expect(Object.keys(manifest).sort()).toEqual(["captured_on", "cli", "profile_command", "profiles"]);
    expect(manifest.profile_command).toBe("policyofficer profile .");
    expect(profiles.length).toBeGreaterThan(0);
    expect(manifest.profiles.map((entry) => entry.file).sort()).toEqual(profiles.map((file) => `profile/${file}`));
    expect(manifest.profiles.map((entry) => `${entry.name}.json`).sort()).toEqual(profiles);
  });

  it.each(entries)("%s 를 화면의 파서가 읽고, 기능이 MANIFEST 에 적힌 것과 같다. 도구는 수집한 CLI 다", (_, entry) => {
    const data = readJson("contract", "cli-current", entry.file) as { tool: unknown };
    expect(data.tool).toEqual({ name: "policyofficer", version: manifest.cli.version });
    const profile = parseProfile(data);
    expect(profile).not.toBeNull();
    expect(profile!.features.map((feature) => feature.id)).toEqual(entry.features);
  });

  it.each(entries)("%s 의 근거가 가리키는 파일이 표본 폴더에 있다", (name, entry) => {
    // 수집을 git 저장소 안에서 돌리면 CLI 가 경로 기준을 저장소 루트로 잡는다. 수집 스크립트가 표본을 저장소 밖으로 복사해 돌리는
    // 것이 깨지면 여기서 잡힌다.
    const [app, variant] = name.split(".");
    const profile = parseProfile(readJson("contract", "cli-current", entry.file))!;
    const evidence = [...profile.features, ...profile.testOnly].flatMap((feature) => feature.evidence);
    if (entry.features.length > 0) expect(evidence.length).toBeGreaterThan(0);
    for (const item of evidence) {
      expect(existsSync(path.join(root, "contract", "fixtures", app, variant, item.file)), `${name}: ${item.file}`).toBe(true);
    }
  });

  it("기능이 있는 표본과 없는 표본이 함께 있다 (시험이 빈 목록을 보고 통과하지 않게)", () => {
    expect(manifest.profiles.some((entry) => entry.features.length > 0)).toBe(true);
    expect(manifest.profiles.some((entry) => entry.features.length === 0)).toBe(true);
  });
});

describe("review 2판 (contract/review, contract/schema/review.cli-2.schema.json)", () => {
  // 스키마는 고정 CLI 의 schemas/review-2.json 사본이다. 합성 예시(손으로 만든 것)는 합성 미리보기와 로컬 실행기가 쓴다.
  const schema = readJson("contract", "schema", "review.cli-2.schema.json") as { $id: string; properties: { review_version: unknown } };
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  const sample = () => readJson("contract", "review", "genai-chat.review.json") as Record<string, unknown>;

  it("스키마 폴더에는 review 2판 스키마만 있다", () => {
    expect(readdirSync(path.join(root, "contract", "schema"))).toEqual(["review.cli-2.schema.json"]);
    expect(schema.$id.endsWith("/schemas/review-2.json")).toBe(true);
    expect(schema.properties.review_version).toEqual({ const: 2 });
  });

  it("합성 예시가 스키마를 통과한다. 판이 다르면 받지 않는다", () => {
    expect(validate(sample()), JSON.stringify(validate.errors)).toBe(true);
    expect(sample().tool).toEqual({ name: "policyofficer", version: manifest.cli.version });
    expect(validate({ ...sample(), review_version: 1 })).toBe(false);
  });
});

describe("수집본, 의무 지도, 실행기가 같은 CLI 커밋이다", () => {
  // 실행기(.github/workflows/analyze.yml)가 설치하는 CLI 와, 이 저장소가 계약으로 받은 수집본·의무 지도가 같은 커밋에서 나와야 한다.
  // 고정 판을 옮길 때는 셋을 함께 바꾼다(docs/cli-followup.md 의 "따라가는 절차").
  const workflow = readFileSync(path.join(root, ".github", "workflows", "analyze.yml"), "utf8");
  const pinned = /\n {6}CLI_COMMIT: ([0-9a-f]{40})\n/.exec(workflow)?.[1];
  const excludeNewer = /\n {6}CLI_EXCLUDE_NEWER: "(\d{4}-\d{2}-\d{2})T00:00:00Z"\n/.exec(workflow)?.[1];
  const dutyMap = readJson("data", "duty-map.json") as { cli: { commit: string } };

  it("수집본은 커밋되지 않은 변경이 없는 CLI 커밋에서 나왔다", () => {
    expect(manifest.cli.dirty).toBe(false);
    expect(manifest.cli.commit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it("실행기가 설치하는 커밋(CLI_COMMIT)이 수집본의 커밋이다", () => {
    expect(pinned).toBeDefined();
    expect(pinned!.startsWith(manifest.cli.commit!)).toBe(true);
  });

  it("의무 지도(data/duty-map.json)를 옮긴 커밋이 실행기가 설치하는 커밋이다", () => {
    expect(dutyMap.cli.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(dutyMap.cli.commit).toBe(pinned);
    expect(dutyMap.cli.commit.startsWith(manifest.cli.commit!)).toBe(true);
  });

  it("딸린 꾸러미를 묶는 날짜(CLI_EXCLUDE_NEWER)가 그 커밋의 날짜다", () => {
    expect(manifest.cli.committed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(excludeNewer).toBe(manifest.cli.committed_on);
  });
});
