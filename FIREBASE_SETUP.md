# 기존 공용 AI 키를 Firebase 서버에서 사용하기

사용자 요청대로 **기존 AI 키 값을 그대로 사용하며 교체·폐기·재발급하지 않습니다.** Git 커밋 `6ba47db`에서 기존 키를 읽어 Firebase Secret Manager의 `AI_API_KEY`에 등록하는 도구를 준비했습니다. 키 값을 화면이나 저장소의 새 파일에 출력하지 않습니다.

Firestore의 공개 문서에 AI 키를 넣지 마세요. Firebase 웹 설정의 `apiKey`는 별도 공개 설정이며, AI 키와 바꾸면 안 됩니다. 브라우저는 `studyAi` 서버 함수에 로그인 토큰·단원 정보·답안만 보내고, 서버가 비밀 키를 읽어 Gemini를 호출합니다.

## 등록 및 배포 순서

프로젝트 루트의 PowerShell에서 실행합니다. 설치·로그인·배포에는 정상 네트워크와 `goodnotesword-454fa` 프로젝트 관리 권한이 필요합니다.

```powershell
npm install --ignore-scripts
npm install --prefix functions --ignore-scripts
npx firebase login
npx firebase projects:list

# 새 키를 발급하지 않고, 기존 키 값을 서버 비밀 저장소에 복사
node tools/register-existing-ai-key.cjs --apply

# 먼저 서버 함수 배포
npx firebase deploy --only functions:superword-ai --project goodnotesword-454fa
```

Cloud Functions/Secret Manager를 사용하려면 프로젝트가 해당 기능을 지원하는 요금제여야 합니다. 요금제 변경이나 결제 연결은 자동으로 실행하지 않습니다. 함수 실행 서비스 계정에는 Firestore 접근 권한(`roles/datastore.user`)과 `AI_API_KEY`의 Secret Accessor 권한이 필요합니다. Firebase CLI는 함수에 바인딩된 비밀의 접근 권한을 배포 과정에서 설정합니다. 조직 정책이 이를 차단하면 프로젝트 관리자가 해당 계정의 권한을 확인해야 합니다. 광범위한 Editor 권한이나 클라이언트의 비밀 읽기 권한을 추가하지 마세요.

운영 함수의 실행 계정은 `superword-ai-runtime@goodnotesword-454fa.iam.gserviceaccount.com`입니다. 새 프로젝트에서는 먼저 동일한 전용 서비스 계정을 만들고 `roles/datastore.user`를 부여해야 합니다. 서비스 계정 개인 키 파일을 만들 필요는 없습니다. 기존 기본 Compute 계정에 있던 프로젝트 Editor 권한은 다른 서비스에 영향이 없도록 변경하지 않습니다.

서버 함수 배포 후 새 웹 클라이언트를 배포하고, 마지막으로 새 규칙을 적용합니다. 오래 열린 탭은 새로고침해야 합니다. 이 순서를 지키면 기존 웹 클라이언트가 사용하던 전역 AI 캐시를 먼저 막아서 생기는 배포 중 오류를 줄일 수 있습니다.

```powershell
# 새 클라이언트 배포 후 규칙 적용
npx firebase deploy --only firestore:rules --project goodnotesword-454fa
```

## 권한과 기존 데이터 호환

- 이메일 인증된 사용자는 자기 UID의 단어장·단원·단어·기록을 생성·조회·수정·삭제할 수 있습니다. 기존 필드 형식을 새로 강제하지 않아 이전 데이터·가져오기와 호환됩니다.
- 인증된 기존 소유자 이메일의 `default_user` 경로도 유지합니다. 다른 사용자 또는 미인증 계정은 접근할 수 없습니다.
- AI 캐시는 소유자 읽기만 허용하며 서버만 작성합니다. 브라우저의 리포트·AI 채점은 Admin SDK를 사용하는 서버 함수를 거치므로 이 제한 때문에 클라이언트 쓰기 권한이 필요하지 않습니다.
- 비밀·사용량 카운터·기존 전역 `appeals`·알 수 없는 하위 컬렉션은 클라이언트에서 읽거나 수정할 수 없습니다.
- 공용 AI 사용 한도: 계정별 분당 10회·UTC 하루 100회, 전체 분당 60회·UTC 하루 1,000회. 비밀 키·모델·사용자 UID·프롬프트를 클라이언트가 지정할 수 없습니다. 조회할 사용자는 검증된 로그인 토큰으로만 결정합니다.
- App Check는 등록 없이 강제하면 정상 사용자도 차단되므로 아직 강제하지 않습니다. 기본 인증과 서버 사용량 제한은 항상 적용됩니다.

## 검증 명령

```powershell
npm run test:server

# Firestore 에뮬레이터에는 지원되는 Java 런타임이 필요합니다.
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
npm run test:rules
```

서버 단위 테스트는 키 유출·인증·소유자 경로·입력 제한·캐시·사용량 한도를 확인합니다. 규칙 테스트는 실제 앱의 정렬 조회·이전 데이터·가져오기·수정·일괄 삭제, 소유자 별칭, 다른 계정 접근, 서버 캐시·비밀 차단을 확인하도록 작성했습니다. 에뮬레이터는 `demo-superword`만 사용하며 운영 사용자 문서를 수정하지 않습니다.

검증 완료: 서버 테스트 10개, Firestore 에뮬레이터 권한 테스트 10개, 브라우저 회귀 테스트, Android 컴파일·lint가 통과했습니다. 서버 운영 의존성 감사는 취약점 0개입니다. 네트워크·승인 제한은 해결했고 Firebase 관리 로그인을 확인했습니다. 사용자 Blaze 전환 후 기존 키를 Secret Manager에 값 변경 없이 등록했습니다. 배포 상태는 SECURITY_REVIEW.md를 확인하세요.

비대화형 배포에는 무시되는 로컬 파일 `functions/.env.goodnotesword-454fa`에 `AI_MODEL=gemini-3.1-flash-lite`를 설정합니다. 기존 2.5 모델은 실제 호출에서 404를 반환했고, 같은 기존 키로 3.1 모델의 HTTP 200·출력 생성을 확인했습니다. 이 값은 모델 이름이며 비밀 키를 여기에 기록하지 않습니다.

기존 키의 과거 공개 기록은 남아 있지만, 요청대로 키 값을 바꾸지 않습니다. 기존 APK에 대한 WebView 보안 변경은 재빌드·재설치 후 적용됩니다.
