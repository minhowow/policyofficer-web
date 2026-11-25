/** 제품(CLI)의 이름(2026-11-24 오너 결정, 그 전 가칭 policypack). 아래 `SITE` 의 여러 문구가 이 이름으로 만들어진다. */
const CLI = "policyofficer";

/** 앞선 이름. 그 이름의 CLI 가 낸 결과(저장된 분석)의 도구 이름도 화면에는 지금 이름으로 보인다(`toolName`). */
const FORMER_CLI: readonly string[] = ["policypack"];

/** 결과에 적힌 도구 이름을 화면에 적을 이름으로. 앞선 이름이면 지금 이름이다. */
export function toolName(name: string): string {
  return FORMER_CLI.includes(name) ? CLI : name;
}

/**
 * 면책(`SITE.disclaimer`)의 두 문장. 따로 떼어 둔 것은 체크리스트 내보내기(인쇄용 보기·마크다운) 때문이다. 그 맨 위에서는 첫 문장
 * 바로 뒤에 "인증도 아니다"를 잇고, 둘째 문장이 그 뒤에 온다(`SITE.record`).
 */
const NOT_LEGAL_ADVICE = "법률 자문이 아닙니다.";
const PEOPLE_DECIDE = "검토가 필요한 지점을 알려 줄 뿐이고, 조문 해석과 최종 판단은 사람이 합니다.";

/**
 * 이름과 고정 문구를 한곳에 둔다. 화면 어디서도 이름을 직접 적지 말고 여기서 가져다 쓴다.
 */
export const SITE = {
  name: `${CLI} 웹`,
  cli: CLI,
  /**
   * 사이트 설명(쪽의 description). AI 검토는 저장소의 파일을 가리지 않고 읽으므로 'JS/TS 전용'으로 적지 않는다(평가는 JS/TS 저장소에서
   * 했다).
   */
  tagline: "공개 저장소의 코드를 AI 가 읽고, 서비스의 기능에 걸리는 국내 법 의무를 조문과 함께 체크리스트로 보여 줍니다.",
  /** 모든 화면에 붙는 면책. docs/commitments.md 의 표기 약속. */
  disclaimer: `${NOT_LEGAL_ADVICE} ${PEOPLE_DECIDE}`,
  /**
   * 분석 서비스(방향 B, docs/direction.md)의 고정 문구. 운영에서는 저장소가 GitHub 에서, 분석이 DB 에서 온다. 합성 미리보기
   * (SERVICE_STORE=synthetic)에서는 저장소와 분석이 모두 합성이라 합성인 쪽마다 '합성 예시'를 보인다.
   */
  service: {
    noServer: "합성 예시 미리보기라 분석 요청을 받지 않습니다.",
    /** 실행기를 설정하지 않은 서버(RUNNER=none). */
    runnerOff: "지금은 분석을 돌릴 실행기가 설정되지 않아 분석 요청을 받지 않습니다. 이미 있는 분석은 그대로 봅니다.",
    /** 로컬 실행기(RUNNER=local)인데 GitHub 이 실제 주소인 서버. 로컬 실행기는 합성 데모 코드만 다룬다. */
    localRealGitHub: "로컬 실행기는 합성 저장소만 다루므로, 실제 GitHub 에 묻는 이 서버는 분석 요청을 받지 않습니다.",
    /** review 를 맡긴 분석의 진행 화면(2026-11-12 오너 지시). */
    reviewTakes: "검토에 3~4분 걸립니다.",
    /** 하루 review 실행 수 상한(`REVIEW_DAILY_LIMIT`)에 닿아 review 없이 돈 분석. 프로필과 의무 목록까지만 보인다. */
    reviewLimit: "오늘 검토 한도가 찼습니다.",
    /** review 를 맡겼는데 결과가 오지 않았거나 읽지 못한 분석. */
    reviewMissing: "검토 결과를 받지 못했습니다.",
    /** 검토를 켜기 전에 돈 분석(그 커밋의 review 가 없다). */
    reviewNone: "이 분석에는 검토 결과가 없습니다.",
    searchPlaceholder: "저장소 이름이나 설명 (예: kids-signup)",
    /** 자리표시 글이 입력창에 다 들어가지 않는 좁은 화면(320~340px)의 짧은 글. 글자 크기는 줄이지 않는다(16px). */
    searchPlaceholderShort: "저장소 이름이나 설명",
  },
  /**
   * 이 사이트의 실행기가 아니라 CLI 로 미리 돌려 넣은 분석(2026-11-25 오너 지시)의 이름표. 서비스가 요청받아 돌린 분석과 다르다는 것을
   * 밝힌다(docs/commitments.md 의 1).
   */
  prerun: "미리 돌린 결과",
  /** 구조 쪽(/how/). 전시와 보고서에 쓰는 구조 그림 세 장(2026-11-13 오너 지시). */
  how: {
    title: "구조",
  },
  /** 바닥글의 둘째 줄. 사이트에 서버가 있다(분석 요청·기록). */
  footer: "분석 요청에는 로그인이 없고, 요청한 사람의 정보를 남기지 않습니다.",
  /** AI 검토의 확인할 것이 0건일 때 함께 보여 주는 문구(2026-11-16). */
  zeroCheckIsNotClearance: "확인할 것이 0건이어도 법적 문제가 없다는 뜻은 아닙니다.",
  /**
   * 체크리스트 내보내기(인쇄용 보기·마크다운)의 맨 위에 적는 말. 인쇄해서 건네는 종이라 화면보다 "확인을 받았다"는 글로 읽히기
   * 쉽다. 그래서 법률 자문도 인증도 아니라는 말(`lead`)을 굵게 두고 면책의 나머지(`rest`)를 잇는다. 인쇄하면 바닥글의 면책이 함께
   * 나오지 않으므로 종이가 제 안에 지닌다. 도장·발급·확인 같은 말을 쓰지 않는다.
   */
  record: {
    lead: `${NOT_LEGAL_ADVICE} 인증이나 확인서도 아닙니다.`,
    rest: PEOPLE_DECIDE,
  },
} as const;
