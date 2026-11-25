import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import type { CodeSource } from "@/components/result/PolicyCard";
import { SanctionBadge, SanctionDetails } from "@/components/result/Sanction";
import { Tier } from "@/components/result/Tiers";
import { Where } from "@/components/result/Where";
import { keepParticles } from "@/components/text";
import { dutyAnchor, dutyTitle, sanctionOf } from "@/lib/duties";
import { lawArticle } from "@/lib/duties/article";
import { byWeight, SANCTION_TEXT, SANCTION_TIERS, sanctionTier, type Sanction } from "@/lib/duties/sanction";
import { REVIEW_STATUSES, type Review, type ReviewCitation, type ReviewItem, type ReviewStatus } from "@/lib/review";
import { layoutFlow } from "@/lib/review/flow";
import { CHECKS, checkCount, costText, firstSentence, gateText, notAnsweredText, SANCTION, shortStatus, toolCheck, verifySentence } from "@/lib/review/text";
import { REVIEW_GOODS_LABEL, REVIEW_RECHECK_LABEL, REVIEW_STATUS_LABEL } from "@/lib/report/status";
import { fileLink, shortCommit } from "@/lib/service/href";
import { SITE } from "@/lib/site";
import { ExpandAll, TierFilter } from "./ChecklistControls";
import { CitedLines, FlowFigure } from "./FlowFigure";

/** 확인할 것(세 갈래)의 수. 체크리스트 내보내기·목록 줄의 수와 같은 함수다(`lib/review/text.ts`). */
export { checkCount };

/**
 * review 결과(policyofficer review 2판)의 화면. 2026-11-25 web16(SOFTCON 심사 대비, 오너가 2026-11-11 의 하는 일 → 흐름 → 체크리스트
 * 차례를 '과감하게' 바꾸라고 했다)부터 위에서부터:
 *
 * - 요약(쪽 첫 화면 안): 큰 글씨 '확인할 것 N건'과 제재 단추 셋(누르면 그 무게의 행만), 회색 한 줄(감지된 기능 · 걸릴 수 있는 의무 ·
 *   외부로 보냄), 주의 문구 한 번. 점수·비율·등급·예상 금액·'가장 무거운 것'은 두지 않는다.
 * - 1 의무 체크리스트: 확인할 것의 세 갈래는 열린 목록이고 의무 한 건이 두 줄 행이다(어기면 칸 · 짧은 제목 · 인용한 자리 / 조문 ·
 *   제재). 행을 누르면 그 자리에서 펼쳐진다. 나머지 갈래는 목록 아래에 접는다. 목록 아래에 이번 검토가 보지 못한 것 한 줄.
 * - 2 이 저장소가 하는 일, 3 개인정보 흐름 그림, 그리고 검증 정보.
 *
 * `exportLinks` 를 주면 체크리스트 머리 오른쪽에 마크다운으로 받기와 인쇄용 보기 링크를 둔다(내보낸 것은 지금처럼 다 펼친 모양).
 *
 * 인용은 관문을 통과한 것(`ok`)만 보인다. 의무 한 줄에 처분의 말이 들면 그 줄은 싣지 않는다(docs/commitments.md 1장). 행의 제목은 의무
 * 지도의 짧은 제목(조문 도감과 같은 글)이고, 없으면 의무 한 줄, 그것도 없으면 조문이다.
 *
 * `recheck` 는 사람이 답을 읽고 말이 안 된다고 짚은 의무(사례 쪽, 2026-11-12 오너 결정)다. 그 상태는 보이지 않고 갈래 수에서도
 * 빼며, 맨 아래 "다시 검토 중 N건"에 의무 이름만 접어 둔다.
 *
 * 품목 신호가 없어 묻지 않은 품목 의무(묶음 goods)는 "특정 품목을 판다면 확인할 것" 한 줄로 접고 확인할 것의 수에 넣지 않는다. 프로필
 * 신호 인용(`why` profile)은 코드 줄이 아니라 기능이 있다는 파일이라 인용한 줄과 따로 적는다.
 *
 * 의무마다 법에 적힌 제재(2026-11-24 오너 승인)를 의무 id 로 의무 지도에서 찾아(`sanctionOf`. 이미 저장된 분석과 사례에도 그대로
 * 붙는다) 행의 어기면 칸과 둘째 줄, 펼친 상세에 적고, 갈래 안을 무거운 차례로 늘어놓는다(`byWeight`. 같은 무게는 지금 차례). 해당
 * 여부부터 확인할 항목의 제재 앞에는 '해당되면'을 둔다. 제재 표가 없는 판이면 단추·칸·주의 문구가 없다.
 */
