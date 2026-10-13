import { P, ROW } from './constants.js';

export const TAU = Math.PI * 2;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const jitter = (s) => (Math.random() - 0.5) * s;
export const physicalRadius = (e) => e.g ? P.CORE / 2 : e.mass >= P.STAR ? ROW / 2 : Math.min(2.5, 0.7 * Math.sqrt(e.mass / P.MATTER));
const SEPARATION_EPS = 1e-6;
const SEPARATION_OVERSHOOT = 1.5;
const MAX_SEPARATION_PASSES = 256;
export function delta(a, b, w, wrap) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (wrap) {
    if (dx > w.w / 2) dx -= w.w;
    else if (dx < -w.w / 2) dx += w.w;
    if (dy > w.h / 2) dy -= w.h;
    else if (dy < -w.h / 2) dy += w.h;
  }
  return [dx, dy];
}

export function bound(e, w, wrap) {
  if (wrap) {
    e.x = ((e.x % w.w) + w.w) % w.w;
    e.y = ((e.y % w.h) + w.h) % w.h;
    return;
  }
  if (e.x < 0 || e.x >= w.w) {
    e.x = Math.max(0, Math.min(w.w - 0.01, e.x));
    e.vx *= -P.BOUNCE;
  }
  if (e.y < 0 || e.y >= w.h) {
    e.y = Math.max(0, Math.min(w.h - 0.01, e.y));
    e.vy *= -P.BOUNCE;
  }
}

function constrainPosition(e, w, wrap) {
  if (wrap) {
    e.x = ((e.x % w.w) + w.w) % w.w;
    e.y = ((e.y % w.h) + w.h) % w.h;
  } else {
    e.x = Math.max(0, Math.min(w.w - 0.01, e.x));
    e.y = Math.max(0, Math.min(w.h - 0.01, e.y));
  }
}

export function separateEntities(entities, w, wrap) {
  if (entities.length < 2) return;
  const radii = entities.map(physicalRadius);
  const contactRange = 2 * Math.max(...radii);
  if (!contactRange) return;
  const columns = Math.max(1, Math.floor(w.w / contactRange));
  const rows = Math.max(1, Math.floor(w.h / contactRange));
  const cellWidth = w.w / columns;
  const cellHeight = w.h / rows;
  const binOf = (e) => {
    const x = wrap ? ((e.x % w.w) + w.w) % w.w : Math.max(0, Math.min(w.w, e.x));
    const y = wrap ? ((e.y % w.h) + w.h) % w.h : Math.max(0, Math.min(w.h, e.y));
    return [Math.min(columns - 1, Math.floor(x / cellWidth)), Math.min(rows - 1, Math.floor(y / cellHeight))];
  };
  // Only moved entities can create new contacts. A full pass after the active
  // set clears catches contacts missed while bins were changing within a pass.
  let active = null;
  for (let pass = 0; pass < MAX_SEPARATION_PASSES; pass++) {
    const nextActive = new Uint8Array(entities.length);
    const bins = new Map();
    for (let i = 0; i < entities.length; i++) {
      const [x, y] = binOf(entities[i]);
      const key = y * columns + x;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(i);
    }
    let overlaps = 0;
    for (let i = 0; i < entities.length; i++) {
      const a = entities[i];
      const [x, y] = binOf(a);
      const candidates = [];
      const seen = new Set();
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
          for (const j of bins.get(key) ?? []) if (j > i) candidates.push(j);
        }
      }
      candidates.sort((a, b) => a - b);
      for (const j of candidates) {
        if (active && !active[i] && !active[j]) continue;
        const b = entities[j];
        const limit = radii[i] + radii[j];
        const [dx, dy] = delta(a, b, w, wrap);
        if (Math.abs(dx) >= limit || Math.abs(dy) >= limit) continue;
        const distance = Math.hypot(dx, dy);
        if (distance >= limit - SEPARATION_EPS) continue;
        const nx = distance ? dx / distance : 1;
        const ny = distance ? dy / distance : 0;
        const inertiaA = a.g ? 1 : a.mass;
        const inertiaB = b.g ? 1 : b.mass;
        const correction = (limit - distance + SEPARATION_EPS) * SEPARATION_OVERSHOOT;
        a.x -= nx * correction * inertiaB / (inertiaA + inertiaB);
        a.y -= ny * correction * inertiaB / (inertiaA + inertiaB);
        b.x += nx * correction * inertiaA / (inertiaA + inertiaB);
        b.y += ny * correction * inertiaA / (inertiaA + inertiaB);
        constrainPosition(a, w, wrap);
        constrainPosition(b, w, wrap);
        nextActive[i] = 1;
        nextActive[j] = 1;
        overlaps++;
      }
    }
    if (!overlaps) {
      if (active) {
        active = null;
        continue;
      }
      return;
    }
    active = nextActive;
  }
  throw new RangeError('World is too crowded to separate entities');
}

export function flash(w, s, r) {
  for (let gy = Math.floor((s.y - r) / ROW); gy <= (s.y + r) / ROW; gy++) {
    for (let gx = Math.floor(s.x - r); gx <= s.x + r; gx++) {
      if (gx < 0 || gx >= w.cols || gy < 0 || gy >= w.rows) continue;
      const v = 1 - Math.hypot(gx + 0.5 - s.x, (gy + 0.5) * ROW - s.y) / r;
      const i = gy * w.cols + gx;
      if (v > w.flash[i]) w.flash[i] = v;
    }
  }
}

export function orbit(c, mass, r, a, G = P.G) {
  const v = Math.sqrt((G * mass * r * r) / (r * r + P.SOFT ** 2) ** 1.5);
  return [c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.vx - Math.sin(a) * v, c.vy + Math.cos(a) * v];
}

