"use client";

import { useState } from "react";
import { moveTo } from "@/lib/scroll";

/**
 * 맨 위 요약의 강조 무게 항목 수(`SANCTION_TEXT.heavy` N건, 2026-11-24 오너 승인). 누르면 체크리스트(`target`)에서 그 항목(`data-heavy`)만
 * 남기고(그 밖의 항목과 그 항목이 없는 갈래를 감추는 CSS 한 줄), 그 항목이 든 접힌 갈래를 펼친 뒤 첫 항목으로 옮긴다. 다시 누르거나
 * '모두 보기'를 누르면 모두 보인다. 어디에도 요청하지 않고, 주소·방문 기록·브라우저 저장소를 건드리지 않는다.
 */
export function HeavyFilter({ target, label, count }: { target: string; label: string; count: number }) {
  const [on, setOn] = useState(false);
  const toggle = () => {
    const next = !on;
    setOn(next);
    if (!next) return;
    const root = document.getElementById(target);
    if (!root) return;
    for (const details of root.querySelectorAll("details")) {
      if (details.querySelector("[data-heavy]")) details.open = true;
    }
    const first = root.querySelector<HTMLElement>("[data-heavy]");
    requestAnimationFrame(() => moveTo(first ?? root));
  };
  const scope = `#${target}`;
  return (
    <>
      <button type="button" className="sanc-filter" aria-pressed={on} aria-controls={target} onClick={toggle}>
        {label} <b>{count}건</b>
      </button>
      {on && (
        <button type="button" className="sanc-all" onClick={() => setOn(false)}>
          모두 보기
        </button>
      )}
      {on && (
        <style>{`${scope} .rv-item:not([data-heavy]),${scope} > :not(:has([data-heavy])),${scope} details.more:not(:has([data-heavy])){display:none}`}</style>
      )}
    </>
  );
}
