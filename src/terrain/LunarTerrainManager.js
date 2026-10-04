import * as THREE from 'three';
import { GlobalHeightTileLoader } from './GlobalHeightTileLoader.js';
import { TerrainTile } from './TerrainTile.js';
import { curvatureSag, destinationPoint, geodeticOffsetMeters } from '../geo/LunarCoordinates.js';
import { subGridDetail } from './Noise.js';

export class LunarTerrainManager {
  constructor({ scene, material, floatingOrigin, config, onStatus = () => {} }) {
    this.scene = scene;
    this.material = material;
    this.origin = floatingOrigin;
    this.config = config;
    this.onStatus = onStatus;
    this.loader = new GlobalHeightTileLoader();
    this.group = new THREE.Group();
    this.group.name = 'GLOBAL_REAL_DEM_TERRAIN';
    this.group.position.set(-floatingOrigin.east, 0, floatingOrigin.north);
    scene.add(this.group);

    this.active = new Map();
    this.meshPending = new Set();
    this.blockPending = new Set();
    this.renderSampleKeys = new Set();
    this.regionToken = 0;
    this.lastOriginVersion = floatingOrigin.version;

    this.buildQueue = [];
    this.buildQueueKeys = new Set();
    this.tileLoadPending = new Set();
    this.backgroundGeneration = 0;
    this.progressivePreloading = false;
    this.landingRadius = config.landingRadius ?? 4500;
    this.tileBuildBudgetMs = config.tileBuildBudgetMs ?? 3;
    this.maxTileBuildsPerFrame = config.maxTileBuildsPerFrame ?? 1;

    this.anchor = { lat: 0, lon: 0 };
    this.datumHeight = 0;
    this.manifest = null;
    this.isGlobal = true;
  }

  get maxLod() {
    let value = 0;
    for (const block of this.loader.blocks.values()) value = Math.max(value, block.maxLod || 0);
    return value || this.loader.index?.maxLod || 0;
  }

  syncOriginTransform() {
    // Terrain vertices are stored in stable anchor-local EN coordinates.
    // Floating-origin rebases therefore require only one group transform,
    // not a per-vertex geometry rebuild.
    this.group.position.set(-this.origin.east, 0, this.origin.north);
    this.group.updateMatrixWorld(true);
  }

  async activateAt(lat, lon) {
    const token = ++this.regionToken;

    // IMPORTANT: invalidate the previous site's height frame immediately.
    // Keep the loader's bounded LRU caches: Browse-mode prefetch and recently
    // visited sites can then be reused instead of rereading the same DEM packs.
    this.manifest = null;
    this.clearMeshes();
    this.anchor = { lat, lon };
    this.datumHeight = 0;
    this.lastOriginVersion = this.origin.version;
    this.syncOriginTransform();
    this.onStatus('DEM: loading global index...', false);

    const index = await this.loader.loadIndex();
    const meta = this.loader.blockForGeo(lat, lon);
    if (!meta) {
      throw new Error(`No global DEM block covers ${lat}, ${lon}`);
    }

    const block = await this.loader.loadBlock(meta.id);
    if (token !== this.regionToken) return null;

    await this.loader.ensureGeoLoaded(lat, lon, block.maxLod);
    const datum = this.loader.sampleHeightGeoSync(lat, lon);
    if (datum == null) throw new Error(`DEM center sample unavailable for ${meta.id}`);
    this.datumHeight = datum;

    this.manifest = {
      version: 2,
      mode: 'global-geodetic',
      id: 'global',
      dataset: index.dataset,
      nativeResolutionMeters: index.nativeResolutionMeters,
      referenceRadiusMeters: index.referenceRadiusMeters,
      center: { ...this.anchor },
      datumHeight: this.datumHeight,
      coverage: index.coverage,
      global: true
    };

    await this.preloadGround(0, 0);
    const selected = await this.prepareLandingZone(0, 0);
    if (token !== this.regionToken) return null;

    // Do not block entering Drive Mode on the full 58 km terrain set. The
    // remaining tile data is prefetched in the background and meshes are
    // created incrementally under a per-frame CPU budget.
    void this.beginBackgroundVisible(0, 0, selected);

    this.onStatus(`DEM: GLOBAL // ${index.dataset} // ${block.id}`, true);
    return this.manifest;
  }

