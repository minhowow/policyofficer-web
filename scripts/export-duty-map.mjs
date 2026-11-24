#!/usr/bin/env node
// 조문 도감(/policy/)의 의무 지도 데이터를 만든다(2026-11-15 오너 결정): CLI 의 기능–의무 표(src/policyofficer/profile/duties.jsonl,
// handoff-w13-3 전의 판은 src/policypack/profile/)와
// 검토 후보 표(lawmap/review-candidates.csv), 기능 이름(src/policyofficer/profile/features.yaml), 정책 팩의 정책–의무 연결
// (policies/kr-core/pack.yaml 의 duties)을 실행기가 설치하는 CLI 커밋(.github/workflows/analyze.yml 의 CLI_COMMIT)에서 읽어
// data/duty-map.json 에 쓴다. 옆 폴더의 CLI 저장소는 `git show <커밋>:<경로>` 로 읽기만 한다(작업 폴더를 바꾸지 않는다).
// 모델을 부르지 않는다.
//
//   node scripts/export-duty-map.mjs   (CLI 저장소: POLICYOFFICER_FROM(앞선 이름 POLICYPACK_FROM)이 폴더면 그것, 아니면 ../Plitsoft-SDP)
//
// 옮기는 것은 AI 검토(review)가 묻는 의무(검토 후보와 kr-core 의무)의 법·조문·제목·의무 한 줄·걸리는 때·법제처 주소·기능이고,
// 나머지는 갈래별 수만 옮긴다. 조문 인용(quote)과 어긴·지킨 코드의 예, 의무를 지는 자는 옮기지 않는다(조문은 팩 메타데이터의 원문만
// 싣는다. docs/commitments.md). 제목 끝의 [ … ] 는 처분·액수를 적은 조사자 메모라 떼고(의무 한 줄 끝의 벌칙 메모도), 떼고도 화면에 쓰지 않는 말(tests/wording.ts)이
// 든 글은 null 로 둔다(화면은 법·조문만 적는다). 검토 후보 표의 의무·기능 이름이 기능–의무 표와 맞는지 본다.
//
// 의무마다 법에 적힌 제재(2026-11-24 오너 승인)는 같은 커밋의 제재 표(src/policyofficer/profile/sanctions.jsonl)에서 옮긴다. 표의
// 갈래·표지·조문·원문 인용을 그대로 옮기고, 무게(class)가 표에 적힌 규칙(README: direct 가운데 징역 > 과징금 > 벌금 > 과태료, direct 가
// 없고 order 만 있으면 명령, 조문이 없으면 없음. 조건이 붙은 direct 항목은 결과·대상을 말하면 세고 더 무거운 사정(거짓·악의 등)을 요구하면
// 세지 않는다)과 맞는지, AI 검토가 묻는 의무마다 한 줄씩 빠짐없이 있는지 본다. 그 판에 표가 없으면
// 제재 없이 내보낸다. SANCTIONS_FILE 에 파일을 주면 그 파일을 읽는다(디렉터의 초안으로 화면을 미리 보는 데만. 커밋하지 않는다).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { BANNED_WORDING } from "../tests/wording.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromEnv = process.env.POLICYOFFICER_FROM ?? process.env.POLICYPACK_FROM;
const cliDir = fromEnv && existsSync(fromEnv) && statSync(fromEnv).isDirectory() ? path.resolve(fromEnv) : path.resolve(root, "..", "Plitsoft-SDP");

const workflow = readFileSync(path.join(root, ".github/workflows/analyze.yml"), "utf8");
const commit = /\n {6}CLI_COMMIT: ([0-9a-f]{40})\n/.exec(workflow)?.[1];
if (!commit) throw new Error("analyze.yml 에서 CLI_COMMIT 을 찾지 못했습니다");
const show = (file) => execFileSync("git", ["-C", cliDir, "show", `${commit}:${file}`], { encoding: "utf8", maxBuffer: 64 << 20 });

const rows = show("src/policyofficer/profile/duties.jsonl")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const spec = parse(show("src/policyofficer/profile/features.yaml"));
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

/** 제재 표. 고정 커밋에 없으면 null. */
function readSanctions() {
  const file = process.env.SANCTIONS_FILE;
  let text;
  let from;
  if (file) {
    text = readFileSync(path.resolve(file), "utf8");
    from = "file";
  } else {
    try {
      text = execFileSync("git", ["-C", cliDir, "show", `${commit}:src/policyofficer/profile/sanctions.jsonl`], {
        encoding: "utf8",
        maxBuffer: 64 << 20,
        stdio: ["ignore", "pipe", "ignore"],
      });
      from = "git";
    } catch {
      return null;
    }
  }
  const records = text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  return { from, records };
}

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

