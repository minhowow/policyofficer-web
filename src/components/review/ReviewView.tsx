import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import type { CodeSource } from "@/lib/service/href";
import { SanctionBadge, SanctionDetails } from "@/components/result/Sanction";
import { Where } from "@/components/result/Where";
import { keepParticles } from "@/components/text";
import { dutyAnchor, dutyTitle, sanctionOf } from "@/lib/duties";
import { lawArticle } from "@/lib/duties/article";
import { byWeight, SANCTION_TEXT, SANCTION_TIERS, sanctionTier, type Sanction } from "@/lib/duties/sanction";
import { REVIEW_STATUSES, type Review, type ReviewCitation, type ReviewItem, type ReviewStatus } from "@/lib/review";
import { layoutFlow } from "@/lib/review/flow";
import { confirmedItems } from "@/lib/review/pick";
import { CHECKS, checkCount, costText, firstSentence, gateText, modelLabel, notAnsweredText, SANCTION, shortStatus, toolCheck, verifySentence } from "@/lib/review/text";
import { REVIEW_GOODS_LABEL, REVIEW_RECHECK_LABEL, REVIEW_STATUS_LABEL } from "@/lib/report/status";
import { fileLink, shortCommit } from "@/lib/service/href";
import { secondsText } from "@/lib/service/steps";
import { SITE } from "@/lib/site";
import { ExpandAll, TierFilter } from "./ChecklistControls";
import { CitedLines, FlowFigure } from "./FlowFigure";

/** 확인할 것(세 갈래)의 수. 체크리스트 내보내기·목록 줄의 수와 같은 함수다(`lib/review/text.ts`). */
export { checkCount };

/**
 * review 결과(policyofficer review 2판)의 화면. 2026-11-25 web18(오너 지시: "확실한 것만 내세워서 비중을 크게 잡아 밀어야 한다")부터
 * 위에서부터:
 *
 * 1. 한 줄: 이 저장소가 하는 일(AI 설명의 첫 문장)과 실행 정보 한 줄.
 * 2. 코드에서 확인된 것(크게, 3건 안팎, `confirmedItems`): 코드에서 본 것 가운데 반박을 견디고 도구가 인용을 받은 것만. 카드 하나는
 *    코드에서 본 사실(조사 답의 `condition`, 없으면 까닭의 첫 문장) → 인용 한 줄과 '도구가 파일에서 확인함' → 걸릴 수 있는 의무(법·조문·
 *    짧은 제목·제재 표지) → 확인할 질문(찾지 못한 것은 그 아래 작게) 차례다. 그 아래 주의 문구 한 번. 후보가 없으면 없다고 적는다.
 * 3. 더 살펴볼 것(작게, 한 줄 행 목록): 나머지 코드에서 본 것 → 저장소 밖에서 → 해당 여부부터. 행을 누르면 그 자리에서 펼쳐진다.
 *    제재 거르개 셋과 모두 펼치기·내보내기는 이 목록 머리에 둔다. 목록 아래 이번 검토가 보지 못한 것 한 줄.
 * 4. 그 아래는 모두 접는다: 개인정보 흐름, 이 저장소가 하는 일(감지된 기능), 닫은 의무(지킨 근거 있음·걸리지 않는 것으로 보임·해당 없음·
 *    모름·품목·다시 검토 중), 검증 정보.
 *
 * 인용은 관문을 통과한 것(`ok`)만 보인다. 의무 한 줄에 처분의 말이 들면 그 줄은 싣지 않는다(docs/commitments.md 1장). 행·카드의 제목은
 * 의무 지도의 짧은 제목(조문 도감과 같은 글)이고, 없으면 의무 한 줄, 그것도 없으면 조문이다. 점수·비율·등급·예상 금액은 두지 않는다.
 *
 * `recheck` 는 사람이 답을 읽고 말이 안 된다고 짚은 의무(2026-11-12 오너 결정)다. 그 상태는 보이지 않고 수에서도 빼며, 닫은 의무 안의
 * "다시 검토 중 N건"에 의무 이름만 접어 둔다. 품목 신호가 없어 묻지 않은 품목 의무(묶음 goods)는 확인할 것의 수에 넣지 않는다.
 *
 * 의무마다 법에 적힌 제재(2026-11-24 오너 승인)를 의무 id 로 의무 지도에서 찾아(`sanctionOf`) 카드·행·펼친 상세에 적는다. 해당 여부부터
 * 확인할 항목의 제재 앞에는 '해당되면'을 둔다. 제재 표가 없는 판이면 거르개·표지·주의 문구가 없다.
 */
