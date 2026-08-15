# 스타스트라이크 - 궤도 방어선

무기를 합성해 화력을 키우고, 반복된 죽음으로 영구히 강해지는 모바일 하이퍼캐주얼 게임입니다.

- **장르**: 무기 합성(Merge) + 로그라이트 슈팅 서바이벌
- **기술**: Three.js + Vite (2D 게임플레이 + 3D 원근 카메라 연출)

## 폴더 구조

- `src/` — 게임 소스 코드
- `docs/` — 기획 문서 및 프로젝트 문서
- `docs/StarStrike_GDD_Summary.md` — 기획안 요약본
- `docs/obsidian/` — 프로젝트 문서 허브(옵시디언 볼트)

## 개발

```
npm install    # 의존성 설치
npm run dev    # 개발 서버 실행
npm run build  # 배포용 빌드 (dist/)
```

## 배포

main 브랜치에 푸시하면 GitHub Actions가 자동으로 빌드해 GitHub Pages에 배포합니다.

## 문서 시작점

프로젝트 맥락과 현재 진행 상황은 `docs/obsidian/프로젝트 컨텍스트.md`에서 시작하세요.
모든 기록과 계획은 이 옵시디언 폴더를 중심으로 관리합니다.
