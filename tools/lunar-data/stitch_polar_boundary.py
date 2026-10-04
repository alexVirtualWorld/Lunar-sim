#!/usr/bin/env python3
"""
Stitch SLDEM +/-60 degree outer latitude edges directly to the LOLA polar DEM.

This follows the same data-level philosophy as stitch_global.py: modify the
packed boundary samples themselves, for every LOD, instead of hiding a seam
with runtime blend geometry.
"""
from __future__ import annotations

import argparse
import json
import math
import time
import zipfile
from pathlib import Path

import numpy as np

from stitch_global import BlockStore, SAMPLES, STRIDE

R = 1_737_400.0


class PolarStore:
    def __init__(self, root: Path, hemisphere: str):
        self.root = root
        self.hemisphere = hemisphere
        self.base = root / 'polar' / hemisphere
        self.manifest = json.loads((self.base / 'manifest.json').read_text(encoding='utf-8'))
        self._ranges = {}
        self._tiles = {}

    def level(self, lod: int):
        return next(lv for lv in self.manifest['levels'] if int(lv['lod']) == lod)

    def ranges(self, lod: int):
        if lod not in self._ranges:
            lv = self.level(lod)
            self._ranges[lod] = np.memmap(self.base / lv['rangesPath'], dtype='<f4', mode='r')
        return self._ranges[lod]

    def read_tile(self, lod: int, x: int, y: int) -> np.ndarray:
        key = (lod, x, y)
        if key in self._tiles:
            return self._tiles[key]
        lv = self.level(lod)
        nx = int(lv['countX'])
        linear = y * nx + x
        pack = linear // int(lv['packTiles'])
        in_pack = linear % int(lv['packTiles'])
        path = self.base / f'lod{lod}' / f'pack_{pack:04d}.bin'
        offset = in_pack * int(lv['tileBytes'])
        rr = self.ranges(lod)
        hmin = float(rr[linear * 2]); hmax = float(rr[linear * 2 + 1])
        with open(path, 'rb') as f:
            f.seek(offset)
            raw = f.read(int(lv['tileBytes']))
        q = np.frombuffer(raw, dtype='<u2').copy().reshape(SAMPLES, SAMPLES)
        if abs(hmax - hmin) < 1e-12:
            arr = np.full((SAMPLES, SAMPLES), hmin, dtype=np.float32)
        else:
            arr = (hmin + (hmax - hmin) * (q.astype(np.float32) / 65535.0)).astype(np.float32)
        self._tiles[key] = arr
        return arr

    def project(self, lat: float, lon: float):
        p = self.manifest['projection']
        north = self.hemisphere == 'north'
        lam = math.radians(lon % 360.0)
        phi = math.radians(lat)
        colat = math.pi / 2 - phi if north else math.pi / 2 + phi
        rho = 2 * R * math.tan(max(0.0, colat) * 0.5)
        x = rho * math.sin(lam)
        y = (-1.0 if north else 1.0) * rho * math.cos(lam)
        return x, y

    def sample(self, lod: int, lat: float, lon: float) -> float:
        lv = self.level(lod)
        p = self.manifest['projection']
        X, Y = self.project(lat, lon)
        span_x = (p['xMax'] - p['xMin']) / int(lv['countX'])
        span_y = (p['yMax'] - p['yMin']) / int(lv['countY'])
        tx = (X - p['xMin']) / span_x
        ty = (p['yMax'] - Y) / span_y
        x = max(0, min(int(lv['countX']) - 1, math.floor(tx)))
        y = max(0, min(int(lv['countY']) - 1, math.floor(ty)))
        tile = self.read_tile(lod, x, y)
        u = max(0.0, min(1.0, tx - x))
        v = max(0.0, min(1.0, ty - y))
        fx = u * (SAMPLES - 1); fy = v * (SAMPLES - 1)
        x0 = int(math.floor(fx)); y0 = int(math.floor(fy))
        x1 = min(SAMPLES - 1, x0 + 1); y1 = min(SAMPLES - 1, y0 + 1)
        ax = fx - x0; ay = fy - y0
        a = tile[y0, x0] * (1 - ax) + tile[y0, x1] * ax
        b = tile[y1, x0] * (1 - ax) + tile[y1, x1] * ax
        return float(a * (1 - ay) + b * ay)


def boundary_blocks(index, hemisphere: str):
    if hemisphere == 'north':
        return sorted([b for b in index['blocks'] if abs(float(b['north']) - 60.0) < 1e-9], key=lambda b: float(b['west']))
    return sorted([b for b in index['blocks'] if abs(float(b['south']) + 60.0) < 1e-9], key=lambda b: float(b['west']))


def edge_row(store: BlockStore, hemisphere: str, lod: int):
    lv = store.level(lod)
    return 0 if hemisphere == 'north' else int(lv['countY']) - 1


