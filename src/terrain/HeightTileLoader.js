export class HeightTileLoader {
  constructor() {
    this.manifest = null;
    this.regionId = null;
    this.cache = new Map();
    this.pending = new Map();
    this.generation = 0;
  }

  async loadRegion(regionId) {
    this.generation++;
    this.cache.clear();
    this.pending.clear();
    this.manifest = null;
    this.regionId = null;
    const response = await fetch(`/moon/regions/${regionId}/manifest.json`, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`DEM manifest missing for ${regionId}. Run the data build script.`);
    }
    this.manifest = await response.json();
    this.regionId = regionId;
    return this.manifest;
  }

  key(lod, x, y) { return `${lod}/${x}/${y}`; }

  getLevel(lod) {
    return this.manifest?.levels?.find(l => l.lod === lod) || null;
  }

  tileInfo(lod, x, y) {
    const key = this.key(lod, x, y);
    const meta = this.manifest?.tiles?.[key];
    return meta ? { key, ...meta } : null;
  }

  tileIndicesForPoint(lod, east, north) {
    const level = this.getLevel(lod);
    if (!level) return null;
    const half = this.manifest.extentMeters / 2;
    const x = Math.floor((east + half) / level.tileSizeMeters);
    const y = Math.floor((north + half) / level.tileSizeMeters);
    return { x, y };
  }

  tileBounds(lod, x, y) {
    const level = this.getLevel(lod);
    const half = this.manifest.extentMeters / 2;
    const minEast = -half + x * level.tileSizeMeters;
    const minNorth = -half + y * level.tileSizeMeters;
    return {
      minEast,
      maxEast: minEast + level.tileSizeMeters,
      minNorth,
      maxNorth: minNorth + level.tileSizeMeters
    };
  }

  async loadTile(lod, x, y) {
    const info = this.tileInfo(lod, x, y);
    if (!info) return null;
    if (this.cache.has(info.key)) return this.cache.get(info.key);
    if (this.pending.has(info.key)) return this.pending.get(info.key);
    const generation = this.generation;
    const promise = (async () => {
      const url = `/moon/regions/${this.regionId}/${info.path}`;
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`Failed DEM tile ${url}: ${res.status}`);
      const buf = await res.arrayBuffer();
      if (generation !== this.generation) return null;
      const data = new Uint16Array(buf);
      const level = this.getLevel(lod);
      const expected = level.samples * level.samples;
      if (data.length !== expected) throw new Error(`DEM tile ${info.key} expected ${expected} samples, got ${data.length}`);
      const tile = { ...info, lod, x, y, samples: level.samples, data, bounds: this.tileBounds(lod, x, y) };
      this.cache.set(info.key, tile);
      this.pending.delete(info.key);
      return tile;
    })().catch(err => {
      this.pending.delete(info.key);
      throw err;
    });
    this.pending.set(info.key, promise);
    return promise;
  }

  decodeSample(tile, i) {
    const t = tile.data[i] / 65535;
    return tile.minHeight + (tile.maxHeight - tile.minHeight) * t;
  }

  sampleTile(tile, east, north) {
    const { minEast, maxEast, minNorth, maxNorth } = tile.bounds;
    const u = Math.max(0, Math.min(1, (east - minEast) / (maxEast - minEast)));
    const v = Math.max(0, Math.min(1, (north - minNorth) / (maxNorth - minNorth)));
    const n = tile.samples;
    const fx = u * (n - 1), fy = v * (n - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const i00 = y0 * n + x0, i10 = y0 * n + x1, i01 = y1 * n + x0, i11 = y1 * n + x1;
    const a = this.decodeSample(tile, i00) * (1 - tx) + this.decodeSample(tile, i10) * tx;
    const b = this.decodeSample(tile, i01) * (1 - tx) + this.decodeSample(tile, i11) * tx;
    return a * (1 - ty) + b * ty;
  }

  sampleHeightSync(east, north) {
    if (!this.manifest) return null;
    const levels = [...this.manifest.levels].sort((a,b) => b.lod - a.lod);
    for (const level of levels) {
      const idx = this.tileIndicesForPoint(level.lod, east, north);
      if (!idx) continue;
      const tile = this.cache.get(this.key(level.lod, idx.x, idx.y));
      if (tile) return this.sampleTile(tile, east, north);
    }
    return null;
  }

  async ensurePointLoaded(east, north, lod = null) {
    if (!this.manifest) return null;
    const targetLod = lod ?? Math.max(...this.manifest.levels.map(l => l.lod));
    const idx = this.tileIndicesForPoint(targetLod, east, north);
    if (!idx) return null;
    return this.loadTile(targetLod, idx.x, idx.y);
  }
}
