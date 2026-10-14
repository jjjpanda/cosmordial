import { P, BURST } from './constants.js';
import { TAU, rand, jitter, bound, flash, orbit, physicalRadius, MAX_BODY_RADIUS } from './space.js';
import { body, cell, starterGenome, starPower } from './entities.js';

const DEFAULT_GRID_AREA = 80 * 30;
const MAX_BODY_CONTACT = 2 * MAX_BODY_RADIUS;

function bodyCandidates(bodies, w, wrap) {
  // A contacting pair must be in neighboring bins. Yield indices in their
  // original order, and search again if an impact moves the current body.
  const columns = Math.max(1, Math.floor(w.w / MAX_BODY_CONTACT));
  const rows = Math.max(1, Math.floor(w.h / MAX_BODY_CONTACT));
  const cellWidth = w.w / columns;
  const cellHeight = w.h / rows;
  const bins = new Map();
  const keys = new Array(bodies.length);
  const candidates = [];
  const seen = new Set();
  const keyOf = (e) => {
    const x = wrap ? ((e.x % w.w) + w.w) % w.w : Math.max(0, Math.min(w.w, e.x));
    const y = wrap ? ((e.y % w.h) + w.h) % w.h : Math.max(0, Math.min(w.h, e.y));
    const bx = Math.min(columns - 1, Math.floor(x / cellWidth));
    const by = Math.min(rows - 1, Math.floor(y / cellHeight));
    return by * columns + bx;
  };
  for (let i = 0; i < bodies.length; i++) {
    const key = keyOf(bodies[i]);
    keys[i] = key;
    if (!bins.has(key)) bins.set(key, new Set());
    bins.get(key).add(i);
  }
  const updateBin = (i) => {
    const key = keyOf(bodies[i]);
    if (key === keys[i]) return false;
    bins.get(keys[i]).delete(i);
    if (!bins.has(key)) bins.set(key, new Set());
    bins.get(key).add(i);
    keys[i] = key;
    return true;
  };
  return function* from(i) {
    let start = i + 1;
    while (start < bodies.length && !bodies[i].dead) {
      candidates.length = 0;
      seen.clear();
      const x = keys[i] % columns;
      const y = Math.floor(keys[i] / columns);
      for (let oy = -1; oy <= 1; oy++) {
        let by = y + oy;
        if (wrap) by = (by + rows) % rows;
        else if (by < 0 || by >= rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          let bx = x + ox;
          if (wrap) bx = (bx + columns) % columns;
          else if (bx < 0 || bx >= columns) continue;
          const key = by * columns + bx;
          if (seen.has(key)) continue;
          seen.add(key);
          const bucket = bins.get(key);
          if (bucket) for (const j of bucket) if (j >= start) candidates.push(j);
        }
      }
      candidates.sort((a, b) => a - b);
      let moved = false;
      for (const j of candidates) {
        yield j;
        start = j + 1;
        moved = updateBin(i);
        updateBin(j);
        if (moved || bodies[i].dead) break;
      }
      if (!moved) return;
    }
  };
}

