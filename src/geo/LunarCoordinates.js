import { MOON_RADIUS_M } from '../config.js';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function normalizeLon360(lon) {
  return ((lon % 360) + 360) % 360;
}

export function destinationPoint(latDeg, lonDeg, eastM, northM, radius = MOON_RADIUS_M) {
  const distance = Math.hypot(eastM, northM);
  if (distance < 1e-9) return { lat: latDeg, lon: normalizeLon360(lonDeg) };

  // Spherical exponential map in a local ENU tangent basis. Unlike the usual
  // bearing formula, this remains well-defined at the exact north/south pole.
  const lat = latDeg * DEG;
  const lon = normalizeLon360(lonDeg) * DEG;
  const cl = Math.cos(lat), sl = Math.sin(lat);
  const co = Math.cos(lon), so = Math.sin(lon);

  const ox = cl * co, oy = cl * so, oz = sl;
  const ex = -so, ey = co, ez = 0;
  const nx = -sl * co, ny = -sl * so, nz = cl;

  const inv = 1 / distance;
  const de = eastM * inv, dn = northM * inv;
  const tx = ex * de + nx * dn;
  const ty = ey * de + ny * dn;
  const tz = ez * de + nz * dn;

  const delta = distance / radius;
  const cd = Math.cos(delta), sd = Math.sin(delta);
  const x = ox * cd + tx * sd;
  const y = oy * cd + ty * sd;
  const z = oz * cd + tz * sd;

  return {
    lat: Math.asin(Math.max(-1, Math.min(1, z))) * RAD,
    lon: normalizeLon360(Math.atan2(y, x) * RAD)
  };
}

export function geodeticOffsetMeters(originLatDeg, originLonDeg, latDeg, lonDeg, radius = MOON_RADIUS_M) {
  const lat1 = originLatDeg * DEG;
  const lat2 = latDeg * DEG;
  let dLon = (normalizeLon360(lonDeg) - normalizeLon360(originLonDeg)) * DEG;
  if (dLon > Math.PI) dLon -= Math.PI * 2;
  if (dLon < -Math.PI) dLon += Math.PI * 2;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = Math.atan2(y, x);

  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const angular = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  const dist = angular * radius;
  return { east: Math.sin(bearing) * dist, north: Math.cos(bearing) * dist };
}

export function curvatureSag(eastM, northM, radius = MOON_RADIUS_M) {
  const d = Math.hypot(eastM, northM);
  return radius * (Math.cos(d / radius) - 1);
}

export function localWorldPosition(eastM, northM, localHeightM, floatingOrigin) {
  return {
    x: eastM - floatingOrigin.east,
    y: localHeightM,
    z: -(northM - floatingOrigin.north)
  };
}

export function formatLatLon(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = normalizeLon360(lon) <= 180 ? 'E' : 'W';
  const lonAbs = ew === 'E' ? normalizeLon360(lon) : 360 - normalizeLon360(lon);
  return `${Math.abs(lat).toFixed(4)}°${ns} ${lonAbs.toFixed(4)}°${ew}`;
}
