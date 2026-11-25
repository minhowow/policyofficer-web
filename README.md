# policyofficer-web

GitHub 공개 저장소의 코드를 AI 가 읽고, 그 서비스의 기능에 걸릴 수 있는 국내 법 의무를 조문·코드 근거와 함께 체크리스트로
보여 주는 웹 서비스다. 아주대학교 2026-2 자기주도프로젝트 · 플리트소프트 연계. 사이트는 <https://policyofficer.vercel.app> 에
배포되어 있고, 분석을 요청하면 GitHub Actions 의 실행기가 policyofficer CLI 로 검토해 결과를 보낸다. GitHub:
[minhowow/policyofficer-web](https://github.com/minhowow/policyofficer-web), CLI 는 [minhowow/policyofficer](https://github.com/minhowow/policyofficer)
(로컬 옆 폴더 `../Plitsoft-SDP`).

검토는 이렇게 한다: 기능 파악 → 의무 고르기 → 의무별 조사(AI 가 코드를 읽고 파일·줄을 인용해 답한다) → 반박(다른 AI) → 직접
대조(도구가 인용한 줄과 '없다'는 검색을 코드에서 다시 확인한다) → 체크리스트. 법률 자문이 아니다. 위반 판정이 아니라 무엇을 어디서
확인할지를 알려 준다.

## 쪽

| 주소 | 내용 |
|---|---|
| `/` | 검색창과 최근 분석 |
| `/search/?q=` | GitHub 공개 저장소 검색과 이 사이트의 분석 수 |
| `/r/{owner}/{repo}/` | 저장소의 분석 기록과 요청 단추. `/r/{owner}/{repo}/a/{id}/` 는 분석 하나(진행 또는 결과) |
| `/r/{owner}/{repo}/a/{id}/checklist/` | 의무 체크리스트의 인쇄용 보기(마크다운 파일은 `/api/analyses/{id}/checklist/`) |
| `/policy/` | 조문 도감: AI 검토가 묻는 의무를 법령별로, 기능·법령·제재로 걸러 본다 |
| `/how/` | 구조 그림과 분석 한 건 따라가 보기 |

예: Vactor0911/jobtalk 을 CLI 로 미리 돌린 결과(2026-11-24)는 <https://policyofficer.vercel.app/r/vactor0911/jobtalk/> 에 있다.

## 써 보기

```bash
npm ci
SERVICE_STORE=synthetic npm run dev     # 합성 예시 미리보기(DB·GitHub 을 부르지 않는다). http://localhost:3000
npm run github-stub                     # 또는: 가짜 GitHub(127.0.0.1:4010)을 띄우고
GITHUB_API_BASE=http://127.0.0.1:4010 npm run dev   # DB(PGlite, .data/) + 가짜 GitHub 으로 띄운다
# 요청부터 결과까지 돌려 보려면 dev 에 RUNNER=local RUNNER_SECRET=<아무 글> 을 더하고, 다른 창에서
RUNNER_SECRET=<같은 글> npm run local-runner -- --fixture
npm run check    # lint + typecheck + 부품 시험 + build + 브라우저 시험
```

환경 변수를 주지 않고 `npm run dev` 를 띄우면 실제 GitHub API 를 부른다. 개발 중에는 위처럼 가짜 GitHub 이나 합성 미리보기를
쓴다. 환경 변수 목록은 `.env.example`, 배포할 때 오너가 할 일은 [docs/deploy.md](docs/deploy.md).

Node.js 22.12 이상의 22, 24, 또는 26 이상이 필요하다(시험 도구 vitest 의 요구).

`npm run check` 의 마지막 단계(브라우저 시험, `npm run test:browser`)는 빌드된 사이트를 `next start` 로 127.0.0.1 에 띄우고 이
컴퓨터에 깔린 Google Chrome 으로 열어 본다. Chrome 이 없으면 건너뛰지 않고 실패한다(Chrome·Chromium 실행 파일의 경로를
`CHROME_PATH` 로 줄 수 있다). 시험 도구(`playwright-core`)는 브라우저를 내려받지 않는다. 자세한 것은
[docs/architecture.md](docs/architecture.md) 의 "브라우저 시험".

CLI 의 프로필 출력을 다시 수집하려면 `uv` 와 옆 폴더의 CLI 저장소가 있어야 한다(`npm run capture`, [contract/README.md](contract/README.md)).

## 문서

- [docs/ROADMAP.md](docs/ROADMAP.md) — 할 일과 관문
- [docs/commitments.md](docs/commitments.md) — 지켜야 할 약속
- [docs/architecture.md](docs/architecture.md) — 구조
- [docs/direction.md](docs/direction.md) — 방향 B 와 일정, 기본 제한 값
- [docs/deploy.md](docs/deploy.md) — 배포할 때 오너가 할 일
- [contract/README.md](contract/README.md) — CLI 와 이어지는 방식
- [CLAUDE.md](CLAUDE.md) — 에이전트 작업 안내

## 라이선스

아직 정하지 않았다. 공개 전에 정한다. 조문 원문은 법령이라 누구나 쓸 수 있다(저작권법 제7조).