export function ReviewView({
  review,
  code = null,
  recheck = [],
  exportLinks,
  runNote,
}: {
  review: Review;
  code?: CodeSource | null;
  recheck?: readonly string[];
  /** 체크리스트 내보내기(마크다운 파일, 인쇄용 보기)의 주소. 없으면(데모의 합성 예시) 링크를 두지 않는다. */
  exportLinks?: { markdown: string; print: string };
  /** 검증 정보에 함께 적는 실행의 사실(사례 쪽: 결과를 낸 CLI 커밋, 판정 규칙만 다시 건 결과면 그 규칙의 CLI 커밋). */
  runNote?: { cli: string; regate: string | null };
}) {
  const held = review.checklist.filter((item) => recheck.includes(item.duty));
  const items = review.checklist.filter((item) => !recheck.includes(item.duty));
  const sanctioned = review.checklist.some((item) => sanctionOf(item.duty) !== null);
  return (
    <div className="tiers review">
      <Summary review={review} items={items} sanctioned={sanctioned} />
      <Tier
        n={1}
        name="의무 체크리스트"
        aside={
          <p className="rv-export">
            <ExpandAll target={CHECKLIST_ID} />
            {exportLinks && (
              <>
                <a href={exportLinks.markdown} download>
                  마크다운으로 받기
                </a>
                <Link href={exportLinks.print}>인쇄용 보기</Link>
              </>
            )}
          </p>
        }
      >
        <Checklist review={review} items={items} held={held} code={code} />
        <p className="hint rv-unseen">
          이번 검토가 보지 못한 것 — 저장소 밖(처리방침·약관·배포 설정) · 읽지 않는 파일(.env 등) · 판단 못 한 의무{" "}
          {items.filter((item) => item.status === "unknown").length}건
        </p>
      </Tier>
      <ServiceTier review={review} code={code} />
      <Tier n={3} name="개인정보 흐름">
        {review.flow.nodes.length === 0 ? (
          <p className="tier-none">없음</p>
        ) : (
          <FlowFigure layout={layoutFlow(review.flow.nodes, review.flow.edges)} nodes={review.flow.nodes} edges={review.flow.edges} code={code} />
        )}
      </Tier>
      <Verification review={review} note={runNote} />
    </div>
  );
}

/** 체크리스트를 감싼 요소의 id(맨 위 요약의 걸러 보기가 가리킨다. 쪽에 체크리스트는 하나다). 띠는 `{id}-band` 에 붙는다. */
const CHECKLIST_ID = "rv-checklist";

/** 개인정보 흐름 단의 자리(요약 줄의 '외부로 보냄 ↓'가 가리킨다). */
const FLOW_ANCHOR = "tier-3";

/** 확인할 것(세 갈래, 묻지 않은 품목 빼고). 맨 위 요약의 수와 제재 단추가 센다. */
const isCheck = (item: ReviewItem) => CHECKS.includes(item.status) && item.group !== "goods";

/** 의무의 제재와 그 무게(없으면 null). */
function weightOf(item: ReviewItem): { sanction: Sanction; tier: number } | null {
  const sanction = sanctionOf(item.duty);
  return sanction ? { sanction, tier: sanctionTier(sanction) } : null;
}

/**
 * 요약(쪽 첫 화면 안, 2026-11-25 web16): 큰 글씨 '확인할 것 N건'과 그 옆 제재 단추 셋(조문 도감의 제재 거르개와 같은 세 무게, 첫 단추는
 * 채운 강조), 회색 한 줄(감지된 기능 · 걸릴 수 있는 의무 · 외부로 보냄과 흐름으로 내려가는 ↓), 주의 문구 한 번. '외부로 보냄'은 흐름
 * 그림의 외부 마디 가운데 화살표가 들어오는 것(이 저장소가 보내는 곳)이고, 없으면 그 조각을 두지 않는다. 개수만 센다.
 */
