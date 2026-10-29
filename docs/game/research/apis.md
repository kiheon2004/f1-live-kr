# 공개 API 조사 — 전략 게임 시나리오 준비용 (요청 §14, DESIGN §15)

조사일 **2026-10-29**. 각 항목은 그날 문서·약관을 직접 열람하고, 익명 요청 하나로 실제 응답을 확인했다(요청에 개인 정보·계정·
이메일 없음). "확인"은 내가 열어 본 것, "요약"은 검색 결과 요약만 본 것(원문 미열람).

## 0. 결론 (엔진·게임 데이터 경계)

| 데이터 | 1순위 | 2순위(캐시에 없는 경기) | 쓰지 않음 |
|---|---|---|---|
| 시즌·경기·서킷·일정·랩 수 | **앱 캐시**(SessionInfo, LapCount) | Jolpica `races`, `circuits` | — |
| 참가 팀·드라이버(그 경기의) | **앱 캐시** DriverList | Jolpica `results`/`drivers`/`constructors`, OpenF1 `drivers` | 현재 시즌 명단을 과거 경기에 적용 |
| 출발 그리드 | **앱 캐시** TimingData/TimingAppData(GridPos) | Jolpica `results.grid`, OpenF1 `starting_grid` | — |
| 결과·랩·스틴트·피트 | **앱 캐시**(검증 전용) | Jolpica `laps`/`pitstops`/`results`, OpenF1 `laps`/`stints`/`pit` (검증 전용) | **엔진 입력으로 사용 금지**(DESIGN §0.6) |
| 텔레메트리(속도·스로틀·브레이크·기어·위치) | **앱 캐시** CarData.z(~4 Hz)·Position.z | OpenF1 `car_data`(~3.7 Hz)·`location` | — |
| 과거 날씨(실측) | **앱 캐시** WeatherData(기온·노면·습도·풍속·강우 유무 0/1) | — | — |
| 강우 강도·구름(모델) | Open-Meteo archive(ERA5/IFS, 앱 `clouds.js`가 이미 사용) | — | — |
| 팀이 알 수 있던 예보 | **Open-Meteo Previous Runs API**(N일 전 발표 예보, 2024-01부터) | Historical Forecast API | 실제 강우를 예보로 공개 |

- **네트워크는 시나리오 준비 단계(엔진 밖, `src/game/tools/` 또는 메인 프로세스)에서만.** 결과는 `userData/game/scenarios/`에
  원자료 사본 + 출처·취득 시각과 함께 저장 → 이후 완전 오프라인. 엔진 루프·레이스 중에는 네트워크 없음. 응답 형식 검증 실패·429·5xx·
  오프라인 → 이전 시나리오/캐시로, 진행 중 경기는 영향 없음.
- **세션 캐시는 읽기 전용**(BRIEF). 게임은 캐시 파일을 수정·삭제하지 않는다.
- 2026-10-16부터 **F1 공식 아카이브가 익명 요청을 거부**한다(아래 §3) → 캐시에 있는 41경기가 텔레메트리 기반 보정의 핵심 자원.
  캐시에 없는 경기는 OpenF1(텔레메트리)·Jolpica(결과)로 "시나리오 가능, 보정 자료 제한" 수준.

## 1. Jolpica F1 (Ergast 후계)
- 문서: https://github.com/jolpica/jolpica-f1 (README, `docs/README.md`), 약관 `TERMS.md`(Last updated 2025-08-27),
  `docs/rate_limits.md`, `docs/database_dumps.md` — 2026-10-29 열람(raw.githubusercontent.com).
- 엔드포인트(Ergast 호환): `https://api.jolpi.ca/ergast/f1/` — seasons, circuits, races(일정·세션 시각·서킷 좌표), constructors,
  drivers, results(grid 포함), sprint, qualifying, laps(랩별 순위·시간), pitstops(랩·정차 시간·duration), status, standings.
  `limit` 최대 100, `offset` 페이지.
- 범위 확인(2026-10-29 실제 요청): 2026 races total 23, `2026/last/results` = United States GP 2026-10-25(22명),
  `2026/1/laps` total 1003, `2026/1/pitstops` 32, `2024/1/laps` 1129 → **2026 최신 경기까지 결과·랩·피트 있음**.
- 인증: 없음. **사용자 정의 User-Agent 요구**("앱이름/버전", 문서 'Custom User Agent'). 예: `LiveTimingKR/0.48` — 개인 정보 아님.
- 호출 제한(익명): **버스트 4 req/s, 지속 500 req/h**, 초과 시 HTTP 429. "향후 감소 예정"이라고 명시.
- 약관/라이선스: **비상업 무료**, 데이터 **CC BY-NC-SA 4.0**(저작자 표시·비영리·동일조건). 가용성·정확성 보장 없음, 예고 없이
  차단 가능. DB 덤프(CSV): 비상업은 업로드 14일 후 무료.
