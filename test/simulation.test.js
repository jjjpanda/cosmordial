import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorld, resizeWorld, tick } from '../src/sim.js';
import { P, ROLE, GLYPHS, ROW } from '../src/sim/constants.js';
import { cell, eventCounts, glyph, roleOf } from '../src/sim/entities.js';
import { advanceLife } from '../src/sim/life.js';
import { moveEntities } from '../src/sim/motion.js';
import { collideAndBurst, replenishMatter } from '../src/sim/matter.js';
import { delta, physicalRadius, separateEntities } from '../src/sim/space.js';

function withSeed(seed, run) {
  let state = seed;
  const random = Math.random;
  Math.random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    return run();
  } finally {
    Math.random = random;
  }
}

function assertSeparated(world, wrap) {
  const entities = world.entities;
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const [dx, dy] = delta(entities[i], entities[j], world, wrap);
      const distance = Math.hypot(dx, dy);
      const limit = physicalRadius(entities[i]) + physicalRadius(entities[j]);
      assert.ok(distance >= limit - 1e-6, `entities ${i} and ${j} overlap at tick ${world.tick}`);
    }
  }
}

test('roles keep their threshold and tie order', () => {
  const cases = [
    [[0, 0, 0.5, 0.5, 0.5], ROLE.CELL],
    [[0, 0, 0.8, 0.8, 0.8], ROLE.HUNTER],
    [[0, 0, 0, 0.8, 0], ROLE.HELIOTROPE],
    [[0, 0, 0, 0, 0.8], ROLE.PARASITE],
    [[0, 0.8, 0, 0, 0], ROLE.FORAGER],
  ];
  for (const [traits, expected] of cases) {
    const entity = { g: [...traits, 0.2, 0.2] };
    assert.equal(roleOf(entity), expected);
    assert.equal(glyph(entity), GLYPHS[expected]);
  }
  for (const [mass, expected] of [[P.MATTER, ROLE.FOOD], [P.ROCK, ROLE.ROCK], [P.STAR, ROLE.STAR]]) {
    assert.equal(roleOf({ mass }), expected);
  }
});

test('worlds start and remain physically separated', () => {
  for (const [seed, preset, boundary] of [[11, 'orbit', 'box'], [12, 'binary', 'box'], [13, 'soup', 'torus']]) {
    withSeed(seed, () => {
      const world = createWorld(preset, 80, 30, P.G, boundary);
      const wrap = boundary === 'torus';
      assertSeparated(world, wrap);
      for (let i = 0; i < 100; i++) {
        tick(world, { boundary });
        assertSeparated(world, wrap);
      }
    });
  }
});

test('exactly coincident cells and wrapped neighbors separate', () => {
  const world = { w: 80, h: 60, tick: 0 };
  world.entities = [
    { x: 10, y: 10, g: [0] },
    { x: 10, y: 10, g: [0] },
    { x: 79.9, y: 20, g: [0] },
    { x: 0.1, y: 20, g: [0] },
  ];
  separateEntities(world.entities, world, true);
  assertSeparated(world, true);
});

test('stars keep a compact hitbox as they gain mass', () => {
  assert.equal(physicalRadius({ mass: P.STAR }), 1);
  assert.equal(physicalRadius({ mass: 35 }), 1);
});

test('photosynthesis weakens as a cell ages and starts fresh in offspring', () => {
  const star = { x: 0, y: 0, mass: 35 };
  const traits = [0, 0, 0, 0.8, 0, 0, 0];
  const parent = cell(8, 0, 0, 0, traits, 5);
  parent.lifespan = 200;
  const upkeep = P.UPKEEP + P.TRAIT_COST * traits[3];
  const gain = (entity) => {
    entity.energy = 5;
    advanceLife({
      w: { w: 40, h: 40 }, wrap: false, mutation: 0,
      d: (a, b) => [b.x - a.x, b.y - a.y], nearest: () => null,
      es: [entity, star], cells: [entity], stars: [star], food: [], born: [], events: eventCounts(),
    });
    return entity.energy - 5 + upkeep;
  };
  const first = gain(parent);
  for (let i = 1; i < 99; i++) gain(parent);
  const middle = gain(parent);
  for (let i = 100; i < 199; i++) gain(parent);
  const last = gain(parent);
  assert.ok(first > middle && middle > last);
  assert.ok(Math.abs(last / first - P.PHOTO_OLD_AGE / (1 - (1 - P.PHOTO_OLD_AGE) / 200)) < 1e-12);

  const offspring = cell(8, 0, 0, 0, traits, 5, parent.gen + 1);
  offspring.lifespan = 200;
  assert.equal(offspring.age, 0);
  assert.ok(Math.abs(gain(offspring) - first) < 1e-12);
});

