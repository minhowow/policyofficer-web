/**
 * 분석 서비스의 데이터 모델. 쪽이 읽는 저장소 구현은 서버 쪽 `src/server/store/index.ts` 의 `getStore()` 가 고른다
 * (운영: DB + GitHub, SERVICE_STORE=synthetic: 합성). 브라우저에서 도는 부품은 여기서 타입만 가져간다.
 *
 * 이름을 하나씩 적는다. `export *` 로 바꾸면 타입만 내보낸다는 보장이 사라지므로(나중에 `types.ts` 에 런타임 내보냄이 생기면
 * 브라우저 묶음으로 새어 든다) 이름을 적는 쪽을 골랐다.
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
