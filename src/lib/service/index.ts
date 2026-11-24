/**
 * 분석 서비스의 데이터 모델. 쪽이 읽는 저장소 구현은 서버 쪽 `src/server/store/index.ts` 의 `getStore()` 가 고른다
 * (운영: DB + GitHub, SERVICE_STORE=synthetic: 합성). 브라우저에서 도는 부품은 여기서 타입만 가져간다.
 *
 * 이름을 하나씩 적는다. `export type * from "./types"`(TS 5.0)는 semgrep 의 TypeScript 문법이 읽지 못해
 * 이 파일 전체가 파싱되지 않았다(`policyofficer scan` 의 `run.unparsed`). 파싱되지 않으면 정적 조건을
 * 확인할 수 없어 판정이 '불확실'로 남는다. `export *` 로 바꾸면 타입만 내보낸다는 보장이 사라지므로
 * (나중에 `types.ts` 에 런타임 내보냄이 생기면 브라우저 묶음으로 새어 든다) 이름을 적는 쪽을 골랐다.
 */
export type {
  Analysis,
  AnalysisFailure,
  AnalysisStatus,
  AnalysisStep,
  Repository,
  RepositoryActivity,
  RepositoryHit,
  RequestOutcome,
  RequestRefusal,
  ReviewFacts,
  ReviewPlan,
  ScanPart,
  SearchOutcome,
  ServiceStore,
  StepName,
  StoreSuggestions,
} from "./types";