export function ReviewView({
  review,
  code = null,
  recheck = [],
  exportLinks,
}: {
  review: Review;
  code?: CodeSource | null;
  recheck?: readonly string[];
  /** 체크리스트 내보내기(마크다운 파일, 인쇄용 보기)의 주소. 없으면 링크를 두지 않는다. */
  exportLinks?: { markdown: string; print: string };
}) {
  const held = review.checklist.filter((item) => recheck.includes(item.duty));
  const items = review.checklist.filter((item) => !recheck.includes(item.duty));
  const sanctioned = review.checklist.some((item) => sanctionOf(item.duty) !== null);
  const cards = confirmedItems(review, items);
  const closed = items.filter((item) => !CHECKS.includes(item.status) || item.group === "goods").length + held.length;
  return (
    <div className="review">
      <Lead review={review} />
      {checkCount(items) === 0 && <p className="hint zero-note">{SITE.zeroCheckIsNotClearance}</p>}
      <section className="rv-confirmed" aria-labelledby="rv-confirmed-h">
        <h2 className="rv-sec-h" id="rv-confirmed-h">
          코드에서 확인된 것 <span className="ck-n">{cards.length}건</span>
        </h2>
        {cards.length > 0 ? (
          <ol className="rv-cards">
            {cards.map((item) => (
              <Card key={item.duty} item={item} code={code} />
            ))}
          </ol>
        ) : (
          <p className="tier-none">없음</p>
        )}
        {sanctioned && <p className="hint sanc-caution">{SANCTION_TEXT.note}</p>}
      </section>
      <More items={items.filter((item) => !cards.includes(item))} review={review} code={code} sanctioned={sanctioned} exportLinks={exportLinks} />
      <Fold id="rv-flow" title="개인정보 흐름">
        {review.flow.nodes.length === 0 ? (
          <p className="tier-none">없음</p>
        ) : (
          <FlowFigure layout={layoutFlow(review.flow.nodes, review.flow.edges)} nodes={review.flow.nodes} edges={review.flow.edges} code={code} />
        )}
      </Fold>
      <Fold id="rv-service" title="이 저장소가 하는 일" count={`기능 ${review.profile.features.filter((feature) => feature.removed === null).length}가지`}>
        <ServiceBody review={review} />
      </Fold>
      <Fold id="rv-closed" title="닫은 의무" count={`${closed}건`}>
        <Closed items={items} held={held} code={code} />
      </Fold>
      <Fold id="rv-verify" title="검증 정보">
        <Verification review={review} code={code} />
      </Fold>
    </div>
  );
}

/** 체크리스트(더 살펴볼 것의 행 목록)를 감싼 요소의 id(제재 거르개가 가리킨다. 쪽에 하나다). 띠는 `{id}-band` 에 붙는다. */
const CHECKLIST_ID = "rv-checklist";

/** 의무의 제재와 그 무게(없으면 null). */
function weightOf(item: ReviewItem): { sanction: Sanction; tier: number } | null {
  const sanction = sanctionOf(item.duty);
  return sanction ? { sanction, tier: sanctionTier(sanction) } : null;
}

/** 접어 둔 구획 하나(쪽 아래의 흐름·하는 일·닫은 의무·검증 정보). 이름 옆에 수를 둘 수 있다. */
function Fold({ id, title, count, children }: { id: string; title: string; count?: string; children: ReactNode }) {
  return (
    <details className="rv-fold" id={id}>
      <summary>
        <h2 className="rv-fold-h">
          {title}
          {count && <span className="ck-n">{count}</span>}
        </h2>
      </summary>
      <div className="rv-fold-body">{children}</div>
    </details>
  );
}

/** 1. 한 줄: 이 저장소가 하는 일(AI 설명의 첫 문장)과 실행 정보(조사·반박 모델, 걸린 시간). */
function Lead({ review }: { review: Review }) {
  const [what] = firstSentence(review.profile.summary);
  const { run } = review;
  return (
    <div className="rv-lead">
      {what && <p className="rv-what">{keepParticles(what)}</p>}
      <p className="rv-run">
        조사 {modelLabel(run.models.investigate)} · 반박 {modelLabel(run.models.verify)} · {secondsText(run.seconds)}
      </p>
    </div>
  );
}

