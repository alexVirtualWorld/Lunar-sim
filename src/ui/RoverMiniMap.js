import { formatLatLon } from '../geo/LunarCoordinates.js';
import { t } from '../i18n.js';

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const MAP_SPANS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function cardinal(degrees) {
  return CARDINALS[Math.round(normalizeDegrees(degrees) / 45) % 8];
}

function niceDistance(meters) {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

export class RoverMiniMap {
  constructor({ terrain, rover, multiplayer, exploration = null, root }) {
    this.terrain = terrain;
    this.rover = rover;
    this.multiplayer = multiplayer;
    this.exploration = exploration;
    this.root = root;
    this.canvas = root.querySelector('#minimap-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.coords = root.querySelector('#minimap-coords');
    this.telemetry = root.querySelector('#minimap-telemetry');
    this.scaleLabel = root.querySelector('#minimap-scale-label');
    this.spanIndex = 2;
    this.trail = [];
    this.regionToken = -1;
    this.lastTrailAt = 0;
    this.lastTerrainAt = 0;
    this.terrainRaster = document.createElement('canvas');
    this.terrainRaster.width = 64;
    this.terrainRaster.height = 64;
    this.terrainCtx = this.terrainRaster.getContext('2d');

    root.querySelector('#minimap-zoom-in').addEventListener('click', () => {
      this.spanIndex = Math.max(0, this.spanIndex - 1);
      this.lastTerrainAt = 0;
    });
    root.querySelector('#minimap-zoom-out').addEventListener('click', () => {
      this.spanIndex = Math.min(MAP_SPANS.length - 1, this.spanIndex + 1);
      this.lastTerrainAt = 0;
    });
  }

  get span() { return MAP_SPANS[this.spanIndex]; }

  reset() {
    this.trail.length = 0;
    this.lastTrailAt = 0;
    this.lastTerrainAt = 0;
  }

  recordTrail(now) {
    const previous = this.trail[this.trail.length - 1];
    const moved = previous ? Math.hypot(this.rover.east - previous.east, this.rover.north - previous.north) : Infinity;
    if (moved >= 4 || now - this.lastTrailAt >= 1000) {
      this.trail.push({ east: this.rover.east, north: this.rover.north });
      if (this.trail.length > 1800) this.trail.splice(0, this.trail.length - 1800);
      this.lastTrailAt = now;
    }
  }

  updateTerrain(now) {
    if (now - this.lastTerrainAt < 900) return;
    this.lastTerrainAt = now;
    const size = this.terrainRaster.width;
    const span = this.span;
    const half = span / 2;
    const heights = new Float32Array(size * size);
    let min = Infinity, max = -Infinity;

    for (let y = 0; y < size; y++) {
      const north = this.rover.north + half - (y + 0.5) / size * span;
      for (let x = 0; x < size; x++) {
        const east = this.rover.east - half + (x + 0.5) / size * span;
        const h = this.terrain.sampleLocalHeight(east, north);
        const i = y * size + x;
        heights[i] = h == null ? NaN : h;
        if (Number.isFinite(h)) { min = Math.min(min, h); max = Math.max(max, h); }
      }
    }

    const image = this.terrainCtx.createImageData(size, size);
    const range = Math.max(3, max - min);
    for (let i = 0; i < heights.length; i++) {
      const h = heights[i];
      const p = i * 4;
      if (!Number.isFinite(h)) {
        image.data[p] = 8; image.data[p + 1] = 13; image.data[p + 2] = 18; image.data[p + 3] = 230;
        continue;
      }
      const shade = Math.round(30 + 95 * (h - min) / range);
      image.data[p] = shade;
      image.data[p + 1] = Math.round(shade * 0.96);
      image.data[p + 2] = Math.round(shade * 0.88);
      image.data[p + 3] = 245;
    }
    this.terrainCtx.putImageData(image, 0, 0);
  }

  mapPoint(east, north, width, height) {
    const pixelsPerMeter = Math.min(width, height) / this.span;
    return {
      x: width / 2 + (east - this.rover.east) * pixelsPerMeter,
      y: height / 2 - (north - this.rover.north) * pixelsPerMeter
    };
  }

  drawGrid(ctx, width, height) {
    const step = this.span <= 1000 ? 100 : this.span <= 5000 ? 500 : 2000;
    const pixelsPerMeter = width / this.span;
    const x0 = width / 2 - (this.rover.east % step) * pixelsPerMeter;
    const y0 = height / 2 + (this.rover.north % step) * pixelsPerMeter;
    ctx.strokeStyle = 'rgba(177,216,223,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= width; x += step * pixelsPerMeter) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let x = x0 - step * pixelsPerMeter; x >= 0; x -= step * pixelsPerMeter) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = y0; y <= height; y += step * pixelsPerMeter) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    for (let y = y0 - step * pixelsPerMeter; y >= 0; y -= step * pixelsPerMeter) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
  }

  drawTrail(ctx, width, height) {
    const persistent = this.exploration?.settings?.showRoute
      ? this.exploration.routeLocalPoints()
      : [];
    const points = persistent.length ? persistent : (!this.exploration ? this.trail : []);
    if (points.length < 2) return;
    ctx.strokeStyle = 'rgba(125,255,218,.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let drawing = false;
    for (const point of points) {
      const p = this.mapPoint(point.east, point.north, width, height);
      if (p.x < -20 || p.y < -20 || p.x > width + 20 || p.y > height + 20) { drawing = false; continue; }
      if (drawing) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); drawing = true; }
    }
    ctx.stroke();
  }

  drawPOIs(ctx, width, height) {
    if (!this.exploration) return;
    const pois = this.exploration.poiLocalPoints();
    for (const poi of pois) {
      const p = this.mapPoint(poi.east, poi.north, width, height);
      if (p.x < -8 || p.y < -8 || p.x > width + 8 || p.y > height + 8) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, poi.discovered ? 3.4 : 4.2, 0, Math.PI * 2);
      if (poi.discovered) {
        ctx.fillStyle = 'rgba(125,255,218,.9)';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,214,134,.95)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  drawObelisk(ctx, width, height) {
    const obelisk = this.exploration?.obeliskLocalPoint?.();
    if (!obelisk) return;
    const p = this.mapPoint(obelisk.east, obelisk.north, width, height);
    if (p.x < -10 || p.y < -10 || p.x > width + 10 || p.y > height + 10) return;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(226,236,244,.98)';
    ctx.strokeStyle = 'rgba(7,18,28,.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.5, 1);
    ctx.lineTo(2.4, 6);
    ctx.lineTo(-2.4, 6);
    ctx.lineTo(-4.5, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(125,255,218,.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPeers(ctx, width, height) {
    if (!this.multiplayer) return;
    ctx.fillStyle = '#74bfff';
    ctx.strokeStyle = '#07121c';
    ctx.lineWidth = 2;
    for (const peer of this.multiplayer.peers.values()) {
      if (!peer.root.visible) continue;
      const east = peer.root.position.x + this.terrain.origin.east;
      const north = this.terrain.origin.north - peer.root.position.z;
      const p = this.mapPoint(east, north, width, height);
      if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  drawRover(ctx, width, height) {
    const angle = this.rover.heading;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);
    ctx.fillStyle = '#8dffe0';
    ctx.strokeStyle = '#06100d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 5);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawScale(ctx, width, height) {
    const meters = this.span <= 1000 ? 100 : this.span <= 5000 ? 500 : 2000;
    const px = meters / this.span * width;
    const x = 12, y = height - 14;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 4);
    ctx.stroke();
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(niceDistance(meters), x, y - 7);
  }

  update() {
    if (!this.terrain.manifest) return;
    if (this.regionToken !== this.terrain.regionToken) {
      this.regionToken = this.terrain.regionToken;
      this.reset();
    }

    const now = performance.now();
    if (!this.exploration) this.recordTrail(now);
    this.updateTerrain(now);

    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const deviceWidth = Math.round(width * dpr);
    const deviceHeight = Math.round(height * dpr);
    if (this.canvas.width !== deviceWidth || this.canvas.height !== deviceHeight) {
      this.canvas.width = deviceWidth;
      this.canvas.height = deviceHeight;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrainRaster, 0, 0, width, height);
    this.drawGrid(ctx, width, height);
    this.drawTrail(ctx, width, height);
    this.drawPOIs(ctx, width, height);
    this.drawObelisk(ctx, width, height);
    this.drawPeers(ctx, width, height);
    this.drawRover(ctx, width, height);
    this.drawScale(ctx, width, height);

    ctx.fillStyle = '#f5fbff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', width / 2 - 4, 14);
    ctx.beginPath();
    ctx.moveTo(width / 2, 19); ctx.lineTo(width / 2 - 3, 25); ctx.lineTo(width / 2 + 3, 25); ctx.closePath(); ctx.fill();

    const geo = this.terrain.geoAt(this.rover.east, this.rover.north);
    const heading = normalizeDegrees(this.rover.heading * 180 / Math.PI);
    this.coords.textContent = geo ? formatLatLon(geo.lat, geo.lon) : '--';
    this.telemetry.textContent = t('hud.heading') + ' ' + String(Math.round(heading)).padStart(3, '0') + '° ' + cardinal(heading) + ' · ' + t('hud.elev', { value: Math.round(this.rover.elevation) });
    this.scaleLabel.textContent = t('minimap.view', { value: niceDistance(this.span) });
  }
}
