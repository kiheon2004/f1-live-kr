// Season calendar with session start times (UTC), from the public Jolpica F1 API (Ergast-compatible).
const URL_FOR = (year) => `https://api.jolpi.ca/ergast/f1/${year}/races.json?limit=100`;

const SESSION_KEYS = [
  ["FirstPractice", "Practice 1"], ["SecondPractice", "Practice 2"], ["ThirdPractice", "Practice 3"],
  ["SprintQualifying", "Sprint Qualifying"], ["Sprint", "Sprint"], ["Qualifying", "Qualifying"],
];

const toIso = (date, time) => (date ? `${date}T${time || "00:00:00Z"}` : null);

async function getSchedule(year) {
  const res = await fetch(URL_FOR(year), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const races = (await res.json()).MRData?.RaceTable?.Races || [];
  return races.map((r) => {
    const sessions = [];
    for (const [key, name] of SESSION_KEYS) if (r[key]) sessions.push({ name, utc: toIso(r[key].date, r[key].time) });
    sessions.push({ name: "Race", utc: toIso(r.date, r.time) });
    sessions.sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));
    return {
      round: +r.round, name: r.raceName, circuit: r.Circuit?.circuitName,
      locality: r.Circuit?.Location?.locality, country: r.Circuit?.Location?.country, sessions,
    };
  });
}

module.exports = { getSchedule };
