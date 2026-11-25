#!/usr/bin/env node
// 합성 데모 코드(contract/fixtures)에 설치된 policyofficer CLI 의 저장소 프로필(`policyofficer profile`, 모델 호출 없음)을 돌려
// contract/cli-current/profile/<표본>.json 과 MANIFEST.json 을 다시 만든다. 2026-11-25 규칙 검사(scan)를 폐기해 그 출력은 남기지 않는다
// (CLI handoff-w13-4 부터 그 명령이 없다).
//
// CLI 소스를 가져다 쓰지 않는다. 격리된 환경에 설치한 `policyofficer` 명령만 부른다.
//   POLICYOFFICER_FROM  설치 출처. 기본값은 옆 폴더의 CLI 저장소(../Plitsoft-SDP). 앞선 이름 POLICYPACK_FROM 도 읽는다
//                    (제품 이름이 policyofficer 로 바뀌었다. 2026-11-24 오너 결정).
//                    PyPI 공개 뒤에는 "policyofficer==<판>" 처럼 판을 고정해 쓴다.
//
// 지키는 것
//   - 출처가 폴더면 매번 휠을 새로 빌드해 그 휠로 실행한다. uvx 는 로컬 폴더를 pyproject.toml 이 바뀔 때만
//     다시 빌드해서, 그냥 부르면 CLI 가 바뀌어도 옛 빌드의 결과가 나온다(--refresh-package 도 듣지 않는다).
//   - 표본은 임시 폴더로 복사해 거기서 돌린다. 이 저장소(git) 안에서 돌리면 CLI 가 경로 기준을 저장소 루트로 잡는다.
//   - 전부 성공한 뒤에만 contract/cli-current/ 를 바꾼다. 도중에 실패하면 기존 수집본은 그대로다.
//
// 실행: npm run capture
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "contract", "fixtures");
const outDir = path.join(root, "contract", "cli-current");
const stagingDir = path.join(root, "contract", ".cli-current.tmp");

// 상대 경로로 받아도 어디서 부르든 같은 곳을 가리키게 절대 경로로 바꾼다.
const rawFrom = process.env.POLICYOFFICER_FROM ?? process.env.POLICYPACK_FROM ?? path.resolve(root, "..", "Plitsoft-SDP");
const fromIsDir = existsSync(rawFrom) && statSync(rawFrom).isDirectory();
const from = existsSync(rawFrom) ? path.resolve(rawFrom) : rawFrom;

const work = mkdtempSync(path.join(tmpdir(), "policyofficer-capture-"));

// CLI 가 읽는 환경변수(POLICYOFFICER_*, 앞선 이름 POLICYPACK_*)가 새어 들어가지 않게 지운다.
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^POLICY(OFFICER|PACK)_/.test(key)));
// 임시 폴더 위쪽의 git 저장소를 찾지 않게 한다.
childEnv.GIT_CEILING_DIRECTORIES = work;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: childEnv, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) {
    throw new Error(`${command} 를 실행하지 못했습니다: ${result.error.message}. uv 가 설치돼 있는지 확인하세요.`);
  }
  return result;
}

/** 설치 출처. 폴더면 지금 내용으로 휠을 빌드해 그 파일을 쓴다. */
function resolveSource() {
  if (!fromIsDir) return from;
  const wheelDir = path.join(work, "wheel");
  const build = run("uv", ["build", "--quiet", "--wheel", "--out-dir", wheelDir, from], root);
  if (build.status !== 0) {
    throw new Error(`CLI 휠을 빌드하지 못했습니다 (출처: ${from})\n${build.stderr}`);
  }
  const wheel = readdirSync(wheelDir).find((name) => name.endsWith(".whl"));
  if (!wheel) throw new Error(`빌드한 휠을 찾지 못했습니다: ${wheelDir}`);
  return path.join(wheelDir, wheel);
}

