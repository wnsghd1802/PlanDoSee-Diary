# 플랜두씨 다이어리 v1

과제 6의 Plan → Do → See → Next Plan 흐름을 구현한 Supabase 기반 단일 페이지 앱입니다.

## 파일
- `index.html` : 화면 + CRUD + 집계 + 계획 이력
- `supabase_schema.sql` : Supabase 테이블/RLS 정책

## 시작 순서
1. Supabase에서 새 프로젝트 생성
2. SQL Editor에서 `supabase_schema.sql` 전체 실행
3. Supabase Project Settings/API에서 Project URL과 `anon` key 확인
4. `index.html` 상단 JS의 아래 값을 교체
   - `YOUR_SUPABASE_URL`
   - `YOUR_SUPABASE_ANON_KEY`
5. GitHub 저장소에 `index.html` 업로드
6. Vercel로 배포
7. 실제 계획 1개, 할 일 5개 이상, 실행 기록 3개 이상 입력

> `service_role` key는 브라우저 코드에 절대 넣지 마세요.

## v1에서 구현한 과제 핵심
- 계획: 기간 / 성공 기준 / 예상시간 / 우선순위 저장
- 계획 수정 전 값을 `plan_history`에 남김
- 할 일: 생성 / 수정 / 완료 / 완료취소 / 삭제
- 할 일: 마감일 / 우선순위 / 태그 / 예상시간
- 검색 / 상태 필터 / 우선순위 필터 / 정렬
- 실행 기록: 시작 / 종료 / 실제 시간 / 막힌 이유
- 계획값과 실제값 분리 저장
- 돌아보기: 계획/완료/지연/막힘 수, 예상/실제 시간
- 집계 숫자를 클릭해 근거 기록 확인
- 회고 저장 및 다음 계획 초안 생성
- 로그인 없는 공개 화면 경고 문구

## 다음 버전에서 점검할 것
과제 이미지의 T06-C04 ~ T06-C82를 실제 브라우저에서 하나씩 PASS/FAIL 검증하고, 필요한 항목만 보완합니다.
