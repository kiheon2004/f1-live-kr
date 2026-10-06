// Korean names, labels and the race-control message translator.
// Loaded as a <script> in the app and with require() in tests.
(function (root) {
  // Driver names as Korean media usually write them, keyed by three-letter code.
  const DRIVERS = {
    NOR: "랜도 노리스", PIA: "오스카 피아스트리", VER: "막스 베르스타펜", HAD: "아이작 하자르",
    LEC: "샤를 르클레르", HAM: "루이스 해밀턴", RUS: "조지 러셀", ANT: "안드레아 키미 안토넬리",
    ALO: "페르난도 알론소", STR: "랜스 스트롤", GAS: "피에르 가슬리", COL: "프랑코 콜라핀토",
    ALB: "알렉스 알본", SAI: "카를로스 사인츠", LAW: "리암 로슨", LIN: "아비드 린드블라드",
    HUL: "니코 휠켄버그", BOR: "가브리엘 보르톨레토", OCO: "에스테반 오콘", BEA: "올리버 베어먼",
    PER: "세르히오 페레스", BOT: "발테리 보타스", TSU: "유키 츠노다", DOO: "잭 두한",
  };
  const TEAMS = {
    "McLaren": "맥라렌", "Red Bull Racing": "레드불 레이싱", "Ferrari": "페라리", "Mercedes": "메르세데스",
    "Aston Martin": "애스턴 마틴", "Alpine": "알핀", "Williams": "윌리엄스", "Racing Bulls": "레이싱 불스",
    "Audi": "아우디", "Haas F1 Team": "하스", "Cadillac": "캐딜락", "Kick Sauber": "킥 자우버",
  };
  const TYRES = {
    SOFT: { ko: "소프트", short: "S", color: "#e8392f" },
    MEDIUM: { ko: "미디엄", short: "M", color: "#f2c230" },
    HARD: { ko: "하드", short: "H", color: "#e9ecef" },
    INTERMEDIATE: { ko: "인터미디어트", short: "I", color: "#3cb54a" },
    WET: { ko: "웻", short: "W", color: "#2f7fe0" },
  };
  const GP = {
    "Australian": "호주", "Chinese": "중국", "Japanese": "일본", "Bahrain": "바레인", "Saudi Arabian": "사우디아라비아",
    "Miami": "마이애미", "Canadian": "캐나다", "Monaco": "모나코", "Barcelona-Catalunya": "바르셀로나-카탈루냐",
    "Spanish": "스페인", "Austrian": "오스트리아", "British": "영국", "Belgian": "벨기에", "Hungarian": "헝가리",
    "Dutch": "네덜란드", "Italian": "이탈리아", "Azerbaijan": "아제르바이잔", "Singapore": "싱가포르",
    "United States": "미국", "Mexico City": "멕시코시티", "São Paulo": "상파울루", "Sao Paulo": "상파울루",
    "Las Vegas": "라스베이거스", "Qatar": "카타르", "Abu Dhabi": "아부다비", "Emilia Romagna": "에밀리아로마냐",
  };
  const SESSIONS = {
    "Practice 1": "연습 주행 1", "Practice 2": "연습 주행 2", "Practice 3": "연습 주행 3",
    "Qualifying": "예선", "Sprint Qualifying": "스프린트 예선", "Sprint Shootout": "스프린트 예선",
    "Sprint": "스프린트", "Race": "결승",
  };
  const TRACK_STATUS = {
    "1": { ko: "그린 – 정상 주행", cls: "green" }, "2": { ko: "황색기", cls: "yellow" },
    "4": { ko: "세이프티카", cls: "sc" }, "5": { ko: "적색기 – 중단", cls: "red" },
    "6": { ko: "버추얼 세이프티카", cls: "sc" }, "7": { ko: "VSC 종료 중", cls: "sc" },
  };

  const HOSTS = { Malaysia: "말레이시아", Portugal: "포르투갈", Turkey: "튀르키예", Germany: "독일", France: "프랑스", Korea: "한국", India: "인도" };
  // "Bahrain Grand Prix" → "바레인 그랑프리"; "Bahrain Grand Prix in Malaysia" → "바레인 그랑프리 (말레이시아 개최)"
  const gpName = (name) => {
    const m = /^(.*) Grand Prix(?: in (.*))?$/.exec(name || "");
    if (!m || !GP[m[1]]) return name;
    return `${GP[m[1]]} 그랑프리${m[2] ? ` (${HOSTS[m[2]] || m[2]} 개최)` : ""}`;
  };
  const sessionName = (name) => SESSIONS[name] || name;

  // ---------- race control ----------
  const REASONS = [
    [/FAILING TO FOLLOW RACE DIRECTORS? INSTRUCTIONS/, "레이스 디렉터 지시 불이행"],
    [/KEEPING TO (?:THE )?CORRECT SIDE OF THE BOLLARD/, "볼라드 올바른 쪽 통과 지시"],
    [/DRIVING UNNECESSARILY SLOWLY IN (?:THE )?PIT EXIT ROAD/, "피트 출구 도로에서 불필요한 저속 주행"],
    [/DRIVING UNNECESSARILY SLOWLY/, "불필요한 저속 주행"], [/DRIVING ERRATICALLY/, "불규칙한 주행"],
    [/IGNORING BLUE FLAGS?/, "청색기 무시"], [/MORE THAN ONE CHANGE OF DIRECTION/, "두 번 이상 진로 변경"],
    [/VSC INFRINGEMENT/, "VSC 규정 위반"], [/FALSE START/, "부정 출발"],
    [/OUT OF POSITION AT (?:THE )?SAFETY CAR LINE/, "세이프티카 라인에서 정위치 이탈"], [/OUT OF POSITION/, "정위치 이탈"],
    [/MOVING BEFORE (?:THE )?SIGNAL/, "신호 전 출발"], [/FAILING TO SERVE (?:A |THE )?TIME PENALTY CORRECTLY/, "타임 페널티를 제대로 이행하지 않음"],
    [/MAXIMUM DELTA TIME/, "최대 델타 타임 위반"], [/RACE CONTROL TEST/, "레이스 컨트롤 테스트"],
    [/ESCAPE ROAD INSTRUCTIONS/, "탈출로 이용 지시"], [/PRACTICE START INFRINGEMENT/, "연습 스타트 규정 위반"],
    [/STARTING PROCEDURE INFRINGEMENT/, "스타트 절차 위반"], [/LEAVING THE TRACK AND GAINING AN ADVANTAGE/, "트랙을 벗어나 이득을 얻음"],
    [/FORCING ANOTHER DRIVER OFF THE TRACK/, "다른 드라이버를 트랙 밖으로 밀어냄"], [/CAUSING A COLLISION/, "충돌 유발"],
    [/SPEEDING IN THE PIT LANE/, "피트레인 과속"], [/YELLOW FLAG INFRINGEMENT/, "황색기 규정 위반"],
    [/MOVING UNDER BRAKING/, "브레이킹 중 진로 변경"], [/REJOINING UNSAFELY/, "위험한 트랙 복귀"],
    [/UNSAFE RELEASE/, "위험한 피트 출발"], [/IMPEDING/, "진로 방해"], [/TRACK LIMITS/, "트랙 리밋 위반"],
    [/DOUBLE YELLOW/, "이중 황색기 구간"], [/RED FLAG INFRINGEMENT/, "적색기 규정 위반"],
    [/SAFETY CAR INFRINGEMENT/, "세이프티카 규정 위반"], [/PIT ENTRY INFRINGEMENT/, "피트 진입 규정 위반"],
    [/PIT EXIT INFRINGEMENT/, "피트 출구 규정 위반"], [/OVERTAKING UNDER (SC|SAFETY CAR|VSC)/, "SC·VSC 중 추월"],
    [/OVERTAKING/, "추월 규정 위반"], [/CROSSING THE (WHITE )?LINE/, "흰 선 침범"], [/UNSAFE/, "위험 행위"],
  ];
  const reason = (text) => {
    if (!text) return "";
    const parts = text.split(/\s+[–-]\s+/).map((p) => {
      for (const [re, ko] of REASONS) if (re.test(p)) return ko;
      return p;
    });
    return parts.join(" – ");
  };

  // "CAR 44 (HAM)" / "CARS 1 (NOR), 10 (GAS) AND 43 (COL)" → "44번 해밀턴, …"
  // Short form used on the leaderboard, e.g. "베르스타펜"; falls back to the feed's own last name.
  const surname = (tla, fallback) => (DRIVERS[tla] ? DRIVERS[tla].split(" ").slice(-1)[0] : (fallback || tla || "").toUpperCase());
  const carRef = (num, tla) => `${num}번 ${DRIVERS[tla] ? DRIVERS[tla].split(" ").slice(-1)[0] : tla || ""}`.trim();
  const carsIn = (s) => [...s.matchAll(/(\d+) \(([A-Z0-9]{3})\)/g)].map((m) => carRef(m[1], m[2])).join(", ");
  const trailTime = (s) => { const m = /\((\d{1,2}:\d{2}(?::{1,2}\d{2})?)\)\s*$/.exec(s); return m ? ` (${m[1].replace("::", ":")})` : ""; };
  const stripTrail = (s) => s.replace(/\s*\(\d{1,2}:\d{2}(?::{1,2}\d{2})?\)\s*$/, "");
  const where = (s) => {
    const m = /^(?:(S?Q\d) )?(?:LAP (\d+) )?(?:TURN (\d+) )?(PIT LANE )?INCIDENT/.exec(s);
    return m ? [m[1], m[2] && `${m[2]}랩`, m[3] && `${m[3]}번 코너`, m[4] && "피트레인"].filter(Boolean).join(" ") : "";
  };
  // Session names inside messages ("F1 FREE PRACTICE 2", "SPRINT QUALIFYING", …)
  const sessionKo = (s) => s.replace(/^F1 /, "").replace(/^(?:FREE )?PRACTICE (\d)$/, "연습 주행 $1").replace(/^SPRINT QUALIFYING$/, "스프린트 예선")
    .replace(/^(F2|F3) (SPRINT|FEATURE) RACE$/, (_, c, k) => `${c} ${k === "SPRINT" ? "스프린트" : "피처"} 레이스`)
    .replace(/^P(\d)$/, "연습 주행 $1").replace(/^QUALIFYING$/, "예선").replace(/^SPRINT$/, "스프린트").replace(/^(?:THE )?RACE$/, "레이스").replace(/^(?:THE )?SESSION$/, "세션").replace(/^FORMATION LAP$/, "포메이션 랩");

  const STATUS = [
    [/REVIEWED NO FURTHER INVESTIGATION/, "검토 결과 추가 조사 없음"], [/NO FURTHER ACTION/, "추가 조치 없음"],
    [/UNDER INVESTIGATION/, "조사 중"], [/WILL BE INVESTIGATED AFTER THE RACE/, "레이스 후 조사 예정"],
    [/WILL BE INVESTIGATED AFTER THE SESSION/, "세션 후 조사 예정"], [/WILL BE INVESTIGATED AFTER THE SPRINT/, "스프린트 후 조사 예정"],
    [/NOTED/, "기록됨"],
  ];

  // Each rule returns Korean text or null. Order matters: specific before general.
  const RULES = [
    [/^UPDATE: (.*)$/, (m) => { const t = translate(m[1]); return t ? `[업데이트] ${t}` : null; }],
    [/^FIA STEWARDS: PENALTY SERVED - (.*)$/, (m) => { const t = translate("FIA STEWARDS: " + m[1]); return t ? t.replace(/^스튜어드: /, "스튜어드: 페널티 이행 완료 – ") : null; }],
    [/^FIA STEWARDS: (\d+) SECOND TIME PENALTY FOR CAR (\d+) \(([A-Z0-9]{3})\)(?: - (.*?))?(\s*\(.*\))?$/,
      (m) => `스튜어드: ${carRef(m[2], m[3])}에게 ${m[1]}초 타임 페널티${m[4] ? ` – ${reason(stripTrail(m[4]))}` : ""}${trailTime(m[0])}`],
    [/^FIA STEWARDS: DRIVE THROUGH PENALTY FOR CAR (\d+) \(([A-Z0-9]{3})\)(?: - (.*))?$/,
      (m) => `스튜어드: ${carRef(m[1], m[2])}에게 드라이브 스루 페널티${m[3] ? ` – ${reason(stripTrail(m[3]))}` : ""}${trailTime(m[0])}`],
    [/^FIA STEWARDS: (\d+) SECOND STOP\/GO PENALTY FOR CAR (\d+) \(([A-Z0-9]{3})\)(?: - (.*))?$/,
      (m) => `스튜어드: ${carRef(m[2], m[3])}에게 ${m[1]}초 스톱 앤 고 페널티${m[4] ? ` – ${reason(stripTrail(m[4]))}` : ""}${trailTime(m[0])}`],
    [/^FIA STEWARDS: (\d+) PLACE GRID PENALTY FOR CAR (\d+) \(([A-Z0-9]{3})\)(?: - (.*))?$/,
      (m) => `스튜어드: ${carRef(m[2], m[3])}에게 ${m[1]}계단 그리드 강등${m[4] ? ` – ${reason(stripTrail(m[4]))}` : ""}${trailTime(m[0])}`],
    [/^FIA STEWARDS: STOP-AND-GO PENALTY FOR CAR (\d+) \(([A-Z0-9]{3})\)(?: - (.*))?$/,
      (m) => `스튜어드: ${carRef(m[1], m[2])}에게 스톱 앤 고 페널티${m[3] ? ` – ${reason(stripTrail(m[3]))}` : ""}${trailTime(m[0])}`],
    [/^FIA STEWARDS: UPDATE: (.*)$/, (m) => { const t = translate("FIA STEWARDS: " + m[1]); return t ? t.replace(/^스튜어드: /, "스튜어드 [업데이트]: ") : null; }],
    [/^FIA STEWARDS: WARNING FOR CAR (\d+) \(([A-Z0-9]{3})\)(?: - (.*))?$/,
      (m) => `스튜어드: ${carRef(m[1], m[2])}에게 경고${m[3] ? ` – ${reason(stripTrail(m[3]))}` : ""}${trailTime(m[0])}`],
    [/^(FIA STEWARDS: )?((?:S?Q\d )?(?:LAP \d+ )?(?:TURN \d+ )?(?:PIT LANE )?INCIDENT INVOLVING (?:ALL )?CARS?(?: (.*?))?)$/, (m) => {
      const body = stripTrail(m[2]);
      let status = "", rest = "";
      for (const [re, ko] of STATUS) {
        const i = body.search(re);
        if (i >= 0) { status = ko; rest = body.slice(i).replace(re, "").replace(/^\s*-\s*/, ""); break; }
      }
      if (!status) return null;
      const head = body.split(/ (?:REVIEWED|NO FURTHER|UNDER INVESTIGATION|WILL BE INVESTIGATED|NOTED)/)[0];
      const place = where(head);
      const who = /INVOLVING ALL CARS/.test(head) ? "전체 차량" : carsIn(head);
      return `${m[1] ? "스튜어드: " : ""}${place ? place + " " : ""}${who} 관련 사고 – ${status}${rest ? ` (${reason(rest)})` : ""}${trailTime(m[0])}`;
    }],
    // e.g. "... DELETED - TRACK LIMITS AT TURN 4 LAP 12 15:01:33 (PIT)" or "... AT TURN 4 (NEXT LAP PIT)"
    [/^CAR (\d+) \(([A-Z0-9]{3})\) (?:LAP|TIME ([\d:.]+)) DELETED - (.*?) AT TURN (\d+)(?: LAP (\d+) ([\d:]+))?(?: \((NEXT LAP)? ?(PIT)?\))?$/,
      (m) => {
        const extra = [m[6] && `${m[6]}랩`, m[7], m[8] && "다음 랩", m[9] && "피트"].filter(Boolean).join(", ");
        return `${carRef(m[1], m[2])} ${m[3] ? m[3] + " " : ""}기록 삭제 – ${m[5]}번 코너 ${reason(m[4])}${extra ? ` (${extra})` : ""}`;
      }],
    [/^CAR (\d+) \(([A-Z0-9]{3})\) LAP (\d+) WILL BE REINSTATED$/, (m) => `${carRef(m[1], m[2])}의 ${m[3]}랩 기록 복원 예정`],
    [/^CAR (\d+) \(([A-Z0-9]{3})\) TIME ([\d:.]+) WILL BE REINSTATED$/, (m) => `${carRef(m[1], m[2])}의 ${m[3]} 기록 복원 예정`],
    [/^BLACK AND WHITE FLAG FOR CAR (\d+) \(([A-Z0-9]{3})\)(?: - (.*?))?(\s*\(.*\))?$/,
      (m) => `${carRef(m[1], m[2])}에게 흑백기(경고)${m[3] ? ` – ${reason(m[3])}` : ""}${trailTime(m[0])}`],
    [/^WAVED BLUE FLAG FOR CAR (\d+) \(([A-Z0-9]{3})\) TIMED AT ([\d:]+)$/, (m) => `${carRef(m[1], m[2])}에게 청색기 (${m[3]})`],
    [/^(DOUBLE )?YELLOW IN TRACK SECTOR (\d+)$/, (m) => `${m[1] ? "이중 황색기" : "황색기"} – 트랙 섹터 ${m[2]}`],
    [/^CLEAR IN TRACK SECTOR (\d+)$/, (m) => `트랙 섹터 ${m[1]} 황색기 해제`],
    [/^YELLOW IN PIT LANE$/, () => "피트레인 황색기"],
    [/^TRACK CLEAR$/, () => "전 구간 황색기 해제"],
    [/^CHEQUERED FLAG$/, () => "체커기"],
    [/^GREEN LIGHT - PIT EXIT OPEN$/, () => "녹색등 – 피트 출구 개방"],
    [/^RED FLAG(?: - (RACE|SESSION) SUSPENDED)?$/, (m) => `적색기${m[1] ? ` – ${m[1] === "RACE" ? "레이스" : "세션"} 중단` : ""}`],
    [/^SAFETY CAR DEPLOYED$/, () => "세이프티카 투입"],
    [/^SAFETY CAR IN THIS LAP$/, () => "이번 랩에 세이프티카 복귀"],
    [/^SAFETY CAR LIGHTS ON$/, () => "세이프티카 경광등 점등"],
    [/^VSC DEPLOYED$/, () => "버추얼 세이프티카(VSC) 발동"],
    [/^VSC ENDING$/, () => "VSC 종료 예정"],
    [/^LAPPED CARS MAY NOW OVERTAKE THE SAFETY CAR(?:: (.*))?$/, (m) => `랩 다운 차량은 세이프티카 추월 가능${m[1] ? `: ${m[1]}번` : ""}`],
    [/^LAPPED CARS WILL NOT BE ALLOWED TO OVERTAKE$/, () => "랩 다운 차량 추월 불허"],
    [/^OVERTAKE ENABLED$/, () => "오버테이크 모드 사용 가능"],
    [/^OVERTAKE DISABLED$/, () => "오버테이크 모드 사용 불가"],
    [/^DRS ENABLED$/, () => "DRS 사용 가능"], [/^DRS DISABLED$/, () => "DRS 사용 불가"],
    [/^PIT EXIT CLOSED$/, () => "피트 출구 폐쇄"], [/^PIT EXIT OPEN$/, () => "피트 출구 개방"],
    [/^PIT ENTRY CLOSED$/, () => "피트 입구 폐쇄"], [/^PIT LANE CLEAR$/, () => "피트레인 정리 완료"],
    [/^MARSHALS ON TRACK AT TURN (\d+)$/, (m) => `${m[1]}번 코너 트랙 위 마셜 작업 중`],
    [/^MARSHALS ON TRACK AT PIT ENTRY$/, () => "피트 입구 트랙 위 마셜 작업 중"],
    [/^CAR (\d+) \(([A-Z0-9]{3})\) (?:LAP|TIME ([\d:.]+)) DELETED - (.*?) AT PIT ENTRY LAP (\d+) ([\d:]+)$/,
      (m) => `${carRef(m[1], m[2])} ${m[3] ? m[3] + " " : ""}기록 삭제 – 피트 입구 ${reason(m[4])} (${m[5]}랩, ${m[6]})`],
    // Qualifying form that names the driver only: "CAR LEC TIME 1:36.518 DELETED - TRACK LIMITS AT TURN 14 (NEXT LAP) (Q1)"
    [/^CAR ([A-Z]{3}) TIME ?([\d:.]*) DELETED - (.*?) AT TURN (\d+)(?: \((NEXT LAP)? ?(PIT)?\))?(?: \((S?Q\d)\))?$/,
      (m) => {
        const extra = [m[7], m[5] && "다음 랩", m[6] && "피트"].filter(Boolean).join(", ");
        return `${surname(m[1])} ${m[2] ? m[2] + " " : ""}기록 삭제 – ${m[4]}번 코너 ${reason(m[3])}${extra ? ` (${extra})` : ""}`;
      }],
    [/^BLACK AND ORANGE FLAG FOR CAR (\d+) \(([A-Z0-9]{3})\)$/, (m) => `${carRef(m[1], m[2])}에게 흑주황기 (차량 결함 – 피트로 들어와 수리)`],
    [/^(?:TEST: )?AIR TEMPERATURE (\d+) HOURS? BEFORE (?:THE )?(.*?) = ([\d.]+) DEGREES$/, (m) => `${sessionKo(m[2])} 시작 ${m[1]}시간 전 기온 ${m[3]}°`],
    [/^ESTIMATED TIME OF (S?Q\d|SESSION|RACE) RESUMPTION - ([\d:]+)$/, (m) => `${sessionKo(m[1])} 재개 예상 시각 – ${m[2]}`],
    [/^AWNINGS MAY BE USED$/, () => "차양막 사용 가능"], [/^AWNINGS TO BE REMOVED$/, () => "차양막 철거"],
    [/^DELAYED START$/, () => "출발 지연"],
    [/^RECOVERY VEHICLE ON TRACK AT TURN (\d+)$/, (m) => `${m[1]}번 코너 견인 차량 투입`],
    [/^TRACK SURFACE SLIPPERY IN TRACK SECTOR (\d+)$/, (m) => `트랙 섹터 ${m[1]} 노면 미끄러움`],
    [/^RISK OF RAIN FOR (?:THE )?(.*?) IS (\d+)%$/, (m) => `${sessionKo(m[1])} 강수 확률 ${m[2]}%`],
    [/^(RACE|SESSION|S?Q\d) WILL RESUME AT ([\d:]+)$/, (m) => `${sessionKo(m[1])} ${m[2]} 재개 예정`],
    [/^(S?Q\d|SESSION|QUALIFYING|SPRINT QUALIFYING|SPRINT|RACE|THE RACE|FORMATION LAP) WILL START AT ([\d:]+)$/, (m) => `${sessionKo(m[1])} ${m[2]} 시작 예정`],
    [/^START OF (S?Q\d|QUALIFYING|THE RACE|THE SESSION|SESSION|SPRINT) WILL BE DELAYED$/, (m) => `${sessionKo(m[1])} 시작 지연`],
    [/^ESTIMATED TIME OF SESSION START - ([\d:]+)$/, (m) => `세션 시작 예상 시각 – ${m[1]}`],
    [/^(?:FREE )?PRACTICE (\d) WILL BE EXTENDED BY (A FURTHER )?(\d+) MINUTES?$/, (m) => `연습 주행 ${m[1]} ${m[2] ? "추가로 " : ""}${m[3]}분 연장`],
    [/^SESSION WILL BE TEMPORARILY STOPPED$/, () => "세션 일시 중단 예정"],
    [/^SESSION TEMPERATURES: AIR = (\d+), TRACK = (\d+)$/, (m) => `세션 온도: 기온 ${m[1]}°, 노면 ${m[2]}°`],
    [/^SAFETY CAR WILL USE START\/FINISH STRAIGHT$/, () => "세이프티카 스타트/피니시 직선 이용"],
    [/^RESUMPTION TEST ABORTED$/, () => "재개 테스트 취소"],
    [/^PUSH CARS TO FRONT IN ORDER: (.*)$/, (m) => `차량을 앞으로 밀어 정렬할 순서: ${m[1]}`],
    [/^PIT LANE ENTRY (OPEN|CLOSED)$/, (m) => `피트레인 입구 ${m[1] === "OPEN" ? "개방" : "폐쇄"}`],
    [/^MEDICAL CAR DEPLOYED$/, () => "메디컬카 투입"],
    [/^WET TRACK$/, () => "젖은 노면"], [/^TRACK TEST COMPLETED$/, () => "트랙 점검 완료"],
    [/^THIS IS A TEST MESSAGE FROM RACE CONTROL$/, () => "레이스 컨트롤 테스트 메시지"],
    [/^STRAIGHT MODE - (NORMAL GRIP|LOW GRIP|DISABLED)$/, (m) => `직선 모드 – ${{ "NORMAL GRIP": "일반 그립", "LOW GRIP": "저그립", DISABLED: "사용 불가" }[m[1]]}`],
    [/^(NORMAL|LOW) GRIP (DELTA ACTIVE|CONDITIONS)$/, (m) => `${m[1] === "LOW" ? "저그립" : "일반 그립"} ${m[2] === "CONDITIONS" ? "상태" : "델타 적용"}`],
    [/^SPRINT START$/, () => "스프린트 스타트"],
    [/^RESUMPTION ORDER: (.*)$/, (m) => `재개 순서: ${m[1]}`],
    [/^STANDING START$/, () => "스탠딩 스타트"], [/^ROLLING START$/, () => "롤링 스타트"],
    [/^EXTRA FORMATION LAP$/, () => "포메이션 랩 추가"], [/^RACE START$/, () => "레이스 스타트"],
    [/^ALL CARS THROUGH THE PIT LANE$/, () => "모든 차량 피트레인 통과"],
    [/^ALL CARS USE START\/FINISH STRAIGHT$/, () => "모든 차량 스타트/피니시 직선 이용"],
    [/^ALL PASS HOLDERS MAY ACCESS THE PIT LANE$/, () => "출입증 소지자 피트레인 출입 가능"],
    [/^FIRST CAR TO TAKE THE FLAG - CAR (\d+) \(([A-Z0-9]{3})\)$/, (m) => `처음 체커기를 받을 차량 – ${carRef(m[1], m[2])}`],
    [/^(PINK|LIGHT BLUE|BLUE|YELLOW|GREEN|ORANGE) HEAD PADDING MATERIAL MUST BE USED$/,
      (m) => `${{ PINK: "분홍색", "LIGHT BLUE": "하늘색", BLUE: "파란색", YELLOW: "노란색", GREEN: "초록색", ORANGE: "주황색" }[m[1]]} 헤드 패딩 사용 의무`],
  ];

  function translate(message) {
    const text = String(message || "").trim();
    for (const [re, fn] of RULES) {
      const m = re.exec(text);
      if (m) { const out = fn(m); if (out) return out; }
    }
    return null;
  }

  // Short explanations for newer fans.
  const GLOSSARY = [
    ["리더와 차이 / 앞 차와 간격", "선두 또는 바로 앞 차와의 시간 차이(초)예요. '1랩'은 선두에게 한 바퀴 뒤처졌다는 뜻이에요. 앞 차와 1초 이내면 추월 사정권이에요."],
    ["섹터 (S1·S2·S3)", "한 바퀴를 세 구간으로 나눈 것이에요. 보라색은 그 세션 전체 최고, 초록색은 그 드라이버의 개인 최고, 노란색은 그 외 기록이에요."],
    ["타이어", "소프트(S·빨강)는 빠르지만 빨리 닳고, 미디엄(M·노랑)은 중간, 하드(H·흰색)는 느리지만 오래가요. 비가 오면 인터미디어트(I·초록)와 웻(W·파랑)을 써요."],
    ["스틴트", "타이어 한 세트로 달린 구간이에요. 피트스톱을 하면 새 스틴트가 시작돼요."],
    ["피트스톱 · 피트 손실", "타이어를 갈려고 피트레인에 들어오는 것이에요. 피트레인 속도 제한 때문에 서킷마다 보통 20초 안팎을 잃어요."],
    ["언더컷 · 오버컷", "언더컷은 앞 차보다 먼저 피트에 들어가 새 타이어의 속도로 앞지르는 전략이에요. 오버컷은 반대로 더 오래 버텨서 앞서는 전략이에요."],
    ["세이프티카 (SC)", "사고나 위험이 있을 때 투입되는 차량이에요. 모든 차가 그 뒤에 줄을 서서 천천히 달리고 추월이 금지돼요."],
    ["버추얼 세이프티카 (VSC)", "실제 차량 없이 모든 차가 정해진 속도 이하로 달리게 하는 조치예요. 차 사이 간격이 대체로 유지돼요."],
    ["적색기", "경기를 멈추는 깃발이에요. 차들은 피트레인으로 들어가 재개를 기다려요."],
    ["황색기 · 이중 황색기", "위험 구간 표시예요. 감속해야 하고 추월할 수 없어요. 이중 황색기는 더 크게 감속하거나 멈출 준비를 해야 해요."],
    ["청색기", "랩 다운(한 바퀴 뒤처진) 차에게 뒤에 빠른 차가 오니 비켜 주라는 신호예요."],
    ["흑백기", "스포츠맨답지 않은 행동이나 트랙 리밋 반복 위반에 대한 경고예요."],
    ["트랙 리밋", "흰 선 밖으로 차가 완전히 나가면 위반이에요. 예선에서는 그 랩 기록이 삭제되고, 결승에서는 반복되면 페널티를 받아요."],
    ["오버테이크 모드", "2026년부터 DRS 대신 도입된 추월 보조 기능이에요. 앞 차와 가까우면 전기 에너지를 더 쓸 수 있어요."],
    ["Q1 · Q2 · Q3", "예선은 세 단계예요. Q1과 Q2에서 하위권이 탈락하고, Q3에서 상위 10명이 폴 포지션을 다퉈요."],
    ["107% 규칙", "예선 Q1 최고 기록의 107%보다 느리면 원칙적으로 결승에 나갈 수 없어요."],
    ["스튜어드", "규정 위반을 조사하고 페널티를 정하는 심판진이에요."],
    ["미니 섹터", "각 섹터를 더 잘게 나눈 구간이에요. 섹터 기록 아래 막대가 구간마다 노랑(보통)·초록(개인 최고)·보라(전체 최고)·파랑(피트 레인)으로 칠해져요."],
    ["이론상 최고 랩", "세 섹터의 개인 최고 기록을 더한 값이에요. 한 랩을 완벽하게 달렸다면 나올 수 있었던 기록이에요."],
    ["갭 차트(레이스 트레이스)", "랩마다 선두와의 시간 차이를 선으로 그린 그래프예요. 선이 위로 올라가면 따라잡는 중이고, 세이프티카 구간에서는 간격이 줄어들어요."],
    ["흑주황기", "차에 문제가 생겨 위험할 수 있으니 피트로 들어와 고치라는 깃발이에요."],
    ["정차 시간 · 피트 레인 시간", "정차 시간은 차가 멈춰 타이어를 바꾸는 시간(보통 2~3초), 피트 레인 시간은 피트 입구부터 출구까지 걸린 시간이에요."],
    ["챔피언십 예상", "지금 순위 그대로 경기가 끝났을 때의 시즌 순위와 점수예요. 경기 중 실시간으로 바뀌어요."],
    ["간격 추세 (▼ ▲)", "앞 차와 간격 아래 작은 숫자는 최근 3랩 동안 간격이 얼마나 변했는지예요. 초록 ▼는 따라잡는 중, 빨강 ▲는 멀어지는 중이에요."],
    ["트랙 리밋 횟수 (TL)", "결승에서 트랙 리밋으로 랩이 삭제된 횟수예요. 3번째에 흑백기 경고, 그 뒤로 또 어기면 보통 5초 페널티를 받아요. 연습·예선에서는 삭제된 기록 수를 보여 줘요."],
    ["지금 피트인하면", "선두와의 차이에 이 서킷의 피트 손실(피트 레인 통과 시간)을 더해서 지금 피트에 들어가면 몇 위로 나올지 계산한 값이에요. 세이프티카·VSC 중에는 손실이 줄어들어요."],
    ["타이어 전략", "모든 드라이버가 어떤 타이어로 몇 랩씩 달렸는지 한눈에 보여 줘요. 빗금 친 구간은 이미 쓴 타이어로 시작한 스틴트예요."],
    ["텔레메트리", "차에서 실시간으로 보내는 속도·엔진 회전수(RPM)·기어·스로틀(가속 페달)·브레이크 정보예요. 속도 그래프의 Δ 선은 랩을 따라 기준 랩보다 얼마나 빠르거나 느린지를 누적해서 보여 줘요."],
    ["스틴트 페이스", "한 타이어 세트로 달린 랩들의 평균 기록과 랩마다 기록이 얼마나 느려지는지(타이어 마모 경향)예요. 피트·세이프티카 랩은 빼고 계산해요. 연료가 줄면 차가 가벼워져서 실제 마모보다 조금 작게 보여요."],
    ["실제 지도", "F1 위치 데이터를 OpenStreetMap 지도에 맞춰서 위성 사진, 지형 높이, 건물, 숲, 바다를 실제 자리에 그려요. 지도에 없는 임시 시설(관중석 일부, 광고판)은 빠질 수 있어요."],
    ["중계 지연 · 멈춤", "TV 중계는 실제보다 수십 초 늦게 나와요. 그만큼 화면을 늦추면 순위가 TV보다 먼저 바뀌지 않아요. TV를 멈추면 멈춤을 누르고, 다시 재생할 때 이어서를 누르면 멈춘 시간만큼 지연이 자동으로 늘어나요."],
  ];

  const KO = { DRIVERS, TEAMS, TYRES, TRACK_STATUS, GLOSSARY, gpName, sessionName, surname, translate };
  if (typeof module !== "undefined" && module.exports) module.exports = KO; else root.KO = KO;
})(typeof window !== "undefined" ? window : globalThis);
