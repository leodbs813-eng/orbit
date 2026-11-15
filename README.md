# Orbit — 공부 궤도

원 하나로 **계획하고, 재고, 기록하는** 공부 관리 웹앱입니다.
빌드 과정이 없는 순수 HTML/CSS/JS 정적 사이트라서 GitHub에 올리고 Vercel에 연결하면 바로 배포됩니다.

## 기능

- **오늘** — 오늘의 원(계획 + 실제)과 타이머가 한 화면에 있습니다. 과목을 누르면 바로 시작, 일시정지·종료·과목 변경 지원
- **달력** — 날짜마다 작은 원으로 공부량 표시. 날짜를 누르면 상세 기록 확인·추가·수정, 시험/과제 등 일정 등록
- **통계** — 누적 시간과 과목 비중, 최근 7일, 시간대 패턴
- **계획** — 하루 계획(과목별 목표 시간·순서·세부 목표)과 반복 시간표(매일/평일/요일/N일마다)
- **설정** — 과목 이름·색상, 라이트/다크 테마, 기본 목표, 백업 파일 내려받기/불러오기

### 원 읽는 법
- 안쪽 원의 연한 구간 = 계획한 시간 (과목별 비율)
- 진하게 채워진 부분 = 실제로 공부한 시간
- 바깥 가는 궤도 = 계획을 넘긴 시간 또는 계획에 없던 과목

## 파일 구성

```
├── index.html     # 페이지 뼈대
├── style.css      # 디자인 (라이트/다크)
├── app.js         # 앱 전체 로직
├── manifest.json  # 홈 화면에 추가(PWA) 설정
├── sw.js          # 오프라인 지원
├── icon.svg       # 앱 아이콘
└── vercel.json    # Vercel 설정
```

## 배포 방법

### 1. GitHub에 올리기
1. GitHub에서 새 저장소 생성 (예: `orbit-study`)
2. 이 폴더의 파일을 모두 업로드 — 웹에서 **Add file → Upload files**로 끌어다 놓거나, 터미널에서:

```bash
git init
git add .
git commit -m "Orbit 공부 관리 앱"
git branch -M main
git remote add origin https://github.com/<아이디>/orbit-study.git
git push -u origin main
```

### 2. Vercel에 연결
1. [vercel.com](https://vercel.com) 에 GitHub 계정으로 로그인
2. **Add New → Project** → 방금 만든 저장소 **Import**
3. Framework Preset은 **Other** 그대로, 설정 변경 없이 **Deploy**
4. 몇 초 뒤 `https://orbit-study.vercel.app` 같은 주소가 생깁니다

이후 GitHub에 푸시할 때마다 자동으로 다시 배포됩니다.

### 로컬에서 실행
```bash
npx serve .
# 또는
python3 -m http.server 8000
```

## 데이터 저장
- 모든 기록은 **사용하는 브라우저의 localStorage**에 저장됩니다. 서버나 계정은 없습니다.
- 기기를 바꾸거나 브라우저 데이터를 지우기 전에 **설정 → 백업 내려받기**로 JSON 파일을 받아 두고, 새 기기에서 **백업 불러오기**로 복원하세요.
- 휴대폰에서는 브라우저 메뉴의 **홈 화면에 추가**로 앱처럼 쓸 수 있습니다.