function git(args) {
  const result = spawnSync("git", ["--no-optional-locks", "-C", from, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function listDirs(dir) {
  return readdirSync(dir)
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .sort();
}

/** 표준 출력을 JSON 으로 읽는다. uvx 자체가 실패해도 종료 코드가 1 이라 종료 코드만 믿지 않는다. */
function parseOutput(result, name, what) {
  if (result.status !== 0) {
    throw new Error(`${name}: ${what} 이 종료 코드 ${result.status} 로 끝났습니다.\n${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${name}: ${what} 의 출력이 JSON 이 아닙니다 (종료 코드 ${result.status}).\n${result.stderr}`);
  }
}

function main() {
  const source = resolveSource();
  const policyofficer = (args, cwd) => run("uvx", ["--quiet", "--from", source, "policyofficer", ...args], cwd);

  const version = policyofficer(["--version"], work);
  if (version.status !== 0) {
    throw new Error(`policyofficer --version 실패 (출처: ${from})\n${version.stderr}`);
  }

  // 표본을 git 저장소 밖으로 복사한다.
  const fixtures = path.join(work, "fixtures");
  cpSync(fixturesDir, fixtures, { recursive: true });

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(path.join(stagingDir, "profile"), { recursive: true });

  const profiles = [];

  for (const app of listDirs(fixtures)) {
    for (const variant of listDirs(path.join(fixtures, app))) {
      const name = `${app}.${variant}`;
      const cwd = path.join(fixtures, app, variant);
      // 저장소 프로필. 모델을 부르지 않는다. 폴더 전체를 본다(package.json 등).
      const profile = parseOutput(policyofficer(["profile", "."], cwd), name, "policyofficer profile");
      writeFileSync(path.join(stagingDir, "profile", `${name}.json`), JSON.stringify(profile, null, 2) + "\n");
      profiles.push({ name, file: `profile/${name}.json`, features: profile.features.map((feature) => feature.id) });
      console.log(`${name}: 기능 ${profile.features.length}`);
    }
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const relative = fromIsDir ? path.relative(root, from) : null;
  const status = fromIsDir ? git(["status", "--porcelain"]) : null;
  const manifest = {
    // 수집한 날(이 기계의 날짜). 시각은 적지 않는다.
    captured_on: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    cli: {
      version: version.stdout.trim().replace(/^policyofficer\s+/, ""),
      // 절대 경로는 적지 않는다. 옆 폴더면 상대 경로, 그 밖의 폴더면 이름만, 폴더가 아니면 준 값 그대로.
      from: !fromIsDir ? from : /^\.\.[\\/][^\\/]+$/.test(relative) ? relative : path.basename(from),
      commit: fromIsDir ? git(["rev-parse", "--short", "HEAD"]) : null,
      // 그 커밋의 날짜(커미터 날짜, YYYY-MM-DD). 실행기의 CLI_EXCLUDE_NEWER 와 견준다(tests/contract.test.ts).
      committed_on: fromIsDir ? git(["show", "-s", "--format=%cs", "HEAD"]) : null,
      // 커밋되지 않은 변경이 있었는지. git 저장소가 아니면 모른다(null).
      dirty: status === null ? null : status !== "",
    },
    profile_command: "policyofficer profile .",
    profiles,
  };
  writeFileSync(path.join(stagingDir, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");

  // 여기까지 왔으면 전부 성공이다. 이제 바꾼다.
  rmSync(outDir, { recursive: true, force: true });
  renameSync(stagingDir, outDir);
  console.log(`\ncontract/cli-current/ 에 프로필 ${profiles.length}개를 썼습니다. (policyofficer ${manifest.cli.version}, 커밋 ${manifest.cli.commit ?? "모름"})`);
  if (manifest.cli.dirty) {
    console.log("주의: CLI 저장소에 커밋되지 않은 변경이 있습니다. 이 수집본은 커밋하지 마세요(contract/README.md).");
  }
}

try {
  main();
} catch (error) {
  rmSync(stagingDir, { recursive: true, force: true });
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
