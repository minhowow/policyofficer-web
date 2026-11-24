"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { SanctionBadge, SanctionDetails } from "@/components/result/Sanction";
import type { Sanction } from "@/lib/duties/sanction";
import { DutyJump } from "./DutyFilter";

/**
 * 의무 지도의 줄(법령 묶음과 의무 줄). 빌드할 때 서버에서 HTML 로 그려 두고(브라우저 부품도 미리 그린다), 쪽을 옮겨 올 때 받는
 * 내용에는 줄마다 글만 짧게 싣는다(줄 220개를 요소의 나무로 실으면 쪽 하나에 0.5MB 였다). 어디에도 요청하지 않는다. 글은 서버
 * (`DutyMap`)가 고른 것 그대로이고, 정적 규칙(정책)의 내용은 서버가 그린 것을 받아 그 의무 줄 안에 넣는다.
 */

export interface DutyRowData {
  /** 쪽 안의 자리(`dutyAnchor`). */
  id: string;
  /** 기능의 차례(걸러 보기의 data-f). */
  f: number;
  /** 제재의 무게(걸러 보기의 data-s: `SANCTION_TIERS` 의 차례 0 강조, 1 보통, 2 흐림). 제재가 없으면 -1. */
  s: number;
  /** 제목. 화면에 쓰지 않는 말이 들어 뺐으면 null(조문이 제목 자리에 온다). */
  title: string | null;
  /** 묶음 안에서 적는 조문(`articleLabel`). */
  article: string;
  /** 기능 이름과 걸리는 조건(품목, 기능이 있으면 걸림, 이용자 나이). */
  cond: string[];
  duty: string | null;
  trigger: string | null;
  /** 법령 이름과 조문(`fullArticle`). */
  full: string;
  url: string | null;
  /** 정적 규칙이 있는지. */
  rule: boolean;
  /** 정책의 내용이 다른 의무 줄에 있으면 그 줄(정책 이름, 자리, 조문). */
  jump: { title: string; id: string; full: string } | null;
  /** 법에 적힌 제재(2026-11-24 오너 승인). 제재 표가 없는 판이면 null. */
  sanction: Sanction | null;
}

export function DutyRows({ groups, statics }: { groups: { name: string; rows: DutyRowData[] }[]; statics: Record<string, ReactNode> }) {
  return (
    <div className="dm-list">
      {groups.map((group, l) => (
        <section key={group.name} className="dm-law" data-l={l} aria-labelledby={`law-${l}`}>
          <h2 className="sec-h" id={`law-${l}`}>
            {group.name} <span className="count">{group.rows.length}</span>
          </h2>
          <div className="box rows">
            {group.rows.map((row) => (
              <DutyRow key={row.id} row={row} statik={statics[row.id]} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * 의무 한 줄(접는 줄). 첫 줄은 제목(없으면 조문)과 제재 표지(좁은 화면에서는 제목 아래), 둘째 줄은 조문·기능·정적 규칙 표시. 펼치면
 * 의무 한 줄과 사실 줄(기능, 걸리는 코드, 조문과 법제처 링크, 어기면 받는 제재), 정적 규칙.
 */
function DutyRow({ row, statik }: { row: DutyRowData; statik: ReactNode }) {
  return (
    <details className="duty-row" id={row.id} data-f={row.f} data-s={row.s}>
      <summary>
        <span className="dr-head">
          <span className="dr-title">{row.title ?? row.article}</span>
          {row.sanction && " "}
          {row.sanction && <SanctionBadge sanction={row.sanction} />}
        </span>
        <span className="dr-sub">
          {row.title && <span className="dr-law">{row.article}</span>}
          <span>{row.cond[0]}</span>
          {row.rule && <span className="tag">정적 규칙</span>}
        </span>
      </summary>
      <div className="dr-body">
        {row.duty && <p className="dr-duty">{row.duty}</p>}
        <dl className="dr-facts">
          <div>
            <dt>기능</dt>
            <dd>{row.cond.join(" · ")}</dd>
          </div>
          {row.trigger && (
            <div>
              <dt>걸리는 코드</dt>
              <dd>{row.trigger}</dd>
            </div>
          )}
          <div>
            <dt>조문</dt>
            <dd>
              {row.full}
              {row.url && " "}
              {row.url && (
                <a className="ob-ext" href={row.url} target="_blank" rel="noopener noreferrer">
                  법제처
                  <Icon name="external" />
                  <span className="visually-hidden">{`(새 창, ${row.full})`}</span>
                </a>
              )}
            </dd>
          </div>
        </dl>
        {row.sanction && <SanctionDetails sanction={row.sanction} />}
        {row.jump ? (
          <p className="dr-static-link">
            <span className="tag">정적 규칙</span> {row.jump.title}: <DutyJump target={row.jump.id}>{row.jump.full}</DutyJump> 항목에 있음
          </p>
        ) : (
          statik
        )}
      </div>
    </details>
  );
}