// 제재 표: 갈래·표지·조문을 그대로 옮긴다. 화면이 쓰는 모양(camelCase)으로 바꾸기만 한다.
const CLASSES = ["징역", "과징금", "벌금", "과태료", "명령", "없음"];
const KINDS = ["징역", "벌금", "과징금", "과태료"];
const LAW_URL = /^https:\/\/www\.law\.go\.kr\//;
// 제재 표의 글은 법령의 말을 옮긴 것이라(제재의 말, '위반행위와 관련한 매출액' 같은 법령의 낱말) 조문 원문처럼 그 두 줄은 보지 않는다
// (docs/commitments.md 1장). 그 밖의 화면에 쓰지 않는 말(적법 단정, 점수 등)이 표지·문구·조건·보충에 들면 멈춘다.
const unsaid = (text) => BANNED_WORDING.filter(([pattern]) => !pattern.test("과징금") && !pattern.test("위반")).find(([pattern]) => pattern.test(text));
/** 표에 적힌 규칙으로 정한 무게(센 항목만으로). */
function classOf(items) {
  const direct = items.filter((item) => item.via === "direct");
  for (const kind of ["징역", "과징금", "벌금", "과태료"]) if (direct.some((item) => item.kind === kind)) return kind;
  if (items.some((item) => item.via === "order")) return "명령";
  return "없음";
}
/**
 * 무게가 조문으로 정해질 수 있는지: 조건이 없는 항목은 늘 세고, 조건이 붙은 direct 항목은 세거나 세지 않은(표의 규칙이 조건의 뜻으로
 * 가른다) 어느 경우로든 그 갈래가 나오면 맞다.
 */
function classFits(items, cls) {
  const conditioned = items.filter((item) => item.via === "direct" && item.condition);
  const always = items.filter((item) => !conditioned.includes(item));
  for (let mask = 0; mask < 1 << conditioned.length; mask++) {
    if (classOf([...always, ...conditioned.filter((_, i) => mask & (1 << i))]) === cls) return true;
  }
  return false;
}
const table = readSanctions();
const sanctions = new Map();
if (table) {
  const askedIds = new Set(asked.map((r) => r.id));
  for (const record of table.records) {
    const id = record.duty;
    if (!askedIds.has(id)) throw new Error(`제재 표의 ${id} 는 AI 검토가 묻는 의무가 아닙니다`);
    if (sanctions.has(id)) throw new Error(`제재 표에 ${id} 가 두 번 있습니다`);
    if (!CLASSES.includes(record.class)) throw new Error(`${id}: 모르는 갈래 ${record.class}`);
    if (typeof record.label !== "string" || !record.label.trim()) throw new Error(`${id}: 표지가 없습니다`);
    if ([...record.label.trim()].length > 32) throw new Error(`${id}: 표지가 32자를 넘습니다(${record.label})`);
    if (!Array.isArray(record.items)) throw new Error(`${id}: items 가 목록이 아닙니다`);
    if (record.max_won !== null && !(Number.isInteger(record.max_won) && record.max_won > 0)) throw new Error(`${id}: max_won 이 정수가 아닙니다`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.as_of ?? "")) throw new Error(`${id}: as_of 가 날짜가 아닙니다`);
    const items = record.items.map((item, i) => {
      const where = `${id} 의 ${i + 1}번째 조문`;
      if (!KINDS.includes(item.kind)) throw new Error(`${where}: 모르는 kind ${item.kind}`);
      if (item.via !== "direct" && item.via !== "order") throw new Error(`${where}: 모르는 via ${item.via}`);
      for (const key of ["penalty", "law", "clause", "quote"]) {
        if (typeof item[key] !== "string" || !item[key].trim()) throw new Error(`${where}: ${key} 가 없습니다`);
      }
      if (item.url !== null && !LAW_URL.test(item.url ?? "")) throw new Error(`${where}: 법제처 주소가 아닙니다(${item.url})`);
      return {
        kind: item.kind,
        via: item.via,
        condition: typeof item.condition === "string" && item.condition.trim() ? item.condition.trim() : null,
        penalty: item.penalty.trim(),
        law: item.law.trim(),
        clause: item.clause.trim(),
        url: item.url ?? null,
        quote: item.quote.trim(),
      };
    });
    if (!classFits(items, record.class)) throw new Error(`${id}: 갈래 ${record.class} 가 조문으로 정해지지 않습니다(모두 세면 ${classOf(items)})`);
    const note = typeof record.note === "string" && record.note.trim() ? record.note.trim() : null;
    for (const text of [record.label, note, ...items.flatMap((item) => [item.penalty, item.condition])]) {
      const hit = text && unsaid(text);
      if (hit) throw new Error(`${id}: "${text}" — ${hit[1]}`);
    }
    sanctions.set(id, { class: record.class, label: record.label.trim(), maxWon: record.max_won, items, note, asOf: record.as_of });
  }
  const missing = asked.filter((r) => !sanctions.has(r.id)).map((r) => r.id);
  if (missing.length) throw new Error(`제재 표에 없는 의무 ${missing.length}개: ${missing.slice(0, 10).join(", ")}`);
}
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
  ...(table ? { sanction: sanctions.get(r.id) } : {}),
}));

const rest = rows.filter((r) => !r.review_candidate && !r.krcore);
const out = {
  generated_by: "scripts/export-duty-map.mjs",
  cli: { commit, sanctions: table?.from ?? null },
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
if (table) {
  const count = (cls) => duties.filter((d) => d.sanction.class === cls).length;
  console.log(`제재(${table.from === "file" ? `파일 ${process.env.SANCTIONS_FILE}, 미리 보기용` : "고정 커밋"}): ${CLASSES.map((cls) => `${cls} ${count(cls)}`).join(" · ")}`);
} else console.log("제재 표 없음(고정 커밋에 src/policyofficer/profile/sanctions.jsonl 이 없습니다)");
const held = duties.filter((d) => d.title === null || d.duty === null || d.trigger === null).map((d) => d.id);
if (held.length) console.log(`화면에 쓰지 않는 말이 들어 글을 뺀 의무: ${held.join(", ")}`);
