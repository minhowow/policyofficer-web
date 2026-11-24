-- 이 프로젝트의 두 GitHub 저장소 이름이 바뀌었다(2026-11-24 오너 결정, 제품 이름 policyofficer): minhowow/Plitsoft-SDP →
-- minhowow/policyofficer, minhowow/Plitsoft-SDP-Web → minhowow/policyofficer-web. GitHub 은 옛 이름을 새 이름으로 넘겨 주므로 저장소 쪽은
-- 새 이름으로 보이지만, 그 전에 분석한 기록의 저장소 이름은 옛 이름으로 남아 최근 분석 목록에 보였다. 그 기록만 새 이름으로 옮긴다
-- (실행 기록 주소도). 다른 저장소의 기록은 건드리지 않는다.
UPDATE analyses SET owner = 'minhowow', repo = 'policyofficer', repo_key = 'minhowow/policyofficer'
  WHERE repo_key = 'minhowow/plitsoft-sdp';
UPDATE analyses SET owner = 'minhowow', repo = 'policyofficer-web', repo_key = 'minhowow/policyofficer-web'
  WHERE repo_key = 'minhowow/plitsoft-sdp-web';
UPDATE analyses SET runner_run_url = replace(runner_run_url, 'github.com/minhowow/Plitsoft-SDP-Web/', 'github.com/minhowow/policyofficer-web/')
  WHERE runner_run_url LIKE '%github.com/minhowow/Plitsoft-SDP-Web/%';