/**
 * 2. 코드에서 확인된 것 카드 하나: 코드에서 본 사실(가장 큰 글. 조사 답의 걸리는 조건, 없으면 까닭의 첫 문장), 첫 인용(파일:줄, 코드 한
 * 줄, 커밋 고정 링크)과 '도구가 파일에서 확인함', 걸릴 수 있는 의무(조문·법제처, 짧은 제목, 제재 표지), 확인할 질문, 찾지 못한 것(작게).
 * 나머지(본 것, 인용 더, 도구 확인, 제재 조문, 찾아본 말, 자세히)는 '자세히' 안에 둔다. 글은 결과에 실린 그대로다.
 */
function Card({ item, code }: { item: ReviewItem; code: CodeSource | null }) {
  const cites = item.citations.filter((cite) => cite.ok && cite.why !== "profile");
  const fact = item.condition || firstSentence(item.reason)[0];
  const sanction = sanctionOf(item.duty);
  return (
    <li className="rv-card" id={dutyAnchor(item.duty)}>
      <p className="rv-fact">{keepParticles(fact)}</p>
      <div className="rv-card-cite">
        <CitedLines citations={cites.slice(0, 1)} code={code} />
        <p className="rv-checked">도구가 파일에서 확인함</p>
      </div>
      <div className="rv-card-duty">
        <p className="rv-law">
          <span>{lawArticle(item.law, item.article)}</span>
          {item.url && (
            <a className="ob-ext" href={item.url} target="_blank" rel="noopener noreferrer">
              법제처
              <Icon name="external" />
              <span className="visually-hidden">{`(새 창, ${lawArticle(item.law, item.article)})`}</span>
            </a>
          )}
        </p>
        <p className="rv-card-title">
          <span className="rv-duty">{keepParticles(titleOf(item))}</span>
          {sanction && " "}
          {sanction && <SanctionBadge sanction={sanction} />}
        </p>
      </div>
      {item.question && (
        <p className="ask-line rv-card-q">
          <span className="lbl">확인할 질문</span> {item.question}
        </p>
      )}
      {item.missing && (
        <p className="ask-line rv-card-missing">
          <span className="lbl">찾지 못한 것</span> {item.missing}
        </p>
      )}
      <details className="f-more">
        <summary>자세히</summary>
        <div className="rv-body">
          <ItemBody item={item} code={code} />
        </div>
      </details>
    </li>
  );
}

/**
 * 3. 더 살펴볼 것: 카드에 오르지 않은 확인할 것을 코드에서 본 것 → 저장소 밖에서 → 해당 여부부터 차례로, 한 줄 행 목록으로. 갈래 안은
 * 무거운 제재 차례(`byWeight`. 같은 무게는 결과에 실린 차례, 코드에서 본 것은 요약이 고른 것 먼저). 머리에 제재 거르개 셋(그 무게의
 * 행만 남긴다)과 모두 펼치기·내보내기 링크. 목록 아래 이번 검토가 보지 못한 것 한 줄.
 */
