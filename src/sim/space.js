import { P, ROW } from './constants.js';

export const TAU = Math.PI * 2;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const jitter = (s) => (Math.random() - 0.5) * s;
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

