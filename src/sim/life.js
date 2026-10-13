import { P, ROLE, THR, SMELL, BITE, PHOTO, COH, REPRO } from './constants.js';
import { TAU, rand, jitter, bound } from './space.js';
import { body, cell, roleOf, canBite, isParasite, isHost, mutate, starPower } from './entities.js';

export function advanceLife(ctx) {
  const { w, wrap, mutation, d, nearest, es, cells, stars, food, born, events } = ctx;
  for (const e of cells) e.lit = [];
  for (const s of stars) {
    if (s.dead) continue;
    s.demand = 0;
    s.power = starPower(s);
    const exposed = [];
    for (const e of cells) {
      const [dx, dy] = d(s, e);
      const r = Math.hypot(dx, dy);
      if (r < P.BURN_R * Math.sqrt(s.power)) e.energy -= P.BURN * s.power;
      else if (r < P.LIGHT_R) {
        const f = 1 - r / P.LIGHT_R;
        const angle = (Math.atan2(dy, dx) + Math.PI) / TAU;
        exposed.push([e, r, f, Math.floor(angle * P.LIGHT_SECTORS) % P.LIGHT_SECTORS]);
        s.demand += e.g[PHOTO] * f * (isParasite(e) ? P.PARASITE_LIGHT : 1);
      }
    }
    exposed.sort((a, b) => a[1] - b[1]);
    const shade = new Uint8Array(P.LIGHT_SECTORS);
    for (const [e, , f, sector] of exposed) {
      e.lit.push([s, f * P.LIGHT_PASS ** shade[sector]]);
      if (e.g[PHOTO] > 0.5) shade[sector]++;
    }
  }

  for (const e of cells) {
    const g = e.g;
    const parasite = isParasite(e);
    e.age++;
    e.energy -= P.UPKEEP + P.TRAIT_COST * (g[THR] + g[SMELL] + g[BITE] + g[PHOTO] + g[COH]);

    e.flux = 0;
    for (const [s, f] of e.lit) {
      e.flux += f * s.power;
      e.energy += g[PHOTO] * (0.5 + g[PHOTO]) * P.PHOTO * f * s.power * Math.min(1, P.LIGHT * s.power / s.demand) * (parasite ? P.PARASITE_LIGHT : 1);
    }

    const prey = roleOf(e) === ROLE.HUNTER ? nearest(e, cells, P.BITE_R, (t) => t.energy <= 0 || !canBite(e, t))?.[0] : null;
    if (prey) {
      const drain = Math.min(prey.energy, (g[BITE] * P.DRAIN) / (1 + prey.guard));
      prey.energy -= drain;
      e.energy += drain * P.BITE_GAIN;
      if (drain > 0) events.bites++;
    }

    const host = parasite ? nearest(e, cells, P.INFECT_R, (t) => !isHost(t) || t.hostDrain >= P.HOST_DRAIN_CAP || t.energy <= 4)?.[0] : null;
    if (host) {
      const drain = Math.min(P.INFECT_DRAIN * g[COH], P.HOST_DRAIN_CAP - host.hostDrain, host.energy - 4);
      host.energy -= drain;
      host.hostDrain += drain;
      e.energy += drain * P.INFECT_GAIN;
    }
    const susceptible = parasite ? nearest(e, cells, P.INFECT_R, (t) => !isHost(t) || t.spore || t.age < (t.immuneUntil ?? 0) || t.energy <= 4)?.[0] : null;
    if (susceptible) {
      const role = roleOf(susceptible);
      const boost = role === ROLE.HUNTER || role === ROLE.FORAGER ? P.SWARM_SPORE_BOOST : 1;
      const chance = Math.min(1, P.SPORE_CHANCE * boost * (e.lit.length ? 1 : P.DARK_SPORE_BOOST));
      if (Math.random() < chance) {
        susceptible.spore = { g: [...g], gen: e.gen, age: 0 };
        events.infections++;
      }
    }

    const meal = nearest(e, food, P.EAT_R)?.[0];
    if (meal) {
      meal.dead = true;
      e.energy += P.MATTER_E * (1 - g[BITE]) * (parasite ? P.PARASITE_MATTER : 1);
      events.meals++;
    }
  }

  for (const host of cells) {
    if (!host.spore) continue;
    host.spore.age++;
    if (host.spore.age < P.SPORE_DELAY) continue;
    if (host.energy > P.SPORE_COST + 4) {
      const a = rand(0, TAU);
      const spore = cell(
        host.x + Math.cos(a) * 1.4,
        host.y + Math.sin(a) * 1.4,
        host.vx + jitter(0.05),
        host.vy + jitter(0.05),
        mutate(host.spore.g, mutation + host.flux * P.STAR_MUT),
        P.SPORE_COST,
        host.spore.gen + 1
      );
      bound(spore, w, wrap);
      born.push(spore);
      host.energy -= P.SPORE_COST;
      events.births++;
    }
    host.spore = null;
    host.immuneUntil = host.age + P.SPORE_REST;
  }

  const next = [];
  for (const e of es) {
    if (e.dead) continue;
    if (e.g) {
      if (e.energy <= 0 || e.age >= (e.lifespan ?? P.LIFESPAN)) {
        next.push(body(e.x, e.y, e.vx * 0.15, e.vy * 0.15, P.MATTER));
        events.deaths++;
        continue;
      }
      const hunter = roleOf(e) === ROLE.HUNTER;
      const parasite = isParasite(e);
      const birthCost = hunter ? P.HUNTER_BIRTH_COST : P.BIRTH_COST;
      const birthEnergy = parasite ? P.PARASITE_BIRTH_E + 8 * e.g[REPRO] : 14 + 14 * e.g[REPRO];
      if (e.energy >= birthEnergy + (birthCost - P.BIRTH_COST) && (!hunter || e.age - (e.lastBirth ?? 0) >= P.HUNTER_BIRTH_WAIT)) {
        const childEnergy = parasite ? P.PARASITE_CHILD_E + 4 * e.g[REPRO] : P.CHILD_E + 6 * e.g[REPRO];
        e.energy -= childEnergy + birthCost;
        e.lastBirth = e.age;
        const a = rand(0, TAU);
        const child = cell(
          e.x + Math.cos(a) * 1.4,
          e.y + Math.sin(a) * 1.4,
          e.vx + jitter(0.05),
          e.vy + jitter(0.05),
          mutate(e.g, mutation + e.flux * P.STAR_MUT),
          childEnergy,
          e.gen + 1
        );
        bound(child, w, wrap);
        born.push(child);
        events.births++;
      }
    }
    next.push(e);
  }
  next.push(...born);

  return next;
}
