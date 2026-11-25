import type { Metadata } from "next";
import Link from "next/link";
import { StructureFigure } from "@/components/how/StructureFigure";
import { buildFigures, traceSourceLine, type TraceSource } from "@/lib/how/figures";
import { PRERUNS } from "@/lib/service/prerun";
import { analysisHref } from "@/lib/service/href";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: SITE.how.title };

/**
 * 구조 쪽(2026-11-13 오너 지시, 전시와 보고서용). 맨 위는 쉬운 판 둘(처음 보는 사람이 10초 안에 읽는 것)과 따라가 보기(실제 분석
 * 하나가 단계를 지나는 모습, 발표의 중심 장), 그 아래 '자세히 보기'에 자세한 판 둘(만든 사람이 읽는 설계도, 그림마다 글 3~4줄)을 접어
 * 둔다.
 * 빌드할 때 그린다. 그림의 자료와 출처는 src/lib/how/figures.ts, 포스터·보고서용 파일은 docs/figures/(scripts/export-figures.mjs).
 */
export default function HowPage() {
  // 따라가 보기: 미리 돌려 넣은 분석(jobtalk). 그 결과를 실을 때 함께 보이는 것(미리 돌린 결과, 저장소·커밋·돌린 날·모델). 앞의
  // 저장소 이름은 그 분석 쪽으로 가는 링크다.
  const run = PRERUNS[0];
  const traceSource: TraceSource = { owner: run.owner, name: run.name, commit: run.commit, ranOn: run.ranOn, review: run.review };
  const { simple, trace, detailed } = buildFigures(traceSource);
  const source = traceSourceLine(traceSource);
  const repoLabel = `${run.owner}/${run.name}`;
  return (
    <div className="how">
      {/* data-page: 머리글이 지금 쪽(구조)을 표시하는 데 쓴다(CSS :has). */}
      <h1 data-page="how">{SITE.how.title}</h1>
      {[...simple, trace].map((figure, i) => (
        <section key={figure.id} className="how-sec" aria-labelledby={`${figure.id}-h`}>
          <h2 className="sec-h" id={`${figure.id}-h`}>
            {i + 1}. {figure.title}
          </h2>
          <StructureFigure figure={figure} />
          {figure === trace && (
            <p className="how-src">
              <Link href={analysisHref(run.owner, run.name, run.id)}>{repoLabel}</Link>
              {source.slice(repoLabel.length)}
            </p>
          )}
        </section>
      ))}
      <details className="how-more">
        <summary>자세히 보기</summary>
        <div className="how">
          {detailed.map((figure, i) => (
            <section key={figure.id} className="how-sec" aria-labelledby={`${figure.id}-h`}>
              <h3 className="sec-h" id={`${figure.id}-h`}>
                {i + 1}. {figure.title}
              </h3>
              <StructureFigure figure={figure} />
              <ul className="how-notes">
                {figure.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
