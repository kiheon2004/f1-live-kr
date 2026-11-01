<div align="center">

<img src="build/icon.png" alt="라이브 타이밍 KR 아이콘" width="96">

# 라이브 타이밍 KR

**F1 세션을 한국어로 보는 데스크톱 앱** · 다시보기·실시간 타이밍 · 실제 지도 3D 서킷 · 싱글플레이 전략 게임

![version](https://img.shields.io/badge/version-0.53.0-e10600?style=flat-square)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square)
![unofficial](https://img.shields.io/badge/비공식-개인용-555555?style=flat-square)

<img src="docs/images/hero.jpg" alt="2025 헝가리 그랑프리 결승 다시보기: 한국어 순위표와 3D 관전 화면" width="100%">

</div>

> [!NOTE]
> 개인적·비상업적 용도의 **비공식** 프로그램이며 Formula 1 회사들과 관련이 없습니다.

## 목적과 대상 사용자

F1 공식 타이밍은 영어로만 나옵니다. 이 앱은 **중계를 보며 경기를 더 깊이 이해하고 싶은 한국어 사용 F1 팬**을 위한 것입니다.

- **한국어 타이밍:** 순위·간격·섹터·타이어·피트, 레이스 컨트롤 메시지 번역과 원문.
- **다시보기·실시간:** 1~30배속 재생, 실시간은 중계 지연(0~10분)에 맞춤.
- **3D 관전:** 실제 지형·건물·위성 사진 위의 서킷, 헬기·추적·온보드·1인칭 시점.
- **전략 게임:** 실제 팀의 두 드라이버 전략과 피트 스톱 운영(결정론적 엔진: 같은 시드 → 같은 경기).

## 실행과 사용법

필요한 것: macOS(Apple 실리콘·인텔) 또는 Windows, [Node.js](https://nodejs.org) 24.

```bash
git clone https://github.com/kiheon2004/f1-live-kr.git
cd f1-live-kr
npm install       # three.js를 src/renderer/vendor로 복사(postinstall)
npm start         # 앱 실행
npm test          # 전체 테스트
npm run dist      # macOS 앱 → dist.noindex/mac-arm64/LiveTimingKR.app
```

개인용 서명이라 처음 열 때 macOS가 막으면 Finder에서 **우클릭 → 열기**를 누르세요.

1. 위쪽에서 **다시보기** 또는 **실시간**을 고릅니다. 다시보기는 시즌과 세션을 고르고 **불러오기**를 누릅니다.
2. 맵의 **2D / 3D**를 바꾸고, 3D에서 시점을 고릅니다. **설정** 메뉴에서 HUD와 1인칭 카메라 움직임을 바꿉니다.
3. 순위표의 드라이버를 누르면 텔레메트리·스틴트·피트 정보를 봅니다. 단축키: `Space` 재생/정지, `←` `→` 5초, `Esc` 돌아오기.
4. 전략 게임은 홈 화면의 **전략 게임**에서 시작합니다(팀 선택 → 차고 → 전략 → 경기 → 결과).

실시간 차량 위치와 처음 여는 세션에는 F1 TV 로그인이 필요할 수 있습니다. 토큰은 OS 암호화 저장소에만 둡니다.

<img src="docs/images/cockpit.jpg" alt="모나코 1인칭 시점" width="49%"> <img src="docs/images/game_race.jpg" alt="전략 게임 레이스 운영 화면" width="49%">

## 작업 과정

Claude Code(Anthropic의 코딩 에이전트)와 함께 회차 단위로 개발했습니다.

1. **요청서:** 내가 증상과 우선순위를 적습니다. 예: "2026 헝가리 다시보기에서 차가 날아다님".
2. **재현:** 에이전트가 증상을 재현하고 원인 단계를 찾습니다.
3. **수정과 측정:** 수정하고, 같은 경기·같은 도구로 수정 전후를 측정합니다.
4. **분담:** 큰 회차는 리드 에이전트가 영역별 헬퍼(피트레인, UI, 그래픽, 회귀 점검)에게 맡기고, 헬퍼마다 별도 worktree·브랜치(`feat/v0.53-*`)를 써서 리드가 병합합니다.
5. **출시:** 전체 테스트와 실제 앱 흐름을 확인하고, 버전·CHANGELOG·README 사진을 갱신합니다.
6. **외부 점검:** 소스·변경분·근거를 묶어 다른 모델에게 점검을 받고, 지적은 재현한 뒤에만 고칩니다.

커밋 메시지에는 무엇을 왜 바꿨는지와 측정값을 적고, 에이전트 커밋에는 `Co-Authored-By: Claude` 줄이 있습니다.

## Claude Code 근거와 검증 결과 (v0.53)

| 검증 | 결과 |
|---|---|
| 2026 헝가리 결승, 그려진 차량 자세 전수 검사(`Map3D.poseScan`, 10 fps) | 설명 불가 이동 29,835 → 146, 방향 급변 53,630 → 402, 원시 위치로 그린 차량-프레임 733,744 → 29,834 |
| 캐시의 결승·스프린트 47개 전부 스캔, 13경기는 v0.52와 비교 | 순간 이동 −70 %, 높이 급변 −80 %, 오류 0 |
| 출발 전 추정 → 실제 위치 전환(6경기 A/B) | 15 m 넘는 점프 58 → 16, 소등 시점 그리드는 동일 |
| 고정 지점 170–180° 회전(경기 전체) | 중국 25: 19 → 0, 마이애미 26: 14 → 1, 모나코 25: 3 → 0 |
| 게임 엔진: 같은 시드 전체 AI 경기 3개, 수정 전후 | 순위·랩·정차·AI 결정 동일(바뀐 것은 의도한 랩 기록·회계뿐) |
| 테스트 | 970/970 통과. 소스 zip만 풀어 빈 홈 폴더로 실행해도 966 통과, 4 건너뜀 |

에이전트 기록 발췌 두 개:

> "After the last lane samples the feed leaps 36 m in 0.18 s. The curve's end tangent used that leap … so the drawn car ran 1.86 m backwards at 60 km/h."
> — 마이애미 피트 입구에서 차가 180° 도는 원인을 찾은 헬퍼 보고. 수정 뒤 해당 지점의 회전은 0건이 되었습니다.

> "`leapHidden` never resets between sessions … after opening 2026 HUN, the HUD shows '크게 튄 위치는 잠시 숨김' on Monaco."
> — 실제 앱 흐름 점검 헬퍼 보고. 리드가 같은 흐름으로 앱에서 다시 돌려 0으로 바뀐 것을 확인한 뒤 출시했습니다.

## 효과적이었던 방법 세 가지

1. **고치기 전에 측정 도구부터:** 실제 렌더 경로로 모든 차의 최종 자세를 검사하는 개발용 훅을 먼저 만들어, 기준값을 올려 숨기는 대신 원인 단계를 찾고 같은 숫자로 전후를 비교했습니다.
2. **격리:** 헬퍼마다 worktree, 점검 실행은 복제한 캐시와 별도 설정 폴더로만 해서 내 실제 앱 설정과 데이터를 건드리지 않았습니다.
3. **독립 점검 루프:** 출시마다 다른 모델에게 점검을 받았고, 에이전트 혼자 놓친 결함(저장·복원 결정성, 타이어 재고 경로 등)이 여기서 나왔습니다.

## 어려웠던 점 세 가지

1. **원본 자료의 손상:** 2026 헝가리 위치 자료는 달리는 차의 X/Y가 1–5초씩 멈추거나 수백 m 되돌아갑니다. 진짜 정지와 멈춘 자료를 구분해야 했고, 실제 위치가 없는 구간은 숨길 수밖에 없었습니다.
2. **8 GB Mac의 한계:** 앱 실행을 너무 많이 동시에 돌리다 재부팅되어 2시간 분량의 측정을 잃었습니다. 동시 실행 2개 제한과 이어서 돌릴 수 있는 분할 스캔으로 바꿨습니다.
3. **에이전트 결과 검증:** 화면 문구가 샘플 수를 차 대수로 읽어 "355012대"가 나올 뻔했고, 작업 시간 예측이 빗나갔고, 한 문제를 고치며 다른 문제가 생겼습니다(미끄러짐 → 순간 이동). 숫자와 화면으로 직접 확인하는 단계를 늘렸습니다.

## 알려진 한계

- 실시간 모드는 이번 회차에 실제 세션으로 검증하지 못했습니다(녹화 재생 경로만).
- 위치 자료가 손상된 구간은 보정하거나 숨깁니다. 2026 헝가리 후반의 피트 정차 장면은 재현되지 않고, 출발 전 일부 차량(6경기 16건)과 경기 중 큰 자료 도약은 아직 튑니다.
- 성능은 한 번만 측정했고, 주로 macOS에서 개발·검증했습니다.
- 전략 게임: 세이프티카 중 정차 손실을 실제보다 크게 계산합니다(화면에 표시). 타이어 세트 배정은 게임용 가정입니다.

## 핵심 소스 파일 (채점 범위)

| 파일 | 내용 |
|---|---|
| [`src/renderer/replay.js`](src/renderer/replay.js) | F1 변경분 자료로 임의 시점의 상태를 재구성합니다. 멈춘·재전송·도약 위치 샘플을 제거하고 원시 위치 곡선을 만듭니다 |
| [`src/renderer/smooth.js`](src/renderer/smooth.js) | 텔레메트리 적분과 위치 보정으로 차량별 보정 경로를 만듭니다(늦은·손상 구간 처리) |
| [`src/renderer/startplan.js`](src/renderer/startplan.js) | 소등·재출발 순서, 자료가 없는 차의 배치, 출발 전 자료 위치 판단(`departsFromFeed`) |
| [`src/game/engine/engine.js`](src/game/engine/engine.js) | 결정론적 경기 엔진: 트래픽·피트·날씨·규정·회계 |
| [`src/shared/ko.js`](src/shared/ko.js) | 한국어 표기(드라이버·팀·그랑프리), 용어집, 레이스 컨트롤 번역 규칙 |

변경 내역은 [CHANGELOG.md](CHANGELOG.md), 게임 설계는 [`docs/game/DESIGN.md`](docs/game/DESIGN.md)에 있습니다.

## 라이선스와 출처

- 코드와 자체 제작 콘텐츠: [PolyForm Noncommercial 1.0.0](LICENSE.md). 비상업적 사용만 허용합니다.
- three.js, Pretendard, Lucide, f1-circuits, OpenStreetMap·Overture·Sentinel-2 등 제3자 구성요소와 데이터 출처: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- F1, FORMULA ONE, FORMULA 1, GRAND PRIX 및 관련 표시는 Formula One Licensing B.V.의 상표입니다. 데이터를 재배포하거나 광고·유료화하지 않습니다.
