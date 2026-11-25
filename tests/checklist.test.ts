import { describe, expect, it } from "vitest";
import { sanctionOf } from "@/lib/duties";
import { byWeight } from "@/lib/duties/sanction";
import { REVIEW_GOODS_LABEL, REVIEW_RECHECK_LABEL, REVIEW_STATUS_LABEL } from "@/lib/report/status";
import { parseReview, REVIEW_STATUSES } from "@/lib/review";
import { checklistDoc, checklistFileName, checklistMarkdown, type ChecklistSource } from "@/lib/review/checklist";
import { SANCTION } from "@/lib/review/text";
import { PRERUNS } from "@/lib/service/prerun";
import { syntheticStore } from "@/lib/service/synthetic";
import { SITE } from "@/lib/site";
import { getChecklistMarkdown } from "@/server/checklist";
import { withoutSanctionsMarkdown } from "./sanctions";
import { BANNED_WORDING } from "./wording";

// 의무 체크리스트 내보내기(2026-11-13 오너 지시): 마크다운 파일과 인쇄용 보기가 같은 모양(checklistDoc)에서 나온다. 실제 결과는 미리
// 돌려 넣은 분석(src/lib/service/prerun.ts)이다.

/** 미리 돌린 분석의 결과와 내보내기의 출처 줄(분석 쪽의 내보내기와 같은 모양. 사실 줄은 미리 돌린 결과와 그날). */
const runs = PRERUNS.map((run) => ({
  run,
  review: parseReview(run.review)!,
  source: {
    repo: `${run.owner}/${run.name}`,
    htmlUrl: `https://github.com/${run.owner}/${run.name}`,
    commit: run.commit,
    facts: [`${SITE.prerun} ${run.ranOn}`],
  } satisfies ChecklistSource,
}));

