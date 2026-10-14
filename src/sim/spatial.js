// The lists are fixed during each simulation phase, but their positions move
// between phases. Rebuild the index after movement, then query nearby bins.
const neighborCache = new Map();
export function neighborBins(columns, rows, wrap) {
  const cacheKey = `${columns},${rows},${wrap}`;
  const cached = neighborCache.get(cacheKey);
  if (cached) return cached;
  const binCount = columns * rows;
  const offsets = new Int32Array(binCount + 1);
  const keys = new Int32Array(binCount * 9);
  let count = 0;
  for (let key = 0; key < binCount; key++) {
    offsets[key] = count;
    const x = key % columns;
    const y = Math.floor(key / columns);
    for (let oy = -1; oy <= 1; oy++) {
      let by = y + oy;
      if (wrap) by = (by + rows) % rows;
      else if (by < 0 || by >= rows) continue;
      for (let ox = -1; ox <= 1; ox++) {
        let bx = x + ox;
        if (wrap) bx = (bx + columns) % columns;
        else if (bx < 0 || bx >= columns) continue;
        const neighbor = by * columns + bx;
        let duplicate = false;
        for (let i = offsets[key]; i < count; i++) {
          if (keys[i] === neighbor) { duplicate = true; break; }
        }
        if (!duplicate) keys[count++] = neighbor;
      }
    }
  }
  offsets[binCount] = count;
  const neighbors = { offsets, keys: keys.subarray(0, count) };
  if (neighborCache.size >= 4) neighborCache.delete(neighborCache.keys().next().value);
  neighborCache.set(cacheKey, neighbors);
  return neighbors;
}

export function spatialIndex(list, world, binSize = 8) {
  const columns = Math.max(1, Math.ceil(world.w / binSize));
  const rows = Math.max(1, Math.ceil(world.h / binSize));
  const cellWidth = world.w / columns;
  const cellHeight = world.h / rows;
  const heads = new Int32Array(columns * rows);
  const next = new Int32Array(list.length);
  const candidates = [];
  const visited = new Uint32Array(columns * rows);
  let queryStamp = 0;

  const rebuild = () => {
    heads.fill(-1);
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      const x = Math.max(0, Math.min(columns - 1, Math.floor(e.x / cellWidth)));
      const y = Math.max(0, Math.min(rows - 1, Math.floor(e.y / cellHeight)));
      const key = y * columns + x;
      next[i] = heads[key];
      heads[key] = i;
    }
  };

  const nearby = (e, range, wrap) => {
    candidates.length = 0;
    const minX = Math.floor((e.x - range) / cellWidth);
    const maxX = Math.floor((e.x + range) / cellWidth);
    const minY = Math.floor((e.y - range) / cellHeight);
    const maxY = Math.floor((e.y + range) / cellHeight);
    const startX = wrap ? minX : Math.max(0, minX);
    const endX = wrap ? Math.min(maxX, minX + columns - 1) : Math.min(columns - 1, maxX);
    const startY = wrap ? minY : Math.max(0, minY);
    const endY = wrap ? Math.min(maxY, minY + rows - 1) : Math.min(rows - 1, maxY);
    for (let y = startY; y <= endY; y++) {
      const by = wrap ? ((y % rows) + rows) % rows : y;
      for (let x = startX; x <= endX; x++) {
        const bx = wrap ? ((x % columns) + columns) % columns : x;
        for (let i = heads[by * columns + bx]; i !== -1; i = next[i]) candidates.push(i);
      }
    }
    candidates.sort((a, b) => a - b);
    return candidates;
  };

  const nearest = (e, range, wrap, skip) => {
    let best = null;
    let bestIndex = list.length;
    let bd = range * range;
    if (++queryStamp === 0xffffffff) {
      visited.fill(0);
      queryStamp = 1;
    }
    const centerX = Math.floor(e.x / cellWidth);
    const centerY = Math.floor(e.y / cellHeight);
    const maxRing = Math.max(columns, rows);
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let y = centerY - ring; y <= centerY + ring; y++) {
        if (!wrap && (y < 0 || y >= rows)) continue;
        const by = wrap ? ((y % rows) + rows) % rows : y;
        for (let x = centerX - ring; x <= centerX + ring; x++) {
          if (ring && x !== centerX - ring && x !== centerX + ring && y !== centerY - ring && y !== centerY + ring) continue;
          if (!wrap && (x < 0 || x >= columns)) continue;
          const bx = wrap ? ((x % columns) + columns) % columns : x;
          const key = by * columns + bx;
          if (visited[key] === queryStamp) continue;
          visited[key] = queryStamp;
          for (let i = heads[key]; i !== -1; i = next[i]) {
            const t = list[i];
            if (t === e || t.dead) continue;
            let dx = t.x - e.x;
            if (wrap) {
              if (dx > world.w / 2) dx -= world.w;
              else if (dx < -world.w / 2) dx += world.w;
            }
            if (dx * dx > bd) continue;
            let dy = t.y - e.y;
            if (wrap) {
              if (dy > world.h / 2) dy -= world.h;
              else if (dy < -world.h / 2) dy += world.h;
            }
            if (dy * dy > bd) continue;
            const r2 = dx * dx + dy * dy;
            if (r2 < bd || (best && r2 === bd && i < bestIndex)) {
              if (skip && skip(t)) continue;
              bd = r2;
              bestIndex = i;
              best = [t, dx, dy, Math.sqrt(r2) || 1];
            }
          }
        }
      }
      const outside = Math.min(
        e.x - (centerX - ring) * cellWidth,
        (centerX + ring + 1) * cellWidth - e.x,
        e.y - (centerY - ring) * cellHeight,
        (centerY + ring + 1) * cellHeight - e.y
      );
      if ((outside - 1e-9) ** 2 > bd) break;
    }
    return best;
  };

  rebuild();
  return { rebuild, nearby, nearest };
}