function Summary({ review, items, sanctioned }: { review: Review; items: ReviewItem[]; sanctioned: boolean }) {
  const check = checkCount(items);
  const checks = items.filter(isCheck);
  const tiers = SANCTION_TIERS.map((tier, i) => ({ label: tier.label, count: checks.filter((item) => weightOf(item)?.tier === i).length }));
  const sentTo = review.flow.nodes.filter((node) => node.kind === "external" && review.flow.edges.some((edge) => edge.to === node.id));
  return (
    <section className="rv-sum" aria-label="요약">
      <div className="rv-sum-top">
        <p className="rv-big">
          확인할 것 <b>{check}건</b>
        </p>
        {sanctioned && <TierFilter target={CHECKLIST_ID} tiers={tiers} />}
      </div>
      {/* 확인할 것이 0건이어도 법적 문제가 없다는 뜻이 아니다(docs/commitments.md 의 1. 보이는 0 바로 아래). */}
      {check === 0 && <p className="hint zero-note">{SITE.zeroCheckIsNotClearance}</p>}
      <p className="rv-meta">
        감지된 기능 {review.profile.features.filter((feature) => feature.removed === null).length}가지 · 걸릴 수 있는 의무{" "}
        {review.obligations.listed}개 중
        {sentTo.length > 0 && (
          <>
            {" · "}외부로 보냄: {sentTo.map((node) => node.label).join(" · ")}{" "}
            <a href={`#${FLOW_ANCHOR}`} className="rv-down">
              <span aria-hidden="true">↓</span>
              <span className="visually-hidden">개인정보 흐름으로</span>
            </a>
          </>
        )}
      </p>
      {sanctioned && <p className="hint sanc-caution">{SANCTION_TEXT.note}</p>}
    </section>
  );
}

