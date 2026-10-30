// Which change a save holds (v0.50 §3-3), pure (tested: test/game/save50.test.js). G.raceGen: the race on screen (a new
// one per race started or loaded); G.rev: its change counter (each step run, each order sent); G.savedRev: the revision the
// newest successful save of this race holds. A save takes { gen, rev } when its data is built; its answer marks THAT
// revision saved, only for the same race – a change made while the file was written stays unsaved, an earlier race's late
// answer changes nothing. Equal sim time is never taken as equal state.
export const beginSave = (G) => ({ gen: G.raceGen, rev: G.rev });
export function endSave(G, tok, ok) {
  if (tok.gen !== G.raceGen) return { stale: true, marked: false };
  if (!ok) return { stale: false, marked: false };
  if (tok.rev > (G.savedRev ?? -1)) G.savedRev = tok.rev;
  return { stale: false, marked: true, behind: G.rev !== tok.rev };
}
export const unsaved = (G) => G.rev !== G.savedRev;
