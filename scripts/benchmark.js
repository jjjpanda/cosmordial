import { performance } from 'node:perf_hooks';
import { createWorld, resizeWorld, PRESETS, tick } from '../src/sim.js';
import { roleOf } from '../src/sim/entities.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--(ticks|seeds|presets|cols|rows|base-cols|base-rows|boundary|window)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Unknown argument: ${arg}`);
  return [match[1], match[2]];
}));
const ticks = args.ticks === undefined ? 5000 : Number(args.ticks);
const seeds = args.seeds === undefined ? 3 : Number(args.seeds);
const presets = args.presets === undefined ? PRESETS : args.presets.split(',');
const cols = args.cols === undefined ? 80 : Number(args.cols);
const rows = args.rows === undefined ? 30 : Number(args.rows);
const baseCols = args['base-cols'] === undefined ? cols : Number(args['base-cols']);
const baseRows = args['base-rows'] === undefined ? rows : Number(args['base-rows']);
const boundary = args.boundary ?? 'box';
const windowTicks = args.window === undefined ? Math.min(1000, ticks) : Number(args.window);
if ([ticks, seeds, cols, rows, baseCols, baseRows, windowTicks].some((n) => !Number.isSafeInteger(n) || n < 1) || windowTicks > ticks || presets.some((preset) => !PRESETS.includes(preset)) || !['box', 'torus'].includes(boundary)) {
  throw new Error('Use positive integer --ticks, --seeds, --cols, --rows, --base-cols, --base-rows, and --window (at most ticks); presets from orbit,binary,soup; and --boundary=box|torus');
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
console.log('Field:', cols, rows, 'base:', baseCols, baseRows, 'boundary:', boundary);
console.log(`preset seed final(hunter/total) avgHunter% present% peakHunter% nonHunterFreeTicks maxPop first${windowTicks}Ms last${windowTicks}Ms heapMB arrayBuffersMB rssMB peakRssMB`);
try {
  for (const preset of presets) {
    for (let seed = 1; seed <= seeds; seed++) {
      seedRandom(seed);
      global.gc?.();
      // Match the UI: seed at its normal size, then resize into the zoomed field.
      const world = createWorld(preset, baseCols, baseRows, undefined, boundary);
      resizeWorld(world, cols, rows, boundary);
      let hunterShareSum = 0;
      let hunterPresentTicks = 0;
      let peakHunterShare = 0;
      let nonHunterFreeTicks = 0;
      let maxPop = 0;
      let firstWindowMs = 0;
      let lastWindowStart = 0;
      let peakRssBytes = 0;
      const start = performance.now();
      for (let i = 1; i <= ticks; i++) {
        if (i === ticks - windowTicks + 1) lastWindowStart = performance.now();
        tick(world, { boundary });
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
        if (i === windowTicks) firstWindowMs = performance.now() - start;
        if (i % 100 === 0 || i === ticks) peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      }
      const lastWindowMs = performance.now() - lastWindowStart;
      global.gc?.();
      const finalHunters = world.entities.filter((entity) => entity.g && roleOf(entity) === 'hunter').length;
      const finalTotal = world.entities.filter((entity) => entity.g).length;
      const memory = process.memoryUsage();
      const mb = (bytes) => (bytes / 1048576).toFixed(1);
      console.log(`${preset} ${seed} ${finalHunters}/${finalTotal} ${(100 * hunterShareSum / ticks).toFixed(1)} ${(100 * hunterPresentTicks / ticks).toFixed(1)} ${(100 * peakHunterShare).toFixed(1)} ${nonHunterFreeTicks} ${maxPop} ${firstWindowMs.toFixed(0)} ${lastWindowMs.toFixed(0)} ${mb(memory.heapUsed)} ${mb(memory.arrayBuffers)} ${mb(memory.rss)} ${mb(peakRssBytes)}`);
    }
  }
} finally {
  Math.random = originalRandom;
}
