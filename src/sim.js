export { ROW, P, BURST, PRESETS } from './sim/constants.js';
export { glyph } from './sim/entities.js';
export { createWorld, resizeWorld, census } from './sim/world.js';

import { P, ROW } from './sim/constants.js';
import { delta, separateEntities } from './sim/space.js';
import { moveEntities } from './sim/motion.js';
import { collideAndBurst, replenishMatter } from './sim/matter.js';
import { advanceLife } from './sim/life.js';
import { spatialIndex } from './sim/spatial.js';

export function tick(w, { G = P.G, mutation = P.MUTATION, boundary = 'box', trailLength = P.TRAIL_LENGTH } = {}) {
  const wrap = boundary === 'torus';
  const d = (a, b) => delta(a, b, w, wrap);
  const es = w.entities;
  const cells = es.filter((e) => e.g);
  const bodies = es.filter((e) => !e.g);
  const heavy = bodies.filter((e) => e.mass >= P.GRAV);
  const stars = bodies.filter((e) => e.mass >= P.STAR);
  const food = bodies.filter((e) => e.mass < P.ROCK);
  const born = [];
  const events = w.events;
  const foodIndex = food.length >= 128 ? spatialIndex(food, w) : null;
  const cellIndex = cells.length >= 128 ? spatialIndex(cells, w) : null;

  const nearest = (e, list, range, skip) => {
    const index = list === food ? foodIndex : list === cells ? cellIndex : null;
    if (index) return index.nearest(e, range, wrap, skip);
    let best = null;
    let bd = range * range;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t === e || t.dead) continue;
      let dx = t.x - e.x;
      if (wrap) {
        if (dx > w.w / 2) dx -= w.w;
        else if (dx < -w.w / 2) dx += w.w;
      }
      if (dx * dx >= bd) continue;
      let dy = t.y - e.y;
      if (wrap) {
        if (dy > w.h / 2) dy -= w.h;
        else if (dy < -w.h / 2) dy += w.h;
      }
      if (dy * dy >= bd) continue;
      const r2 = dx * dx + dy * dy;
      if (r2 < bd) {
        if (skip && skip(t)) continue;
        bd = r2;
        best = [t, dx, dy, Math.sqrt(r2) || 1];
      }
    }
    return best;
  };

  // These groups describe the entities at the start of this tick. Later phases
  // mark removals with `dead` and collect additions in `born`.
  moveEntities({ w, wrap, G, d, nearest, es, cells, heavy, stars, food, geometricDelta: true });
  collideAndBurst({ w, wrap, d, bodies, stars, es, born, events, geometricDelta: true });
  foodIndex?.rebuild();
  cellIndex?.rebuild();
  const next = advanceLife({ w, wrap, mutation, d, nearest, es, cells, stars, food, born, events });
  replenishMatter({ w, G, d, stars, events }, next);
  separateEntities(next, w, wrap);

  const tr = w.trails;
  const length = Math.max(0, Number(trailLength) || 0);
  const decay = length ? P.TRAIL_DECAY ** (P.TRAIL_LENGTH / length) : 0;
  for (let i = 0; i < tr.length; i++) {
    tr[i] *= decay;
    w.flash[i] *= P.FLASH_DECAY;
  }
  if (length) {
    for (const e of next) {
      if (!e.g) continue;
      const x = Math.floor(e.x);
      const y = Math.floor(e.y / ROW);
      if (x >= 0 && x < w.cols && y >= 0 && y < w.rows) tr[y * w.cols + x] = Math.min(1, tr[y * w.cols + x] + P.TRAIL_BRIGHTNESS / 100);
    }
  }

  w.entities = next;
  w.tick++;
  return w;
}
