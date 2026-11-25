import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PolicyIndexPage from "@/app/policy/page";
import type { Sanction } from "@/lib/duties/sanction";
import { readJson, root } from "./helpers";
import { decodeEntities, plain, readPolicyIndex, squash } from "./policy-page";
import { withoutSanctions } from "./sanctions";
import { BANNED_WORDING } from "./wording";

// 조문 도감(`/policy`, 의무 지도)을 그려서 본다. 빌드된 쪽은 tests/browser/ 의 시험이 같은 도구(tests/policy-page.ts)로 읽는다.
// 2026-11-25 규칙 기반 검사(scan)를 폐기해 정책 한 쪽(/policy/<id>)과 정적 규칙의 표시, 상태의 뜻(#status)·검사에 들지 않는 것
// (#scope) 구역은 쪽에서 빠졌다(docs/commitments.md 의 1). 그것을 보던 시험도 걷었다.

describe("글자 참조를 푸는 도구 (화면의 글을 견주는 데 쓴다)", () => {
  it("이름과 숫자로 적은 참조를 한 번에 푼다. 두 번 풀지 않는다", () => {
    expect(decodeEntities("&lt;개정 2016.3.22&gt; &quot;기간&quot; &#x27;무료&#x27; &#39;A&#39; &amp;")).toBe(`<개정 2016.3.22> "기간" '무료' 'A' &`);
    // "&lt;" 라는 글자 그대로를 적은 것(&amp;lt;)은 "<" 가 되지 않는다.
    expect(decodeEntities("&amp;lt; &amp;amp; &amp;#x27;")).toBe("&lt; &amp; &#x27;");
    expect(decodeEntities("빈칸&nbsp;하나 &#xAC00;&#44032;")).toBe("빈칸 하나 가가");
  });

  it("모르는 이름은 조용히 넘기지 않는다", () => {
    expect(() => decodeEntities("&copy; 2026")).toThrow("모르는 글자 참조");
    expect(() => decodeEntities("&constructor;")).toThrow("모르는 글자 참조");
  });

  it("태그와 React 가 끼워 넣는 주석을 걷어 낸다", () => {
    expect(plain('<h2>규칙 <!-- -->5<!-- -->개</h2><p class="a">A &amp; B</p>')).toBe("규칙 5개A & B");
  });
});