function More({
  items,
  review,
  code,
  sanctioned,
  exportLinks,
}: {
  items: ReviewItem[];
  review: Review;
  code: CodeSource | null;
  sanctioned: boolean;
  exportLinks?: { markdown: string; print: string };
}) {
  const weigh = (list: ReviewItem[]) => byWeight(list, (item) => sanctionOf(item.duty));
  const raw = items.filter((item) => item.status === "seen-in-code" && item.group !== "goods");
  const top = review.summary.top.flatMap((duty) => raw.filter((item) => item.duty === duty));
  const listOf = (status: ReviewStatus) =>
    status === "seen-in-code" ? weigh([...top, ...raw.filter((item) => !top.includes(item))]) : weigh(items.filter((item) => item.status === status && item.group !== "goods"));
  const groups = CHECKS.map((status) => ({ status, list: listOf(status) })).filter((group) => group.list.length > 0);
  const rows = groups.flatMap((group) => group.list);
  const tiers = SANCTION_TIERS.map((tier, i) => ({ label: tier.label, count: rows.filter((item) => weightOf(item)?.tier === i).length }));
  return (
    <section className="rv-more" aria-labelledby="rv-more-h">
      <div className="rv-more-top">
        <h2 className="rv-sec-h" id="rv-more-h">
          더 살펴볼 것 <span className="ck-n">{rows.length}건</span>
        </h2>
        {sanctioned && rows.length > 0 && <TierFilter target={CHECKLIST_ID} tiers={tiers} />}
        <p className="rv-export">
          {rows.length > 0 && <ExpandAll target={CHECKLIST_ID} />}
          {exportLinks && (
            <>
              <a href={exportLinks.markdown} download>
                마크다운으로 받기
              </a>
              <Link href={exportLinks.print}>인쇄용 보기</Link>
            </>
          )}
        </p>
      </div>
      {rows.length > 0 && (
        <div className="rv-check" id={CHECKLIST_ID}>
          <div id={`${CHECKLIST_ID}-band`} className="rv-band-slot" />
          {groups.map(({ status, list }) => (
            <section key={status} className={`ck ck-check rv-${status}`}>
              <h3 className="ck-hd ck-hd-check">
                {shortStatus(status)} <span className="ck-n">{list.length}건</span>
              </h3>
              <ol className="rv-items">
                {list.map((item) => (
                  <Item key={item.duty} item={item} code={code} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      <p className="hint rv-unseen">
        이번 검토가 보지 못한 것 — 저장소 밖(처리방침·약관·배포 설정) · 읽지 않는 파일(.env 등) · 판단 못 한 의무{" "}
        {items.filter((item) => item.status === "unknown").length}건
      </p>
    </section>
  );
}

/**
 * 접어 둔 '이 저장소가 하는 일': 서비스 설명, 플랫폼, 감지된 기능. 코드를 읽고 뺀 기능과 'AI 가 더함' 꼬리표는 여기 두지 않는다
 * (2026-11-25 오너 지시: 뒤에서 걸러 준 것으로 두고 따로 알리지 않는다. 뺀 기능은 검증 정보 안에 한 줄).
 */
function ServiceBody({ review }: { review: Review }) {
  const kept = review.profile.features.filter((feature) => feature.removed === null);
  const PLATFORM: Record<string, string> = { web: "웹", mobile: "모바일 앱", server: "서버" };
  return (
    <>
      {review.profile.summary && <p className="rv-summary">{keepParticles(review.profile.summary)}</p>}
      {review.profile.platforms.length > 0 && (
        <p className="hint tier-note">
          플랫폼: {review.profile.platforms.map((p) => PLATFORM[p] ?? p).join(" · ")}
          {/* package.json 으로 가르지 못해 AI 가 인용과 함께 정한 플랫폼(handoff-w11-13 부터). */}
          {review.profile.platformsFrom === "model" && " (AI 가 코드에서 인용과 함께 정함)"}
        </p>
      )}
      {kept.length > 0 && (
        <ul className="rv-features">
          {kept.map((feature) => (
            <li key={feature.id}>{feature.name}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** 기능이 있다는 프로필 신호의 파일(줄이 있으면 그 줄까지). 분석 쪽은 GitHub 의 커밋 고정 링크다. */
function SignalFiles({ citations, code }: { citations: ReviewCitation[]; code: CodeSource | null }) {
  if (citations.length === 0) return null;
  return (
    <p className="hint">
      기능 신호:{" "}
      {citations.map((cite, i) => {
        const link = code && fileLink(code.htmlUrl, code.commit, cite.file, cite.line);
        const where = <Where file={cite.file} line={cite.line} />;
        return (
          <span key={`${cite.file}:${cite.line}:${i}`}>
            {i > 0 && ", "}
            {link && code ? (
              <a className="gh" href={link} target="_blank" rel="noopener noreferrer">
                {where}
                <Icon name="external" />
                <span className="visually-hidden">(GitHub, 새 창, 커밋 {shortCommit(code.commit)} 에 고정)</span>
              </a>
            ) : (
              where
            )}
          </span>
        );
      })}
    </p>
  );
}

/** 행의 제목: 의무 지도의 짧은 제목, 없으면 의무 한 줄(처분의 말이 들면 빼고), 그것도 없으면 조문. */
function titleOf(item: ReviewItem): string {
  const duty = item.dutyText && !SANCTION.test(item.dutyText) ? item.dutyText : "";
  return dutyTitle(item.duty) ?? (duty || lawArticle(item.law, item.article));
}

/** 행 첫 줄 오른쪽의 인용한 자리: 관문을 통과한 첫 인용의 파일 이름과 줄(전체 경로는 펼친 상세의 인용에). */
function firstCite(item: ReviewItem): ReviewCitation | null {
  return item.citations.find((cite) => cite.ok && cite.why !== "profile") ?? null;
}

/**
 * 의무 한 건의 행(접는 요소, 조문 도감의 의무 줄을 본떴다). 접힌 두 줄: 제재 칸(제재 갈래 한 낱말, 폭 고정, 강조 무게만 느낌표와
 * 테두리) · 짧은 제목 · 인용한 자리 / 조문 · 제재 표지(해당 여부부터 확인할 항목과 품목 의무는 '해당되면' 한정어를 앞에). 펼치면 상세
 * (`children`). 주소의 자리는 의무 id 로 만든다(`dutyAnchor`, 조문 도감과 같은 꼴).
 */
function Row({ item, held = false, children }: { item: ReviewItem; held?: boolean; children: ReactNode }) {
  const weight = weightOf(item);
  // 다시 검토 중인 의무(`held`)는 상태·인용을 보이지 않는다(상태에 따라 붙는 '해당되면'도 없다).
  const cite = held ? null : firstCite(item);
  const iffy = item.group === "goods" || (!held && item.status === "check-applicability");
  return (
    <li className="rv-item" data-tier={weight ? weight.tier : undefined}>
      <details className="rv-row" id={dutyAnchor(item.duty)}>
        <summary>
          <span className="rv-r1">
            {weight ? (
              <span className={`sanc sanc-${weight.tier} rv-sev`}>
                {weight.tier === 0 && (
                  <span className="sanc-mark" aria-hidden="true">
                    !
                  </span>
                )}
                {weight.sanction.class}
              </span>
            ) : (
              <span className="rv-sev rv-sev-none" aria-hidden="true" />
            )}
            <span className="rv-name">{keepParticles(titleOf(item))}</span>
            {cite && (
              <code className="rv-at" translate="no" title={cite.line === null ? cite.file : `${cite.file}:${cite.line}`}>
                {cite.file.split("/").at(-1)}
                {cite.line !== null && `:${cite.line}`}
              </code>
            )}
          </span>
          <span className="rv-r2">
            <span>{lawArticle(item.law, item.article)}</span>
            {weight && (
              <>
                {" · "}
                <span className="sanc rv-r2-sanc">
                  {iffy && `${SANCTION_TEXT.ifApplies} · `}
                  {SANCTION_TEXT.badge(weight.sanction.label)}
                </span>
              </>
            )}
          </span>
        </summary>
        <div className="rv-body">{children}</div>
      </details>
    </li>
  );
}

/** 펼친 상세의 첫 줄: 조문과 법제처 링크, 제재 표지, 반박이 바꾼 항목의 이름표. */
function LawLine({ item, overturned = false }: { item: ReviewItem; overturned?: boolean }) {
  const sanction = sanctionOf(item.duty);
  return (
    <p className="rv-law">
      <span>{lawArticle(item.law, item.article)}</span>
      {item.url && (
        <a className="ob-ext" href={item.url} target="_blank" rel="noopener noreferrer">
          법제처
          <Icon name="external" />
          <span className="visually-hidden">{`(새 창, ${lawArticle(item.law, item.article)})`}</span>
        </a>
      )}
      {sanction && <SanctionBadge sanction={sanction} />}
      {overturned && <span className="tag">반박이 바꿈</span>}
    </p>
  );
}

/** 의무 한 줄(제목보다 긴 글). 처분의 말이 들면 싣지 않는다. */
function DutyLine({ item }: { item: ReviewItem }) {
  const duty = item.dutyText && !SANCTION.test(item.dutyText) ? item.dutyText : "";
  return duty ? <p className="rv-duty">{keepParticles(duty)}</p> : null;
}

/**
 * 체크리스트의 의무 한 건(펼친 상세). 차례는 포스터의 카드와 같다(2026-11-25 web16): 1 조문(법제처 링크)과 제재 표지(그 아래 의무 한
 * 줄), 2 본 것(AI 가 본 것 첫 문장. 관문이 답을 바꾼 항목은 그 까닭), 3 인용(첫 인용 하나, 둘째부터는 접는다), 4 없는 것, 5 도구 확인,
 * 6 확인할 질문, 7 제재(조문 줄과 법제처 링크, 원문은 접힘), 8 찾아본 말 · 자세히(접힘). 글은 결과에 실린 그대로다.
 */
function Item({ item, code }: { item: ReviewItem; code: CodeSource | null }) {
  return (
    <Row item={item}>
      <ItemBody item={item} code={code} />
    </Row>
  );
}

/** 펼친 상세의 글(행과 카드의 '자세히'가 함께 쓴다). */
function ItemBody({ item, code }: { item: ReviewItem; code: CodeSource | null }) {
  // 관문이 답을 바꾼 항목은 그 까닭을 첫 줄에, 모델의 말은 모두 '자세히'에 둔다.
  const gate = gateText(item);
  const [seen, rest] = gate ? [gate, item.reason] : firstSentence(item.reason);
  const notAnswered = notAnsweredText(item);
  const cites = item.citations.filter((cite) => cite.ok && cite.why !== "profile");
  const signals = item.citations.filter((cite) => cite.ok && cite.why === "profile");
  const sanction = sanctionOf(item.duty);
  const checked = toolCheck(item);
  return (
    <>
      <LawLine item={item} overturned={item.verification === "overturned"} />
      <DutyLine item={item} />
      {seen &&
        (gate ? (
          <p className="rv-seen">{keepParticles(seen)}</p>
        ) : (
          <p className="ask-line rv-seen">
            <span className="lbl">본 것</span> {keepParticles(seen)}
          </p>
        ))}
      <CitedLines citations={cites.slice(0, 1)} code={code} />
      {cites.length > 1 && (
        <details className="f-more rv-more-cites">
          <summary>인용 {cites.length - 1}개 더</summary>
          <CitedLines citations={cites.slice(1)} code={code} />
        </details>
      )}
      <SignalFiles citations={signals} code={code} />
      {item.missing && CHECKS.includes(item.status) && (
        <p className="ask-line">
          <span className="lbl">없는 것</span> {item.missing}
        </p>
      )}
      {checked.length > 0 && (
        <p className="ask-line rv-tool">
          <span className="lbl">도구 확인</span> {checked.join(" · ")}
        </p>
      )}
      {item.question && (
        <p className="ask-line">
          <span className="lbl">확인할 질문</span> {item.question}
        </p>
      )}
      {notAnswered && <p className="hint">{notAnswered}</p>}
      {sanction && <SanctionDetails sanction={sanction} />}
      {item.searches.length > 0 && (
        <details className="f-more">
          <summary>찾아본 말 {item.searches.length}개</summary>
          <ul className="rv-searches">
            {item.searches.map((search, i) => (
              <li key={i}>
                <code translate="no">{search.pattern}</code> <span className="hint">({search.path || "."})</span> 다시 센 줄{" "}
                {search.found === null ? "모름" : `${search.found}줄`}
                {search.claimed !== null && search.claimed !== search.found && (
                  <span className="hint"> · AI 가 적은 수 {search.claimed}줄</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {rest && (
        <details className="f-more">
          <summary>자세히</summary>
          <p className="rv-rest">{keepParticles(rest)}</p>
        </details>
      )}
    </>
  );
}

/**
 * 조문과 의무 한 줄만 적는 의무 한 건. 다시 검토 중인 의무(상태·까닭·인용은 싣지 않는다)와 묻지 않은 품목 의무(`ask` 면 질문까지)가
 * 쓴다.
 */
function HeldItem({ item, ask = false }: { item: ReviewItem; ask?: boolean }) {
  const sanction = sanctionOf(item.duty);
  return (
    <Row item={item} held={!ask}>
      <LawLine item={item} />
      <DutyLine item={item} />
      {ask && item.question && (
        <p className="ask-line">
          <span className="lbl">확인할 질문</span> {item.question}
        </p>
      )}
      {sanction && <SanctionDetails sanction={sanction} />}
    </Row>
  );
}

/**
 * 접어 둔 닫은 의무: 품목 의무(특정 품목을 판다면 확인할 것), 모름, 지킨 근거 있음, 걸리지 않는 것으로 보임, 해당 없음, 다시 검토 중.
 * 갈래마다 접고, 갈래 안은 무거운 제재 차례다. 행 모양은 더 살펴볼 것과 같다.
 */
function Closed({ items, held, code }: { items: ReviewItem[]; held: ReviewItem[]; code: CodeSource | null }) {
  const weigh = (list: ReviewItem[]) => byWeight(list, (item) => sanctionOf(item.duty));
  const goods = weigh(items.filter((item) => item.group === "goods"));
  const rest = REVIEW_STATUSES.filter((status) => !CHECKS.includes(status));
  const heldItems = weigh(held);
  return (
    <div className="rv-check rv-folded">
      {goods.length > 0 && (
        <details className="rv-group rv-goods">
          <summary>
            {REVIEW_GOODS_LABEL} <span className="ck-n">{goods.length}건</span>
          </summary>
          <ol className="rv-items">
            {goods.map((item) => (
              <HeldItem key={item.duty} item={item} ask />
            ))}
          </ol>
        </details>
      )}
      {rest.map((status) => {
        const list = weigh(items.filter((item) => item.status === status && item.group !== "goods"));
        return list.length === 0 ? null : (
          <details key={status} className={`rv-group rv-${status}`}>
            <summary>
              {REVIEW_STATUS_LABEL[status]} <span className="ck-n">{list.length}건</span>
            </summary>
            <ol className="rv-items">
              {list.map((item) => (
                <Item key={item.duty} item={item} code={code} />
              ))}
            </ol>
          </details>
        );
      })}
      {held.length > 0 && (
        <details className="rv-group rv-recheck">
          <summary>
            {REVIEW_RECHECK_LABEL} <span className="ck-n">{held.length}건</span>
          </summary>
          <p className="hint">CLI 를 고친 다음 판에서 다시 돌립니다.</p>
          <ol className="rv-items">
            {heldItems.map((item) => (
              <HeldItem key={item.duty} item={item} />
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

/**
 * 검증 정보(쪽 아래, 2026-11-25 web16): 숫자 나열 대신 문장으로(인용을 파일에서 글자 그대로 확인한 수, '없다' 검색을 다시 돌려 같은 수와
 * 달라 쓰지 않은 수, 반박의 결과). 그 아래 회색 한 줄에 모델·비용(구성과 함께)·시간·가린 비밀값·묻지 않은 의무. 결과에 실린 수
 * 그대로다.
 */
function Verification({ review, code }: { review: Review; code: CodeSource | null }) {
  const { run } = review;
  const removed = review.profile.features.filter((feature) => feature.removed !== null);
  const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);
  const masked = sum(run.masked);
  const notAsked = sum(run.notAsked);
  return (
    <div className="rv-verify-in">
        <p className="rv-verify-say">{verifySentence(run).join(" · ")}</p>
        <p className="rv-verify-meta">
          <span>
            조사 <code translate="no">{run.models.investigate}</code> · 반박 <code translate="no">{run.models.verify}</code>
          </span>
          <span>
            {costText(run)}
            {run.limits && ` (상한 $${run.limits.usd})`}
          </span>
          <span>
            {Math.round(run.seconds)}초{run.limits && ` (상한 ${Math.round(run.limits.seconds)}초)`}
          </span>
          {masked > 0 && <span>가린 비밀값 {masked}개</span>}
          {notAsked > 0 && <span>묻지 않은 의무 {notAsked}개</span>}
        </p>
        {/* 기능 신호가 잡았지만 이해 단계가 코드를 읽고 뺀 기능(2026-11-25 오너 지시: 본문에 따로 알리지 않고 여기 한 줄, 누르면 까닭과 인용). */}
        {removed.length > 0 && (
          <details className="ob ob-test rv-removed">
            <summary>
              코드를 읽고 뺀 기능 <span className="ob-n">{removed.length}가지</span>
            </summary>
            <ul className="features ft-test">
              {removed.map((feature) => (
                <li key={feature.id}>
                  <span className="ft-name">{feature.name}</span>
                  <div>
                    <p className="rv-seen">{feature.removed!.reason}</p>
                    <CitedLines citations={feature.removed!.citations.filter((c) => c.ok)} code={code} />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
    </div>
  );
}
