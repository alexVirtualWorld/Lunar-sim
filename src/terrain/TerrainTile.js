import * as THREE from 'three';
import { curvatureSag, geodeticOffsetMeters } from '../geo/LunarCoordinates.js';
import { subGridDetail } from './Noise.js';

export class TerrainTile {
  constructor({ tile, loader, material, terrain, renderSegments, skirtDepth, detailConfig, isFinest, edgeMorph = {} }) {
    this.tile = tile;
    this.loader = loader;
    this.material = material;
    this.terrain = terrain;
    this.renderSegments = renderSegments;
    this.skirtDepth = skirtDepth;
    this.detailConfig = detailConfig;
    this.isFinest = isFinest;
    this.edgeMorph = edgeMorph || {};
    this.mesh = this.buildMesh();
    this.lastWanted = performance.now();
  }

  sampleElevationGeo(lat, lon) {
    return this.terrain.sampleRenderElevationGeo(lat, lon, this.tile);
  }

  surfaceY(lat, lon, east, north) {
    const realHeight = this.sampleElevationGeo(lat, lon);
    const detail = this.isFinest ? subGridDetail(east, north, this.detailConfig) : 0;
    return (realHeight - this.terrain.datumHeight) + curvatureSag(east, north) + detail;
  }

  buildMesh() {
    const seg = this.renderSegments;
    const block = this.loader.blocks.get(this.tile.blockId);
    if (!block) throw new Error(`Missing block for terrain tile ${this.tile.key}`);
    const polar = this.loader.isPolarBlock(block);
    const clipLimit = polar ? (block.projection.hemisphere === 'north' ? 60 : -60) : null;
    const keepGreater = polar && block.projection.hemisphere === 'north';

    const positions = [];
    const geo = [];
    const lunar = [];
    const uvs = [];
    const indices = [];
    const edgeTop = [], edgeBottom = [], edgeLeft = [], edgeRight = [];
    const grid = [];

    const addVertex = (u, v, gpOverride = null) => {
      let gp = gpOverride || this.loader.tileGeoPoint(block, this.tile.lod, this.tile.x, this.tile.y, u, v);

      // Any polar vertex numerically on the +/-60 seam must use the same
      // canonical longitude lattice as the matching SLDEM render edge. This
      // also catches native polar grid vertices that happen to land on the
      // seam, not only vertices created by triangle clipping.
      if (polar && Math.abs(gp.lat - clipLimit) < 5e-5) {
        const seamStepDeg = 360 / (8 * (1 << this.tile.lod) * this.renderSegments);
        let seamLon = Math.round(this.loader.normalizeLon(gp.lon) / seamStepDeg) * seamStepDeg;
        seamLon = this.loader.normalizeLon(seamLon);
        gp = { lat: clipLimit, lon: seamLon };
      }

      const lat = gp.lat, lon = gp.lon;
      const en = geodeticOffsetMeters(this.terrain.anchor.lat, this.terrain.anchor.lon, lat, lon);
      const y = this.surfaceY(lat, lon, en.east, en.north);
      const idx = positions.length / 3;
      positions.push(en.east, y, -en.north);
      geo.push(lat, lon);
      lunar.push(en.east, en.north);
      uvs.push(u, v);
      return { idx, u, v, lat, lon };
    };

    for (let j = 0; j <= seg; j++) {
      const v = j / seg;
      const rowVerts = [];
      for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        const vert = addVertex(u, v);
        rowVerts.push(vert);
        if (j === 0) edgeBottom.push(vert.idx);
        if (j === seg) edgeTop.push(vert.idx);
        if (i === 0) edgeLeft.push(vert.idx);
        if (i === seg) edgeRight.push(vert.idx);
      }
      grid.push(rowVerts);
    }

    this.applyLodEdgeMorph({ block, seg, grid, positions });

    const inside = v => {
      if (!polar) return true;
      return keepGreater ? v.lat >= clipLimit - 1e-10 : v.lat <= clipLimit + 1e-10;
    };

    let polarHasInside = false;
    let polarHasOutside = false;
    if (polar) {
      for (const rowVerts of grid) {
        for (const v of rowVerts) {
          if (inside(v)) polarHasInside = true;
          else polarHasOutside = true;
        }
      }
    }

