# Cosmordial

Matter, stars, and cells that evolve.

## The loop

```text
∙ tan food → ° gray rock → Θ yellow-white star
∙ near starlight → rarely α white cell → on death ∙ food
```

| Event | Result |
| --- | --- |
| Gentle collision | Matter joins |
| Hard collision | Bounce; rocks may shed food |
| Star birth | Flash and shove; no new matter |
| Star + star | A star larger than either parent + flash + debris |
| Star bursts | Smaller remnant + flash + debris |
| Box edge | Stars feel an inward push near the wall |
| Starlight | Cells avoid the hot center; light feeds them outside |
| More star mass | More inertia, light, and burst energy |
| More nearby stars | More mutation |

## Cells

| Mark | Role | Does |
| :---: | --- | --- |
| `α` white | Cell | Starts unspecialized |
| `σ` orange | Forager | Short lived; follows food; flees hunters; leaves other foragers alone |
| `φ` green | Heliotrope | Long lived; seeks a safe ring; shades cells behind it |
| `Ω` red | Hunter | Short lived; tracks plain cells and foragers beyond the star ring; bites unrelated cells; divides slowly |
| `Ξ` blue | Parasite | Gathers with kin; drains hosts and leaves spores; feeds poorly on food and light |

Food / light / prey **→ energy → division → changed offspring**. Movement and staying alive spend energy. Roles can mix; the mark shows the strongest trait.

Parasite + plain cell, forager, or hunter **→ infected host → new parasite**. Infected hosts have a blue underline. Spores spread more easily away from starlight; sparse hosts end the outbreak.

## Starts

| Preset | At the start |
| --- | --- |
| Orbit | Star, matter, plain cells |
| Binary | Wider, orbiting pair of stars; matter and plain cells |
| Soup | Plain cells only; matter drifts in later |

**Display:** sparkline = living population over a speed-scaled span · key = current counts · events = totals since reset.

**Controls:** `Space` run/pause · `s` step · `r` reset · number keys choose preset · `b` boundary · `t` theme. Sliders adjust speed, gravity, and mutation.

## Run

```sh
npm install
npm run dev
```

`npm run build` creates the distributable. Embed with `<cosmordial-universe></cosmordial-universe>`.
