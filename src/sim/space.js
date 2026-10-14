import { P, ROW } from './constants.js';
import { neighborBins } from './spatial.js';

export const TAU = Math.PI * 2;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const jitter = (s) => (Math.random() - 0.5) * s;
const MAX_MATTER_RADIUS = 2.5;
export const MAX_BODY_RADIUS = Math.max(ROW / 2, MAX_MATTER_RADIUS);
export const physicalRadius = (e) => e.g ? P.CORE / 2 : e.mass >= P.STAR ? ROW / 2 : Math.min(MAX_MATTER_RADIUS, 0.7 * Math.sqrt(e.mass / P.MATTER));
const SEPARATION_EPS = 1e-6;
const SEPARATION_OVERSHOOT = 1.5;
const MAX_SEPARATION_PASSES = 1024;
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
  const radii = new Float64Array(entities.length);
  let maxRadius = 0;
  let occupiedArea = 0;
  for (let i = 0; i < entities.length; i++) {
    const radius = physicalRadius(entities[i]);
    radii[i] = radius;
    if (radius > maxRadius) maxRadius = radius;
    occupiedArea += Math.PI * radius * radius;
  }
  const contactRange = 2 * maxRadius;
  if (!contactRange) return;
  // A wrapped world cannot separate disks whose combined area exceeds its
  // surface. Keep every entity and retry on later ticks if density falls.
  if (wrap && occupiedArea > w.w * w.h) return;
  const columns = Math.max(1, Math.floor(w.w / contactRange));
  const rows = Math.max(1, Math.floor(w.h / contactRange));
  const cellWidth = w.w / columns;
  const cellHeight = w.h / rows;
  const binCount = columns * rows;
  const { offsets: neighborOffsets, keys: neighborKeys } = neighborBins(columns, rows, wrap);
  const binOf = (e) => {
    const x = wrap ? ((e.x % w.w) + w.w) % w.w : Math.max(0, Math.min(w.w, e.x));
    const y = wrap ? ((e.y % w.h) + w.h) % w.h : Math.max(0, Math.min(w.h, e.y));
    return Math.min(rows - 1, Math.floor(y / cellHeight)) * columns + Math.min(columns - 1, Math.floor(x / cellWidth));
  };
  const heads = new Int32Array(binCount);
  const activeHeads = new Int32Array(binCount);
  const next = new Int32Array(entities.length);
  const activeNext = new Int32Array(entities.length);
  const binKeys = new Int32Array(entities.length);
  const movedThisPass = new Uint8Array(entities.length);
  const heap = new Int32Array(9);
  // Only moved entities can create new contacts. A full pass after the active
  // set clears catches contacts missed while bins were changing within a pass.
  let active = null;
  let nextActive = new Uint8Array(entities.length);
  for (let pass = 0; pass < MAX_SEPARATION_PASSES; pass++) {
    nextActive.fill(0);
    movedThisPass.fill(0);
    heads.fill(-1);
    if (active) activeHeads.fill(-1);
    for (let i = entities.length - 1; i >= 0; i--) {
      const key = binOf(entities[i]);
      binKeys[i] = key;
      next[i] = heads[key];
      heads[key] = i;
      if (active && active[i]) {
        activeNext[i] = activeHeads[key];
        activeHeads[key] = i;
      }
    }
    let overlaps = 0;
    for (let i = 0; i < entities.length; i++) {
      const a = entities[i];
      const keyOfA = movedThisPass[i] ? binOf(a) : binKeys[i];
      const onlyActive = active && !active[i];
      const bucketHeads = onlyActive ? activeHeads : heads;
      const bucketNext = onlyActive ? activeNext : next;
      let heapSize = 0;
      for (let n = neighborOffsets[keyOfA]; n < neighborOffsets[keyOfA + 1]; n++) {
        const key = neighborKeys[n];
        let j = bucketHeads[key];
        while (j !== -1 && j <= i) j = bucketNext[j];
        if (j === -1) continue;
        let slot = heapSize++;
        while (slot > 0) {
          const parent = (slot - 1) >> 1;
          if (heap[parent] < j) break;
          heap[slot] = heap[parent];
          slot = parent;
        }
        heap[slot] = j;
      }
      while (heapSize) {
        const j = heap[0];
        let replacement = bucketNext[j];
        if (replacement === -1) replacement = heap[--heapSize];
        if (heapSize) {
          let slot = 0;
          while (true) {
            const left = slot * 2 + 1;
            if (left >= heapSize) break;
            const right = left + 1;
            const child = right < heapSize && heap[right] < heap[left] ? right : left;
            if (heap[child] >= replacement) break;
            heap[slot] = heap[child];
            slot = child;
          }
          heap[slot] = replacement;
        }
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
        movedThisPass[i] = 1;
        movedThisPass[j] = 1;
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
    const previousActive = active;
    active = nextActive;
    nextActive = previousActive ?? new Uint8Array(entities.length);
  }
  // A finite pass limit also covers torus arrangements that cannot be
  // separated despite their combined disk area fitting inside the world.
  if (!wrap) throw new RangeError('World is too crowded to separate entities');
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