    const intersect = (a, b) => {
      let lo = 0, hi = 1;
      const aInside = inside(a);
      let gp = null, u = a.u, v = a.v;
      for (let k = 0; k < 20; k++) {
        const t = (lo + hi) * 0.5;
        u = THREE.MathUtils.lerp(a.u, b.u, t);
        v = THREE.MathUtils.lerp(a.v, b.v, t);
        gp = this.loader.tileGeoPoint(block, this.tile.lod, this.tile.x, this.tile.y, u, v);
        const midInside = keepGreater ? gp.lat >= clipLimit : gp.lat <= clipLimit;
        if (midInside === aInside) lo = t; else hi = t;
      }
      const t = (lo + hi) * 0.5;
      u = THREE.MathUtils.lerp(a.u, b.u, t);
      v = THREE.MathUtils.lerp(a.v, b.v, t);
      gp = this.loader.tileGeoPoint(block, this.tile.lod, this.tile.x, this.tile.y, u, v);

      // Canonical +/-60 seam longitude lattice. At a given LOD the SLDEM
      // boundary consists of 8 * 2^LOD tiles around the Moon; each rendered
      // tile edge has renderSegments subdivisions. Snapping the polar clip
      // intersection to that exact lattice removes T-junctions between the
      // equirectangular and polar meshes.
      const seamStepDeg = 360 / (8 * (1 << this.tile.lod) * this.renderSegments);
      let seamLon = Math.round(this.loader.normalizeLon(gp.lon) / seamStepDeg) * seamStepDeg;
      seamLon = this.loader.normalizeLon(seamLon);
      return addVertex(u, v, { lat: clipLimit, lon: seamLon });
    };

