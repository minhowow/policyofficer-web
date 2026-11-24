import { readFileSync } from "node:fs";
import path from "node:path";
import type { DutyMap, MapDuty } from "@/lib/duties";
import { SANCTION_TEXT, SANCTION_TIERS, type Sanction } from "@/lib/duties/sanction";
import { elementAt, root } from "./helpers";

/**
 * 제재 표(2026-11-24 오너 승인)를 시험하는 데 쓰는 것. `tests/fixtures/sanctions.jsonl` 은 CLI 제재 표의 모양(디렉터 README)을 따른
 * 손으로 만든 시험용 레코드다(법·조문·원문은 실제가 아니다). 시험은 의무 지도(`@data/duty-map.json`)를 `withFixtureSanctions` 로 바꿔
 * 불러 화면을 그린다.
 */

interface Row {
  duty: string;
  class: Sanction["class"];
  label: string;
  max_won: number | null;
  items: Sanction["items"];
  note: string | null;
  as_of: string;
}

/** 시험용 레코드(의무 id → 제재). 화면이 읽는 모양(scripts/export-duty-map.mjs 가 옮기는 모양)이다. */
export const FIXTURE_SANCTIONS: Record<string, Sanction> = Object.fromEntries(
  readFileSync(path.join(root, "tests", "fixtures", "sanctions.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Row)
    .map((row) => [row.duty, { class: row.class, label: row.label, maxWon: row.max_won, items: row.items, note: row.note, asOf: row.as_of }]),
);

/** 의무 지도에 시험용 제재를 붙인 사본(레코드가 없는 의무는 제재 없음). */
export function withFixtureSanctions(map: DutyMap): DutyMap {
  return {
    ...map,
    cli: { ...map.cli, sanctions: "file" },
    duties: map.duties.map((duty): MapDuty => ({ ...duty, sanction: FIXTURE_SANCTIONS[duty.id] ?? null })),
  };
}

/** 제재 표의 몫인 요소: 표지(sanc), 항목 상세(sanc-detail), 주의 문구(sanc-caution), 맨 위 요약의 수(ov-sanc), 인쇄본의 제재 조문(ck-sanc). */
const PARTS = new Set(["sanc", "sanc-detail", "sanc-caution", "ov-sanc", "ck-sanc"]);

/** 이 사이트가 정한 제재의 고정 문구(`SANCTION_TEXT`, 무게 이름). 표에서 온 글과 달리 소스의 것이라 어디서 지워도 다른 글을 가리지 않는다. */
const FIXED = [SANCTION_TEXT.heavy, SANCTION_TEXT.note, ...SANCTION_TIERS.map((tier) => tier.label)].sort((a, b) => b.length - a.length);
const dropFixed = (text: string) => FIXED.reduce((rest, piece) => rest.split(piece).join(" "), text);

/**
 * 그려 낸 HTML 에서 제재 표의 몫을 뺀다: 제재의 요소(`PARTS`)를 자리째 걷어 내고, 남은 글에서 고정 문구(걸러 보기의 무게 이름 등)를
 * 뺀다. 표에서 온 글(표지 말, 제재 문구)을 글자로 찾아 지우지 않는다. 그러면 다른 자리에 잘못 실린 처분 메모('[과징금 매출 3%]')까지
 * 가린다. 문구 시험(BANNED_WORDING)은 그 나머지를 본다(docs/commitments.md 1장: 제재의 말은 제재 표의 몫에만).
 */
export function withoutSanctions(html: string): string {
  let out = html;
  for (let at = findPart(out); at >= 0; at = findPart(out)) out = `${out.slice(0, at)}${out.slice(at + elementAt(out, at).length)}`;
  return dropFixed(out);
}

function findPart(html: string): number {
  for (const match of html.matchAll(/<[a-z0-9]+\b[^>]*\bclass="([^"]*)"/g)) {
    if (match[1].split(/\s+/).some((name) => PARTS.has(name))) return match.index;
  }
  return -1;
}

/**
 * 내보낸 마크다운에서 제재 표의 몫을 뺀다: 항목 줄 끝의 표지(` · 어기면 · …`), 제재 조문과 보충 줄(`  - 어기면: …`), 원문 줄(`    > …`),
 * 그리고 고정 문구(요약의 수, 주의 문구).
 */
export function withoutSanctionsMarkdown(text: string): string {
  const head = SANCTION_TEXT.head;
  const cut = text
    .split("\n")
    .filter((line) => !line.startsWith(`  - ${head}: `) && !line.startsWith("    > "))
    .map((line) => line.replace(new RegExp(` · ${head} · .*?(?=( \\(반박이 바꿈\\))?$)`), ""))
    .join("\n");
  return dropFixed(cut);
}