describe("체크리스트 내보내기", () => {
  it("미리 돌린 분석마다 읽힌다(첫째는 jobtalk)", () => {
    expect(runs[0].run.id).toBe("jbtk24nv7q");
    for (const { run, review } of runs) expect(review, run.id).not.toBeNull();
  });

  it("갈래 차례는 화면과 같고 의무는 빠짐없이 한 번씩, 다시 검토 중인 의무는 맨 끝에 이름만", () => {
    for (const { run, review } of runs) {
      // 다시 검토 중(사람이 짚은 의무)이 있을 때의 모양도 본다: 해당 없음 하나를 짚는다.
      for (const recheck of [[], [review.checklist.find((item) => item.status === "not-applicable")!.duty]]) {
        const doc = checklistDoc(review, recheck);
        const order = [...REVIEW_STATUSES.map((status) => REVIEW_STATUS_LABEL[status]), REVIEW_GOODS_LABEL, REVIEW_RECHECK_LABEL];
        const labels = doc.groups.map((group) => group.label);
        expect(labels.map((label) => order.indexOf(label))).toEqual([...labels.map((label) => order.indexOf(label))].sort((a, b) => a - b));
        expect(labels.at(-1) === REVIEW_RECHECK_LABEL, run.id).toBe(recheck.length > 0);
        // 품목 의무는 '해당 여부부터' 바로 뒤.
        if (labels.includes(REVIEW_GOODS_LABEL)) expect(labels.indexOf(REVIEW_GOODS_LABEL)).toBe(labels.indexOf(REVIEW_STATUS_LABEL["check-applicability"]) + 1);
        const duties = doc.groups.flatMap((group) => group.entries.map((entry) => entry.duty));
        expect(duties.sort()).toEqual(review.checklist.map((item) => item.duty).sort());
        // 코드에서 본 것은 결과의 요약이 고른 의무가 먼저다. 제재 표가 있으면 그 위에 무거운 제재 먼저(같은 무게끼리는 그 차례).
        const seen = doc.groups.find((group) => group.key === "seen-in-code");
        const top = review.summary.top.filter((duty) => seen?.entries.some((entry) => entry.duty === duty));
        const listed = seen?.entries.map((entry) => entry.duty) ?? [];
        const before = [...top, ...listed.filter((duty) => !top.includes(duty))];
        expect(listed).toEqual(byWeight(before, sanctionOf));
        expect(doc.overview.check).toBe(
          review.checklist.filter((item) => !recheck.includes(item.duty) && ["seen-in-code", "check-outside", "check-applicability"].includes(item.status) && item.group !== "goods").length,
        );
      }
    }
    // jobtalk(2026-11-24): 확인할 것 16건(코드에서 본 것 11, 저장소 밖에서 1, 해당 여부부터 4).
    const jobtalk = checklistDoc(runs[0].review);
    expect(jobtalk.overview.check).toBe(16);
    expect(jobtalk.groups.map((group) => [group.key, group.entries.length])).toEqual([
      ["seen-in-code", 11],
      ["check-outside", 1],
      ["check-applicability", 4],
      ["likely-not-applicable", 1],
      ["not-applicable", 13],
    ]);
  });

  it("마크다운: 맨 위에 자문·인증이 아니라는 말, 저장소·커밋·출처 줄, 할 일 칸은 확인할 것에만. 도구가 거절한 인용은 싣지 않는다", () => {
    for (const { run, review, source } of runs) {
      const doc = checklistDoc(review);
      const text = checklistMarkdown(doc, source);
      expect(text.startsWith(`# 의무 체크리스트 · ${run.owner}/${run.name}\n`)).toBe(true);
      expect(text).toContain(SITE.record.lead);
      expect(text).toContain(source.htmlUrl);
      expect(text).toContain(run.commit.slice(0, 7));
      expect(text).toContain(`- ${SITE.prerun} ${run.ranOn}`);
      expect(text).toContain(`조사 ${review.run.models.investigate}`);
      const todo = doc.groups.filter((group) => group.todo).reduce((n, group) => n + group.entries.length, 0);
      expect(text.match(/^- \[ \] /gm)?.length ?? 0).toBe(todo);
      for (const item of review.checklist) {
        for (const cite of item.citations.filter((cite) => !cite.ok)) {
          // 같은 줄이 다른 의무에서 통과한 인용으로 실렸을 수 있다. 그 의무에서만 본다.
          const ok = review.checklist.some((other) => other.citations.some((o) => o.ok && o.text.trim() === cite.text.trim()));
          if (!ok && cite.text.trim().length > 12) expect(text, `${run.id} ${item.duty}`).not.toContain(cite.text.trim());
        }
        if (item.dutyText && SANCTION.test(item.dutyText)) expect(text).not.toContain(item.dutyText);
      }
      for (const [pattern, why] of BANNED_WORDING) expect(pattern.test(withoutSanctionsMarkdown(text)), `${run.id}: ${why}`).toBe(false);
      expect(checklistFileName(source)).toMatch(/^checklist-[A-Za-z0-9._-]+-[0-9a-f]{7}\.md$/);
    }
  });

  it("처분의 말이 든 의무 한 줄은 싣지 않는다", () => {
    const { review, source } = runs[0];
    const word = String.fromCodePoint(0xacfc, 0xd0dc, 0xb8cc);
    const changed = { ...review, checklist: review.checklist.map((item, i) => (i === 0 ? { ...item, dutyText: `${item.dutyText} ${word}` } : item)) };
    const doc = checklistDoc(changed);
    const entry = doc.groups.flatMap((group) => group.entries).find((e) => e.duty === review.checklist[0].duty)!;
    expect(entry.dutyText).toBe("");
    // 제재 표의 몫(표지, 제재 조문, 원문)은 빼고 본다(docs/commitments.md 1장, 2026-11-24).
    expect(withoutSanctionsMarkdown(checklistMarkdown(doc, source))).not.toContain(word);
  });

  it("분석의 마크다운 파일(GET /api/analyses/{id}/checklist/): review 가 있는 끝난 분석만, 받기 머리와 함께. 합성이면 주소 없이 합성 예시", async () => {
    const response = await getChecklistMarkdown("4qqa6fdx2h", syntheticStore, true);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="checklist-example-studio-genai-chat-5d34db9.md"');
    const text = await response.text();
    expect(text).toContain("- 합성 예시");
    expect(text).toContain("분석 4qqa6fdx2h");
    expect(text).not.toContain("https://github.com/");
    // review 가 없는 분석, 끝나지 않은 분석, 없는 분석.
    for (const id of ["wtk33e9zuf", "9f4gxaqj6s", "zzzzzzzzzz", "../etc"]) expect((await getChecklistMarkdown(id, syntheticStore, true)).status).toBe(404);
  });
});
