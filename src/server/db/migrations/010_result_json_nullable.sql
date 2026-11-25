-- 2026-11-25 오너 지시로 실행기가 규칙 검사(scan)를 돌리지 않는다. 결과는 프로필과 review 만이라 그 검사의 결과 JSON 칸은 비어도 된다.
-- 앞선 분석의 칸은 그대로 둔다.
ALTER TABLE results ALTER COLUMN json DROP NOT NULL
