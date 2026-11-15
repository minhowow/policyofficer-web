import { configDefaults, defineConfig } from "vitest/config";
import base from "./vitest.config.mjs";

// 브라우저 시험(`npm run test:browser`). 빌드된 사이트(.next)를 `next start` 로 127.0.0.1 에 띄우고 이 컴퓨터의 Chrome 으로 연다.
// `npm run check` 에서 빌드 뒤에 돈다. Chrome 을 찾지 못하면 건너뛰지 않고 실패한다(tests/browser/site.ts).
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["tests/browser/**/*.test.ts"],
    exclude: configDefaults.exclude,
    // 쪽을 열고 기다리는 시험이다. 한 시험에 30초까지 준다(보통 1~2초에 끝난다).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 시험 파일마다 next start 와 Chrome 을 하나씩 띄운다. 파일을 모두 한꺼번에 돌리면(이 컴퓨터는 12코어에 파일 13개) 쪽을 두루
    // 훑는 시험이 창 하나의 한도(28초, tests/browser/site.ts)를 넘기곤 했다(2026-11-11~15 에 여러 번). 동시에 여섯 파일까지만 돌린다.
    maxWorkers: 6,
  },
});