describe("조문 도감 (/policy): 의무 지도", () => {
  // 의무 지도(2026-11-15 오너 결정): CLI 의 기능–의무 표에서 AI 검토가 묻는 의무를 법령별로. 기대값은 data/duty-map.json 을 직접 읽어
  // 만든다(src/lib/duties 의 묶는 함수를 가져다 견주지 않는다).
  const html = renderToStaticMarkup(<PolicyIndexPage />);
  const index = readPolicyIndex(html);
  type Duty = {
    id: string;
    feature: string;
    law: string;
    lawShort: string;
    article: string;
    title: string | null;
    duty: string | null;
    trigger: string | null;
    url: string | null;
    candidate: boolean;
    sanction?: Sanction | null;
  };
  const map = readJson("data", "duty-map.json") as {
    cli: { commit: string; sanctions?: string | null };
    total: number;
    candidates: number;
    asked: number;
    notAsked: { total: number; status: number; other: number };
    features: { id: string; name: string }[];
    duties: Duty[];
  };
  // 쪽 안의 자리 이름: 영문자·숫자·빼기표 밖의 글자는 `_<16진 코드>_`.
  const dutyAnchorOf = (id: string) => `duty-${[...id].map((char) => (/[A-Za-z0-9-]/.test(char) ? char : `_${char.codePointAt(0)!.toString(16)}_`)).join("")}`;
  const rows = index.groups.flatMap((group) => group.rows.map((row) => ({ ...row, group: group.name })));
  const dutyOf = (row: { id: string }) => map.duties.find((duty) => dutyAnchorOf(duty.id) === row.id)!;
  const featureName = (id: string) => map.features.find((feature) => feature.id === id)!.name;
  /** 검토 후보는 아니지만 CLI 가 따로 정해 함께 묻는 의무(의무 표의 krcore 칸). */
  const extra = map.duties.filter((duty) => !duty.candidate).length;

  it("수는 의무 지도의 것이다: 795개 가운데 검토 후보 218개와, CLI 가 따로 정해 함께 묻는 의무", () => {
    expect(map.total).toBe(795);
    expect(map.candidates).toBe(218);
    expect(map.duties.filter((duty) => duty.candidate)).toHaveLength(map.candidates);
    expect(map.asked).toBe(map.duties.length);
    expect(map.asked).toBe(map.candidates + extra);
    expect(map.notAsked.total).toBe(map.total - map.asked);
    expect(map.notAsked.status + map.notAsked.other).toBe(map.notAsked.total);
    // 의무를 옮긴 CLI 커밋은 실행기가 설치하는 커밋이다(수집본과 같은 판).
    expect(readFileSync(path.join(root, ".github/workflows/analyze.yml"), "utf8")).toContain(`CLI_COMMIT: ${map.cli.commit}\n`);
  });

  it("한 줄: 몇 개를 묻고 나머지는 왜 묻지 않는지. 메타 줄은 CLI 커밋·AI 검토가 묻는 의무·법령·기능의 수", () => {
    expect(extra).toBeGreaterThan(0);
    expect(squash(index.lead)).toBe(
      squash(
        `의무 지도 ${map.total}개 가운데 AI 검토가 묻는 것은 검토 후보 ${map.candidates}개와, 검토 후보는 아니지만 CLI 가 따로 정해 함께 묻는 의무 ${extra}개입니다. ` +
          `나머지 ${map.notAsked.total}개는 공공기관·금융회사 같은 지위에 걸리는 의무 ${map.notAsked.status}개와, 조사 확신이 높지 않거나 ` +
          `조문 대조가 맞지 않은 의무 ${map.notAsked.other}개라 묻지 않습니다.`,
      ),
    );
    expect(squash(index.meta)).toBe(
      squash(`CLI ${map.cli.commit.slice(0, 7)} AI 검토가 묻는 의무 ${map.asked} 법령 ${index.groups.length} 기능 ${map.features.length}`),
    );
    expect(html).not.toContain('class="lede"');
  });

  it("법령별 묶음: 의무는 빠짐없이 한 번씩, 의무가 많은 법령이 먼저. 시행령·시행규칙은 그 법이 있으면 법에 묶고 조문 앞에 법령 이름을 붙인다", () => {
    expect(rows.map((row) => row.id).sort()).toEqual(map.duties.map((duty) => dutyAnchorOf(duty.id)).sort());
    for (const group of index.groups) expect(group.count).toBe(String(group.rows.length));
    const sizes = index.groups.map((group) => group.rows.length);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    const names = new Set(map.duties.map((duty) => duty.lawShort));
    for (const row of rows) {
      const duty = dutyOf(row);
      const parent = duty.lawShort.replace(/ (시행령|시행규칙)$/, "");
      expect(row.group, duty.id).toBe(parent !== duty.lawShort && names.has(parent) ? parent : duty.lawShort);
      if (duty.title !== null) {
        const article = row.sub[0];
        expect(article.endsWith(duty.article), duty.id).toBe(true);
        expect(article, duty.id).not.toMatch(/(시행령|시행규칙) \1/);
        if (row.group !== duty.lawShort) expect(article, duty.id).toMatch(new RegExp(`^${row.group} (시행령|시행규칙) `));
      }
    }
    expect(rows.some((row) => row.group !== dutyOf(row).lawShort)).toBe(true);
  });

  it("의무 줄: 제목(없으면 조문), 둘째 줄은 조문·기능뿐. 펼치면 의무 한 줄, 기능, 걸리는 코드, 조문과 법제처 링크(표의 주소), 제재. 모두 접혀 있다", () => {
    for (const row of rows) {
      const duty = dutyOf(row);
      expect(row.open, duty.id).toBe(false);
      if (duty.title !== null) expect(row.title, duty.id).toBe(duty.title);
      else expect(row.title.endsWith(duty.article), duty.id).toBe(true);
      // 둘째 줄에 더 붙는 표시가 없다(2026-11-25 전에는 정적 규칙이 있는 의무에 '정적 규칙' 표시가 있었다).
      expect(row.sub, duty.id).toEqual(duty.title === null ? [featureName(duty.feature)] : [row.sub[0], featureName(duty.feature)]);
      // 펼친 안은 의무 한 줄, 사실 줄, 제재 조문뿐이다(2026-11-25 전에는 정적 규칙의 내용이 이 안에 있었다). 제재 조문도 보충 한 줄도
      // 없는 제재는 표지만 있다.
      const details = Boolean(duty.sanction && (duty.sanction.items.length > 0 || duty.sanction.note));
      expect(row.parts, duty.id).toEqual([...(duty.duty ? ["dr-duty"] : []), "dr-facts", ...(details ? ["sanc-detail"] : [])]);
      expect(row.f, duty.id).toBe(String(map.features.findIndex((feature) => feature.id === duty.feature)));
      expect(row.duty, duty.id).toBe(duty.duty);
      expect(row.facts[0].label).toBe("기능");
      expect(row.facts[0].value.startsWith(featureName(duty.feature)), duty.id).toBe(true);
      const trigger = row.facts.find((fact) => fact.label === "걸리는 코드");
      expect(trigger?.value ?? null, duty.id).toBe(duty.trigger);
      // 조문: 법령 이름과 조문. 표의 조문이 법령 이름의 끝말('시행령')로 시작하면 그 말을 두 번 적지 않는다.
      const law = row.facts.find((fact) => fact.label === "조문")!;
      const sub = / (시행령|시행규칙)$/.exec(duty.law)?.[1];
      const full = sub && duty.article.startsWith(`${sub} `) ? `${duty.law}${duty.article.slice(sub.length)}` : `${duty.law} ${duty.article}`;
      expect(law.value.startsWith(full), duty.id).toBe(true);
      expect(law.value, duty.id).not.toMatch(/(시행령|시행규칙) \1/);
      expect(row.facts.map((fact) => fact.label), duty.id).toEqual(["기능", ...(duty.trigger ? ["걸리는 코드"] : []), "조문"]);
      expect(row.ext, duty.id).toEqual(duty.url ? [duty.url] : []);
      if (duty.url) expect(duty.url.startsWith("https://www.law.go.kr/"), duty.id).toBe(true);
    }
    // 화면에 쓰지 않는 말 때문에 제목을 뺀 의무는 조문이 제목 자리에 온다.
    expect(rows.filter((row) => dutyOf(row).title === null).length).toBeGreaterThan(0);
  });

  // 제재의 무게(2026-11-24 오너 승인): 징역·과징금 / 벌금·과태료 / 명령·없음. 의무 지도에 제재가 있을 때만 걸러 보기와 표지가 있다.
  const TIERS: [string, string[]][] = [
    ["징역·과징금", ["징역", "과징금"]],
    ["벌금·과태료", ["벌금", "과태료"]],
    ["명령·없음", ["명령", "없음"]],
  ];
  const tierOf = (duty: Duty) => (duty.sanction ? TIERS.findIndex(([, classes]) => classes.includes(duty.sanction!.class)) : -1);
  const sanctioned = map.duties.some((duty) => duty.sanction);

  it("걸러 보기: 기능(의무 지도의 기능 차례, 수)과 법령(묶음 차례, 수), 제재가 있으면 제재의 무게(수). 첫 보기는 모두", () => {
    expect(index.filters).toEqual([
      { label: "기능", options: ["모든 기능", ...map.features.map((feature) => `${feature.name} (${map.duties.filter((duty) => duty.feature === feature.id).length})`)] },
      { label: "법령", options: ["모든 법령", ...index.groups.map((group) => `${group.name} (${group.rows.length})`)] },
      ...(sanctioned
        ? [{ label: "제재", options: ["모든 제재", ...TIERS.map(([name], s) => `${name} (${map.duties.filter((duty) => tierOf(duty) === s).length})`)] }]
        : []),
    ]);
  });

  it("제재(있으면): 의무 줄마다 표지 말(2026-11-25 오너 지시로 앞의 '어기면'을 뺐다), 줄의 무게(data-s), 펼치면 제재 조문마다 걸리는 때·문구·법과 조항·법제처 링크와 원문", () => {
    for (const row of rows) {
      const duty = dutyOf(row);
      expect(row.s, duty.id).toBe(String(tierOf(duty)));
      if (!duty.sanction) {
        expect(row.sanction, duty.id).toBeNull();
        continue;
      }
      expect(row.sanction?.badge, duty.id).toBe(duty.sanction.label);
      expect(row.sanction?.lines.length, duty.id).toBe(duty.sanction.items.length);
      duty.sanction.items.forEach((item, i) => {
        const when = [item.via === "order" ? "시정명령 등을 따르지 않았을 때" : null, item.condition].filter(Boolean).join(", ");
        expect(row.sanction!.lines[i].startsWith(`${when ? `${when} ` : ""}${item.penalty} ${item.law} ${item.clause}`), duty.id).toBe(true);
        expect(row.sanction!.quotes[i], duty.id).toBe(item.quote);
      });
      expect(row.sanction?.links, duty.id).toEqual(duty.sanction.items.flatMap((item) => (item.url ? [item.url] : [])));
    }
  });

  it("쪽 안의 링크가 가리키는 자리가 쪽에 있다. 정적 검사의 구역(#status, #scope)은 없다", () => {
    for (const [, id] of html.matchAll(/href="#([^"]*)"/g)) expect(html, id).toContain(` id="${id}"`);
    for (const id of ["status", "scope"]) expect(html).not.toContain(` id="${id}"`);
  });

  it("쓰지 않는 말이 없고(제재 표의 몫은 빼고 본다), 마우스를 올려야 뜨는 말(title)이 없다", () => {
    const shown = plain(withoutSanctions(html));
    for (const [pattern, why] of BANNED_WORDING) expect(pattern.test(shown), `${pattern} — ${why}`).toBe(false);
    expect(html).not.toMatch(/\stitle="/);
    // 조문 앞의 '시행령'이 두 번 적히지 않고, 제재 표지가 '어기면'을 겹쳐 적지 않는다(CLI handoff-w13-2).
    expect(plain(html)).not.toMatch(/(시행령|시행규칙) \1/);
    expect(plain(html)).not.toContain("어기면 · 시정명령을 어기면");
  });
});
