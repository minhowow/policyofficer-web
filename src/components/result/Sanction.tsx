import { Icon } from "@/components/Icon";
import { SANCTION_TEXT, sanctionTier, sanctionWhen, type Sanction } from "@/lib/duties/sanction";

/**
 * 의무마다 법에 적힌 제재(2026-11-24 오너 승인, `lib/duties/sanction`). 결과 쪽의 체크리스트와 조문 도감의 의무 줄이 함께
 * 쓴다. 어디에도 요청하지 않는다(조문 도감의 브라우저 부품도 그린다). 글은 제재 표의 것과 `SANCTION_TEXT` 뿐이다.
 */

/**
 * 표지(표의 표지 말 그대로). 세 무게(`SANCTION_TIERS`)를 색 없이도 가른다: 강조는 굵은 글, 두꺼운 테두리, 앞의 느낌표 동그라미. 보통은
 * 얇은 테두리. 흐림은 옅은 글과 점선 테두리. 인쇄(흑백)에도 테두리와 기호가 남는다.
 */
export function SanctionBadge({ sanction }: { sanction: Sanction }) {
  const tier = sanctionTier(sanction);
  return (
    <span className={`sanc sanc-${tier}`}>
      {tier === 0 && (
        <span className="sanc-mark" aria-hidden="true">
          !
        </span>
      )}
      {tier === 0 && " "}
      {SANCTION_TEXT.badge(sanction.label)}
    </span>
  );
}

/** 항목 상세: 제재 조문마다 걸리는 때·제재 문구·법과 조항(법제처 링크)·원문(접어 둔다), 그리고 표의 보충 한 줄. */
export function SanctionDetails({ sanction }: { sanction: Sanction }) {
  if (sanction.items.length === 0 && !sanction.note) return null;
  return (
    <div className="sanc-detail">
      <span className="lbl">{SANCTION_TEXT.head}</span>
      {sanction.items.length > 0 && (
        <ul className="sanc-items">
          {sanction.items.map((item, i) => {
            const when = sanctionWhen(item);
            return (
              <li key={`${item.law}:${item.clause}:${i}`}>
                <p className="sanc-line">
                  {when && <span className="sanc-when">{when}</span>}
                  {when && " "}
                  <span className="sanc-pen">{item.penalty}</span>{" "}
                  <span className="sanc-law">
                    {item.law} {item.clause}
                  </span>
                  {item.url && " "}
                  {item.url && (
                    <a className="ob-ext" href={item.url} target="_blank" rel="noopener noreferrer">
                      법제처
                      <Icon name="external" />
                      <span className="visually-hidden">{`(새 창, ${item.law} ${item.clause})`}</span>
                    </a>
                  )}
                </p>
                <details className="sanc-quote">
                  <summary>{SANCTION_TEXT.quote}</summary>
                  <blockquote className="statute">{item.quote}</blockquote>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {sanction.note && <p className="hint sanc-note">{sanction.note}</p>}
    </div>
  );
}
