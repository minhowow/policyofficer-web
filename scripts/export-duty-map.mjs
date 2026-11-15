#!/usr/bin/env node
// 조문 도감(/policy/)의 의무 지도 데이터를 만든다(2026-11-15 오너 결정): CLI 의 기능–의무 표(src/policypack/profile/duties.jsonl)와
// 검토 후보 표(lawmap/review-candidates.csv), 기능 이름(src/policypack/profile/features.yaml), 정책 팩의 정책–의무 연결
// (policies/kr-core/pack.yaml 의 duties)을 실행기가 설치하는 CLI 커밋(.github/workflows/analyze.yml 의 CLI_COMMIT)에서 읽어
// data/duty-map.json 에 쓴다. 옆 폴더의 CLI 저장소는 `git show <커밋>:<경로>` 로 읽기만 한다(작업 폴더를 바꾸지 않는다).
// 모델을 부르지 않는다.
//
//   node scripts/export-duty-map.mjs   (CLI 저장소: POLICYPACK_FROM 이 폴더면 그것, 아니면 ../Plitsoft-SDP)
//
// 옮기는 것은 AI 검토(review)가 묻는 의무(검토 후보와 kr-core 의무)의 법·조문·제목·의무 한 줄·걸리는 때·법제처 주소·기능이고,
// 나머지는 갈래별 수만 옮긴다. 조문 인용(quote)과 어긴·지킨 코드의 예, 의무를 지는 자는 옮기지 않는다(조문은 팩 메타데이터의 원문만
// 싣는다. docs/commitments.md). 제목 끝의 [ … ] 는 처분·액수를 적은 조사자 메모라 떼고(의무 한 줄 끝의 벌칙 메모도), 떼고도 화면에 쓰지 않는 말(tests/wording.ts)이
// 든 글은 null 로 둔다(화면은 법·조문만 적는다). 검토 후보 표의 의무·기능 이름이 기능–의무 표와 맞는지 본다.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { BANNED_WORDING } from "../tests/wording.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromEnv = process.env.POLICYPACK_FROM;
const cliDir = fromEnv && existsSync(fromEnv) && statSync(fromEnv).isDirectory() ? path.resolve(fromEnv) : path.resolve(root, "..", "Plitsoft-SDP");

const workflow = readFileSync(path.join(root, ".github/workflows/analyze.yml"), "utf8");
const commit = /\n {6}CLI_COMMIT: ([0-9a-f]{40})\n/.exec(workflow)?.[1];
if (!commit) throw new Error("analyze.yml 에서 CLI_COMMIT 을 찾지 못했습니다");
const show = (file) => execFileSync("git", ["-C", cliDir, "show", `${commit}:${file}`], { encoding: "utf8", maxBuffer: 64 << 20 });

const rows = show("src/policypack/profile/duties.jsonl")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const spec = parse(show("src/policypack/profile/features.yaml"));
const pack = parse(show("policies/kr-core/pack.yaml"), { maxAliasCount: -1 });

/** RFC 4180 CSV(따옴표 안의 쉼표·따옴표 두 개). 첫 줄은 머리다. */
function readCsv(text) {
  const out = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) out.push([...row, cell]);
  const [head, ...rest] = out;
  return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const candidates = readCsv(show("lawmap/review-candidates.csv"));

// 기능 이름. 'common'(거의 모든 서비스)이 맨 앞, 'status'(지위)는 묻지 않으므로 이름만.
const features = [{ id: "common", name: spec.common.name }, ...spec.features.map((f) => ({ id: f.id, name: f.name }))];
const featureName = Object.fromEntries([...features.map((f) => [f.id, f.name]), ["status", spec.status.name]]);
const whenever = new Set(spec.features.flatMap((f) => f.whenever ?? []));
const audience = new Set(spec.features.flatMap((f) => f.audience ?? []));
const goodsOf = Object.fromEntries((spec.goods ?? []).flatMap((g) => g.duties.map((d) => [d, g.name])));

// 정책 팩의 정책마다 의무 id. 한 의무에 정책이 둘 붙지는 않지만 목록으로 둔다. 정책이 의무 둘을 가리키면 팩에 적힌 첫 의무가
// 그 정책의 의무다(화면은 정책의 내용을 그 의무 줄에 싣고, 둘째 의무는 그리로 잇는다).
const policiesOf = {};
const policyHome = {};
for (const policy of pack.policies ?? []) {
  for (const duty of policy.duties ?? []) (policiesOf[duty] ??= []).push(String(policy.id));
  if (policy.duties?.length) policyHome[String(policy.id)] = String(policy.duties[0]);
}

