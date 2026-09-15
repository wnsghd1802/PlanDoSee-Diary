# 플랜두씨 다이어리 — 과제 7 카드 1~2 설정

이번 버전은 Supabase Auth를 사용하지 않습니다.

구조:
브라우저(login.html)
→ Vercel /api/auth/*
→ bcryptjs로 비밀번호 해시/비교
→ Supabase public.app_users 테이블

로그인 성공 시 서버가 8시간짜리 JWT를 HttpOnly 쿠키로 발급합니다.
브라우저 JavaScript에서는 세션 토큰 값을 읽을 수 없습니다.

## 1. Supabase에서 회원 테이블 만들기

Supabase > SQL Editor를 열고 아래 파일 내용을 실행합니다.

sql/01_create_app_users.sql

생성되는 테이블:
- app_users.id
- app_users.username
- app_users.password_hash
- app_users.created_at

중요:
password 자체를 저장하는 칼럼은 없습니다.

## 2. Vercel 환경변수 3개 추가

Vercel 프로젝트 > Settings > Environment Variables

1) SUPABASE_URL
값: 현재 Supabase Project URL

2) SUPABASE_SERVICE_ROLE_KEY
값: Supabase의 service_role secret key
주의: 이 값은 index.html/login.html/GitHub에 절대로 적지 않습니다.

3) SESSION_SECRET
길고 무작위인 문자열
예시는 그대로 쓰지 말고 본인이 새 값으로 생성하세요.
최소 32바이트 이상을 권장합니다.

환경변수를 추가한 뒤 Redeploy 합니다.

## 3. GitHub에 올릴 파일

루트:
- index.html
- login.html
- package.json

폴더:
- api/_lib/auth.js
- api/auth/signup.js
- api/auth/login.js
- api/auth/logout.js
- api/auth/me.js
- sql/01_create_app_users.sql

Vercel은 package.json의 dependencies를 설치하고 /api 폴더를 서버 함수로 배포합니다.

## 4. 카드 1 확인

1) 로그아웃 상태에서 index.html 직접 접속
2) login.html로 이동하는지 확인
3) 새 아이디/비밀번호로 회원가입
4) Supabase Table Editor > app_users에 사용자 행이 생성되는지 확인
5) password_hash에는 원문 비밀번호가 아니라 $2... 형태의 bcrypt 해시가 들어가는지 확인
6) 로그아웃 후 index.html 직접 접속 → 다시 login.html
7) 틀린 비밀번호 로그인 → 거절
8) 같은 아이디 회원가입 → 거절

## 5. 카드 2 확인

같은 비밀번호로 서로 다른 아이디 2개를 회원가입합니다.

예:
- card2usera
- card2userb

SQL Editor:

select
  username,
  password_hash
from public.app_users
where username in ('card2usera', 'card2userb')
order by username;

확인할 것:
- password_hash에 입력한 비밀번호 원문이 없음
- 두 계정에 같은 비밀번호를 입력했어도 password_hash 값이 서로 다름

이유:
bcrypt.hash(password, 12)를 호출할 때 계정마다 새로운 salt가 생성되기 때문입니다.

## 카드 2 설명 문구 초안

비밀번호 보호 방식으로 bcrypt를 선택하고 JavaScript 구현체인 bcryptjs 3.0.3을 사용하였다.
비밀번호는 브라우저에서 데이터베이스에 직접 저장하지 않고 Vercel 서버 API로 전달한 뒤 서버에서 bcrypt 해시로 변환한다.
bcrypt는 salt를 포함한 단방향 해시 방식이므로 저장된 값만으로 원래 비밀번호를 되돌릴 수 없다.
또한 동일한 비밀번호로 두 계정을 생성해도 매번 새로운 salt가 적용되어 서로 다른 해시값이 저장되는 것을 확인하였다.

## 아직 카드 4는 적용 전

현재 인증 자체는 서버에서 처리하지만 기존 plans/todos/work_logs 등의 데이터는 아직 사용자 소유권 분리를 적용하지 않았습니다.
카드 4에서 user_id 및 서버 측 소유자 검사를 추가해야 합니다.
