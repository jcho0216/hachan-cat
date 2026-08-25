# 하찮냥

잡으려 하면 피하고, 실패할수록 약 올리는 고양이 잡기 미니게임입니다.

## 실행

```bash
npm install
npm run dev
```

## 앱인토스 설정

`granite.config.ts`의 `appName`, `displayName`, `icon`을 앱인토스 콘솔 정보와 정확히 맞춰주세요. 현재 `icon`에는 운영 도메인의 600×600 PNG가 설정되어 있으며, 콘솔에 로고를 업로드한 뒤에는 콘솔에서 복사한 동일 로고 URL로 교체하세요.

Vercel과 일반 웹 배포용 빌드는 다음 명령을 사용합니다.

```bash
npm run build
```

앱인토스 콘솔에 올릴 `.ait` 파일은 별도 명령으로 생성합니다.

```bash
npm run build:ait
```