  async prepareVisible(east, north) {
    const token = this.regionToken;
    const ids = this.nearbyBlockIds(east, north);
    await Promise.all(ids.map(async id => {
      try {
        await this.loader.loadBlock(id);
      } catch (err) {
        console.warn('[Global DEM block preload]', id, err);
      }
    }));
    const selected = this.selectTiles(east, north);

    // Two-phase build: first make every selected DEM tile available in the
    // cache, then construct meshes. This lets all neighboring LODs resolve
    // shared edge heights from one canonical cached surface instead of each
    // mesh sampling only its own pyramid level.
    this.renderSampleKeys = new Set(selected.map(d => d.key));
    await Promise.all(selected.map(async d => {
      try {
        await this.loader.loadTile(d.block, d.lod, d.x, d.y);
      } catch (err) {
        console.warn('[Global terrain preload]', d.key, err);
      }
    }));
    if (token !== this.regionToken) return;
    await Promise.all(selected.map(d => this.ensureRenderTile(d, token)));
  }

  descriptorDistance(desc, east, north) {
    const m = this.tileMetrics(desc.block, desc.lod, desc.x, desc.y);
    return Math.max(0, Math.hypot(m.center.east - east, m.center.north - north) - m.radius);
  }

  async prepareLandingZone(east, north) {
    const token = this.regionToken;

    // Block manifests are tiny. Load all manifests needed by the normal full
    // visible set so the critical subset uses EXACTLY the same LOD descriptors
    // as the final terrain, avoiding a parent/child replacement seam.
    const ids = this.nearbyBlockIds(east, north);
    await Promise.all(ids.map(async id => {
      try { await this.loader.loadBlock(id); }
      catch (err) { console.warn('[Landing block preload]', id, err); }
    }));
    if (token !== this.regionToken) return [];

    const selected = this.selectTiles(east, north);
    this.renderSampleKeys = new Set(selected.map(d => d.key));

    const critical = selected
      .filter(d => this.descriptorDistance(d, east, north) <= this.landingRadius)
      .sort((a, b) => this.descriptorDistance(a, east, north) - this.descriptorDistance(b, east, north));

    // There must always be at least one render tile at the landing point.
    if (!critical.length && selected.length) critical.push(selected[0]);

    await Promise.all(critical.map(async d => {
      try { await this.loader.loadTile(d.block, d.lod, d.x, d.y); }
      catch (err) { console.warn('[Landing terrain preload]', d.key, err); }
    }));
    if (token !== this.regionToken) return [];

    // Build the small critical set sequentially and yield every two tiles so
    // the browser can paint the loading UI instead of appearing frozen.
    for (let i = 0; i < critical.length; i++) {
      await this.ensureRenderTile(critical[i], token);
      if ((i & 1) === 1) await new Promise(resolve => { if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(resolve); else setTimeout(resolve, 0); });
      if (token !== this.regionToken) return [];
    }

    return selected;
  }

  async beginBackgroundVisible(east, north, selected = null) {
    const token = this.regionToken;
    const generation = ++this.backgroundGeneration;
    this.progressivePreloading = true;

    try {
      const list = selected || this.selectTiles(east, north);
      this.renderSampleKeys = new Set(list.map(d => d.key));
      const missing = list.filter(d => !this.loader.tileCache.has(d.key));

      // Network/file IO and pack decoding are async; wait for all DEM samples
      // before building meshes so cross-LOD edge sampling has its canonical
      // neighbor data available. This does NOT block Drive Mode.
      await Promise.allSettled(missing.map(d =>
        this.loader.loadTile(d.block, d.lod, d.x, d.y)
      ));

      if (token !== this.regionToken || generation !== this.backgroundGeneration) return;

      const ordered = list
        .filter(d => !this.active.has(d.key))
        .sort((a, b) => this.descriptorDistance(a, east, north) - this.descriptorDistance(b, east, north));
      for (const d of ordered) this.enqueueBuild(d, east, north);
    } finally {
      if (token === this.regionToken && generation === this.backgroundGeneration) {
        this.progressivePreloading = false;
      }
    }
  }

