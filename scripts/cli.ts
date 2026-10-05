import { PRESETS } from '../src/engine/presets.js';
import { alerts, healthScore } from '../src/engine/sim/health.js';
import { createTerrarium, run } from '../src/engine/sim/terrarium.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : [])).filter((p) => p.length),
);
const presetName = args.preset ?? 'tropical-jar';
const days = Number(args.days ?? 120);
const every = Number(args.every ?? 7);
const setup = PRESETS[presetName];
if (!setup) {
  console.error(`Unknown preset "${presetName}". Try: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(1);
}

const s = createTerrarium(setup);
console.log(`\n${presetName} - ${days} days\n`);
console.log(['day', 'score', 'moist', 'RH%', 'temp', 'CO2ppm', 'mold g', 'plant g', 'fauna'].map((h) => h.padEnd(8)).join(''));

// Sample at 14:00 so the climate columns show mid-day conditions.
run(s, 14);
const row = () => {
  const cl = s.climate;
  const cells = [
    Math.floor(s.hour / 24), healthScore(s), cl.moisture.toFixed(2), Math.round(cl.rh * 100), cl.airTempC.toFixed(1),
    Math.round(cl.co2Ppm), s.pools.moldG.toFixed(3), s.plants.reduce((a, p) => a + p.biomassG, 0).toFixed(1),
  ].map((c) => String(c).padEnd(8));
  const fauna = s.fauna.map((f) => `${f.speciesId}:${Math.round(f.juveniles + f.adults)}`).join(' ');
  console.log(cells.join('') + fauna);
};
row();
for (let d = every; d <= days; d += every) {
  run(s, every * 24);
  row();
}

console.log('\nEvents:');
for (const e of s.events) console.log(`  day ${Math.floor(e.hour / 24)}: ${e.message}`);
console.log('\nAlerts now:');
const a = alerts(s);
if (!a.length) console.log('  none - the jar is in balance');
for (const x of a) console.log(`  [${x.severity}] ${x.message} -> ${x.fix}`);
console.log();
