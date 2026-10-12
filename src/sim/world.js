import { P, ROW } from './constants.js';
import { TAU, rand, jitter, orbit } from './space.js';
import { body, cell, eventCounts, glyph, starterGenome } from './entities.js';

export function createWorld(preset = 'orbit', cols = 80, rows = 30, G = P.G) {
  const w = cols;
  const h = rows * ROW;
  const c = { x: w / 2, y: h / 2, vx: 0, vy: 0 };
  const es = [];
  const clade = (g, x, y, vx, vy, energy = P.START_E) => {
    for (let k = 0; k < 3; k++) es.push(cell(x + jitter(3), y + jitter(3), vx + jitter(0.02), vy + jitter(0.02), [...g], energy));
  };
  if (preset === 'orbit') {
    const M = 35;
    es.push(body(c.x, c.y, 0, 0, M));
    for (let i = 0; i < 4; i++) es.push(body(...orbit(c, M, 14 + i * 5, (i * TAU) / 4, G), 2));
    for (let i = 0; i < 55; i++) es.push(body(...orbit(c, M, rand(8, h * 0.45), rand(0, TAU), G), P.MATTER));
    for (let i = 0; i < 10; i++) clade(starterGenome(), ...orbit(c, M, rand(10, 22), rand(0, TAU), G));
  } else if (preset === 'binary') {
    const M = 32;
    const radius = 15;
    const separation = 2 * radius;
    const v = P.BINARY_ORBIT_FACTOR * Math.sqrt((G * M * separation * radius) / (separation ** 2 + P.SOFT ** 2) ** 1.5);
    es.push({ ...body(c.x - radius, c.y, 0, -v, M), binaryStar: true }, { ...body(c.x + radius, c.y, 0, v, M), binaryStar: true });
    for (let i = 0; i < 65; i++) es.push(body(...orbit(c, 2 * M, rand(18, h * 0.48), rand(0, TAU), G), P.MATTER));
    for (let i = 0; i < 10; i++) {
      const s = es[i % 2];
      const a = rand(0, TAU);
      const r = rand(7, 13);
      clade(starterGenome(), s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, s.vx, s.vy);
    }
  } else {
    for (let i = 0; i < 10; i++) clade(starterGenome(), rand(8, w - 8), rand(8, h - 8), jitter(0.06), jitter(0.06));
  }

  return { preset, cols, rows, w, h, entities: es, trails: new Float32Array(cols * rows), flash: new Float32Array(cols * rows), events: eventCounts(), tick: 0 };
}

export function census(w) {
  const counts = {};
  let pop = 0;
  let gen = 0;
  let energy = 0;
  let age = 0;
  for (const e of w.entities) {
    const c = glyph(e);
    counts[c] = (counts[c] || 0) + 1;
    if (e.g) {
      pop++;
      gen = Math.max(gen, e.gen);
      energy += e.energy;
      age += e.age;
    }
  }
  return { tick: w.tick, pop, gen, counts, avgEnergy: pop ? energy / pop : 0, avgAge: pop ? age / pop : 0, events: { ...w.events } };
}
