/**
 * 법령 이름과 조문을 이어 적는다. 조문이 법령 이름의 끝말('시행령'·'시행규칙')로 시작하면 그 말을 두 번 적지 않는다('…기본법 시행령
 * 시행령 제27조'가 아니라 '…기본법 시행령 제27조'). CLI 의 의무 표는 handoff-w13-2 에서 조문 앞의 '시행령 '을 뗐지만, 그 전 판으로
 * 만든 결과(이미 저장된 분석, 사례 쪽)에는 그대로 실려 있다. 글자를 더하거나 바꾸지 않고 겹친 말 하나만 뺀다. 구조 그림을 뽑는
 * 스크립트도 불러 쓰므로 다른 것을 불러오지 않는다.
 */
const SUB = / (시행령|시행규칙)$/u;

export function lawArticle(law: string, article: string): string {
  const sub = SUB.exec(law)?.[1];
  return sub && article.startsWith(`${sub} `) ? `${law}${article.slice(sub.length)}` : `${law} ${article}`.trim();
}
