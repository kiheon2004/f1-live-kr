#!/usr/bin/env node
// Committed test fixtures from built scenarios (build-all.mjs output): the scenario as built (the tests rebuild it from
// the cache and compare), and the calibration extract trimmed – race control kept only for flags, SC/VSC and penalties.
//
//   node src/game/tools/make-fixtures.mjs <scenariosDir> <id> [<id> …]
import fs from "node:fs";
import path from "node:path";

const [dir, ...ids] = process.argv.slice(2);
const out = path.join(new URL("../../../test/fixtures/game", import.meta.url).pathname);
fs.mkdirSync(out, { recursive: true });
for (const id of ids) {
  const sc = fs.readFileSync(path.join(dir, `${id}.scenario.json`), "utf8");
  const c = JSON.parse(fs.readFileSync(path.join(dir, `${id}.calib.json`), "utf8"));
  c.raceControl = c.raceControl.filter((m) => /Flag|SafetyCar/.test(m.cat || "") || /PENALTY|SAFETY CAR|RED FLAG|VSC/.test(m.msg));
  c.trimmed = "fixture: raceControl reduced to flags / SC / VSC / penalties";
  fs.writeFileSync(path.join(out, `${id}.scenario.json`), sc);
  fs.writeFileSync(path.join(out, `${id}.calib.json`), JSON.stringify(c));
  const a = fs.statSync(path.join(out, `${id}.scenario.json`)).size, b = fs.statSync(path.join(out, `${id}.calib.json`)).size;
  console.log(`${id}: scenario ${(a / 1024).toFixed(0)} KB + calib ${(b / 1024).toFixed(0)} KB = ${((a + b) / 1024).toFixed(0)} KB`);
}
