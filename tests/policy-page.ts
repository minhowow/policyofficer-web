import { elementAt, elementsOf } from "./helpers";

// 조문 도감(/policy, 의무 지도)을 HTML 에서 읽어 내는 시험용 도구. 부품을 그려 낸 HTML(tests/policy.test.tsx)과 빌드된 쪽의
// HTML(tests/browser/)을 같은 방법으로 읽는다. 읽은 것을 data/duty-map.json 에서 만든 기대값과 견준다.
// 2026-11-25 규칙 기반 검사(scan)를 폐기해 정책 한 쪽(/policy/<id>)을 읽는 도구는 걷었다.

const NAMED = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

/**
 * HTML 의 글자 참조(&amp; &lt; &#x27; 등)를 푼다. 한 번에 훑는다. 차례로 바꾸면 "&amp;lt;" 같은 글이 두 번 풀린다.
 * 모르는 이름은 조용히 넘기지 않고 실패한다. 화면의 글을 글자 그대로 견주려면 푸는 쪽이 틀리지 않아야 한다.
 */
export function decodeEntities(html: string): string {
  return html.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole: string, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      return String.fromCodePoint(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    const char = NAMED.get(body);
    if (char === undefined) throw new Error(`모르는 글자 참조입니다: ${whole}`);
    return char;
  });
}

/** 태그와 주석을 걷어 내고 글만 남긴다. React 가 글 조각 사이에 넣는 주석(<!-- -->)도 걷힌다. */
export function plain(html: string): string {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, ""));
}

/** 글에서 빈칸(줄바꿈까지)을 뺀다. 요소 사이에 빈칸이 있고 없고는 그리는 길마다 다르다. */
export const squash = (text: string) => text.replace(/\s+/g, "");

/** `open` 으로 시작하는 첫 요소. 없으면 null. */
function first(html: string, open: string): string | null {
  const at = html.indexOf(open);
  return at === -1 ? null : elementAt(html, at);
}

function need(html: string, open: string): string {
  const element = first(html, open);
  if (element === null) throw new Error(`요소가 없습니다: ${open}`);
  return element;
}

const attribute = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const openTag = (element: string) => element.slice(0, element.indexOf(">") + 1);

export interface PolicyIndexRead {
  /** 메타 한 줄(CLI 커밋, AI 검토가 묻는 의무·법령·기능의 수). */
  meta: string;
  /** 의무 지도의 몇 개를 AI 검토가 묻고 나머지는 왜 묻지 않는지의 한 줄. */
  lead: string;
  /** 걸러 보기의 고르기(기능, 법령, 제재가 있으면 제재)의 보기 글(첫 보기 '모든 …' 포함). */
  filters: { label: string; options: string[] }[];
  /** 법령 묶음: 제목(수 빼고), 수, 의무 줄. */
  groups: { name: string; count: string; rows: DutyRowRead[] }[];
}

/** 의무 줄 하나(접는 줄). */
export interface DutyRowRead {
  id: string;
  open: boolean;
  /** 줄의 기능 차례(data-f). */
  f: string;
  /** 줄의 제재 무게(data-s, 제재가 없으면 "-1"). */
  s: string;
  title: string;
  /** 제목 옆의 제재 표지와 펼친 안의 제재 조문(2026-11-24). 제재가 없으면 null. */
  sanction: { badge: string; lines: string[]; quotes: string[]; links: string[] } | null;
  /** 둘째 줄의 조각들(조문, 기능). */
  sub: string[];
  /** 펼친 안의 바로 아래 요소들의 class(차례대로). 읽지 않는 것이 더해지면 여기에 보인다. */
  parts: string[];
  /** 펼친 안의 의무 한 줄. 없으면 null. */
  duty: string | null;
  /** 사실 줄(기능, 걸리는 코드, 조문). */
  facts: { label: string; value: string; html: string }[];
  /** 법제처 링크(밖으로 가는 링크. 제재 조문의 링크는 `sanction.links`). */
  ext: string[];
}

/** 요소 안의 바로 아래 요소들. 요소 사이의 글은 빈칸뿐이어야 한다(아니면 읽지 않고 실패한다). */
function childrenOf(element: string): string[] {
  const inner = element.slice(element.indexOf(">") + 1, element.lastIndexOf("</"));
  const out: string[] = [];
  let at = 0;
  while (at < inner.length) {
    if (inner[at] === "<") {
      const child = elementAt(inner, at);
      out.push(child);
      at += child.length;
    } else {
      const next = inner.indexOf("<", at);
      const text = inner.slice(at, next === -1 ? undefined : next);
      if (text.trim()) throw new Error(`요소 사이에 글이 있습니다: ${text}`);
      at = next === -1 ? inner.length : next;
    }
  }
  return out;
}

function dutyRowOf(details: string): DutyRowRead {
  const tag = openTag(details);
  const summary = need(details, "<summary>");
  const sub = need(summary, '<span class="dr-sub">');
  const body = need(details, '<div class="dr-body">');
  const duty = first(body, '<p class="dr-duty">');
  const facts = need(body, '<dl class="dr-facts">');
  const badge = first(summary, '<span class="sanc ');
  const detail = first(body, '<div class="sanc-detail">');
  const rest = detail === null ? body : body.replace(detail, "");
  return {
    id: attribute(tag, "id") ?? "",
    open: / open=""/.test(tag),
    f: attribute(tag, "data-f") ?? "",
    s: attribute(tag, "data-s") ?? "",
    title: plain(need(summary, '<span class="dr-title">')),
    sanction:
      badge === null
        ? null
        : {
            badge: plain(badge.replace(/<span class="sanc-mark"[^>]*>[^<]*<\/span>/, "")).trim(),
            lines: detail === null ? [] : elementsOf(detail, '<p class="sanc-line">').map(plain),
            quotes: detail === null ? [] : elementsOf(detail, '<blockquote class="statute">').map(plain),
            links: detail === null ? [] : [...detail.matchAll(/<a class="ob-ext" href="([^"]*)"/g)].map((m) => decodeEntities(m[1])),
          },
    sub: childrenOf(sub).map(plain),
    parts: childrenOf(body).map((child) => attribute(openTag(child), "class") ?? openTag(child)),
    duty: duty === null ? null : plain(duty),
    facts: elementsOf(facts, "<div>").map((row) => {
      const dd = need(row, "<dd>");
      return { label: plain(need(row, "<dt>")), value: plain(dd), html: dd };
    }),
    ext: [...rest.matchAll(/<a class="ob-ext" href="([^"]*)"/g)].map((m) => decodeEntities(m[1])),
  };
}

/** 조문 도감(/policy, 의무 지도)을 읽는다. 부품만 그려 낸 HTML 이든 빌드된 쪽이든 본문(main) 또는 그 조각을 준다. */
export function readPolicyIndex(html: string): PolicyIndexRead {
  const list = need(html, '<div class="dm-list">');
  const filter = need(html, '<div class="dm-filter">');
  return {
    meta: plain(need(html, '<p class="pi-meta">')),
    lead: plain(need(html, '<p class="dm-lead">')),
    filters: elementsOf(filter, "<label>").map((label) => ({
      label: plain(need(label, "<span>")),
      options: elementsOf(label, "<option").map(plain),
    })),
    groups: elementsOf(list, '<section class="dm-law"').map((section) => {
      const h2 = need(section, "<h2");
      return {
        name: plain(h2.replace(/<span class="count">[\s\S]*?<\/span>/, "")).trim(),
        count: plain(need(h2, '<span class="count">')),
        rows: elementsOf(section, '<details class="duty-row"').map(dutyRowOf),
      };
    }),
  };
}
