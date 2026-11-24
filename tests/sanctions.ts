import { readFileSync } from "node:fs";
import path from "node:path";
import type { DutyMap, MapDuty } from "@/lib/duties";
import { SANCTION_TEXT, SANCTION_TIERS, type Sanction } from "@/lib/duties/sanction";
import { root } from "./helpers";

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

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };

/**
 * 그려 낸 글에서 제재 표의 몫을 뺀다: 표지, 맨 위 요약의 이름, 주의 문구, 걸러 보기의 무게 이름, 그리고 표에서 온 글(표지 말,
 * 제재 문구, 걸리는 때, 보충, 원문). 문구 시험(BANNED_WORDING)은 그 나머지를 본다(docs/commitments.md 1장: 제재의 말은 제재 표의
 * 몫에만). 낱말 하나(과태료 등)만 따로 빼지는 않는다.
 */
export function withoutSanctions(text: string, sanctions: Iterable<Sanction | null | undefined>): string {
  const pieces = new Set<string>([SANCTION_TEXT.heavy, SANCTION_TEXT.note, SANCTION_TEXT.order, ...SANCTION_TIERS.map((tier) => tier.label)]);
  for (const sanction of sanctions) {
    if (!sanction) continue;
    pieces.add(SANCTION_TEXT.badge(sanction.label));
    pieces.add(sanction.label);
    if (sanction.note) pieces.add(sanction.note);
    for (const item of sanction.items) {
      for (const piece of [item.penalty, item.condition, item.quote]) if (piece) pieces.add(piece);
    }
  }
  let out = text.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity]);
  for (const piece of [...pieces].sort((a, b) => b.length - a.length)) out = out.split(piece).join(" ");
  return out;
}
