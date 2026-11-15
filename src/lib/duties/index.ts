import raw from "@data/duty-map.json";

/**
 * 의무 지도(조문 도감 /policy/, 2026-11-15 오너 결정). CLI 의 기능–의무 표와 검토 후보 표에서 AI 검토(review)가 묻는 의무만
 * 옮긴 것이다(`node scripts/export-duty-map.mjs` → data/duty-map.json, 실행기가 설치하는 CLI 커밋에서 읽는다). 나머지 의무는 갈래별
 * 수만 있다. 조문 원문은 싣지 않고 법제처 주소만 둔다(조문 원문은 팩 메타데이터의 것만 싣는다). 화면에 쓰지 않는 말이 든 제목·의무
 * 한 줄·걸리는 코드는 내보낼 때 null 로 두었다(화면은 법·조문만 적는다).
 */

export interface MapDuty {
  id: string;
  /** 기능 id(features 의 id). 'common' 은 거의 모든 서비스. */
  feature: string;
  law: string;
  lawShort: string;
  kind: string;
  article: string;
  title: string | null;
  duty: string | null;
  /** 코드에서 그 의무가 걸리는 곳(CLI 표의 trigger). */
  trigger: string | null;
  url: string | null;
  /** 검토 후보인지. 아니면 kr-core 의무라서 묻는다(기능이 있거나 정적 규칙이 걸리면). */
  candidate: boolean;
  /** 이 의무를 가리키는 정적 규칙 팩의 정책 id. */
  policies: string[];
  /** 그 기능이 있으면 걸리는 의무(review 가 '해당 없음'을 받지 않는다). */
  whenever: boolean;
  /** 이용자가 누구인지(나이)에 걸리는 의무. */
  audience: boolean;
  /** 특정 품목을 팔 때만 걸리는 의무의 품목 이름. */
  goods: string | null;
}

export interface DutyMap {
  cli: { commit: string };
  total: number;
  candidates: number;
  asked: number;
  notAsked: { total: number; status: number; other: number };
  features: { id: string; name: string }[];
  /** 정책 id → 그 정책이 든 의무 id(팩에 적힌 첫 의무). */
  policyHome: Record<string, string>;
  duties: MapDuty[];
}

export const dutyMap = raw as DutyMap;

/**
 * 쪽 안의 자리 이름. 의무 id 에서만 만든다(빌드마다 같다). 영문자·숫자·빼기표 밖의 글자(의무 id 에 한글이 든 것이 있다)는 규칙의
 * 자리(`ruleAnchor`)와 같게 `_<16진 코드>_` 로 바꾼다.
 */
export function dutyAnchor(id: string): string {
  return `duty-${id.replace(/[^A-Za-z0-9-]/gu, (char) => `_${char.codePointAt(0)!.toString(16)}_`)}`;
}

/** 조문 도감을 기능 하나로 걸러 연 주소(`DutyFilter` 가 `?f=` 를 읽는다). */
export function dutyFeatureHref(featureId: string): string {
  return `/policy/?f=${encodeURIComponent(featureId)}`;
}

export function featureName(id: string): string {
  return dutyMap.features.find((feature) => feature.id === id)?.name ?? id;
}

/** 정책의 내용을 싣는 의무(팩에 적힌 그 정책의 첫 의무). */
export function policyHomeDuty(policyId: string): MapDuty | null {
  const id = dutyMap.policyHome[policyId];
  return dutyMap.duties.find((duty) => duty.id === id) ?? null;
}

/**
 * 법령 이름과 조문. 표의 조문이 법령 이름의 끝말('시행령'·'시행규칙')로 시작하면 그 말을 두 번 적지 않는다('근로기준법 시행령
 * 시행령 제9조…'가 아니라 '근로기준법 시행령 제9조…').
 */
export function fullArticle(duty: MapDuty): string {
  const sub = SUB.exec(duty.law)?.[1];
  return sub && duty.article.startsWith(`${sub} `) ? `${duty.law}${duty.article.slice(sub.length)}` : `${duty.law} ${duty.article}`;
}

export interface LawGroup {
  /** 묶음 이름(법령의 줄인 이름). 시행령·시행규칙은 그 법이 함께 있으면 법에 묶는다. */
  name: string;
  duties: MapDuty[];
}

const SUB = / (시행령|시행규칙)$/u;

/** 법령별 묶음. 의무가 많은 법령이 먼저, 같으면 이름 차례. 묶음 안은 조문 차례(표의 차례). */
export function lawGroups(duties: readonly MapDuty[] = dutyMap.duties): LawGroup[] {
  const names = new Set(duties.map((duty) => duty.lawShort));
  const groups = new Map<string, MapDuty[]>();
  for (const duty of duties) {
    const parent = duty.lawShort.replace(SUB, "");
    const key = parent !== duty.lawShort && names.has(parent) ? parent : duty.lawShort;
    groups.set(key, [...(groups.get(key) ?? []), duty]);
  }
  return [...groups]
    .map(([name, list]) => ({ name, duties: list }))
    .sort((a, b) => b.duties.length - a.duties.length || a.name.localeCompare(b.name, "ko"));
}

/**
 * 의무 줄에 적는 조문. 묶음 이름과 법령이 다르면(법에 묶은 시행령·시행규칙) 법령 이름을 앞에 붙인다. 표의 조문이 이미 '시행령 …'
 * 으로 시작하면 그 말을 두 번 적지 않는다.
 */
export function articleLabel(duty: MapDuty, group: string): string {
  if (duty.lawShort === group) return duty.article;
  const sub = SUB.exec(duty.lawShort)?.[1];
  if (sub && duty.article.startsWith(`${sub} `)) return `${duty.lawShort.replace(SUB, "")} ${duty.article}`;
  return `${duty.lawShort} ${duty.article}`;
}
