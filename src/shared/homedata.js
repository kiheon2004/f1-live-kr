// The home screen's data rules, kept free of the page and of three.js so the tests can load them: where a circuit sits
// on the globe, how a calendar race is matched to F1's archive meetings, what state a race's schedule and its data are
// in, searching, clustering markers, and guards against late answers. Loaded as a <script> in the app (HomeData) and
// with require() in tests.
(function (root) {
  const DAY = 864e5;

  // ---------- globe ----------
  // A latitude/longitude (degrees) → a point on a sphere of radius r, in the convention of three.js SphereGeometry's
  // texture coordinates with an equirectangular map whose left edge is 180°W and centre 0° (NASA Blue Marble, Natural
  // Earth): SphereGeometry puts u = φ/2π at x = −cos φ·sin θ, z = sin φ·sin θ (θ from the north pole), so longitude λ
  // (u = (λ + 180)/360) lands at x = cos λ·cos β, y = sin β, z = −sin λ·cos β (β latitude). 0°/0° is +x; 90°E is −z.
  // (checked against the geometry's own vertices in test/home.test.js)
  function latLonToVec3(lat, lon, r = 1) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const b = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180;
    return { x: r * Math.cos(l) * Math.cos(b), y: r * Math.sin(b), z: -r * Math.sin(l) * Math.cos(b) };
  }

  // Markers close together on screen are drawn as one, numbered: points [{ id, x, y }] (front side only) → clusters
  // [{ ids, x, y }]. The selected one is placed first so its own marker (and label) stays where it is; the rest go in
  // the order given (round order), each joining the first cluster whose anchor is within radius pixels.
  function clusterPoints(points, radius, selectedId = null) {
    const order = [...points].sort((a, b) => (a.id === selectedId ? -1 : b.id === selectedId ? 1 : 0));
    const out = [];
    for (const p of order) {
      const c = out.find((k) => Math.hypot(k.x - p.x, k.y - p.y) < radius);
      if (c) c.ids.push(p.id); else out.push({ ids: [p.id], x: p.x, y: p.y });
    }
    return out;
  }

  // Races held at the same spot (same coordinates to ~1 km): one marker that offers each of them. Races without
  // coordinates get no marker (they stay in the list) – never a made-up spot.
  function placeGroups(races) {
    const m = new Map();
    for (const r of races) {
      if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
      const k = `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
      if (!m.has(k)) m.set(k, { key: k, lat: r.lat, lon: r.lon, races: [] });
      m.get(k).races.push(r);
    }
    return [...m.values()];
  }

  // ---------- dates ----------
  const dayNum = (d) => (typeof d === "string" && /^\d{4}-\d\d-\d\d/.test(d) ? Math.floor(Date.parse(d.slice(0, 10) + "T00:00:00Z") / DAY) : null);
  // A calendar session's start: { at (ms) or null, precision }. A date alone has no start time (precision "date").
  const sessionAt = (s) => (s?.precision === "time" || (s?.utc && s?.precision == null) ? { at: Date.parse(s.utc), precision: "time" } : { at: null, precision: s?.date ? "date" : null });
  // The first session with a real start time after now – what a countdown may count to (a date-only one never is).
  function nextTimedSession(races, now = Date.now()) {
    let best = null;
    for (const r of races || []) for (const s of r.sessions || []) {
      const { at } = sessionAt(s);
      if (at != null && at > now && (!best || at < best.at)) best = { r, s, at };
    }
    return best;
  }
  // The race weekend in ms, as wide as the calendar allows: a date alone covers that whole day anywhere on Earth
  // (UTC−12 … UTC+14). → { start, end } or null.
  function weekend(race) {
    const ss = race?.sessions || [];
    if (!ss.length) return null;
    const first = ss[0], last = ss.find((s) => s.name === "Race") || ss[ss.length - 1];
    const a = sessionAt(first), b = sessionAt(last);
    const start = a.at != null ? a.at : first.date ? Date.parse(first.date + "T00:00:00Z") - 14 * 3600e3 : null;
    const end = b.at != null ? b.at + 4 * 3600e3 : last.date ? Date.parse(last.date + "T00:00:00Z") + DAY + 12 * 3600e3 : null;
    return start != null && end != null ? { start, end } : null;
  }

  // ---------- archive meetings ----------
  // The season's archive sessions grouped by meeting: by F1's meeting key, else by the meeting folder of the path
  // (both F1's own ids – never the meeting's display name).
  function groupMeetings(sessions) {
    const m = new Map();
    for (const s of sessions || []) {
      const folder = typeof s.path === "string" ? s.path.split("/").slice(0, 2).join("/") : null;
      const key = s.meetingKey != null ? `k${s.meetingKey}` : folder ? `p${folder}` : null;
      if (!key) continue;
      if (!m.has(key)) m.set(key, { key, meetingKey: s.meetingKey ?? null, folder, name: s.meeting, location: s.location, country: s.country, circuitKey: s.circuitKey ?? null, circuit: s.circuit ?? null, sessions: [] });
      m.get(key).sessions.push(s);
    }
    for (const g of m.values()) {
      const days = g.sessions.map((s) => dayNum(s.start)).filter((d) => d != null);
      g.first = days.length ? Math.min(...days) : null; g.last = days.length ? Math.max(...days) : null;
    }
    return [...m.values()];
  }

  // Calendar races ↔ archive meetings of the same season, by the days they ran: a race's weekend (its first session's
  // day to the race's, a day either side for time zones – the archive gives local days, the calendar UTC) against a
  // meeting's session days. One meeting overlapping one race: matched. None: no record (yet). More than one, or a
  // meeting that overlaps two races: left unresolved ("ambiguous") with the candidates – never forced. Names and
  // countries aren't used to match (2026's "Bahrain Grand Prix" ran in Malaysia; Spain had two venues in 2026; 2020 had
  // two races each at the Red Bull Ring and Sakhir), and neither is F1's meeting Number (2026's index numbers Miami and
  // Monaco both 6). → { races: Map(round → { state, meeting, candidates }), extra: meetings matched to no race }
  function matchRaces(races, sessions) {
    const meetings = groupMeetings(sessions);
    const win = (r) => {
      const days = (r.sessions || []).map((s) => dayNum(s.date)).filter((d) => d != null);
      if (r.date) days.push(dayNum(r.date));
      return days.length ? [Math.min(...days) - 1, Math.max(...days) + 1] : null;
    };
    const cand = new Map(), byMeeting = new Map();
    for (const r of races || []) {
      const w = win(r);
      const list = w ? meetings.filter((g) => g.first != null && g.first <= w[1] && g.last >= w[0]) : [];
      cand.set(r.round, { w, list });
      for (const g of list) byMeeting.set(g.key, (byMeeting.get(g.key) || 0) + 1);
    }
    const out = new Map(), used = new Set();
    for (const r of races || []) {
      const { w, list } = cand.get(r.round);
      if (!w) { out.set(r.round, { state: "unknown", meeting: null, candidates: [] }); continue; }
      if (list.length === 1 && byMeeting.get(list[0].key) === 1) { out.set(r.round, { state: "matched", meeting: list[0], candidates: list }); used.add(list[0].key); }
      else if (!list.length) out.set(r.round, { state: "none", meeting: null, candidates: [] });
      else out.set(r.round, { state: "ambiguous", meeting: null, candidates: list });
    }
    for (const c of cand.values()) for (const g of c.list) used.add(g.key);
    return { races: out, extra: meetings.filter((g) => !used.has(g.key)), meetings };
  }

  // ---------- states ----------
  const SCHEDULE = {
    scheduled: { ko: "예정", cls: "" }, ongoing: { ko: "진행 중", cls: "ok" }, finished: { ko: "종료", cls: "done" },
    postponed: { ko: "연기", cls: "warn" }, cancelled: { ko: "취소", cls: "bad" }, unknown: { ko: "미확인", cls: "muted" },
  };
  // The race's schedule state. "finished" only with evidence – F1's own record list has the race session and it has
  // been over for 3 hours –; a date gone by without that is "unknown"; "ongoing" is the calendar's weekend window (a
  // schedule state, not a live one: live comes from the live feed only); "cancelled"/"postponed" only from explicit
  // evidence passed in (no source the app reads publishes either – Jolpica drops a cancelled race from its list).
  // → { key, ko, cls, why }
  function scheduleStatus(race, { now = Date.now(), raceListed = false, raceStart = null, evidence = null } = {}) {
    const out = (key, why) => ({ key, ...SCHEDULE[key], why });
    if (evidence?.cancelled) return out("cancelled", evidence.source || "근거 있음");
    if (evidence?.postponed) return out("postponed", evidence.source || "근거 있음");
    const w = weekend(race);
    if (!w) return out("unknown", "일정에 날짜가 없음");
    if (now < w.start) return out("scheduled", "일정 기준");
    if (raceListed && raceStart != null && now > raceStart + 3 * 3600e3) return out("finished", "F1 기록 목록에 결승이 있음");
    if (now <= w.end) return out("ongoing", "일정 기준 (실시간 확인 아님)");
    return out("unknown", "날짜는 지났지만 기록으로 확인되지 않음");
  }

  const DATA = {
    checking: { ko: "확인 중", cls: "muted" }, listed: { ko: "세션 목록 있음", cls: "" }, cached: { ko: "로컬 캐시 있음", cls: "ok" },
    remote: { ko: "원격 이용 가능 확인됨", cls: "ok" }, auth: { ko: "인증 필요", cls: "warn" }, none: { ko: "아직 기록 없음", cls: "muted" },
    failed: { ko: "요청 실패", cls: "bad" }, unsupported: { ko: "지원 범위 밖", cls: "muted" }, unknown: { ko: "미확인", cls: "muted" },
  };
  // F1's live timing archive (livetiming.formula1.com/static) starts with the 2018 season.
  const ARCHIVE_FROM = 2018;
  // A race's data state from what has really been checked. listing: the season's archive list { state: "loading" |
  // "ok" | "error", status, offline, stale }; match: matchRaces' entry; cached: path → { core } (sessions.cached);
  // probes: path → probeSession's answer. A failed request is never "no data", no record is never "cancelled", a list
  // entry is never "downloadable". → { key, ko, cls, why }
  function dataStatus({ year, listing, match, cached = {}, probes = {}, now = Date.now(), race = null } = {}) {
    const out = (key, why = "") => ({ key, ...DATA[key], why });
    if (year < ARCHIVE_FROM) return out("unsupported", `F1 기록 보관소는 ${ARCHIVE_FROM}년부터`);
    if (!listing || listing.state === "loading") return out("checking");
    if (listing.state === "error") {
      if (listing.status === 401 || listing.status === 403) return out("auth", "F1 기록 서버가 목록을 막음 (로그인 필요)");
      return out("failed", listing.offline ? "오프라인 · 저장된 목록 없음" : listing.message || "목록 요청 실패");
    }
    const note = listing.stale ? (listing.offline ? "오프라인 · 저장된 목록 기준" : `저장된 목록 기준 (HTTP ${listing.status})`) : "";
    if (!match || match.state === "unknown") return out("unknown", "일정 날짜를 알 수 없음");
    if (match.state === "ambiguous") return out("unknown", `기록 후보 ${match.candidates.length}개 · 자동으로 고르지 않음`);
    if (match.state === "none") {
      const w = race && weekend(race);
      return out("none", w && now < w.start ? "경기 전" : "F1 기록 목록에 없음 (취소 여부와 무관)" + (note ? ` · ${note}` : ""));
    }
    const paths = match.meeting.sessions.map((s) => s.path);
    const nCached = paths.filter((p) => cached[p]?.core).length;
    if (nCached) return out("cached", `${nCached}/${paths.length} 세션${note ? ` · ${note}` : ""}`);
    if (paths.some((p) => probes[p]?.state === "remote")) return out("remote", note);
    if (paths.some((p) => probes[p]?.state === "auth")) return out("auth", "목록은 있지만 받으려면 로그인 필요" + (note ? ` · ${note}` : ""));
    return out("listed", `세션 ${paths.length}개 · 받을 수 있는지는 고를 때 확인${note ? ` · ${note}` : ""}`);
  }
  // One archive session's state: on this computer, F1's answer to the probe, else only listed.
  function sessionStatus({ cached, probe } = {}) {
    const out = (key, why = "") => ({ key, ...DATA[key], why });
    if (cached?.core) return out("cached", "이 컴퓨터에 있음 · 오프라인 재생 가능");
    if (!probe) return out("listed", "받을 수 있는지 아직 확인 안 함");
    if (probe.state === "checking") return out("checking");
    if (probe.state === "remote") return out("remote", "F1 기록 서버가 응답함");
    if (probe.state === "auth") return out("auth", probe.authTried === "refused" ? "로그인 토큰으로도 거부됨" : "F1 TV 로그인 필요");
    if (probe.state === "none") return out("none", "아직 공개되지 않음 (HTTP 404)");
    return out("failed", probe.offline ? "오프라인" : `HTTP ${probe.status ?? "?"}`);
  }

  // ---------- list ----------
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Races whose name, Korean name, circuit, place or country contain the query (accents and case ignored).
  function filterRaces(races, query, koName = (n) => n) {
    const q = norm(query).trim();
    if (!q) return races.slice();
    const words = q.split(/\s+/);
    return races.filter((r) => {
      const hay = norm([r.name, koName(r.name), r.circuitName || r.circuit, r.locality, r.country, r.circuitId, r.meeting].join(" "));
      return words.every((w) => hay.includes(w));
    });
  }

  // ---------- late answers ----------
  // Each request takes a ticket; an answer whose ticket is no longer the newest is ignored (the request itself still
  // runs to its end – this ignores, it doesn't cancel).
  function guard() {
    let n = 0;
    return { next: () => ++n, current: (t) => t === n, get value() { return n; } };
  }
  // A load's progress message belongs to the load numbered job (messages without a number come from callers that
  // number nothing: shown, as before).
  const progressMatches = (job, p) => p?.job == null || p.job === job;

  const API = { latLonToVec3, clusterPoints, placeGroups, dayNum, sessionAt, nextTimedSession, weekend, groupMeetings, matchRaces, scheduleStatus, dataStatus, sessionStatus, filterRaces, guard, progressMatches, SCHEDULE, DATA, ARCHIVE_FROM };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.HomeData = API;
})(typeof window !== "undefined" ? window : globalThis);