  async prefetchLanding(lat, lon, radius = this.landingRadius) {
    // Browse-mode prefetch: warm bounded loader caches without changing the
    // current driving anchor/manifest. Safe to call repeatedly.
    const index = await this.loader.loadIndex();
    const meta = this.loader.blockForGeo(lat, lon);
    if (!meta) return false;
    const block = await this.loader.loadBlock(meta.id);
    if (!block) return false;

    const offsets = [
      [0, 0],
      [-radius, 0], [radius, 0], [0, -radius], [0, radius],
      [-radius * 0.7, -radius * 0.7], [radius * 0.7, -radius * 0.7],
      [-radius * 0.7, radius * 0.7], [radius * 0.7, radius * 0.7]
    ];
    await Promise.allSettled(offsets.map(([east, north]) => {
      const g = destinationPoint(lat, lon, east, north);
      return this.loader.ensureGeoLoaded(g.lat, g.lon);
    }));
    return !!index;
  }

  enqueueBuild(desc, east = 0, north = 0) {
    if (!desc || this.active.has(desc.key) || this.buildQueueKeys.has(desc.key) || this.meshPending.has(desc.key)) return;
    desc._buildPriority = this.descriptorDistance(desc, east, north);
    this.buildQueue.push(desc);
    this.buildQueueKeys.add(desc.key);
    this.buildQueue.sort((a, b) => a._buildPriority - b._buildPriority);
  }

  requestRenderTile(desc, token, east, north) {
    if (this.active.has(desc.key) || this.buildQueueKeys.has(desc.key) || this.tileLoadPending.has(desc.key)) return;
    if (this.loader.tileCache.has(desc.key)) {
      this.enqueueBuild(desc, east, north);
      return;
    }

    this.tileLoadPending.add(desc.key);
    this.loader.loadTile(desc.block, desc.lod, desc.x, desc.y)
      .then(tile => {
        if (tile && token === this.regionToken) this.enqueueBuild(desc, east, north);
      })
      .catch(err => console.warn('[Progressive terrain tile]', desc.key, err))
      .finally(() => this.tileLoadPending.delete(desc.key));
  }

  buildRenderTileFromLoaded(desc, token) {
    if (token !== this.regionToken || this.active.has(desc.key)) return null;
    const tile = this.loader.tileCache.get(desc.key);
    if (!tile) return null;

    const lodIndex = desc.lod;
    const renderSegments =
      this.config.renderSegments[Math.min(lodIndex, this.config.renderSegments.length - 1)] || 48;
    const skirtDepth =
      this.config.skirtDepth[Math.min(lodIndex, this.config.skirtDepth.length - 1)] || 5;

    const terrainTile = new TerrainTile({
      tile,
      loader: this.loader,
      material: this.material,
      terrain: this,
      renderSegments,
      skirtDepth,
      detailConfig: this.config.proceduralDetail,
      isFinest: desc.lod === desc.block.maxLod,
      edgeMorph: desc.edgeMorph
    });
    terrainTile.lastWanted = performance.now();
    this.active.set(desc.key, terrainTile);
    this.group.add(terrainTile.mesh);
    return terrainTile;
  }

  processBuildQueue(token) {
    if (!this.buildQueue.length) return;
    const start = performance.now();
    let built = 0;

    while (this.buildQueue.length && built < this.maxTileBuildsPerFrame) {
      if (performance.now() - start >= this.tileBuildBudgetMs && built > 0) break;
      const desc = this.buildQueue.shift();
      this.buildQueueKeys.delete(desc.key);
      if (token !== this.regionToken) return;
      if (this.active.has(desc.key)) continue;

      if (!this.loader.tileCache.has(desc.key)) {
        this.requestRenderTile(desc, token, 0, 0);
        continue;
      }

      this.buildRenderTileFromLoaded(desc, token);
      built++;
    }
  }

