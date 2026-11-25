import type { ReactNode } from "react";

/**
 * review 가 있는 쪽의 정적 검사(보조)를 한 줄로 접는다(2026-11-25 web16, docs/commitments.md 1장 '보조 한 줄'). 접힌 줄에는 정적 검사의
 * 수와 AI 검토가 코드에서 본 것의 수를 함께 둔다(같은 저장소에서 둘이 어떻게 다른지 보이게). 그 줄의 0 에는 '0이어도'를 붙이지
 * 않는다(확인할 것이 1 이상인데 붙으면 모순으로 읽힌다. 2026-11-16 오너 지시). 펼치면 지금까지의 정적 검사 구역 전체가 있다.
 */
export function StaticAux({ parts, children }: { parts: string[]; children: ReactNode }) {
  return (
    <details className="aux" id="aux">
      <summary>
        <span className="aux-k">보조</span>
        {parts.map((part) => (
          <span key={part} className="aux-part">
            {" · "}
            {part}
          </span>
        ))}{" "}
        <span className="aux-more">자세히</span>
      </summary>
      <div className="aux-body">{children}</div>
    </details>
  );
}
