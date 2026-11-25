import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dutyAnchor, dutyMap, lawGroups } from "@/lib/duties";
import { analysisHref, checklistHref, repoHref } from "@/lib/service/href";
import { syntheticRepositories, syntheticStore } from "@/lib/service/synthetic";
import { SITE } from "@/lib/site";
import { elementAt, elementsOf, root } from "../helpers";
import { decodeEntities, plain, readPolicyIndex } from "../policy-page";
import { nextDir, serveSite, type Site } from "./site";

// 빌드된 사이트가 브라우저에 내주는 것을 본다. 브라우저는 쓰지 않지만 빌드 뒤에 돌아야 해서 이 단계(`npm run test:browser`)에 둔다.
// B1 까지는 out/ 의 정적 파일을 읽었다. B2 에서 서버가 생겨(`next start`) 분석 서비스의 쪽은 요청 때 그린다. 그래서 쪽의 HTML 은
// 띄운 서버(합성 저장소)에서 받고, JS 묶음·CSS 는 빌드가 내놓은 .next/static 에서, 미리 그려 둔 쪽(조문 도감, 구조)이 쪽을 옮겨 올 때
// 쓰는 내용(.rsc)은 .next/server/app 에서 읽는다. 요청 때 그리는 쪽의 그 내용은 HTML 안에 함께 실려 있다.
//
// 2026-11-25 web17 에서 결과 보기(/view/), 데모(/demo/), 사례(/cases/), 조문 도감의 정책 쪽(/policy/<이름>/)과 팩 메타데이터를 걷었다.
// 걷은 주소는 404 이고 빌드에도 없다. 팩 작성자 메모(rationale)를 찾던 시험은 그 글을 읽는 곳이 사이트에 없어져 함께 걷었다.

/** 받아 볼 쪽: 첫 화면, 구조, 조문 도감, 인쇄용 보기, 검색, 합성 저장소마다, 합성 분석마다. */
const hits = syntheticRepositories();
const PAGES = [
  "/",
  "/how/",
  "/policy/",
  checklistHref("example-studio", "genai-chat", "4qqa6fdx2h"),
  "/search/",
  "/search/?q=example",
  ...hits.map(({ repository: r }) => repoHref(r.owner, r.name)),
  ...(await Promise.all(hits.map(({ repository: r }) => syntheticStore.listAnalyses(r.owner, r.name))))
    .flat()
    .map((a) => analysisHref(a.owner, a.name, a.id)),
];

/**
 * 걷은 주소(web17). 쪽과 /api/ 의 파일, 정책 쪽은 걷기 전의 이름 하나씩(점 없는 주소)이다. 모두 404 여야 한다. 남아 있으면
 * 걷은 것을 내주는 것이다.
 */
const REMOVED = [
  "/view/",
  "/demo/",
  "/demo/review/",
  "/cases/",
  "/cases/jobtalk/",
  "/cases/jobtalk/checklist/",
  "/api/cases/jobtalk/checklist/",
  "/policy/kr-pipa-22-2/",
  "/policy/kr-ai-basic-act-31-1/",
];