  async waitForBackgroundComplete({ timeoutMs = 30000 } = {}) {
    const token = this.regionToken;
    const started = performance.now();

    while (token === this.regionToken && (
      this.progressivePreloading ||
      this.tileLoadPending.size ||
      this.buildQueue.length
    )) {
      this.processBuildQueue(token);
      if (performance.now() - started > timeoutMs) {
        throw new Error('Timed out waiting for progressive terrain background work');
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  sampleRenderElevationGeo(lat, lon, fallbackTile = null) {
    const meta = this.loader.blockForGeo(lat, lon);
    const block = meta ? this.loader.blocks.get(meta.id) : null;

    if (block) {
      const levels = [...block.levels].sort((a, b) => b.lod - a.lod);
      for (const level of levels) {
        const idx = this.loader.tileIndicesForGeo(block, level.lod, lat, lon);
        if (!idx) continue;
        const key = this.loader.tileKey(block.id, level.lod, idx.x, idx.y);
        if (!this.renderSampleKeys.has(key)) continue;
        const tile = this.loader.tileCache.get(key);
        if (tile) return this.loader.sampleTileGeo(tile, lat, lon);
      }
    }

    if (fallbackTile) return this.loader.sampleTileGeo(fallbackTile, lat, lon);
    return this.loader.sampleHeightGeoSync(lat, lon);
  }

  clearMeshes() {
    for (const t of this.active.values()) {
      this.group.remove(t.mesh);
      t.dispose();
    }
    this.active.clear();
    this.meshPending.clear();
    this.renderSampleKeys.clear();
    this.buildQueue.length = 0;
    this.buildQueueKeys.clear();
    this.tileLoadPending.clear();
    this.progressivePreloading = false;
    this.backgroundGeneration++;
  }

  geoAt(east, north) {
    return destinationPoint(this.anchor.lat, this.anchor.lon, east, north);
  }

  localFromGeo(lat, lon) {
    return geodeticOffsetMeters(this.anchor.lat, this.anchor.lon, lat, lon);
  }

  elevationToLocalY(elevation, east, north) {
    return (elevation - this.datumHeight) + curvatureSag(east, north);
  }

  async preloadGround(east, north) {
    const geo = this.geoAt(east, north);
    const meta = this.loader.blockForGeo(geo.lat, geo.lon);
    if (!meta) return;
    const block = await this.loader.loadBlock(meta.id);
    const lod = block.maxLod;
    const samples = [
      [0, 0],
      [-6, -6], [0, -6], [6, -6],
      [-6, 0], [6, 0],
      [-6, 6], [0, 6], [6, 6]
    ];
    await Promise.all(samples.map(([de, dn]) => {
      const g = this.geoAt(east + de, north + dn);
      return this.loader.ensureGeoLoaded(g.lat, g.lon, lod);
    }));
  }

  nearbyBlockIds(east, north, radius = this.config.farRadius * 1.15) {
    const ids = new Set();
    const r = radius;
    const pts = [
      [0, 0], [r, 0], [-r, 0], [0, r], [0, -r],
      [r * 0.72, r * 0.72], [r * 0.72, -r * 0.72],
      [-r * 0.72, r * 0.72], [-r * 0.72, -r * 0.72]
    ];
    for (const [de, dn] of pts) {
      const g = this.geoAt(east + de, north + dn);
      const meta = this.loader.blockForGeo(g.lat, g.lon);
      if (meta) ids.add(meta.id);
    }
    return [...ids];
  }

  queueNearbyBlocks(east, north) {
    for (const id of this.nearbyBlockIds(east, north)) {
      if (this.loader.blocks.has(id) || this.blockPending.has(id)) continue;
      this.blockPending.add(id);
      this.loader.loadBlock(id)
        .catch(err => console.warn('[Global DEM block]', id, err))
        .finally(() => this.blockPending.delete(id));
    }
  }

  tileMetrics(block, lod, x, y) {
    // Ask the loader for geographic points so both equirectangular SLDEM and
    // polar-stereographic LOLA tiles use the same local-distance LOD metric.
    const centerGeo = this.loader.tileGeoPoint(block, lod, x, y, 0.5, 0.5);
    const aGeo = this.loader.tileGeoPoint(block, lod, x, y, 0.0, 0.5);
    const bGeo = this.loader.tileGeoPoint(block, lod, x, y, 1.0, 0.5);
    const cGeo = this.loader.tileGeoPoint(block, lod, x, y, 0.5, 0.0);
    const dGeo = this.loader.tileGeoPoint(block, lod, x, y, 0.5, 1.0);
    const c = this.localFromGeo(centerGeo.lat, centerGeo.lon);
    const a = this.localFromGeo(aGeo.lat, aGeo.lon);
    const b = this.localFromGeo(bGeo.lat, bGeo.lon);
    const c0 = this.localFromGeo(cGeo.lat, cGeo.lon);
    const d = this.localFromGeo(dGeo.lat, dGeo.lon);
    const width = Math.hypot(b.east - a.east, b.north - a.north);
    const height = Math.hypot(d.east - c0.east, d.north - c0.north);
    return { center: c, radius: 0.5 * Math.hypot(width, height), size: Math.max(width, height) };
  }

  selectTiles(east, north, { farRadius = this.config.farRadius, blockRadius = farRadius * 1.15 } = {}) {
    if (!this.manifest) return [];
    const selected = [];
    for (const blockId of this.nearbyBlockIds(east, north, blockRadius)) {
      const block = this.loader.blocks.get(blockId);
      if (!block) continue;

      const visit = (lod, x, y) => {
        const level = this.loader.level(block, lod);
        if (!level || x < 0 || y < 0 || x >= level.countX || y >= level.countY) return;

        const m = this.tileMetrics(block, lod, x, y);
        const centerDist = Math.hypot(m.center.east - east, m.center.north - north);
        const dist = Math.max(0, centerDist - m.radius);
        if (dist > farRadius + m.radius * 0.25) return;

        const canSplit = lod < block.maxLod;
        const shouldSplit = canSplit && dist < m.size * this.config.splitFactor;
        if (shouldSplit) {
          const child = lod + 1;
          const cx = x * 2, cy = y * 2;
          visit(child, cx, cy);
          visit(child, cx + 1, cy);
          visit(child, cx, cy + 1);
          visit(child, cx + 1, cy + 1);
          return;
        }

        selected.push({
          block,
          lod, x, y,
          key: this.loader.tileKey(block.id, lod, x, y)
        });
      };

      visit(0, 0, 0);
    }
    this.annotateLodEdgeMorph(selected);
    return selected;
  }

  annotateLodEdgeMorph(selected) {
    const byBlock = new Map();
    for (const d of selected) {
      d.edgeMorph = {};
      if (!byBlock.has(d.block.id)) byBlock.set(d.block.id, []);
      byBlock.get(d.block.id).push(d);
    }

    for (const list of byBlock.values()) {
      const maxLod = Math.max(...list.map(d => d.lod));
      const ext = d => {
        const s = 1 << (maxLod - d.lod);
        return { x0: d.x * s, x1: (d.x + 1) * s, y0: d.y * s, y1: (d.y + 1) * s };
      };

      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (Math.abs(a.lod - b.lod) !== 1) continue;
          const fine = a.lod > b.lod ? a : b;
          const coarse = a.lod > b.lod ? b : a;
          const F = ext(fine), C = ext(coarse);
          const overlapY = Math.max(F.y0, C.y0) < Math.min(F.y1, C.y1);
          const overlapX = Math.max(F.x0, C.x0) < Math.min(F.x1, C.x1);

          if (F.x1 === C.x0 && overlapY) fine.edgeMorph.right = { coarse, maxLod, coarseEdge: 'left' };
          else if (C.x1 === F.x0 && overlapY) fine.edgeMorph.left = { coarse, maxLod, coarseEdge: 'right' };
          else if (F.y1 === C.y0 && overlapX) fine.edgeMorph.bottom = { coarse, maxLod, coarseEdge: 'top' };
          else if (C.y1 === F.y0 && overlapX) fine.edgeMorph.top = { coarse, maxLod, coarseEdge: 'bottom' };
        }
      }
    }
  }

  async ensureRenderTile(desc, token) {
    const key = desc.key;
    const existing = this.active.get(key);
    if (existing) {
      existing.lastWanted = performance.now();
      return existing;
    }
    if (this.meshPending.has(key)) return null;
    this.meshPending.add(key);

    try {
      const tile = await this.loader.loadTile(desc.block, desc.lod, desc.x, desc.y);
      if (!tile || token !== this.regionToken || this.active.has(key)) return null;

      return this.buildRenderTileFromLoaded(desc, token);
    } catch (err) {
      console.warn('[Global terrain tile]', key, err);
      return null;
    } finally {
      this.meshPending.delete(key);
    }
  }

  update(east, north) {
    if (!this.manifest) return;

    if (this.origin.version !== this.lastOriginVersion) {
      this.lastOriginVersion = this.origin.version;
      this.syncOriginTransform();
    }

    this.queueNearbyBlocks(east, north);
    const token = this.regionToken;
    const selected = this.selectTiles(east, north);
    this.renderSampleKeys = new Set(selected.map(d => d.key));
    const wanted = new Set(selected.map(d => d.key));
    const now = performance.now();

    for (const d of selected) {
      const t = this.active.get(d.key);
      if (t) t.lastWanted = now;
      else if (!this.progressivePreloading) this.requestRenderTile(d, token, east, north);
    }

    this.processBuildQueue(token);

    for (const [key, t] of this.active) {
      if (!wanted.has(key) && now - t.lastWanted > this.config.tileRetireMs) {
        this.group.remove(t.mesh);
        t.dispose();
        this.active.delete(key);
      }
    }
  }

  sampleRenderedLocalHeight(east, north) {
    if (!this.manifest) return null;

    const geo = this.geoAt(east, north);
    // Only sample tiles that belong to the CURRENT wanted render set.
    // Retiring parent/old LOD meshes may remain active for tileRetireMs,
    // but the rover must never follow those stale surfaces.
    let best = null;
    for (const terrainTile of this.active.values()) {
      if (!this.renderSampleKeys.has(terrainTile.tile.key)) continue;

      if (!this.loader.tileContainsGeo(terrainTile.tile, geo.lat, geo.lon)) continue;
      if (!best || terrainTile.tile.lod > best.tile.lod) best = terrainTile;
    }

    if (best) return best.surfaceY(geo.lat, geo.lon, east, north);

    // During the short async handoff before the new mesh is attached, use the
    // same canonical selected DEM source used to construct terrain vertices.
    const meta = this.loader.blockForGeo(geo.lat, geo.lon);
    const block = meta ? this.loader.blocks.get(meta.id) : null;
    if (!block) return null;

    const levels = [...block.levels].sort((a, b) => b.lod - a.lod);
    for (const level of levels) {
      const idx = this.loader.tileIndicesForGeo(block, level.lod, geo.lat, geo.lon);
      if (!idx) continue;

      const key = this.loader.tileKey(block.id, level.lod, idx.x, idx.y);
      if (!this.renderSampleKeys.has(key)) continue;

      const tile = this.loader.tileCache.get(key);
      if (!tile) continue;

      const elevation = this.loader.sampleTileGeo(tile, geo.lat, geo.lon);
      const detail = level.lod === block.maxLod
        ? subGridDetail(east, north, this.config.proceduralDetail)
        : 0;
      return this.elevationToLocalY(elevation, east, north) + detail;
    }

    return null;
  }

  sampleElevation(east, north) {
    const geo = this.geoAt(east, north);
    return this.loader.sampleHeightGeoSync(geo.lat, geo.lon);
  }

  sampleLocalHeight(east, north) {
    const elevation = this.sampleElevation(east, north);
    if (elevation == null || !this.manifest) return null;
    return this.elevationToLocalY(elevation, east, north)
      + subGridDetail(east, north, this.config.proceduralDetail);
  }

  async ensureSample(east, north) {
    const geo = this.geoAt(east, north);
    const meta = this.loader.blockForGeo(geo.lat, geo.lon);
    if (!meta) return null;
    const block = await this.loader.loadBlock(meta.id);
    await this.loader.ensureGeoLoaded(geo.lat, geo.lon, block.maxLod);
    return this.sampleLocalHeight(east, north);
  }

  stats() {
    const s = this.loader.stats();
    return {
      activeMeshes: this.active.size,
      cachedHeightTiles: s.tiles,
      cachedPacks: s.packs,
      loadedBlocks: s.blocks,
      maxLod: this.maxLod
    };
  }
}