def read_block_edge(store: BlockStore, hemisphere: str, lod: int) -> np.ndarray:
    lv = store.level(lod)
    y = edge_row(store, hemisphere, lod)
    row = 0 if hemisphere == 'north' else -1
    parts = []
    for x in range(int(lv['countX'])):
        e = store.read_tile(lod, x, y)[row, :]
        parts.append(e if x == int(lv['countX']) - 1 else e[:-1])
    return np.concatenate(parts).astype(np.float64)


def write_block_edge(store: BlockStore, hemisphere: str, lod: int, target: np.ndarray):
    lv = store.level(lod)
    y = edge_row(store, hemisphere, lod)
    row = 0 if hemisphere == 'north' else -1
    for x in range(int(lv['countX'])):
        h = store.read_tile(lod, x, y)
        start = x * STRIDE
        h[row, :] = target[start:start + SAMPLES]
        store.write_tile(lod, x, y, h)


def polar_targets_for_block(polar: PolarStore, lod: int, block_meta) -> np.ndarray:
    count_x = 1 << lod
    count = count_x * STRIDE + 1
    west = float(block_meta['west']); east = float(block_meta['east'])
    lat = 60.0 if polar.hemisphere == 'north' else -60.0
    lons = np.linspace(west, east, count, dtype=np.float64)
    return np.asarray([polar.sample(lod, lat, float(lon)) for lon in lons], dtype=np.float32)


def affected_files(root: Path, index, lods):
    files = set()
    for hemi in ('north', 'south'):
        for meta in boundary_blocks(index, hemi):
            store = BlockStore(root, meta['id'])
            for lod in lods:
                lv = store.level(lod)
                files.add(store.base / lv['rangesPath'])
                y = edge_row(store, hemi, lod)
                for x in range(int(lv['countX'])):
                    linear = y * int(lv['countX']) + x
                    pack = linear // int(lv['packTiles'])
                    files.add(store.base / f'lod{lod}' / f'pack_{pack:04d}.bin')
    files.add(root / 'index.json')
    return sorted(files)


def backup_files(root: Path, files):
    stamp = time.strftime('%Y%m%d_%H%M%S')
    out = root.parent.parent.parent / 'tools' / 'lunar-data' / 'backups' / f'polar_boundary_pre_stitch_{stamp}.zip'
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for p in files:
            z.write(p, p.relative_to(root))
    print('[backup]', out)
    return out


def validate_one(store: BlockStore, polar: PolarStore, meta, lod: int):
    a = read_block_edge(store, polar.hemisphere, lod)
    b = polar_targets_for_block(polar, lod, meta).astype(np.float64)
    d = np.abs(a - b)
    return float(d.max()), float(d.mean())


def run(root: Path, lods, validate_only: bool, no_backup: bool):
    index_path = root / 'index.json'
    index = json.loads(index_path.read_text(encoding='utf-8'))
    stores = {b['id']: BlockStore(root, b['id']) for b in index['blocks']}
    polars = {'north': PolarStore(root, 'north'), 'south': PolarStore(root, 'south')}

    if not validate_only and not no_backup:
        backup_files(root, affected_files(root, index, lods))

    before = []; after = []
    for lod in lods:
        print(f'\n=== LOD {lod} ===')
        for hemi in ('north', 'south'):
            polar = polars[hemi]
            for meta in boundary_blocks(index, hemi):
                store = stores[meta['id']]
                m0, a0 = validate_one(store, polar, meta, lod)
                before.append(m0)
                if not validate_only:
                    target = polar_targets_for_block(polar, lod, meta)
                    write_block_edge(store, hemi, lod, target)
                    m1, a1 = validate_one(store, polar, meta, lod)
                else:
                    m1, a1 = m0, a0
                after.append(m1)
                print(f'[{hemi}] {meta["id"]}: {m0:.3f}m -> {m1:.3f}m (mean {a1:.3f}m)')

    for s in stores.values(): s.flush()

    print('\n=== SUMMARY ===')
    print('edges checked:', len(after))
    print(f'max error before: {max(before):.3f} m')
    print(f'max error after : {max(after):.3f} m')

    if not validate_only:
        index = json.loads(index_path.read_text(encoding='utf-8'))
        index.pop('polarSeamTransition', None)
        index['polarBoundaryStitch'] = {
            'version': 2,
            'strategy': 'rewrite-sldem-outer-edge-to-lola-polar',
            'latitudeDegrees': 60.0,
            'lods': list(lods),
            'maxResidualMeters': float(max(after)),
        }
        index_path.write_text(json.dumps(index, indent=2), encoding='utf-8')
        print('[done] direct packed-data polar boundary stitch complete')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=str(Path(__file__).resolve().parents[2] / 'public' / 'moon' / 'global'))
    ap.add_argument('--lod', type=int, action='append')
    ap.add_argument('--validate-only', action='store_true')
    ap.add_argument('--no-backup', action='store_true')
    args = ap.parse_args()
    root = Path(args.root).resolve()
    index = json.loads((root / 'index.json').read_text(encoding='utf-8'))
    max_lod = int(index['maxLod'])
    lods = sorted(set(args.lod)) if args.lod else list(range(max_lod + 1))
    run(root, lods, args.validate_only, args.no_backup)


if __name__ == '__main__':
    main()