- 안정성: 자원봉사 운영(월 호스팅 ~45 USD, README) — 중간 정도. Ergast 형식 유지 약속은 "aim", 보장 아님.
- **권장: 사용(시나리오 준비 때만, 캐시에 없는 경기의 참가자·그리드·결과·랩 수 보충, 그리고 검증용 실제 결과).** 경기당 요청 수:
  races 1 + results 1 + laps ~12(100행 단위) + pitstops 1 ≈ 15회 → 제한에 여유. 응답은 저장해 재요청하지 않음. 화면에
  "데이터: Jolpica F1 (CC BY-NC-SA 4.0)" 표기.

## 2. OpenF1
- 문서: https://openf1.org/ (요금·FAQ), https://openf1.org/docs/ (엔드포인트) — 2026-10-29 열람.
- 무료(Community, "Free / forever"): **2023년 이후 모든 과거 세션**, 18개 엔드포인트, JSON/CSV, **인증 없음**, **3 req/s·30 req/min**.
- 유료(Sponsor, €9.90/월, 개인용): 과거 + **실시간**(REST/MQTT/WebSocket), 6 req/s·60 req/min. 문서: "Real-time data requires a paid
  subscription." → 이 게임은 실시간이 필요 없음.
- 엔드포인트: car_data(~3.7 Hz 속도·rpm·기어·스로틀·브레이크·drs), location, laps(섹터·미니섹터·스피드트랩), intervals, position,
  pit, stints(컴파운드·타이어 나이), race_control, weather, starting_grid, session_result, overtakes, team_radio, drivers, meetings,
  sessions, championship(beta).
- 범위 확인: `sessions?year=2026&session_name=Race` 응답 정상(일정 포함), `stints?session_key=latest` 정상(2026-10-29).
- 라이선스: 사이트 전체 **CC BY-NC-SA 4.0**. "교육·개인 학습·연구·비상업 팬 활동" 용도; 비공식, F1과 무관.
- 출처의 성격: F1 라이브 타이밍을 받아 가공한 것 — **앱 캐시와 같은 원천**. 캐시가 있으면 중복.
- **권장: 캐시에 없는 경기만, 시나리오 준비 때 오프라인 수집용(무료 과거 데이터).** 한 경기 car_data는 드라이버×세션 단위 요청
  (20–22회) → 30 req/min 제한상 1분 이상 소요, 진행 표시 필요. 실시간 유료 기능 사용 안 함. 출처 표기 필요.

## 3. F1 livetiming static (앱이 이미 사용)
- 주소: `https://livetiming.formula1.com/static/` (`src/main/archive.js` BASE). 공개 문서·약관 없음(비공식 엔드포인트).
- **2026-10-29 확인: `2026/Index.json`, `2025/Index.json`, 세션 파일 모두 익명 요청에 HTTP 401.** archive.js 주석: "F1 closed its archive
  to anonymous requests on 2026-10-16". 앱은 거부되면 사용자의 F1 TV 로그인 토큰(auth.js)을 F1 아카이브에만 bearer /
  `ascendontoken` 헤더 / 로그인 쿠키 형태로 시도하고 통한 형태를 기억한다(`fetchAuthed`). 토큰은 F1 아카이브 외에는 보내지 않음.
- 약관: formula1.com Legal Notices (https://www.formula1.com/en/information/legal-notices.7egvZU48hzrypubGBNcQKt, 2026-10-29 열람,
  날짜·판 표시 없음): 사이트 자료는 "for your personal, non-commercial use only", 보호 대상 자료에 "live timing data, historical race
  data" 명시, 무단 복제·재배포 금지; 웹사이트 약관에 명시적 스크래핑 조항은 없고 F1 앱 약관은 자동화된 사용으로 서비스에 부담을 주는
  것을 금지. Terms of Use 본문 링크: https://account.formula1.com/#/en/terms-of-use (미열람).
- **권장: 게임은 이 엔드포인트를 직접 호출하지 않는다.** 이미 받아 둔 캐시만 읽기 전용으로 사용(개인·비상업 범위). 게임 시나리오/
  저장 파일에 F1 원자료를 재배포 형태로 담지 않는다(앱 안에서 경로 참조 + 파생 값).

## 4. Open-Meteo (앱 `src/main/clouds.js`가 이미 사용)
- 약관: https://open-meteo.com/en/terms (2026-10-29 열람, 갱신일 표시 없음): 무료 API는 **비상업 전용**; 제한 **10 000/일, 5 000/시,
  600/분, 300 000/월**; 데이터 **CC BY 4.0**; 상업 예: 구독·광고가 있는 앱. API 키 없음.