/** 2단: 서비스 설명, 플랫폼, 감지된 기능(AI 가 뺀 기능은 접어 둔다). */
function ServiceTier({ review, code }: { review: Review; code: CodeSource | null }) {
  const kept = review.profile.features.filter((feature) => feature.removed === null);
  const removed = review.profile.features.filter((feature) => feature.removed !== null);
  const PLATFORM: Record<string, string> = { web: "웹", mobile: "모바일 앱", server: "서버" };
  return (
    <Tier n={2} name="이 저장소가 하는 일">
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
            <li key={feature.id}>
              {feature.name}
              {!feature.sources.includes("signal") && feature.sources.includes("model") && <span className="tag">AI 가 더함</span>}
            </li>
          ))}
        </ul>
      )}
      {removed.length > 0 && (
        <details className="ob ob-test">
          <summary>
            AI 가 뺀 기능 <span className="ob-n">{removed.length}가지</span>
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
    </Tier>
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
 * 의무 한 건의 행(접는 요소, 조문 도감의 의무 줄을 본떴다). 접힌 두 줄: 어기면 칸(제재 갈래 한 낱말, 폭 고정, 강조 무게만 느낌표와
 * 테두리) · 짧은 제목 · 인용한 자리 / 조문 · 제재 표지(해당 여부부터 확인할 항목과 품목 의무는 '해당되면' 한정어를 앞에). 펼치면 상세
 * (`children`). 주소의 자리는 의무 id 로 만든다(`dutyAnchor`, 조문 도감과 같은 꼴).
 */
function Row({ item, children }: { item: ReviewItem; children: ReactNode }) {
  const weight = weightOf(item);
  const cite = firstCite(item);
  const iffy = item.status === "check-applicability" || item.group === "goods";
  return (
    <li className="rv-item" data-tier={weight ? weight.tier : undefined}>
      <details className="rv-row" id={dutyAnchor(item.duty)}>
        <summary>
          <span className="rv-r1">
            {weight ? (
              <span className={`sanc sanc-${weight.tier} rv-sev`} aria-label={SANCTION_TEXT.column(weight.sanction.class)}>
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
 * 6 확인할 질문, 7 어기면(조문 줄과 법제처 링크, 원문은 접힘), 8 찾아본 말 · 자세히(접힘). 글은 결과에 실린 그대로다.
 */
function Item({ item, code }: { item: ReviewItem; code: CodeSource | null }) {
  // 관문이 답을 바꾼 항목은 그 까닭을 첫 줄에, 모델의 말은 모두 '자세히'에 둔다.
  const gate = gateText(item);
  const [seen, rest] = gate ? [gate, item.reason] : firstSentence(item.reason);
  const notAnswered = notAnsweredText(item);
  const cites = item.citations.filter((cite) => cite.ok && cite.why !== "profile");
  const signals = item.citations.filter((cite) => cite.ok && cite.why === "profile");
  const sanction = sanctionOf(item.duty);
  const checked = toolCheck(item);
  return (
    <Row item={item}>
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
    </Row>
  );
}

/**
 * 조문과 의무 한 줄만 적는 의무 한 건. 다시 검토 중인 의무(상태·까닭·인용은 싣지 않는다)와 묻지 않은 품목 의무(`ask` 면 질문까지)가
 * 쓴다.
 */
function HeldItem({ item, ask = false }: { item: ReviewItem; ask?: boolean }) {
  const sanction = sanctionOf(item.duty);
  return (
    <Row item={item}>
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
 * 의무 체크리스트: 확인할 것의 세 갈래(코드에서 본 것, 저장소 밖에서, 해당 여부부터)는 열린 목록이고, 나머지 갈래는 그 아래에 접는다.
 * 갈래 안의 차례는 무거운 제재 먼저(`byWeight`), 같은 무게끼리는 결과에 실린 그대로(코드에서 본 것은 요약이 고른 것 먼저)다. 목록
 * 머리(`{id}-band`)는 제재 단추를 누른 동안의 띠 자리다.
 */
function Checklist({ review, items, held, code }: { review: Review; items: ReviewItem[]; held: ReviewItem[]; code: CodeSource | null }) {
  const weigh = (list: ReviewItem[]) => byWeight(list, (item) => sanctionOf(item.duty));
  const goods = weigh(items.filter((item) => item.group === "goods"));
  const by = (status: ReviewStatus) => weigh(items.filter((item) => item.status === status && item.group !== "goods"));
  const raw = items.filter((item) => item.status === "seen-in-code" && item.group !== "goods");
  const top = review.summary.top.flatMap((duty) => raw.filter((item) => item.duty === duty));
  const listOf = (status: ReviewStatus) => (status === "seen-in-code" ? weigh([...top, ...raw.filter((item) => !top.includes(item))]) : by(status));
  const heldItems = weigh(held);
  const rest = REVIEW_STATUSES.filter((status) => !CHECKS.includes(status));
  return (
    <div className="rv-check" id={CHECKLIST_ID}>
      <div id={`${CHECKLIST_ID}-band`} className="rv-band-slot" />
      {CHECKS.map((status) => {
        const list = listOf(status);
        return (
          <section key={status} className={`ck ck-check rv-${status}`}>
            <h3 className="ck-hd ck-hd-check">
              {shortStatus(status)} <span className="ck-n">{list.length}건</span>
            </h3>
            {list.length > 0 && (
              <ol className="rv-items">
                {list.map((item) => (
                  <Item key={item.duty} item={item} code={code} />
                ))}
              </ol>
            )}
          </section>
        );
      })}
      <div className="rv-folded">
        {rest.map((status) => {
          const list = by(status);
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
    </div>
  );
}

/**
 * 검증 정보(쪽 아래, 2026-11-25 web16): 숫자 나열 대신 문장으로(인용을 파일에서 글자 그대로 확인한 수, '없다' 검색을 다시 돌려 같은 수와
 * 달라 쓰지 않은 수, 반박의 결과). 그 아래 회색 한 줄에 모델·비용(구성과 함께)·시간·가린 비밀값·묻지 않은 의무, 사례 쪽은 CLI 커밋과
 * 판정 규칙만 다시 적용한 사실. 결과에 실린 수 그대로다.
 */
function Verification({ review, note }: { review: Review; note?: { cli: string; regate: string | null } }) {
  const { run } = review;
  const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);
  const masked = sum(run.masked);
  const notAsked = sum(run.notAsked);
  return (
    <section className="box info rv-verify" aria-labelledby="rv-verify-title">
      <div className="box-hd">
        <h3 id="rv-verify-title">검증 정보</h3>
      </div>
      <div className="box-in rv-verify-in">
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
          {note && (
            <span>
              CLI <code translate="no">{note.cli}</code>
            </span>
          )}
          {note?.regate && (
            <span>
              {SITE.cases.regate} · 규칙 CLI <code translate="no">{note.regate}</code>
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
