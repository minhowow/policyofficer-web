"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SANCTION_TEXT } from "@/lib/duties/sanction";
import { moveTo } from "@/lib/scroll";

/**
 * 의무 체크리스트(`ReviewView`)의 브라우저 부품(2026-11-25 web16). 어디에도 요청하지 않고, 주소·방문 기록·브라우저 저장소를 건드리지
 * 않는다. 행은 서버가 다 그려 두었고(`<details>`), 이 부품들은 행을 펼치거나 거르는 일만 한다. 스크립트가 없으면 모든 행이 보이고
 * 하나씩 펼쳐진다.
 */

/** 행(의무 한 건)의 접는 요소. */
const ROW = "details.rv-row";

/**
 * 맨 위 요약의 제재 단추 셋(`SANCTION_TIERS`: 강조, 보통, 흐림). 누르면 확인할 것의 세 갈래에서 그 무게의 행만 남기고(그 밖의 행과
 * 그 행이 없는 갈래, 거르지 않은 갈래의 수, 접어 둔 나머지 갈래를 감추는 CSS 한 줄), 목록 머리(`#{target}-band`)에 '…건만 보는 중 · 모두
 * 보기' 띠를 붙인 뒤 그 띠로 옮긴다. 같은 단추를 다시 누르거나 '모두 보기'를 누르면 모두 보인다(초점은 누른 단추로 돌린다). 수가 0인
 * 무게의 단추는 누를 수 없다.
 */
export function TierFilter({ target, tiers }: { target: string; tiers: { label: string; count: number }[] }) {
  const [on, setOn] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const last = useRef(0);
  const pick = (tier: number) => {
    const next = on === tier ? null : tier;
    last.current = tier;
    setOn(next);
    if (next === null) return;
    requestAnimationFrame(() => {
      const band = document.getElementById(`${target}-band`);
      if (band) moveTo(band);
    });
  };
  const scope = `#${target}`;
  // 띠의 자리. 단추를 누른 뒤에만(브라우저에서만) 찾는다.
  const slot = on !== null ? document.getElementById(`${target}-band`) : null;
  return (
    <>
      <span className="ov-sanc rv-tiers" role="group" aria-label={SANCTION_TEXT.filter}>
        {tiers.map((tier, i) => (
          <button
            key={tier.label}
            ref={(element) => {
              buttons.current[i] = element;
            }}
            type="button"
            className={`sanc-filter sf-${i}`}
            aria-pressed={on === i}
            aria-controls={target}
            disabled={tier.count === 0}
            onClick={() => pick(i)}
          >
            {i === 0 && (
              <span className="sanc-mark" aria-hidden="true">
                !
              </span>
            )}
            {tier.label} <b>{tier.count}</b>
          </button>
        ))}
      </span>
      {on !== null && (
        <style>{`${scope} .rv-item:not([data-tier="${on}"]),${scope} .ck:not(:has([data-tier="${on}"])),${scope} .rv-folded,${scope} .ck-n{display:none}`}</style>
      )}
      {on !== null &&
        slot &&
        createPortal(
          <p className="rv-band">
            <span>{SANCTION_TEXT.band(tiers[on].label, tiers[on].count)}</span>
            {" · "}
            <button
              type="button"
              className="sanc-all"
              onClick={() => {
                setOn(null);
                buttons.current[last.current]?.focus();
              }}
            >
              모두 보기
            </button>
          </p>,
          slot,
        )}
    </>
  );
}

/**
 * 목록 위의 '모두 펼치기'. 누르면 목록의 모든 행(접어 둔 나머지 갈래의 행까지)을 펼치고, 다시 누르면 접는다. 주소의 자리(`#duty-…`)가
 * 행이면 처음 열 때와 쪽 안에서 자리가 바뀔 때 그 행을 펼치고(접힌 갈래 안이면 갈래도) 그리로 옮긴다.
 */
export function ExpandAll({ target }: { target: string }) {
  const [all, setAll] = useState(false);
  useEffect(() => {
    const open = () => {
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const element = id ? document.getElementById(id) : null;
      if (!(element instanceof HTMLDetailsElement) || !element.matches(ROW) || !element.closest(`#${target}`)) return;
      for (let parent = element.parentElement?.closest("details"); parent; parent = parent.parentElement?.closest("details")) parent.open = true;
      element.open = true;
      requestAnimationFrame(() => moveTo(element));
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [target]);
  const toggle = () => {
    const root = document.getElementById(target);
    if (!root) return;
    const next = !all;
    for (const row of root.querySelectorAll<HTMLDetailsElement>(ROW)) row.open = next;
    if (next) for (const group of root.querySelectorAll<HTMLDetailsElement>("details.rv-group")) group.open = true;
    setAll(next);
  };
  return (
    <button type="button" className="link-btn" aria-controls={target} aria-expanded={all} onClick={toggle}>
      {all ? "모두 접기" : "모두 펼치기"}
    </button>
  );
}