test('parasites infect nearby foragers and hunters even when a closer host is immune', () => {
  const contact = (traits) => {
    const parasite = { x: 0, y: 0, vx: 0, vy: 0, g: [0, 0, 0, 0, 0.8, 0, 0], energy: 8, age: 5, gen: 1 };
    const immune = { x: 0.6, y: 0, vx: 0, vy: 0, g: [0.2, 0.2, 0.2, 0.2, 0.2, 0, 0], energy: 10, age: 5, immuneUntil: 100 };
    const target = { x: 1.2, y: 0, vx: 0, vy: 0, g: traits, energy: 10, age: 5 };
    const cells = [parasite, immune, target];
    const d = (a, b) => [b.x - a.x, b.y - a.y];
    const nearest = (e, list, range, skip) => {
      let result = null;
      let best = range;
      for (const candidate of list) {
        if (candidate === e || skip?.(candidate)) continue;
        const [dx, dy] = d(e, candidate);
        const distance = Math.hypot(dx, dy);
        if (distance < best) { best = distance; result = [candidate, dx, dy, distance]; }
      }
      return result;
    };
    const events = eventCounts();
    const random = Math.random;
    Math.random = () => 0.6;
    try {
      advanceLife({ w: { w: 10, h: 10 }, wrap: false, mutation: 0, d, nearest, es: cells, cells, stars: [], food: [], born: [], events });
    } finally {
      Math.random = random;
    }
    return { infected: !!target.spore, events: events.infections };
  };
  assert.deepEqual(contact([0, 0.8, 0, 0, 0, 0, 0]), { infected: true, events: 1 });
  assert.deepEqual(contact([0, 0, 0.8, 0, 0, 0, 0]), { infected: true, events: 1 });
  assert.deepEqual(contact([0.2, 0.2, 0.2, 0.2, 0.2, 0, 0]), { infected: false, events: 0 });
});

test('a non-hunter bite earns one earlier hunter birth', () => {
  const hunter = () => ({ x: 10, y: 10, vx: 0, vy: 0, g: [0, 0, 0.8, 0, 0, 0, 0], energy: 30, age: 19, gen: 0, lastBirth: 0, guard: 0 });
  const prey = (x) => ({ x, y: 10, vx: 0, vy: 0, g: [0, 0.8, 0, 0, 0, 0, 0], energy: 10, age: 10, gen: 0, guard: 0 });
  const advance = (cells) => {
    const born = [];
    const d = (a, b) => [b.x - a.x, b.y - a.y];
    const nearest = (e, list, range, skip) => {
      let best = null;
      let distance = range;
      for (const target of list) {
        if (target === e || skip?.(target)) continue;
        const [dx, dy] = d(e, target);
        const r = Math.hypot(dx, dy);
        if (r < distance) { best = [target, dx, dy, r]; distance = r; }
      }
      return best;
    };
    advanceLife({ w: { w: 100, h: 100 }, wrap: false, mutation: 0, d, nearest, es: cells, cells, stars: [], food: [], born, events: eventCounts() });
    return born;
  };

  const unfed = hunter();
  assert.equal(advance([unfed, prey(80), prey(85)]).length, 0);
  unfed.age = 59;
  assert.equal(advance([unfed, prey(80), prey(85)]).length, 1);

  const fed = hunter();
  assert.equal(advance([fed, prey(11), prey(80)]).length, 1);
  assert.equal(fed.lastBirth, 20);
  assert.equal(fed.lastNonHunterBite, 20);
  fed.age = 57;
  fed.energy = 30;
  assert.equal(advance([fed, prey(80), prey(85)]).length, 0);

  const crowded = hunter();
  assert.equal(advance([crowded, prey(11)]).length, 0);
  assert.equal(crowded.lastNonHunterBite, 20);
});

