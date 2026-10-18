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

### Hosted iframe

Embed the simulation field with an iframe:

```html
<iframe
  src="https://jjjpanda.github.io/cosmordial/embed/?preset=binary&amp;theme=amber&amp;speed=12"
  title="Cosmordial simulation"
  width="800"
  height="450"
  loading="lazy"
  style="border: 0"
></iframe>
```

The field fills the iframe with its panels hidden. Set the iframe's dimensions
in the parent page; omit URL `width` and `height` to fill it.

Query parameters use the [Options](#options) names and defaults; `embed` is always
enabled. Set `autoplay=false` to start paused. `transparent` and `autofocus` accept
`true` or a bare parameter to enable, and `false` or omission to disable.

Unknown or invalid values are ignored; the first repeated value wins. Changing
the iframe's `src` reloads the simulation with the new settings.

### Web component

```sh
npm install ../cosmordial
```

```js
import 'cosmordial';
```

```html
<cosmordial-universe width="800" height="450" preset="binary" theme="amber"></cosmordial-universe>
```

## Options

Set options with HTML attributes or `setAttribute()`.

| Attribute | Default | Purpose |
| --- | --- | --- |
| `width`, `height` | automatic | Field size in pixels, limited by available space. URL: integers 80–4096 / 80–2160. |
| `cols`, `rows` | 80 × 30; adapts on mobile | Grid size; changing either resets the world. URL: integers 1–400 / 1–200. |
| `preset` | `orbit` | `orbit`, `binary`, or `soup`. Changing it resets the world. |
| `theme` | `ansi` | `ansi`, `green`, `amber`, or `colorblind`. |
| `speed` | `25` | Ticks per second. URL: 1–60. |
| `gravity` | `0.1` | Gravity strength. URL: 0–0.5. |
| `mutation` | `0.25` | Mutation rate. URL: 0–0.5. |
| `trail-length` | `6` | Trail duration; `0` disables trails. URL: integers 0–20. |
| `boundary` | `box` | `box` or `torus` (wraparound). |
| `autoplay` | on | Set to `false` to start paused. |
| `transparent`, `autofocus` | absent | Add to enable a transparent background or initial focus. |
| `embed` | absent | Add to hide all interface panels and fit the field to the component's height. Give its container a definite height. |

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
