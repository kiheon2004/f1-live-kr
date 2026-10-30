// Fuel and ERS of one car (DESIGN §5, §8). Pure. The effect of energy on the race is ONLY through power available to
// profile.js / car.js (P = ICE cap + ERS cap) and the fuel mass – never a lap-time offset.
//
// Fuel: burn = P_ice_used·dt / (η·LHV); no refuelling (the season rules have none); fuel ≥ 0. Empty tank ⇒ ICE power 0 ⇒
// the car runs on what is left in the battery, then coasts and stops (rolling resistance and drag) – an event.
// ERS: state of charge in a window (J). Harvest from braking power (×regenEff, ≤ pK, ≤ per-lap harvest limit) and, ≤2025,
// MGU-H while the ICE is at full power. Deploy ≤ pK·mode share, while SOC is above the mode's floor and the per-lap deploy
// allowance (season data) is not used up; 2026 caps the MGU-K power by speed (rule formula), Overtake Mode adds allowance and moves
// the cap (when the caller says the car is eligible). Empty store ⇒ deploy 0.
export function createEnergy(ep, { fuel = ep.fuel.max, soc = 1 } = {}) {
  return { fuel: Math.max(0, Math.min(ep.fuel.max, fuel)), soc: Math.max(0, Math.min(1, soc)) * ep.ers.socWindow,
    lapDeploy: 0, lapHarvest: 0, fuelUsed: 0, deployed: 0, harvested: 0, fuelEmpty: false, ersEmpty: false, events: [] };
}

// ICE power cap (W at the wheels) for this car: 0 with an empty tank; never above what the season's fuel-flow limit allows
export const iceCap = (es, pIce, ep) => (es.fuel > 0 ? (ep ? Math.min(pIce, ep.fuel.etaIce * ep.fuel.flowMax) : pIce) : 0);

// ERS deploy cap now (W). mode ∈ harvest|balanced|push|overtake; otEligible: 2026 Overtake Mode allowed (within 1 s).
export function ersCap(es, ep, mode, v, otEligible = false) {
  const M = ep.modes[mode] || ep.modes.balanced, E = ep.ers;
  if (es.soc <= M.socFloor * E.socWindow || es.soc <= 0) return 0;
  const ot = mode === "overtake" && otEligible;
  const allowance = E.deployLap * M.budget;
  if (es.lapDeploy >= allowance) return 0;
  // 2026 speed cap (rule formula, season data): normal P ≤ capA − capB·v_kmh below capCut; Overtake P ≤ otA − otB·v_kmh
  const vk = v * 3.6;
  // (C5.2.8 i: 1800 − 5·v below 340 km/h, then 6900 − 20·v down to 0 at 345 – v0.50: the second segment, was a cut at 340)
  const cap = ot ? E.otA - E.otB * vk : vk >= (E.capCut2 ?? E.capCut) ? 0 : vk >= E.capCut ? (E.capA2 ?? 0) - (E.capB2 ?? 0) * vk : E.capA - E.capB * vk;
  const pMax = Math.max(0, Math.min(E.pK, cap));
  return pMax * M.deployFrac;
}

// split the tractive power the car used into ICE and ERS (ICE first: the ERS share is what the ICE alone couldn't give)
export function splitPower(pDrive, pIceCap, pErsCap) {
  const ice = pDrive < pIceCap ? pDrive : pIceCap, ers = Math.min(pErsCap, Math.max(0, pDrive - ice));
  return [ice, ers];
}

// one step: pIce / pErs used (W), pBrake (W braking), iceFull (ICE at its cap: MGU-H harvests ≤2025), otLap (2026: this lap
// started with Overtake active ⇒ +overtakeExtra recharge allowance, C5.2.10 iii)
export function stepEnergy(es, ep, { pIce = 0, pErs = 0, pBrake = 0, iceFull = false, otLap = false }, dt, t = 0) {
  const F = ep.fuel, E = ep.ers;
  // fuel
  if (es.fuel > 0 && pIce > 0) {
    const burn = pIce * dt / (F.etaIce * F.LHV);
    const b = burn < es.fuel ? burn : es.fuel;
    es.fuel -= b; es.fuelUsed += b;
    if (es.fuel <= 1e-9) { es.fuel = 0; if (!es.fuelEmpty) { es.fuelEmpty = true; es.events.push({ t, type: "fuelEmpty", cause: "fuel used up" }); } }
  }
  // deploy
  if (pErs > 0) {
    const e = Math.min(pErs * dt, es.soc);
    es.soc -= e; es.lapDeploy += e; es.deployed += e;
    if (es.soc <= 1e-6 && !es.ersEmpty) { es.ersEmpty = true; es.events.push({ t, type: "ersEmpty", cause: "energy store empty" }); }
  }
  // harvest: braking (MGU-K, per-lap limited) + MGU-H at full ICE power (≤2025)
  let h = 0;
  if (pBrake > 0) {
    const room = E.harvestLapK + (otLap ? E.overtakeExtra : 0) - es.lapHarvest;
    if (room > 0) { const pk = Math.min(pBrake * E.regenEff, E.pK); h = Math.min(pk * dt, room); es.lapHarvest += h; }
  }
  if (iceFull && E.pH > 0) h += E.pH * dt;
  if (h > 0) {
    const add = Math.min(h, E.socWindow - es.soc);
    if (add > 0) { es.soc += add; es.harvested += add; if (es.ersEmpty && es.soc > 0.01 * E.socWindow) es.ersEmpty = false; }
  }
  return es;
}
export const energyLap = (es) => { es.lapDeploy = 0; es.lapHarvest = 0; return es; };
// the state of charge as a share of the window (for screens: game data, never shown as real telemetry)
export const socFrac = (es, ep) => es.soc / ep.ers.socWindow;
