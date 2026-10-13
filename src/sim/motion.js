import { P, ROLE, THR, SMELL, BITE, PHOTO, COH } from './constants.js';
import { jitter, bound } from './space.js';
import { roleOf, kin, canBite, isParasite, isHost, isHuntTarget, starPower } from './entities.js';

export function moveEntities(ctx) {
  const { w, wrap, G, d, nearest, es, cells, heavy, stars, food } = ctx;
  for (const e of es) {
    e.ax = 0;
    e.guard = 0;
    if (e.g) e.hostDrain = 0;
    e.ay = 0;
    for (const s of heavy) {
      if (s === e) continue;
      const [dx, dy] = d(e, s);
      const r2 = dx * dx + dy * dy + P.SOFT ** 2;
      const f = (G * s.mass) / (r2 * Math.sqrt(r2));
      e.ax += f * dx;
      e.ay += f * dy;
    }
  }

  if (!wrap) {
    for (const s of stars) {
      const margin = Math.min(P.STAR_EDGE_MARGIN, w.w / 2, w.h / 2);
      const push = P.STAR_EDGE_FORCE / s.mass;
      if (s.x < margin) s.ax += push * (1 - s.x / margin);
      if (s.x > w.w - margin) s.ax -= push * (1 - (w.w - s.x) / margin);
      if (s.y < margin) s.ay += push * (1 - s.y / margin);
      if (s.y > w.h - margin) s.ay -= push * (1 - (w.h - s.y) / margin);
    }
  }

  const binary = stars.filter((s) => s.binaryStar);
  if (binary.length === 2) {
    const [a, b] = binary;
    const [dx, dy] = d(a, b);
    const r = Math.hypot(dx, dy) || 1;
    const tx = -dy / r;
    const ty = dx / r;
    const mass = a.mass + b.mass;
    const orbitSpeed = P.BINARY_ORBIT_FACTOR * Math.sqrt((G * mass * r * r) / (r * r + P.SOFT ** 2) ** 1.5);
    const relativeSpeed = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
    // Matter accretion can drain the pair's sideways motion; restore it gradually.
    const correction = (orbitSpeed - relativeSpeed) * P.BINARY_ORBIT_CORRECTION;
    a.vx -= tx * correction * b.mass / mass;
    a.vy -= ty * correction * b.mass / mass;
    b.vx += tx * correction * a.mass / mass;
    b.vy += ty * correction * a.mass / mass;
  }

  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j];
      const [dx, dy] = d(a, b);
      const r2 = dx * dx + dy * dy;
      const parasitePair = isParasite(a) && isParasite(b);
      const bondMax = parasitePair ? P.PARASITE_BOND_MAX : P.BOND_MAX;
      if (r2 > bondMax ** 2 || r2 < 1e-4) continue;
      const r = Math.sqrt(r2);
      let f;
      if (r < P.CORE) f = -P.REPEL * (1 - r / P.CORE);
      else if (kin(a, b)) {
        const coh = (a.g[COH] + b.g[COH]) / 2;
        const share = (a.energy - b.energy) * P.SHARE * coh;
        a.energy -= share;
        b.energy += share;
        f = (r - (parasitePair ? P.PARASITE_BOND : P.BOND)) * (parasitePair ? P.PARASITE_BOND_F : P.BOND_F) * coh;
        a.guard += coh;
        b.guard += coh;
      } else continue;
      a.ax += (f * dx) / r;
      a.ay += (f * dy) / r;
      b.ax -= (f * dx) / r;
      b.ay -= (f * dy) / r;
    }
  }

  for (const e of cells) {
    const g = e.g;
    const role = roleOf(e);
    const pw = g[THR] * P.THRUST;
    let px = jitter(pw);
    let py = jitter(pw);
    const pull = (t, weight) => {
      if (!t) return;
      px += (t[1] / t[3]) * pw * weight;
      py += (t[2] / t[3]) * pw * weight;
    };
    if (role === ROLE.HUNTER) {
      const preferred = nearest(e, cells, P.HUNT_SENSE, (t) => !canBite(e, t) || !isHuntTarget(t));
      pull(preferred ?? nearest(e, cells, P.HUNT_SENSE, (t) => !canBite(e, t)), P.HUNT_TAXIS * g[BITE]);
    }
    if (role === ROLE.CELL || role === ROLE.FORAGER) pull(nearest(e, cells, P.FLEE_R, (t) => roleOf(t) !== ROLE.HUNTER), -P.FLEE_TAXIS);
    if (role === ROLE.PARASITE) {
      pull(nearest(e, cells, P.PARASITE_SENSE, (t) => !isParasite(t) || !kin(e, t)), P.PARASITE_KIN_TAXIS * g[COH]);
      const specialist = nearest(e, cells, P.SPECIALIST_SENSE, (t) => {
        const targetRole = roleOf(t);
        return targetRole !== ROLE.HUNTER && targetRole !== ROLE.FORAGER;
      });
      pull(specialist ?? nearest(e, cells, P.HOST_SENSE, (t) => !isHost(t)), P.HOST_TAXIS * g[COH]);
    }
    pull(nearest(e, food, P.SENSE * (0.5 + g[SMELL])), P.SMELL * g[SMELL]);
    const sun = nearest(e, stars, P.LIGHT_R * 1.5);
    if (sun) {
      const [s, dx, dy, r] = sun;
      const safe = P.SAFE_R * Math.sqrt(starPower(s));
      const ux = dx / r;
      const uy = dy / r;
      if (r < safe * 1.5 && g[PHOTO] <= 0.5) {
        const inward = Math.max(0, px * ux + py * uy);
        px -= ux * inward;
        py -= uy * inward;
      }
      if (r < safe) {
        const gravity = Math.max(0, e.ax * ux + e.ay * uy) * P.DT;
        const momentum = Math.max(0, e.vx * ux + e.vy * uy) * 0.65;
        const escape = gravity + momentum + P.STAR_AVOID * (1 - r / safe);
        px -= ux * escape;
        py -= uy * escape;
      }
      if (role === ROLE.HUNTER && r < P.HUNT_AVOID_R) {
        const escape = P.HUNT_AVOID * (1 - r / P.HUNT_AVOID_R);
        px -= ux * escape;
        py -= uy * escape;
      }
      if (role === ROLE.HELIOTROPE) {
        const target = Math.max(safe + 3, P.LIGHT_R * 0.5 * Math.sqrt(starPower(s)));
        const seek = P.PHOTO_TAXIS * g[PHOTO] * (0.5 + g[THR]) * Math.max(-1, Math.min(1, (r - target) / target));
        px += ux * seek;
        py += uy * seek;
      }
    }
    e.vx += px;
    e.vy += py;
    e.energy -= (Math.abs(px) + Math.abs(py)) * P.MOVE_COST;
  }

  for (const e of es) {
    const drag = e.g ? P.DRAG : 1;
    e.vx = (e.vx + e.ax * P.DT) * drag;
    e.vy = (e.vy + e.ay * P.DT) * drag;
    let vmax = P.VMAX;
    if (e.g) vmax = P.VMAX_CELL * (roleOf(e) === ROLE.HUNTER ? P.HUNTER_SPEED : 1);
    else if (e.binaryStar) vmax = P.BINARY_STAR_VMAX * Math.max(1, Math.sqrt(G / P.G));
    else if (e.mass >= P.STAR) vmax = P.VMAX_STAR * Math.sqrt(P.STAR / e.mass);
    const v = Math.hypot(e.vx, e.vy);
    if (v > vmax) {
      e.vx *= vmax / v;
      e.vy *= vmax / v;
    }
    e.x += e.vx * P.DT;
    e.y += e.vy * P.DT;
    bound(e, w, wrap);
  }

  for (const e of cells) {
    for (const s of stars) {
      if (s.dead) continue;
      const [dx, dy] = d(s, e);
      const r = Math.hypot(dx, dy);
      const surface = P.BURN_R * Math.sqrt(starPower(s)) + 0.8;
      if (r >= surface) continue;
      const nx = r ? dx / r : 1;
      const ny = r ? dy / r : 0;
      e.x += nx * (surface - r);
      e.y += ny * (surface - r);
      const inward = Math.min(0, e.vx * nx + e.vy * ny);
      e.vx -= inward * nx;
      e.vy -= inward * ny;
      bound(e, w, wrap);
    }
  }

}
