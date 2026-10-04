function fract(x) { return x - Math.floor(x); }
function hash2(x, y) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}
function smooth(t) { return t * t * (3 - 2 * t); }

export function valueNoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(fract(x)), fy = smooth(fract(y));
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy;
}

export function fbm2(x, y, octaves = 4) {
  let f = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    f += valueNoise2(x, y) * amp;
    norm += amp;
    x *= 2.03; y *= 2.03; amp *= 0.5;
  }
  return f / norm;
}

export function subGridDetail(east, north, config) {
  const medium = (fbm2(east / 38, north / 38, 4) - 0.5) * 2 * config.mediumAmplitude;
  const fine = (fbm2(east / 9, north / 9, 3) - 0.5) * 2 * config.fineAmplitude;
  const long = (fbm2(east / 120, north / 120, 3) - 0.5) * 2 * config.maxAmplitude;
  return long + medium + fine;
}
