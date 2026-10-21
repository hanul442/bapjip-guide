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

- `members`: 아이디(한글·영문·숫자 2~12자)와 bcrypt 비밀번호 해시. 아이디가 친구들에게 보이는 이름이에요.
- `sessions`: 로그인할 때마다 만드는 토큰의 해시. 토큰은 그 기기에만 저장돼요. 가입은 `sign_up`, 로그인은 `sign_in`, 비밀번호 변경은 `change_password`.
- `docs`: 가게, 후기, 댓글, 평가를 `(col, id, data jsonb)`로 저장. 누구나 읽을 수 있고, 쓰기는 `doc_set`, `doc_patch`, `doc_delete` 함수로만 해요.
- 내가 쓴 것만 고치거나 지울 수 있어요. 예외로 가게 위치(`lat`, `lng`)는 친구 누구나 찍을 수 있어요.
- 지우기는 `doc_patch`로 `deleted: true`를 붙여 숨기는 방식이에요. 숨긴 가게나 후기에 딸린 후기, 댓글, 평가도 같이 안 보여요.

## 지도 링크

가게 등록할 때 지도 앱의 공유 내용을 통째로 붙여 넣으면 링크, 가게 이름, 동네를 골라내요.
`kko.to`, `naver.me` 같은 짧은 링크엔 좌표가 없어서, Supabase Edge Function `resolve-map`
(`supabase/functions/resolve-map/index.ts`)이 링크를 따라가 위치와 이름을 찾아요. 못 찾으면 등록한 뒤 지도에서 직접 찍어요.