    const clipPolygon = poly => {
      if (!polar) return poly;
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ai = inside(a), bi = inside(b);
        if (ai && bi) out.push(b);
        else if (ai && !bi) out.push(intersect(a, b));
        else if (!ai && bi) { out.push(intersect(a, b)); out.push(b); }
      }
      return out;
    };

    const emitTriangle = tri => {
      const poly = clipPolygon(tri);
      if (poly.length < 3) return;
      for (let k = 1; k < poly.length - 1; k++) indices.push(poly[0].idx, poly[k].idx, poly[k + 1].idx);
    };

    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = grid[j][i];
        const b = grid[j][i + 1];
        const c = grid[j + 1][i];
        const d = grid[j + 1][i + 1];
        emitTriangle([a, b, c]);
        emitTriangle([b, d, c]);
      }
    }

    const addSkirt = edge => {
      const skirt = [];
      for (const src of edge) {
        const idx = positions.length / 3;
        positions.push(positions[src * 3], positions[src * 3 + 1] - this.skirtDepth, positions[src * 3 + 2]);
        geo.push(geo[src * 2], geo[src * 2 + 1]);
        lunar.push(lunar[src * 2], lunar[src * 2 + 1]);
        uvs.push(uvs[src * 2], uvs[src * 2 + 1]);
        skirt.push(idx);
      }
      for (let i = 0; i < edge.length - 1; i++) {
        const a = edge[i], b1 = edge[i + 1], c = skirt[i], d = skirt[i + 1];
        indices.push(a, c, b1, b1, c, d);
      }
    };

    if (!polar || (polarHasInside && !polarHasOutside)) {
      const isNorthProviderEdge = !polar && Math.abs((block.bounds?.north ?? 0) - 60) < 1e-9;
      const isSouthProviderEdge = !polar && Math.abs((block.bounds?.south ?? 0) + 60) < 1e-9;

      if (!isNorthProviderEdge) addSkirt(edgeTop);
      if (!isSouthProviderEdge) addSkirt([...edgeBottom].reverse());

      // Side skirts normally meet the top/bottom skirt at the corners. At a
      // provider boundary that outer skirt is deliberately absent, so omit
      // the corresponding side-skirt endpoint too; otherwise every tile
      // leaves a short vertical black tooth exactly on +/-60.
      let leftEdge = [...edgeLeft].reverse();
      let rightEdge = [...edgeRight];
      if (isNorthProviderEdge) {
        leftEdge = leftEdge.slice(1);
        rightEdge = rightEdge.slice(0, -1);
      }
      if (isSouthProviderEdge) {
        leftEdge = leftEdge.slice(0, -1);
        rightEdge = rightEdge.slice(1);
      }
      if (leftEdge.length >= 2) addSkirt(leftEdge);
      if (rightEdge.length >= 2) addSkirt(rightEdge);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('geoCoord', new THREE.Float32BufferAttribute(geo, 2));
    g.setAttribute('lunarCoord', new THREE.Float32BufferAttribute(lunar, 2));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();

    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    mesh.userData.terrainTileKey = this.tile.key;
    return mesh;
  }

  applyLodEdgeMorph({ block, seg, grid, positions }) {
    const specs = this.edgeMorph || {};
    const renderSegmentsFor = lod =>
      this.terrain.config.renderSegments[Math.min(lod, this.terrain.config.renderSegments.length - 1)] || 48;

    const coarsePosition = (spec, edge, t) => {
      const coarse = spec.coarse;
      const coarseSeg = renderSegmentsFor(coarse.lod);
      const f = Math.max(0, Math.min(1, t)) * coarseSeg;
      const i0 = Math.floor(f);
      const i1 = Math.min(coarseSeg, i0 + 1);
      const a = f - i0;

      const pointAt = i => {
        const q = i / coarseSeg;
        let u = q, v = q;
        if (edge === 'left') { u = 0; v = q; }
        else if (edge === 'right') { u = 1; v = q; }
        else if (edge === 'top') { u = q; v = 1; }
        else if (edge === 'bottom') { u = q; v = 0; }

        const gp = this.loader.tileGeoPoint(coarse.block, coarse.lod, coarse.x, coarse.y, u, v);
        const en = geodeticOffsetMeters(this.terrain.anchor.lat, this.terrain.anchor.lon, gp.lat, gp.lon);
        const elevation = this.terrain.sampleRenderElevationGeo(gp.lat, gp.lon, null);
        const y = (elevation - this.terrain.datumHeight) + curvatureSag(en.east, en.north);
        return [en.east, y, -en.north];
      };

      const p0 = pointAt(i0), p1 = pointAt(i1);
      return [
        THREE.MathUtils.lerp(p0[0], p1[0], a),
        THREE.MathUtils.lerp(p0[1], p1[1], a),
        THREE.MathUtils.lerp(p0[2], p1[2], a)
      ];
    };

    const morphEdge = (fineEdge, coarseEdge, spec) => {
      const coarse = spec.coarse;
      const maxLod = spec.maxLod;
      const sf = 1 << (maxLod - this.tile.lod);
      const sc = 1 << (maxLod - coarse.lod);
      const fx0 = this.tile.x * sf, fx1 = (this.tile.x + 1) * sf;
      const fy0 = this.tile.y * sf, fy1 = (this.tile.y + 1) * sf;
      const cx0 = coarse.x * sc, cx1 = (coarse.x + 1) * sc;
      const cy0 = coarse.y * sc, cy1 = (coarse.y + 1) * sc;

      for (let k = 0; k <= seg; k++) {
        let vert, t;
        if (fineEdge === 'left') {
          vert = grid[k][0];
          const absY = fy1 - (k / seg) * (fy1 - fy0);
          t = (cy1 - absY) / (cy1 - cy0);
        } else if (fineEdge === 'right') {
          vert = grid[k][seg];
          const absY = fy1 - (k / seg) * (fy1 - fy0);
          t = (cy1 - absY) / (cy1 - cy0);
        } else if (fineEdge === 'top') {
          vert = grid[seg][k];
          const absX = fx0 + (k / seg) * (fx1 - fx0);
          t = (absX - cx0) / (cx1 - cx0);
        } else {
          vert = grid[0][k];
          const absX = fx0 + (k / seg) * (fx1 - fx0);
          t = (absX - cx0) / (cx1 - cx0);
        }

        const p = coarsePosition(spec, coarseEdge, t);
        positions[vert.idx * 3] = p[0];
        positions[vert.idx * 3 + 1] = p[1];
        positions[vert.idx * 3 + 2] = p[2];
      }
    };

    if (specs.left) morphEdge('left', specs.left.coarseEdge, specs.left);
    if (specs.right) morphEdge('right', specs.right.coarseEdge, specs.right);
    if (specs.top) morphEdge('top', specs.top.coarseEdge, specs.top);
    if (specs.bottom) morphEdge('bottom', specs.bottom.coarseEdge, specs.bottom);
  }

  applyLodEdgeMorphToBuffer(pos) {
    const specs = this.edgeMorph || {};
    const seg = this.renderSegments;
    const renderSegmentsFor = lod =>
      this.terrain.config.renderSegments[Math.min(lod, this.terrain.config.renderSegments.length - 1)] || 48;

    const coarsePosition = (spec, edge, t) => {
      const coarse = spec.coarse;
      const coarseSeg = renderSegmentsFor(coarse.lod);
      const f = Math.max(0, Math.min(1, t)) * coarseSeg;
      const i0 = Math.floor(f);
      const i1 = Math.min(coarseSeg, i0 + 1);
      const a = f - i0;

      const pointAt = i => {
        const q = i / coarseSeg;
        let u = q, v = q;
        if (edge === 'left') { u = 0; v = q; }
        else if (edge === 'right') { u = 1; v = q; }
        else if (edge === 'top') { u = q; v = 1; }
        else if (edge === 'bottom') { u = q; v = 0; }
        const gp = this.loader.tileGeoPoint(coarse.block, coarse.lod, coarse.x, coarse.y, u, v);
        const en = geodeticOffsetMeters(this.terrain.anchor.lat, this.terrain.anchor.lon, gp.lat, gp.lon);
        const elevation = this.terrain.sampleRenderElevationGeo(gp.lat, gp.lon, null);
        const y = (elevation - this.terrain.datumHeight) + curvatureSag(en.east, en.north);
        return [en.east, y, -en.north];
      };

      const p0 = pointAt(i0), p1 = pointAt(i1);
      return [
        THREE.MathUtils.lerp(p0[0], p1[0], a),
        THREE.MathUtils.lerp(p0[1], p1[1], a),
        THREE.MathUtils.lerp(p0[2], p1[2], a)
      ];
    };

    const morph = (edge, spec) => {
      const coarse = spec.coarse;
      const maxLod = spec.maxLod;
      const sf = 1 << (maxLod - this.tile.lod);
      const sc = 1 << (maxLod - coarse.lod);
      const fx0 = this.tile.x * sf, fx1 = (this.tile.x + 1) * sf;
      const fy0 = this.tile.y * sf, fy1 = (this.tile.y + 1) * sf;
      const cx0 = coarse.x * sc, cx1 = (coarse.x + 1) * sc;
      const cy0 = coarse.y * sc, cy1 = (coarse.y + 1) * sc;

      for (let k = 0; k <= seg; k++) {
        let idx, t;
        if (edge === 'left') {
          idx = k * (seg + 1);
          const absY = fy1 - (k / seg) * (fy1 - fy0);
          t = (cy1 - absY) / (cy1 - cy0);
        } else if (edge === 'right') {
          idx = k * (seg + 1) + seg;
          const absY = fy1 - (k / seg) * (fy1 - fy0);
          t = (cy1 - absY) / (cy1 - cy0);
        } else if (edge === 'top') {
          idx = seg * (seg + 1) + k;
          const absX = fx0 + (k / seg) * (fx1 - fx0);
          t = (absX - cx0) / (cx1 - cx0);
        } else {
          idx = k;
          const absX = fx0 + (k / seg) * (fx1 - fx0);
          t = (absX - cx0) / (cx1 - cx0);
        }
        const p = coarsePosition(spec, spec.coarseEdge, t);
        pos.setXYZ(idx, p[0], p[1], p[2]);
      }
    };

    if (specs.left) morph('left', specs.left);
    if (specs.right) morph('right', specs.right);
    if (specs.top) morph('top', specs.top);
    if (specs.bottom) morph('bottom', specs.bottom);
  }

  reposition() {
    // Kept for compatibility with older callers. Floating-origin movement is
    // now handled once by LunarTerrainManager.group instead of rebuilding
    // every terrain vertex, normal, and bounding sphere.
    this.terrain.syncOriginTransform?.();
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}