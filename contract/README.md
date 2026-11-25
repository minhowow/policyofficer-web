# contract — CLI 와 웹의 이음매

웹은 CLI 의 소스를 가져다 쓰지 않는다. 설치된 `policyofficer` 명령이 낸 **출력**만 본다. 이 폴더가 그 경계다.
2026-11-25 오너 지시로 규칙 검사(`policyofficer scan`)를 폐기했다. CLI 도 `handoff-w13-4`(`386ce07`)부터 그 명령이 없다. 웹이
받는 출력은 저장소 프로필(`policyofficer profile`)과 AI 검토(`policyofficer review`, 2판) 둘이다.

```
contract/
├── fixtures/            합성 데모 코드 (이 프로젝트의 코드가 아니다). 판은 main(고치기 전), fixed(고친 뒤)
│   └── <앱>/<판>/…
├── cli-current/         지금 CLI 가 실제로 낸 프로필. `npm run capture` 가 통째로 다시 만든다
│   ├── MANIFEST.json    CLI 판·커밋·커밋 날짜·수집한 날·표본마다의 기능
│   └── profile/<앱>.<판>.json   policyofficer profile .
├── review/              review 2판의 합성 예시(손으로 만든 것). 합성 미리보기와 로컬 실행기가 쓴다
└── schema/
    └── review.cli-2.schema.json   고정 CLI 의 schemas/review-2.json 사본
```

## 규칙

- `cli-current/` 는 손으로 고치지 않는다. 스크립트가 만든 그대로 둔다.
- `fixtures/` 의 코드는 도구가 잘 잡도록 비틀지 않는다. 그럴듯한 서비스 코드의 모양으로 둔다.
- 실행기(`.github/workflows/analyze.yml`)가 설치하는 CLI 와 같은 커밋이어야 한다. `MANIFEST.json` 의 `cli.commit` 이 `CLI_COMMIT` 의
  앞자리이고, `cli.committed_on` 이 `CLI_EXCLUDE_NEWER` 의 날짜다. 의무 지도(`data/duty-map.json` 의 `cli.commit`)도 같은 커밋이다.
  `tests/contract.test.ts` 가 본다. 고정 판을 옮길 때는 함께 바꾼다(`docs/cli-followup.md`).
- review 스키마 사본은 고정 CLI 의 것이다. 받는 쪽은 모르는 키를 무시한다(CLI 는 키를 더할 때 판을 올리지 않는다). 화면의 파서
  (`src/lib/review/index.ts`)는 화면이 쓰는 필드만 본다.
- `MANIFEST.json` 의 `dirty` 가 `true` 면 CLI 저장소에 커밋되지 않은 변경이 있던 것이다. 그 수집본은 커밋하지 않는다.

## 다시 수집하기

```bash
npm run capture && npm test
```

- `uv` 가 있어야 한다. 기본으로 옆 폴더 `../Plitsoft-SDP` 를 쓴다(다른 출처는 `POLICYOFFICER_FROM`).
- 수집 스크립트가 하는 일: 출처 폴더에서 휠을 새로 빌드한다 → 표본을 임시 폴더(git 저장소 밖)로 복사한다 → 격리된 환경에서
  `policyofficer profile .` 을 돌린다 → 전부 성공하면 `cli-current/` 를 바꾼다. 도중에 실패하면 기존 수집본은 그대로다. CLI 저장소에는
  아무것도 쓰지 않는다.
- 수집한 뒤 `git diff contract/` 를 읽는다. 프로필이 바뀌었으면 왜 바뀌었는지 커밋 메시지에 적는다.
- 새 수집본이 계약 시험을 깨면(CLI 출력 모양이 바뀜) 수집본을 되돌리고 `docs/ROADMAP.md` 의 "사람 결정이 필요한 것"에 적는다.
