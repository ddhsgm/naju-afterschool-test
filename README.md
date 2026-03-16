# 나주중앙초 방과후수강신청

무료 테스트베드 배포를 기준으로 정리한 방과후 신청 사이트입니다.

## 무료 배포 구조

- 프론트엔드 + API: Vercel Hobby
- 데이터베이스: Supabase Free

## 주요 파일

- `index.html`: 학부모 신청 화면
- `admin.html`: 관리자 조회 화면
- `app.js`: 학부모 신청 로직
- `admin.js`: 관리자 조회 로직
- `api/`: Vercel 서버리스 API
- `bootstrap.json`: 공개 가능한 강좌/시간표 데이터
- `missing-contacts.json`: 연락처 누락 학생 목록
- `supabase-seed.sql`: Supabase에 넣을 스키마 + 시드 SQL
- `build_data.py`: `../원본자료`에서 위 파일들을 다시 생성

## 원본자료 반영

원본 엑셀이나 안내문이 바뀌면 아래 명령을 실행합니다.

```powershell
python .\build_data.py
```

그러면 아래 파일이 다시 생성됩니다.

- `bootstrap.json`
- `missing-contacts.txt`
- `missing-contacts.json`
- `data.js`
- `supabase-seed.sql`

## Supabase 세팅

1. Supabase에서 새 프로젝트 생성
2. SQL Editor 열기
3. `supabase-seed.sql` 내용을 붙여 넣고 실행

## Vercel 세팅

이 `사이트` 폴더를 GitHub에 올린 뒤 Vercel에 연결합니다.

### Environment Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `AFTERSCHOOL_ADMIN_PASSWORD`

## 접속 경로

- 학부모 화면: `/`
- 관리자 화면: `/admin.html`

## 주의

- 학생 연락처 전체 명단은 브라우저 파일에 직접 넣지 않습니다.
- 로그인 확인과 신청 저장은 `api/` 서버 함수에서만 처리합니다.
- 무료 테스트베드 버전에서는 관리자 화면에서 원본자료를 직접 다시 읽지 않습니다.
  원본을 수정하면 `build_data.py`를 다시 실행하고 재배포해야 합니다.

## 로컬 서버 버전

기존 `server.py`와 `start-server.cmd`도 남겨두었습니다. 내부 테스트용으로만 쓰고, 무료 웹 배포는 `api/` + Supabase 기준으로 보면 됩니다.
