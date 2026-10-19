# 보안 점검 결과 — 2026-10-19

기존 AI 키는 사용자 요청대로 교체·폐기·재발급하지 않았습니다. Blaze 전환 후 기존 값을 Firebase Secret Manager의 `AI_API_KEY`에 등록했습니다. 키 값은 새 소스·문서·로그에 출력하지 않았습니다. `studyAi` 서버를 서울 리전에 배포했고 기존 키로 Gemini 3.1 Flash-Lite의 HTTP 200 응답을 확인했습니다. 웹은 기존 GitHub Pages를 사용하며 이 변경을 게시한 후 새 규칙을 적용합니다. 절차는 [FIREBASE_SETUP.md](FIREBASE_SETUP.md)에 있습니다.

## 수정한 위험

| 발견한 문제 | 조치 |
|---|---|
| 브라우저·백업·임시 파일에 공용 AI 키 포함 | 세 파일에서 기본 키 제거. 기존 브라우저 키 삭제. 로그인한 클라이언트는 서버 함수만 호출하고 서버에서 비밀 키로 AI 호출 |
| 이메일 인증 전에 데이터 로딩 | 인증된 이메일만 허용. 기존 소유자의 `default_user` 경로는 인증된 소유자 이메일에 한해서 유지 |
| 전체 저장소가 Pages 대상 | 실제 서비스 파일 6개만 배포. 백업·임시 코드·APK·개발 파일 제외 |
| 단어·경로·기록·오류 문자열의 HTML 삽입 | 텍스트·속성·Markdown 출력 이스케이프와 악성 입력 회귀 검증 |
| WebView 권한 자동 승인·혼합 콘텐츠 | 권한 요청 거부, HTTP 혼합 콘텐츠·파일·콘텐츠 URI 차단, Safe Browsing 적용, 외부 HTTPS 링크는 사용자 동작 시 외부 브라우저로 전달 |
| 공용 AI 캐시 조작·다른 사용자 데이터 혼용 | 서버가 인증 사용자 데이터만 읽고 사용자별 캐시에 작성. 브라우저 캐시 쓰기 거부 |
| 로그아웃·계정 교체 뒤 개인 데이터와 늦은 AI 응답 잔류 | 변수·입력·화면·캔버스 정리, 이전 인증 세션 응답 무시 |
| 영구 캐시·Android 백업의 데이터 잔류 | 신규 Firestore 캐시를 메모리로 변경, Android 백업·기기 이전 제외 |
| CSV 수식 실행 | 위험 접두사·제어문자 셀에 작은따옴표 추가 |
| CDN 스크립트 무결성 미검사 | Chart.js 버전 고정, Chart.js·Hangul.js SRI 적용, CSP 출처 제한 |
| AI 무제한 호출·임의 프록시 악용 | 서버 인증·입력 제한·고정 모델·계정별 및 전체 분/일 한도·제공자 오류 비공개 처리 |
| 서버 운영 의존성의 보통 등급 취약점 | Firebase Admin 14.5.0 / Functions 7.4.0으로 갱신, 운영 의존성 감사 0건 |

## 검증 완료

- 서버 테스트 10개: 미인증 차단, 소유자 별칭, 사용자 데이터 분리, 입력·사용량 제한, 캐시, 키 유출 방지, 기존 키 추출.
- 실제 Firestore 에뮬레이터 테스트 10개: 기존 조회·정렬·가져오기·CRUD·일괄 삭제 호환과 교차 계정·미인증·비밀·캐시 쓰기 거부. 운영 사용자 문서는 수정하지 않았습니다.
- 브라우저 회귀: 320·390·768·1024·1440px, 네 가지 팝업·뒤로가기·테마, 악성 입력·CSV, 서버 함수 연동, 키 및 직접 AI 요청 부재, 로그아웃·계정 교체·지연 응답 차단 통과.
- Android `compileDebugKotlin`·`lintDebug` 성공. 격리 출력 경로와 로그는 무시되는 `security-test-results/`에 보관. 실제 단말 검증은 별도입니다.
- 서버 callable 모듈 로드 성공. 운영 의존성 `npm audit --omit=dev`: 취약점 0개. 변경 파일 공백 검사 통과.
- 앞선 Gradle 실행이 삭제한 추적 캐시 6개만 복구했습니다. 작업 전 변경된 다른 캐시 3개는 유지했습니다.
- 운영 규칙의 이전 버전은 `security-test-results/firestore-before-deploy.rules`에 백업했습니다. 원본 ruleset ID도 파일에 보관했습니다.
- 운영 callable의 비로그인 요청은 HTTP 401 `UNAUTHENTICATED`로 거부되며 GitHub Pages 출처의 CORS 응답을 확인했습니다. 빌드 컨테이너 이미지에는 30일 보관 정책을 적용했습니다.

## 남은 제약

- 과거 공개 Git 기록의 기존 키는 그대로 남습니다. 사용자 요청에 따라 기록 강제 수정·키 교체를 하지 않습니다.
- App Check는 사이트 등록 전 정상 사용자 차단을 피하기 위해 아직 강제하지 않습니다. 로그인 인증과 서버 사용량 제한은 항상 적용합니다.
- 기존 IndexedDB 캐시는 미동기화 데이터 손실을 막기 위해 강제로 삭제하지 않았습니다. 새 클라이언트부터 메모리 캐시를 사용하며 영구 오프라인 캐시는 제공하지 않습니다.
- WebView 변경은 새 APK 빌드·설치 후 적용됩니다. 기존 APK를 교체하지 않았으며 실제 단말 로그인·외부 링크·음성 재생은 추가 확인이 필요합니다.
- 기존 인라인 이벤트 때문에 CSP에 `unsafe-inline`이 남습니다. 이스케이프와 출처 제한이 완전한 XSS 방어를 보장하지는 않습니다.
- 공개 Firebase 웹 설정의 API 키는 AI 비밀 키와 별개입니다. API·출처 제한은 정상 Firebase 로그인 동작을 함께 확인하면서 적용해야 합니다.

## 공식 문서

- [Gemini API 키](https://ai.google.dev/gemini-api/docs/api-key)
- [Firebase 웹 API 키](https://firebase.google.com/docs/projects/api-keys)
- [Firestore 인증 규칙](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Android WebView 출처 제한](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)
