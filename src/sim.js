export { ROW, P, BURST, PRESETS } from './sim/constants.js';
export { glyph } from './sim/entities.js';
export { createWorld, census } from './sim/world.js';

import { P, ROW } from './sim/constants.js';
import { delta } from './sim/space.js';
import { moveEntities } from './sim/motion.js';
import { collideAndBurst, replenishMatter } from './sim/matter.js';
import { advanceLife } from './sim/life.js';

export function tick(w, { G = P.G, mutation = P.MUTATION, boundary = 'box' } = {}) {
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

  const nearest = (e, list, range, skip) => {
    let best = null;
    let bd = range * range;
    for (const t of list) {
      if (t === e || t.dead || (skip && skip(t))) continue;
      const [dx, dy] = d(e, t);
      const r2 = dx * dx + dy * dy;
      if (r2 < bd) {
        bd = r2;
        best = [t, dx, dy, Math.sqrt(r2) || 1];
      }
    }
    return best;
  };

  const ctx = { w, wrap, G, mutation, d, nearest, es, cells, bodies, heavy, stars, food, born, events };
  moveEntities(ctx);
  collideAndBurst(ctx);
  const next = advanceLife(ctx);
  replenishMatter(ctx, next);

  const tr = w.trails;
  for (let i = 0; i < tr.length; i++) {
    tr[i] *= P.TRAIL_DECAY;
    w.flash[i] *= P.FLASH_DECAY;
  }
  for (const e of next) {
    if (!e.g) continue;
    const x = Math.floor(e.x);
    const y = Math.floor(e.y / ROW);
    if (x >= 0 && x < w.cols && y >= 0 && y < w.rows) tr[y * w.cols + x] = Math.min(1, tr[y * w.cols + x] + 0.45);
  }

  w.entities = next;
  w.tick++;
  return w;
}