// 검토 후보 표와 기능–의무 표가 같은 것을 말하는지.
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
const featureKey = Object.keys(candidates[0] ?? {}).find((key) => key.endsWith("기능"));
for (const c of candidates) {
  const r = byId[c.id];
  if (!r?.review_candidate) throw new Error(`검토 후보 표의 ${c.id} 가 기능–의무 표의 검토 후보가 아닙니다`);
  if (featureName[r.feature] !== c[featureKey]) throw new Error(`${c.id}: 기능 이름이 다릅니다(${c[featureKey]} / ${featureName[r.feature]})`);
  if (r.url !== c["링크"] || r.article !== c["조문"]) throw new Error(`${c.id}: 조문이나 링크가 다릅니다`);
}
const candidateCount = rows.filter((r) => r.review_candidate).length;
if (candidateCount !== candidates.length) throw new Error(`검토 후보 수가 다릅니다(표 ${candidates.length}, 기능–의무 표 ${candidateCount})`);
for (const id of Object.keys(policiesOf)) if (!byId[id]?.krcore) throw new Error(`정책 팩의 의무 ${id} 가 기능–의무 표에 kr-core 로 없습니다`);

/** 화면에 쓰지 않는 말이 들었으면 null. */
const clean = (text) => {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return null;
  return BANNED_WORDING.some(([pattern]) => pattern.test(value)) ? null : value;
};
/** 제목 끝의 [ … ](처분·액수, 판단 기준 같은 조사자 메모)를 뗀다. */
const titleOf = (title) => clean(String(title ?? "").replace(/\s*\[[^\]]*\]\s*$/u, ""));
/** 의무 한 줄 끝의 ( … 벌칙 … )(벌칙이 있는지 없는지에 관한 조사자 메모)를 뗀다. */
const dutyOf = (duty) => clean(String(duty ?? "").replace(/\s*\([^()]*벌칙[^()]*\)\s*$/u, ""));

// AI 검토가 묻는 의무: 검토 후보, 그리고 kr-core 의무(기능이 있거나 정적 규칙이 걸리면 묻는다. CLI review 의 의무 고르기).
const asked = rows.filter((r) => r.review_candidate || r.krcore);
const duties = asked.map((r) => ({
  id: r.id,
  feature: r.feature,
  law: r.law,
  lawShort: r.law_short,
  kind: r.kind,
  article: r.article,
  title: titleOf(r.title),
  duty: dutyOf(r.duty),
  trigger: clean(r.trigger),
  url: r.url || null,
  candidate: r.review_candidate,
  policies: policiesOf[r.id] ?? [],
  whenever: whenever.has(r.id),
  audience: audience.has(r.id),
  goods: goodsOf[r.id] ?? null,
}));

const rest = rows.filter((r) => !r.review_candidate && !r.krcore);
const out = {
  generated_by: "scripts/export-duty-map.mjs",
  cli: { commit },
  total: rows.length,
  candidates: candidateCount,
  asked: duties.length,
  notAsked: {
    total: rest.length,
    // 공공기관·금융회사 같은 주체의 지위로 걸리는 의무(scope sector, 기능 'status').
    status: rest.filter((r) => r.feature === "status").length,
    // 조사자의 확신이 높지 않거나 조문 인용이 원문과 맞지 않은 의무.
    other: rest.filter((r) => r.feature !== "status").length,
  },
  features: features.filter((f) => duties.some((d) => d.feature === f.id)),
  policyHome,
  duties,
};
for (const [policy, duty] of Object.entries(policyHome)) {
  if (!duties.some((d) => d.id === duty && d.policies.includes(policy))) throw new Error(`정책 ${policy} 의 의무 ${duty} 가 AI 검토가 묻는 의무에 없습니다`);
}
if (out.notAsked.status + out.notAsked.other + out.asked !== out.total) throw new Error("수가 맞지 않습니다");

writeFileSync(path.join(root, "data/duty-map.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(
  `의무 ${out.total} · 검토 후보 ${out.candidates} · AI 검토가 묻는 의무 ${out.asked} (kr-core ${duties.filter((d) => !d.candidate).length} 더함) · 묻지 않음 ${out.notAsked.total} (지위 ${out.notAsked.status}, 그 밖 ${out.notAsked.other}) → data/duty-map.json`,
);
const held = duties.filter((d) => d.title === null || d.duty === null || d.trigger === null).map((d) => d.id);
if (held.length) console.log(`화면에 쓰지 않는 말이 들어 글을 뺀 의무: ${held.join(", ")}`);
