# Cosmordial

A text-based simulation of gravity, matter, and evolving cells, packaged as a web component.

![Binary preset](screenshots/binary.png)

![Soup preset](screenshots/soup.png)

## Matter

Matter merges into rocks, then stars. Stars emit light and shed matter; bursts return matter to the cycle.

## Life

Cells spend energy to move and reproduce. Mutations change their traits and roles.

| Cell | Behavior |
| --- | --- |
| Forager | Seeks food; flees hunters. |
| Heliotrope | Feeds on starlight; immune to infection. |
| Hunter | Chases and drains prey. |
| Parasite | Drains and infects hosts. |

## Embed

```sh
npm install ../cosmordial
```

```js
import 'cosmordial';
```

```html
<cosmordial-universe width="800" height="450" preset="binary" theme="amber"></cosmordial-universe>
```

The whole field must fit the available space. Requested dimensions shrink to fit the container; no overflow, scrolling, or clipped rows or columns are allowed.

## Options

Set options with HTML attributes or `setAttribute()`.

| Attribute | Default | Purpose |
| --- | --- | --- |
| `width`, `height` | automatic | Requested field size in pixels, limited by available space. |
| `cols`, `rows` | 80 × 30; adapts on mobile | Simulation grid size. Changing either resets the world. |
| `preset` | `orbit` | `orbit`, `binary`, or `soup`. Changing it resets the world. |
| `theme` | `ansi` | `ansi`, `green`, `amber`, or `colorblind`. |
| `speed` | `25` | Ticks per second. |
| `gravity` | `0.1` | Gravity strength. |
| `mutation` | `0.25` | Mutation rate. |
| `trail-length` | `6` | Trail duration; `0` disables trails. |
| `boundary` | `box` | `box` or `torus` (wraparound). |
| `autoplay` | on | Set to `false` to start paused. |
| `transparent`, `autofocus` | absent | Add to enable a transparent background or initial focus. |

## Controls

Use the buttons and sliders, or these keys when the component has focus:

| Key | Action |
| --- | --- |
| Space | Run / pause |
| S / R | Step / reset |
| 1–3 | Change preset |
| B / T | Change boundary / theme |
| + / − | Zoom in fullscreen |

Use the fullscreen button to enter or exit fullscreen. Zoom ranges from 20% to 200% and changes the simulation boundaries. Shrinking a box removes entities outside it; a torus keeps them. Below 40%, the field uses pixels instead of characters.

## Development

```sh
npm install
npm run dev
npm test
npm run build
```

`npm run benchmark` runs seeded simulation trials.
