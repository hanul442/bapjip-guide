# 밥집 가이드

친구들끼리 쓰는 맛집 가이드. 가게마다 평가를 남기고, 메뉴별로 뭘 먹었는지 기록하고, 지도에서 위치를 봐요.

- 사이트: https://hanul442.github.io/bapjip-guide/
- 휴대폰에서 열고 "홈 화면에 추가"하면 앱처럼 쓸 수 있어요 (PWA).

## 구조

- `index.html`: 앱 전체 (화면, 지도, 데이터 연결). 지도는 서울 구·전국 시도 경계를 내장 SVG로 그려요.
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA 설치와 오프라인 셸.
- `vendor/supabase.js`: supabase-js 2.45.4 UMD 빌드.

## 데이터

Supabase 프로젝트 `bapjip-guide` (ap-northeast-2).

- `members`: 이름과 비밀키 해시. 앱이 처음 열릴 때 이름을 정하면 만들어지고, 키는 그 기기에만 저장돼요.
- `docs`: 가게, 후기, 댓글, 평가를 `(col, id, data jsonb)`로 저장. 누구나 읽을 수 있고, 쓰기는 `doc_set`, `doc_patch`, `doc_delete` 함수로만 해요.
- 내가 쓴 것만 고치거나 지울 수 있어요. 예외로 가게 위치(`lat`, `lng`)는 친구 누구나 찍을 수 있어요.
- 지우기는 `doc_patch`로 `deleted: true`를 붙여 숨기는 방식이에요. 숨긴 가게나 후기에 딸린 후기, 댓글, 평가도 같이 안 보여요.
- 다른 기기에서 같은 이름을 쓰려면 앱의 "내 이름"에서 계정 링크를 복사해 그 기기에서 열면 돼요.
