import { performance } from 'node:perf_hooks';
import { createWorld, PRESETS, tick } from '../src/sim.js';
import { roleOf } from '../src/sim/entities.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--(ticks|seeds|presets)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Unknown argument: ${arg}`);
  return [match[1], match[2]];
}));
const ticks = args.ticks === undefined ? 5000 : Number(args.ticks);
const seeds = args.seeds === undefined ? 3 : Number(args.seeds);
const presets = args.presets === undefined ? PRESETS : args.presets.split(',');
if (!Number.isSafeInteger(ticks) || ticks < 1 || !Number.isSafeInteger(seeds) || seeds < 1 || presets.some((preset) => !PRESETS.includes(preset))) {
  throw new Error('Use positive integer --ticks and --seeds values and presets from orbit,binary,soup');
}

const originalRandom = Math.random;
const seedRandom = (seed) => {
  let state = seed;
  Math.random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

console.log(`Run: ${ticks} ticks × ${seeds} seeds × ${presets.join(', ')}`);
console.log('preset seed final(hunter/total) avgHunter% present% peakHunter% nonHunterFreeTicks maxPop first1kMs last1kMs heapMB');
try {
  for (const preset of presets) {
    for (let seed = 1; seed <= seeds; seed++) {
      seedRandom(seed);
      global.gc?.();
      const world = createWorld(preset);
      let hunterShareSum = 0;
      let hunterPresentTicks = 0;
      let peakHunterShare = 0;
      let nonHunterFreeTicks = 0;
      let maxPop = 0;
      let first1kMs = 0;
      let last1kStart = 0;
      const start = performance.now();
      for (let i = 1; i <= ticks; i++) {
        if (i === Math.max(1, ticks - 999)) last1kStart = performance.now();
        tick(world);
        let hunters = 0;
        let nonHunters = 0;
        let total = 0;
        for (const entity of world.entities) {
          if (!entity.g) continue;
          total++;
          if (roleOf(entity) === 'hunter') hunters++;
          else nonHunters++;
        }
        const share = total ? hunters / total : 0;
        hunterShareSum += share;
        hunterPresentTicks += hunters > 0;
        peakHunterShare = Math.max(peakHunterShare, share);
        nonHunterFreeTicks += nonHunters === 0;
        maxPop = Math.max(maxPop, total);
        if (i === Math.min(1000, ticks)) first1kMs = performance.now() - start;
      }
      const last1kMs = performance.now() - last1kStart;
      global.gc?.();
      const finalHunters = world.entities.filter((entity) => entity.g && roleOf(entity) === 'hunter').length;
      const finalTotal = world.entities.filter((entity) => entity.g).length;
      const heapMB = process.memoryUsage().heapUsed / 1048576;
      console.log(`${preset} ${seed} ${finalHunters}/${finalTotal} ${(100 * hunterShareSum / ticks).toFixed(1)} ${(100 * hunterPresentTicks / ticks).toFixed(1)} ${(100 * peakHunterShare).toFixed(1)} ${nonHunterFreeTicks} ${maxPop} ${first1kMs.toFixed(0)} ${last1kMs.toFixed(0)} ${heapMB.toFixed(1)}`);
    }
  }
} finally {
  Math.random = originalRandom;
}