export function collideAndBurst(ctx) {
  const { w, wrap, d, bodies, stars, es, born, events, geometricDelta = false } = ctx;
  const bursts = [];
  const nearby = geometricDelta ? bodyCandidates(bodies, w, wrap) : null;
  function* remaining(i) { for (let j = i + 1; j < bodies.length; j++) yield j; }
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a.dead) continue;
    for (const j of nearby ? nearby(i) : remaining(i)) {
      const b = bodies[j];
      if (b.dead) continue;
      if (geometricDelta) {
        // This is the same wrapped displacement as delta(). It is only enabled
        // by tick(), which supplies delta as d; direct callers keep their d.
        let x = b.x - a.x;
        let y = b.y - a.y;
        if (wrap) {
          if (x > w.w / 2) x -= w.w;
          else if (x < -w.w / 2) x += w.w;
          if (y > w.h / 2) y -= w.h;
          else if (y < -w.h / 2) y += w.h;
        }
        if (Math.abs(x) > MAX_BODY_CONTACT || Math.abs(y) > MAX_BODY_CONTACT) continue;
      }
      const [dx, dy] = d(a, b);
      // Neither body can extend farther than MAX_BODY_RADIUS from its center.
      // Keep every potentially colliding pair in the original iteration order.
      if (Math.abs(dx) > MAX_BODY_CONTACT || Math.abs(dy) > MAX_BODY_CONTACT) continue;
      const r = physicalRadius(a) + physicalRadius(b);
      if (dx * dx + dy * dy > r * r) continue;
      const stars2 = Math.min(a.mass, b.mass) >= P.STAR;
      if (!stars2 && Math.hypot(a.vx - b.vx, a.vy - b.vy) > P.MERGE_V) {
        const dist = Math.hypot(dx, dy);
        const velocity = Math.hypot(a.vx - b.vx, a.vy - b.vy) || 1;
        const nx = dist ? dx / dist : (a.vx - b.vx) / velocity;
        const ny = dist ? dy / dist : (a.vy - b.vy) / velocity;
        const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (closing >= 0) continue;
        const impulse = -(1 + P.BOUNCE) * closing / (1 / a.mass + 1 / b.mass);
        a.vx -= impulse * nx / a.mass;
        a.vy -= impulse * ny / a.mass;
        b.vx += impulse * nx / b.mass;
        b.vy += impulse * ny / b.mass;
        const overlap = r - dist;
        a.x -= nx * overlap * b.mass / (a.mass + b.mass);
        a.y -= ny * overlap * b.mass / (a.mass + b.mass);
        b.x += nx * overlap * a.mass / (a.mass + b.mass);
        b.y += ny * overlap * a.mass / (a.mass + b.mass);
        bound(a, w, wrap);
        bound(b, w, wrap);
        events.impacts++;
        const rock = [a, b].filter((e) => e.mass >= P.ROCK && e.mass < P.STAR).sort((x, y) => x.mass - y.mass)[0];
        if (rock && -closing >= P.SHATTER_V) {
          const side = rock === a ? -1 : 1;
          const vx = rock.vx;
          const vy = rock.vy;
          rock.mass -= P.MATTER;
          rock.vx -= side * nx * P.MATTER / rock.mass;
          rock.vy -= side * ny * P.MATTER / rock.mass;
          const fragment = body(rock.x + side * nx * (physicalRadius(rock) + 0.7), rock.y + side * ny * (physicalRadius(rock) + 0.7), vx + side * nx, vy + side * ny, P.MATTER);
          bound(fragment, w, wrap);
          born.push(fragment);
          events.shatters++;
        }
        continue;
      }
      const [keep, lost] = a.mass >= b.mass ? [a, b] : [b, a];
      const m = a.mass + b.mass;
      if (stars2) bursts.push([keep, 'merge', Math.min(P.MERGE_EJECT, Math.min(a.mass, b.mass) * 0.3), Math.min(a.mass, b.mass) * 0.06]);
      else if (keep.mass < P.STAR && m >= P.STAR) bursts.push([keep, 'born']);
      keep.vx = (a.vx * a.mass + b.vx * b.mass) / m;
      keep.vy = (a.vy * a.mass + b.vy * b.mass) / m;
      keep.mass = m;
      lost.dead = true;
      for (const burst of bursts) if (burst[0] === lost) burst[0] = keep;
      if (lost === a) break;
    }
  }
  for (const s of stars) if (!s.dead && s.mass >= P.NOVA && !bursts.some(([target, kind]) => target === s && kind === 'merge')) bursts.push([s, 'nova']);

  const eject = (s, count, speeds) => {
    events.ejecta += count;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * TAU + jitter(0.2);
      const v = speeds[k % speeds.length] * rand(0.8, 1.2);
      const r = rand(3, 6);
      born.push(body(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, s.vx + Math.cos(a) * v, s.vy + Math.sin(a) * v, P.MATTER));
    }
  };
  for (const [s, kind, debris = 0, radiated = 0] of bursts) {
    if (s.dead) continue;
    const power = starPower(s);
    if (kind === 'nova') {
      if (s.mass < P.NOVA) continue;
      const count = Math.floor((s.mass - P.REMNANT) / P.MATTER);
      eject(s, count, [2.2, 1.65, 1.1]);
      s.mass -= count * P.MATTER;
      events.novae++;
    } else if (kind === 'merge') {
      const count = Math.floor(debris / P.MATTER);
      eject(s, count, [1.2]);
      s.mass -= count * P.MATTER + radiated;
      events.starMergers++;
    } else {
      events.starBirths++;
    }
    const { r: R, push, harm, glow } = BURST[kind];
    for (const t of es) {
      if (t === s || t.dead) continue;
      const [dx, dy] = d(s, t);
      const r = Math.hypot(dx, dy);
      if (r >= R || r < 0.1) continue;
      const k = (1 - r / R) * push * power * (t.g ? 1 : P.MATTER / t.mass);
      t.vx += (dx / r) * k;
      t.vy += (dy / r) * k;
      if (t.g) t.energy -= harm * power;
    }
    flash(w, s, glow * power);
  }

}

export function replenishMatter(ctx, next) {
  const { w, G, d, stars, events } = ctx;
  let mass = next.reduce((m, e) => (!e.g && e.mass < P.STAR ? m + e.mass : m), 0);
  const areaScale = w.cols * w.rows / (w.matterBaseArea || DEFAULT_GRID_AREA);
  const maxMass = P.MAX_MASS * areaScale;
  const spawnChance = w.preset === 'soup' ? (w.tick >= 30 ? P.SOUP_SPAWN_P : 0) : P.SPAWN_P;
  if (mass < maxMass) {
    const rate = spawnChance * areaScale;
    const count = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    for (let i = 0; i < count && mass < maxMass; i++) {
      next.push(body(rand(0, w.w), rand(0, w.h), jitter(0.05), jitter(0.05), P.MATTER));
      mass += P.MATTER;
    }
  }
  for (const s of stars) {
    if (s.dead || s.mass - P.MATTER < P.STAR || mass >= maxMass || Math.random() >= P.EMIT_P) continue;
    s.mass -= P.MATTER;
    next.push(body(...orbit(s, s.mass, rand(5, 12), rand(0, TAU), G), P.MATTER));
    mass += P.MATTER;
  }

  for (const f of next) {
    if (f.g || f.mass >= P.ROCK) continue;
    for (const s of stars) {
      if (s.dead) continue;
      const [dx, dy] = d(f, s);
      const r = Math.hypot(dx, dy);
      if (r >= P.LIGHT_R || Math.random() >= P.SPARK * (1 - r / P.LIGHT_R)) continue;
      Object.assign(f, cell(f.x, f.y, f.vx, f.vy, starterGenome()));
      events.births++;
      break;
    }
  }

}