/** 쪽 주소를 out/ 때의 파일 이름처럼 적는다: "/" → "index.html", "/view/" → "view/index.html", 질의는 이름에 붙인다. */
const pageFile = (pathname: string, ext: "html" | "txt") => {
  const [route, query] = pathname.split("?");
  const dir = route.replace(/^\//, "");
  return path.join(dir, query ? `?${query}` : "", `index.${ext}`);
};

/** .next 아래의 모든 파일(저장소 기준 경로). */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

let site: Site | undefined;
/** 브라우저가 받는 것: 쪽의 HTML, 미리 그린 쪽의 내용(.txt 로 적는다), JS 묶음, CSS. */
const contents: { file: string; text: string }[] = [];
let favicon: Buffer = Buffer.alloc(0);

beforeAll(async () => {
  site = await serveSite();
  for (const pathname of PAGES) {
    const response = await fetch(`${site.origin}${pathname}`);
    if (response.status !== 200) throw new Error(`${pathname}: ${response.status}`);
    contents.push({ file: pageFile(pathname, "html"), text: await response.text() });
  }
  // 미리 그린 쪽이 쪽을 옮겨 올 때 쓰는 내용. 서버가 이 파일을 그대로 내준다.
  const app = path.join(nextDir, "server", "app");
  for (const file of filesUnder(app).filter((f) => f.endsWith(".rsc"))) {
    const route = path.relative(app, file).replace(/\.rsc$/, "");
    if (route.startsWith("_")) continue;
    contents.push({ file: path.join(route === "index" ? "" : route, "index.txt"), text: readFileSync(file, "utf8") });
  }
  for (const file of filesUnder(path.join(nextDir, "static")).filter((f) => /\.(js|css)$/.test(f))) {
    contents.push({ file: path.join("_next", path.relative(nextDir, file)), text: readFileSync(file, "utf8") });
  }
  favicon = Buffer.from(await (await fetch(`${site.origin}/favicon.ico`)).arrayBuffer());
}, 60_000);

afterAll(async () => {
  await site?.close();
});

/**
 * 빌드된 쪽에서 본문(main) 밖의 것: 사이트의 머리와 바닥. 본문은 비워서 자리만 남긴다. React 가 끼워 넣는 주석과 스크립트는
 * 걷어 낸다(Next 가 바닥 뒤에 싣는 스크립트는 쪽을 옮겨 올 때 쓰는 내용이라 쪽마다 다르다).
 */
function chromeOf(html: string): string {
  const bare = html.replace(/<!--[\s\S]*?-->/g, "");
  const body = elementAt(bare, bare.indexOf("<body"));
  const mains = elementsOf(body, "<main");
  if (mains.length !== 1) throw new Error(`쪽의 본문(main)이 하나가 아닙니다: ${mains.length}개`);
  const [main] = mains;
  const start = body.indexOf(main);
  const outside = `${body.slice(0, start)}${main.slice(0, main.indexOf(">") + 1)}</main>${body.slice(start + main.length)}`;
  return outside.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
}

/** 빌드된 쪽의 본문(main) 바로 아래 요소들의 여는 태그. 요소 사이에 빈칸이 아닌 글이 있으면 실패한다. */
function mainChildren(html: string): string[] {
  const [main] = elementsOf(html.replace(/<!--[\s\S]*?-->/g, ""), "<main");
  const inner = main.slice(main.indexOf(">") + 1, -"</main>".length);
  const tags: string[] = [];
  let at = 0;
  for (let next = inner.indexOf("<"); next !== -1; next = inner.indexOf("<", at)) {
    if (inner.slice(at, next).trim() !== "") throw new Error(`본문의 요소 사이에 글이 있습니다: ${inner.slice(at, next).slice(0, 60)}`);
    const element = elementAt(inner, next);
    tags.push(element.slice(0, element.indexOf(">") + 1));
    at = next + element.length;
  }
  if (inner.slice(at).trim() !== "") throw new Error(`본문의 끝에 글이 있습니다: ${inner.slice(at).slice(0, 60)}`);
  return tags;
}

describe("빌드된 사이트가 내주는 것", () => {
  /** 파일에 적힌 바깥 주소 전부(HTML 의 링크와, 쪽을 옮겨 올 때 쓰는 내용에 실린 것). */
  const outsideUrls = (text: string) => [...new Set([...text.matchAll(/https?:[^\s"'\\<>]*/g)].map((match) => match[0]))].sort();
  const htmlPages = () => contents.filter(({ file }) => file.endsWith(".html"));

  it("볼 것이 있다 (쪽, 미리 그린 쪽의 내용, JS 묶음, CSS)", () => {
    const kinds = new Set(contents.map(({ file }) => path.extname(file)));
    for (const kind of [".html", ".txt", ".js", ".css"]) expect(kinds.has(kind), kind).toBe(true);
    expect(contents.length).toBeGreaterThan(30);
    // 분석 서비스의 쪽(요청 때 그린다)도 들어 있다.
    expect(contents.some(({ file }) => file === pageFile("/r/example-org/kids-signup/a/wtk33e9zuf/", "html"))).toBe(true);
    // 빌드할 때 미리 그린 쪽(쪽을 옮겨 올 때 쓰는 내용이 있는 쪽)은 구조와 조문 도감 둘이다. 나머지는 요청 때 그린다. 쪽마다 나눠
    // 받는 조각(.segments)은 세지 않는다.
    const prerendered = contents.filter(({ file }) => file.endsWith(".txt") && !file.includes(".segments")).map(({ file }) => file);
    expect(prerendered.sort()).toEqual([path.join("how", "index.txt"), path.join("policy", "index.txt")]);
  });

  it("걷은 쪽과 파일(결과 보기, 데모, 사례, 정책 쪽, 사례의 체크리스트 파일)은 404 이고, 빌드에도 없다", async () => {
    for (const pathname of REMOVED) {
      const response = await fetch(`${site!.origin}${pathname}`);
      await response.arrayBuffer();
      expect(response.status, pathname).toBe(404);
    }
    // 빌드가 그 쪽을 만들지 않았다(미리 그린 쪽도, 요청 때 그리는 쪽의 코드도).
    const app = path.join(nextDir, "server", "app");
    for (const dir of ["view", "demo", "cases", path.join("api", "cases")]) {
      expect(existsSync(path.join(app, dir)), dir).toBe(false);
      expect(existsSync(path.join(app, `${dir}.html`)), dir).toBe(false);
    }
    // 조문 도감 아래에는 목록의 코드만 있다(정책 쪽의 .html 이나 [id] 폴더가 없다).
    expect(readdirSync(path.join(app, "policy")).filter((name) => name !== "page" && !name.startsWith("page.") && !name.startsWith("page_"))).toEqual([]);
    // 어느 쪽에서도 걷은 주소로 가는 링크가 없다.
    for (const { file, text } of htmlPages()) {
      expect(text, file).not.toMatch(/href="\/(view|demo|cases)\//);
      expect(text, file).not.toMatch(/href="\/policy\/[^"?#]/);
    }
  });

  it("사이트의 머리와 바닥은 모든 쪽에서 글자까지 같다. 머리의 메뉴는 최근 분석·조문 도감·구조다. 구조 쪽의 본문(main)에는 정해 둔 것뿐이다", () => {
    // 쪽(page.tsx)이 한 쪽의 머리나 바닥에만 글을 더하면 여기서 걸린다(ROADMAP 8번).
    const pages = htmlPages();
    expect(pages.map(({ file }) => file)).toEqual(expect.arrayContaining(["index.html", path.join("how", "index.html"), path.join("policy", "index.html")]));
    const chromes = pages.map(({ file, text }) => ({ file, chrome: chromeOf(text) }));
    for (const { file, chrome } of chromes) expect(chrome, file).toBe(chromes[0].chrome);
    // 빈 것끼리 견준 것이 아니다. 사이트의 머리와 바닥이 있다.
    expect(chromes[0].chrome).toContain('<header class="site-header">');
    expect(plain(chromes[0].chrome)).toContain(SITE.disclaimer);
    // 넓은 화면의 메뉴와 좁은 화면의 펼치는 메뉴가 같은 링크 셋을 갖는다(web17 에서 사례가 빠졌다).
    const header = elementAt(chromes[0].chrome, chromes[0].chrome.indexOf('<header class="site-header">'));
    const navs = [...elementsOf(header, '<nav class="hdr-nav"'), ...elementsOf(header, '<nav class="menu-pop"')];
    expect(navs).toHaveLength(2);
    for (const nav of navs) expect([...nav.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1])).toEqual(["/search/", "/policy/", "/how/"]);

    // 구조 쪽의 본문: 그림 묶음 하나. 그 사이와 둘레에 다른 글이나 요소가 없다.
    const how = contents.find(({ file }) => file === path.join("how", "index.html"))!.text;
    expect(mainChildren(how)).toEqual(['<div class="how">']);
  });

  it("바깥 주소: 눌러야 나가는 법제처 링크뿐이다. 모두 새 창이고 rel 이 있다. 스스로 받아 오는 것(그림, 틀, 글꼴, 스크립트)에는 바깥 주소가 없다", () => {
    let links = 0;
    for (const { file, text } of contents.filter((entry) => !entry.file.endsWith(".js") && !entry.file.endsWith(".css"))) {
      // 쪽을 옮겨 올 때 쓰는 내용은 조각으로 나뉘어 실려 주소가 중간에서 끊길 수 있다. 앞부분만 본다.
      for (const url of outsideUrls(text)) expect(url, file).toMatch(/^https:\/\/www\.law\.go/);
      for (const tag of text.match(/<(?:img|iframe|script|link|source|video|audio|embed|object)\b[^>]*>/g) ?? []) {
        expect(tag, file).not.toMatch(/https?:/);
      }
      for (const anchor of text.match(/<a [^>]*href="https?:[^"]*"[^>]*>/g) ?? []) {
        expect(anchor, file).toMatch(/href="https:\/\/www\.law\.go\.kr\//);
        expect(anchor, file).toContain('target="_blank"');
        expect(anchor, file).toContain('rel="noopener noreferrer"');
        links += 1;
      }
    }
    // 빈 것끼리 견준 것이 아니다(조문 도감과 결과 쪽의 법제처 링크).
    expect(links).toBeGreaterThan(dutyMap.asked);
  });

  it("쪽 안의 링크(#…)·다른 쪽의 자리로 가는 링크와, id 로 가리키는 속성(aria-labelledby·aria-controls·aria-describedby·for)이 가리키는 자리가 그 쪽에 있다", () => {
    const links = htmlPages().flatMap(({ file, text }) =>
      [...text.matchAll(/<a [^>]*href="((?:\/[^"#]*)?)#([^"]+)"/g)].map((match) => ({ file, pathname: decodeEntities(match[1]), id: decodeEntities(match[2]) })),
    );
    // id 로 가리키는 속성. 쪽을 옮겨 올 때 쓰는 내용(스크립트 안)은 빼고 태그만 읽는다.
    const refs = htmlPages().flatMap(({ file, text }) =>
      [...text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").matchAll(/<[a-z][^>]*>/g)].flatMap(([tag]) =>
        [...tag.matchAll(/\s(aria-labelledby|aria-controls|aria-describedby|for)="([^"]*)"/g)].flatMap((match) =>
          decodeEntities(match[2])
            .split(/\s+/)
            .filter(Boolean)
            .map((id) => ({ file, attr: match[1], id })),
        ),
      ),
    );
    // 빈 것끼리 견준 것이 아니다. 2026-11-25 web18 에서 결과 쪽 요약의 ↓ 링크가 빠져 쪽 안의 링크는 없을 수 있다. 결과 쪽(review)에는
    // 두 구획의 머리(aria-labelledby)와, 제재 거르개·모두 펼치기가 가리키는 체크리스트(aria-controls)가 있다.
    const reviewed = pageFile(analysisHref("example-studio", "genai-chat", "4qqa6fdx2h"), "html");
    expect(refs.filter((ref) => ref.file === reviewed).map((ref) => `${ref.attr} ${ref.id}`)).toEqual(
      expect.arrayContaining(["aria-labelledby rv-confirmed-h", "aria-labelledby rv-more-h", "aria-controls rv-checklist"]),
    );
    for (const { file, attr, id } of refs) {
      expect(contents.find((entry) => entry.file === file)!.text, `${file}: ${attr}="${id}"`).toContain(` id="${id}"`);
    }
    for (const { file, pathname, id } of links) {
      const target = pathname === "" ? contents.find((entry) => entry.file === file) : contents.find((entry) => entry.file === pageFile(pathname, "html"));
      // 다른 쪽이면 끝에 빗금이 있는 주소다(next.config 의 trailingSlash). 그 쪽을 받아 두었다.
      if (pathname !== "") expect(pathname, `${file}: ${pathname}#${id}`).toMatch(/\/$/);
      expect(target, `${file}: ${pathname}#${id}`).toBeDefined();
      expect(target!.text, `${file}: ${pathname}#${id}`).toContain(` id="${id}"`);
    }
  });

  it("파비콘: /favicon.ico 가 소스의 파일(src/app/favicon.ico) 그대로이고, 모든 쪽의 머리에 그 파일을 가리키는 link 가 하나 있다", () => {
    // 9번 전에는 파비콘이 없어 브라우저가 스스로 청한 /favicon.ico 가 404 로 돌아왔다(브라우저 시험이 그 콘솔 오류를 봐주고
    // 있었다). Next 의 파일 규칙(app/favicon.ico)으로 두면 서버가 그 파일을 내주고 쪽마다 link 를 단다.
    const source = readFileSync(path.join(root, "src", "app", "favicon.ico"));
    expect(favicon.equals(source)).toBe(true);
    // ICO 파일이다(머리의 예약 0, 종류 1, 그림이 하나 이상).
    expect([source.readUInt16LE(0), source.readUInt16LE(2), source.readUInt16LE(4) > 0]).toEqual([0, 1, true]);
    const pages = htmlPages();
    expect(pages.length).toBeGreaterThan(5);
    for (const { file, text } of pages) {
      const head = elementAt(text, text.indexOf("<head"));
      const icons = [...head.matchAll(/<link\b[^>]*\brel="(?:shortcut )?icon"[^>]*>/g)].map((match) => match[0]);
      expect(icons, file).toHaveLength(1);
      expect(icons[0], file).toMatch(/\bhref="\/favicon\.ico(\?[^"]*)?"/);
    }
  });
});

describe("빌드된 사이트의 조문 도감(/policy/, 의무 지도)", () => {
  const html = () => contents.find(({ file }) => file === path.join("policy", "index.html"))!.text;

  it("AI 검토가 묻는 의무가 빠짐없이 법령 묶음에 있고, 메타 한 줄과 의무 지도 한 줄이 의무 지도의 수 그대로다", () => {
    const index = readPolicyIndex(html());
    const rows = index.groups.flatMap((group) => group.rows);
    expect(rows.map((row) => row.id).sort()).toEqual(dutyMap.duties.map((duty) => dutyAnchor(duty.id)).sort());
    expect(rows).toHaveLength(dutyMap.asked);
    expect(index.groups.map((group) => group.name)).toEqual(lawGroups().map((group) => group.name));
    expect(index.meta).toBe(`CLI ${dutyMap.cli.commit.slice(0, 7)} AI 검토가 묻는 의무 ${dutyMap.asked} 법령 ${lawGroups().length} 기능 ${dutyMap.features.length}`);
    expect(index.lead).toContain(`의무 지도 ${dutyMap.total}개`);
  });

  it("정적 규칙의 흔적이 없다: '정적 규칙' 글, 상태의 뜻(#status)과 검사에 들지 않는 것(#scope)의 구획, 의무 줄 안의 정책 묶음", () => {
    for (const text of [html(), contents.find(({ file }) => file === path.join("policy", "index.txt"))!.text]) {
      expect(text).not.toContain("정적 규칙");
      expect(text).not.toMatch(/ id="(status|scope)"/);
      expect(text).not.toMatch(/dr-static/);
    }
    for (const row of readPolicyIndex(html()).groups.flatMap((group) => group.rows)) {
      expect(row.parts.filter((part) => !["dr-duty", "dr-facts", "sanc-detail"].includes(part)), row.id).toEqual([]);
    }
  });
});
