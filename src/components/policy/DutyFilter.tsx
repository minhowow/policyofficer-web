"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { SANCTION_TEXT } from "@/lib/duties/sanction";
import { moveTo } from "@/lib/scroll";

interface FilterProps {
  features: { id: string; name: string; n: number }[];
  laws: { name: string; n: number }[];
  /** 제재의 무게 셋(`SANCTION_TIERS`: 강조, 보통, 흐림). 제재 표가 없는 판이면 비어 있고 고르기를 두지 않는다. */
  tiers: { name: string; n: number }[];
  /** 줄마다 [기능 차례, 법령 차례, 제재 무게(없으면 -1)]. 보이는 줄의 수를 센다. */
  index: [number, number, number][];
}

/**
 * 의무 지도의 걸러 보기(기능, 법령, 제재의 무게. 셋을 함께 건다). 어디에도 요청하지 않고, 주소·방문 기록·브라우저 저장소를 건드리지 않는다. 줄은 서버가 다
 * 그려 두었고(`DutyMap`), 이 부품은 고른 값에 맞지 않는 줄과 법령 묶음을 감추는 CSS 한 줄을 그린다(값은 차례 번호뿐이다).
 * 스크립트가 붙기 전이나 꺼진 브라우저에서는 모든 줄이 보인다.
 *
 * 주소에 `?f=<기능 id>` 가 있으면 그 기능으로 걸러 연다(검색 쪽 곁칸의 기능 링크). 주소의 질의는 빌드할 때 모르므로 그것을 읽는
 * 부분만 브라우저에서 그린다(Suspense. 빌드된 HTML 에는 거르지 않은 채의 고르기가 있다). 쪽 안에서 질의만 바뀌어도(머리글의
 * '조문 도감'을 눌러 ?f= 가 없는 주소로) 따라 바뀐다. 주소의 자리(#duty-…)가 의무 줄이면 그 줄을 펼친다(의무 줄의 주소를 건네받아
 * 연 사람). 쪽 안에서 자리가 바뀌면 거른 것을 풀고 펼친다.
 */
export function DutyFilter(props: FilterProps) {
  return (
    <Suspense fallback={<FilterView {...props} wanted={null} live={false} />}>
      <FilterFromParams {...props} />
    </Suspense>
  );
}

function FilterFromParams(props: FilterProps) {
  const wanted = useSearchParams().get("f");
  return <FilterView {...props} wanted={wanted} live />;
}

function FilterView({ features, laws, tiers, index, wanted, live }: FilterProps & { wanted: string | null; live: boolean }) {
  // 고른 것은 그때의 ?f= 와 함께 둔다. ?f= 가 바뀌면 고른 것을 버리고 주소를 따른다.
  const [picked, setPicked] = useState<{ for: string | null; f: number; l: number; s: number } | null>(null);
  const own = picked !== null && picked.for === wanted ? picked : null;
  const f = own ? own.f : wanted ? features.findIndex((feature) => feature.id === wanted) : -1;
  const l = own ? own.l : -1;
  const s = own ? own.s : -1;
  const pick = (next: { f?: number; l?: number; s?: number }) => setPicked({ for: wanted, f: next.f ?? f, l: next.l ?? l, s: next.s ?? s });
  // 자리가 바뀔 때 거른 것을 푸는 데 쓰는 지금의 ?f=.
  const wantedNow = useRef(wanted);
  useEffect(() => {
    wantedNow.current = wanted;
  }, [wanted]);

  useEffect(() => {
    if (!live) return;
    const open = (reset: boolean) => {
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const element = id ? document.getElementById(id) : null;
      if (!(element instanceof HTMLDetailsElement) || !element.classList.contains("duty-row")) return;
      if (reset) setPicked({ for: wantedNow.current, f: -1, l: -1, s: -1 });
      element.open = true;
      requestAnimationFrame(() => moveTo(element));
    };
    // 처음 열 때는 거른 것이 없다(?f= 와 #duty- 를 함께 주는 링크는 없다).
    open(false);
    const onHash = () => open(true);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [live]);

  const shown = index.filter(([df, dl, ds]) => (f < 0 || df === f) && (l < 0 || dl === l) && (s < 0 || ds === s)).length;
  // 줄을 거르는 것(기능, 제재)은 함께 건다: 맞는 줄만 남기고, 맞는 줄이 없는 법령 묶음과 묶음의 수(거르지 않은 수)를 감춘다. 보이는
  // 수는 아래 '의무 N' 이 말한다.
  const row = `${f >= 0 ? `[data-f="${f}"]` : ""}${s >= 0 ? `[data-s="${s}"]` : ""}`;
  const css = [
    row && `.dm-list .duty-row:not(${row}),.dm-list .dm-law:not(:has(.duty-row${row})),.dm-list .dm-law > h2 > .count{display:none}`,
    l >= 0 && `.dm-list .dm-law:not([data-l="${l}"]){display:none}`,
  ]
    .filter(Boolean)
    .join("");

  return (
    <div className="dm-filter">
      <label>
        <span>기능</span>
        <select value={f} onChange={(event) => pick({ f: Number(event.target.value) })}>
          <option value={-1}>모든 기능</option>
          {features.map((feature, i) => (
            <option key={feature.id} value={i}>
              {feature.name} ({feature.n})
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>법령</span>
        <select value={l} onChange={(event) => pick({ l: Number(event.target.value) })}>
          <option value={-1}>모든 법령</option>
          {laws.map((law, i) => (
            <option key={law.name} value={i}>
              {law.name} ({law.n})
            </option>
          ))}
        </select>
      </label>
      {tiers.length > 0 && (
        <label>
          <span>{SANCTION_TEXT.filter}</span>
          <select value={s} onChange={(event) => pick({ s: Number(event.target.value) })}>
            <option value={-1}>{SANCTION_TEXT.all}</option>
            {tiers.map((tier, i) => (
              <option key={tier.name} value={i}>
                {tier.name} ({tier.n})
              </option>
            ))}
          </select>
        </label>
      )}
      <output className="dm-n" aria-live="polite">
        의무 {shown}
      </output>
      {css && <style>{css}</style>}
    </div>
  );
}