test('hunters sprint faster, tire during a chase, and recover afterward', () => {
  const hunter = { x: 10, y: 10, vx: 2, vy: 0, g: [1, 0, 0.8, 0, 0, 0, 0], energy: 1000 };
  const forager = { x: 20, y: 10, vx: 2, vy: 0, g: [1, 0.8, 0, 0, 0, 0, 0], energy: 1000 };
  const cells = [hunter, forager];
  let chasing = true;
  const nearest = (e, list, range, skip) => e === hunter && list === cells && chasing && !skip(forager) ? [forager, 10, 0, 10] : null;
  const ctx = { w: { w: 100, h: 100 }, wrap: false, G: 0, d: (a, b) => [b.x - a.x, b.y - a.y], nearest, es: cells, cells, heavy: [], stars: [], food: [] };
  moveEntities(ctx);
  assert.ok(Math.hypot(hunter.vx, hunter.vy) > Math.hypot(forager.vx, forager.vy) * 1.4);
  assert.ok(hunter.stamina < 1);
  for (let i = 0; i < 124; i++) moveEntities(ctx);
  assert.equal(hunter.stamina, 0);
  chasing = false;
  for (let i = 0; i < 63; i++) moveEntities(ctx);
  assert.equal(hunter.stamina, 1);
});

test('bonding finds nearby kin across a wrapped edge', () => {
  const cells = [
    { x: 0.8, y: 20, vx: 0, vy: 0, g: [0, 0, 0, 0, 0.8, 0.5, 0], energy: 10 },
    { x: 79.3, y: 20, vx: 0, vy: 0, g: [0, 0, 0, 0, 0.8, 0.5, 0], energy: 10 },
  ];
  const w = { w: 80, h: 60 };
  moveEntities({ w, wrap: true, G: 0, d: (a, b) => delta(a, b, w, true), nearest: () => null, es: cells, cells, heavy: [], stars: [], food: [] });
  assert.ok(cells[0].guard > 0);
  assert.ok(cells[1].guard > 0);
});

test('a nova drives nearby cells outward and sheds matter', () => {
  const star = { x: 10, y: 30, vx: 0, vy: 0, mass: P.NOVA };
  const target = { x: 30, y: 30, vx: 0, vy: 0, g: [0, 0, 0, 0, 0, 0, 0], energy: 10 };
  const born = [];
  const events = eventCounts();
  collideAndBurst({ w: { cols: 80, rows: 30, flash: new Float32Array(2400) }, wrap: false, d: (a, b) => [b.x - a.x, b.y - a.y], bodies: [star], stars: [star], es: [star, target], born, events });
  assert.equal(events.novae, 1);
  assert.ok(target.vx > 2);
  assert.ok(target.energy < 7);
  assert.ok(born.length > 0);
});

test('collision prefilter preserves pair order and the complete result in both boundaries', () => {
  for (const wrap of [false, true]) {
    const base = withSeed(17, () => {
      const cols = 80;
      const rows = 30;
      const entities = Array.from({ length: 40 }, (_, i) => ({
        x: i < 20 ? 10 + Math.random() * 4 : i < 30 ? 75 + Math.random() * 4 : Math.random() * cols,
        y: i < 20 ? 20 + Math.random() * 4 : Math.random() * rows * ROW,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        mass: [P.MATTER, 2, 5.5, 35][i % 4],
      }));
      entities.push(
        { x: 0.5, y: 10, vx: 1, vy: 0, mass: 2 },
        { x: 79.5, y: 10, vx: -1, vy: 0, mass: 2 },
      );
      return { cols, rows, w: cols, h: rows * ROW, entities, flash: new Float32Array(cols * rows), events: eventCounts() };
    });
    const run = (geometricDelta) => withSeed(29, () => {
      const w = structuredClone(base);
      const bodies = w.entities.filter((e) => !e.g);
      const stars = bodies.filter((e) => e.mass >= P.STAR);
      const born = [];
      collideAndBurst({ w, wrap, d: (a, b) => delta(a, b, w, wrap), bodies, stars, es: w.entities, born, events: w.events, geometricDelta });
      return { w, born };
    });
    assert.deepEqual(run(true), run(false), wrap ? 'torus' : 'box');
  }
});