- Historical Weather API(https://open-meteo.com/en/docs/historical-weather-api, 열람): `archive-api.open-meteo.com/v1/archive`;
  ECMWF IFS 9 km(2017–, 지연 없음), ERA5 0.25°(1940–, 5일 지연), ERA5-Land 0.1°(강수는 ERA5 강제값). 시간별 precipitation, rain,
  cloud_cover(전체·저·중·고), 기온, 습도, 바람.
- **Previous Runs API**(https://open-meteo.com/en/docs/previous-runs-api, 열람): `previous-runs-api.open-meteo.com/v1/forecast`,
  `precipitation_previous_day1…7` = 그 시각을 N일 전에 예보한 값. 대부분 모델 **2024-01부터**. → 2024 영국 GP(실버스톤, 2024-07-07)로
  실제 요청 확인: 실측 재분석 강수 10–15시 0.1–0.7 mm/h, 하루 전 예보 0.2–0.3 mm/h. **"팀이 알던 예보"(요청 §11, DESIGN §9)를 실제
  예보로 만들 수 있는 유일하게 확인된 공개 원천.**
- Historical Forecast API(https://open-meteo.com/en/docs/historical-forecast-api, 열람): 2022–, 각 실행의 앞 몇 시간을 이어 붙인
  연속 시계열(발표 당시의 전체 예보 기간이 아님).
- 한계: 9–25 km 격자 모델값 — 서킷 한 지점의 소나기 시각은 L 신뢰도(clouds.js 주석과 같은 판단). 캐시의 WeatherData `Rainfall`(0/1,
  실측)이 "비가 왔는가"의 진실, Open-Meteo는 **강도 추정**과 **예보**에만.
- **권장: 사용(시나리오 준비 때, archive + previous-runs를 받아 시나리오에 저장).** 경기당 2–3회 요청. 표기 "Weather data by
  Open-Meteo.com (CC BY 4.0)".

## 5. 캐시에서 가져올 것 (41경기: 2024 영국 1 + 2025 24 + 2026 16, 스프린트·연습 일부)
`~/Library/Application Support/f1-live-kr/cache` — 읽기 전용, `src/main/archive.js` Archive + `src/renderer/replay.js`로 로드(BRIEF).

| 토픽 | 게임 용도 | 엔진 입력? |
|---|---|---|
| SessionInfo, LapCount | 서킷·세션·예정 랩 수 | 예(경기 전 사실) |
| DriverList | 그 경기의 팀·드라이버·번호·팀 색 | 예 |
| TimingData/TimingAppData | 출발 그리드(GridPos), 실제 스틴트·컴파운드(SOFT/MEDIUM/HARD/INTER/WET, New 여부) | 그리드만 예; 스틴트는 **검증 전용** |
| Position.z (≈4 Hz, x/y/z 1/10 m) | 주행용 서킷 표본(곡률·고저·피트 경로) | 예(형상) |
| CarData.z (≈4 Hz 속도·rpm·기어·스로틀·브레이크·DRS ch45; 2026은 0,2,3,4,5 채널만) | 속도 프로파일·제동·가속 **보정**(보정 경기 집합), 서킷별 **피트레인 제한 속도 측정** | 보정 자료로만 |
| PitStopSeries (`PitStopTime` 정차 s, `PitLaneTime` s, Lap) / PitLaneTimeCollection (Duration) | 피트 손실·정차 시간 분포 보정 | 보정(분포)만; 그 경기의 실제 피트 랩은 입력 금지 |
| WeatherData | 기온·노면 온도·습도·바람·강우 유무(0/1) — 날씨 진실 시나리오의 실측 뼈대 | 예(실제 기반 날씨 모드) |
| RaceControlMessages | SC/VSC/적기/페널티·DRS/OVERTAKE ENABLED 실제 기록 | **검증 전용**(실제 SC 시각 입력 금지) |
| TrackStatus | SC/VSC/황기 구간 실제 기록 | 검증 전용 |

## 6. 위험·운영 메모
- Jolpica·OpenF1 모두 CC BY-NC-SA: 파생 시나리오 파일을 남에게 배포하면 같은 라이선스·출처 표기 의무. 개인 앱 내부 사용은 문제없음.
- Jolpica 제한은 "줄어들 예정" — 요청 수를 경기당 ~15회로 유지, 429면 지수 백오프, 받은 것은 저장.
- F1 아카이브 401 이후 새 경기의 텔레메트리는 사용자 F1 TV 로그인(앱 기존 기능) 또는 OpenF1 무료 과거 데이터로만 — 게임 쪽에서 로그인
  토큰을 다루지 않는다.
- 모든 요청은 익명(User-Agent "앱/버전"만). 이메일·이름·계정 정보를 헤더·URL·본문에 넣지 않는다.