test('collision search revisits later bodies after an impact moves a body to another bin', () => {
  for (const wrap of [false, true]) {
    const base = {
      w: 30, h: 20, cols: 30, rows: 10,
      entities: [
        { x: 4.9, y: 10, vx: -1, vy: 0, mass: 5 },
        { x: 4.7, y: 10, vx: 1, vy: 0, mass: 5 },
        { x: 10.1, y: 10, vx: 0, vy: 0, mass: 5 },
      ],
      flash: new Float32Array(300), events: eventCounts(),
    };
    const run = (geometricDelta) => {
      const w = structuredClone(base);
      const born = [];
      collideAndBurst({ w, wrap, d: (a, b) => delta(a, b, w, wrap), bodies: w.entities, stars: [], es: w.entities, born, events: w.events, geometricDelta });
      return { w, born };
    };
    const indexed = run(true);
    assert.equal(indexed.w.events.impacts, 2);
    assert.deepEqual(indexed, run(false));
  }
});

test('matter supply scales with grid area while default values stay the same', () => {
  const random = Math.random;
  const replenish = (cols, rows, preset = 'orbit', initialMass = 0, matterBaseArea = 80 * 30) => {
    const next = Array.from({ length: initialMass / P.MATTER }, () => ({ x: 0, y: 0, mass: P.MATTER }));
    const before = next.length;
    const w = { cols, rows, w: cols, h: rows * ROW, matterBaseArea, preset, tick: 30 };
    replenishMatter({ w, G: P.G, d: () => [0, 0], stars: [], events: eventCounts() }, next);
    return next.length - before;
  };
  try {
    Math.random = () => 0.5;
    assert.equal(replenish(80, 30), 0);
    assert.equal(replenish(160, 30), 1);
    assert.equal(replenish(24, 22, 'orbit', 0, 24 * 22), 0);
    assert.equal(replenish(48, 22, 'orbit', 0, 24 * 22), 1);

    Math.random = () => 0;
    assert.equal(replenish(80, 30), 1);
    assert.equal(replenish(80, 30, 'orbit', P.MAX_MASS), 0);
    assert.equal(replenish(160, 30, 'orbit', P.MAX_MASS), 1);

    Math.random = () => 0.01;
    assert.equal(replenish(80, 30, 'soup'), 1);
    assert.equal(replenish(160, 30, 'soup'), 2);
  } finally {
    Math.random = random;
  }
});

test('world resizing keeps the original matter baseline', () => {
  const world = withSeed(13, () => createWorld('soup', 24, 22));
  assert.equal(world.matterBaseArea, 24 * 22);
  resizeWorld(world, 48, 22);
  assert.equal(world.cols * world.rows, 2 * world.matterBaseArea);
  assert.equal(world.matterBaseArea, 24 * 22);
});

test('trail length controls decay with fixed trail brightness', () => {
  const empty = () => ({ cols: 3, rows: 3, w: 3, h: 6, preset: 'soup', tick: 0, entities: [], trails: Float32Array.from({ length: 9 }, () => 1), flash: new Float32Array(9), events: eventCounts() });
  const off = empty();
  tick(off, { trailLength: 0 });
  assert.ok(off.trails.every((value) => value === 0));
  const short = empty();
  const long = empty();
  tick(short, { trailLength: 6 });
  tick(long, { trailLength: 12 });
  assert.ok(long.trails[0] > short.trails[0]);

  const withCell = empty();
  withCell.trails.fill(0);
  withCell.entities.push({ x: 1.5, y: 3, vx: 0, vy: 0, g: [0, 0, 0, 0, 0, 0, 0], energy: 8, age: 0, gen: 0 });
  withSeed(21, () => tick(withCell));
  assert.equal(Math.max(...withCell.trails), 0.5);
});
