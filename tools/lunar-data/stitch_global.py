"""
Post-process the already-built global SLDEM pyramid so adjacent 30x45 degree
source blocks share the same DEM samples on every external block boundary.

This fixes visible cracks, rover height steps and lighting/material seams caused by
independent source-block resampling. It does not redownload NASA source data and
does not rewrite interior tiles.

Usage:
  python tools/lunar-data/stitch_global.py
  python tools/lunar-data/stitch_global.py --lod 8
  python tools/lunar-data/stitch_global.py --validate-only
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

SAMPLES = 65
STRIDE = SAMPLES - 1


class BlockStore:
    def __init__(self, root: Path, block_id: str):
        self.root = root
        self.id = block_id
        self.base = root / "blocks" / block_id
        self.manifest = json.loads((self.base / "manifest.json").read_text(encoding="utf-8"))
        self._ranges: dict[int, np.memmap] = {}

    def level(self, lod: int):
        return next(lv for lv in self.manifest["levels"] if int(lv["lod"]) == lod)

    def ranges(self, lod: int) -> np.memmap:
        if lod not in self._ranges:
            lv = self.level(lod)
            self._ranges[lod] = np.memmap(
                self.base / lv["rangesPath"], dtype="<f4", mode="r+"
            )
        return self._ranges[lod]

    def _tile_location(self, lod: int, x: int, y: int):
        lv = self.level(lod)
        nx = int(lv["countX"])
        linear = y * nx + x
        pack = linear // int(lv["packTiles"])
        in_pack = linear % int(lv["packTiles"])
        path = self.base / f"lod{lod}" / f"pack_{pack:04d}.bin"
        offset = in_pack * int(lv["tileBytes"])
        return lv, linear, path, offset

    def read_tile(self, lod: int, x: int, y: int) -> np.ndarray:
        lv, linear, path, offset = self._tile_location(lod, x, y)
        r = self.ranges(lod)
        hmin = float(r[linear * 2])
        hmax = float(r[linear * 2 + 1])
        with open(path, "rb") as f:
            f.seek(offset)
            raw = f.read(int(lv["tileBytes"]))
        if len(raw) != int(lv["tileBytes"]):
            raise IOError(f"truncated tile {self.id} lod{lod} {x},{y}")
        q = np.frombuffer(raw, dtype="<u2").copy().reshape(SAMPLES, SAMPLES)
        if not (math.isfinite(hmin) and math.isfinite(hmax)):
            raise ValueError(f"non-finite range {self.id} lod{lod} {x},{y}")
        if abs(hmax - hmin) < 1e-12:
            return np.full((SAMPLES, SAMPLES), hmin, dtype=np.float32)
        return (hmin + (hmax - hmin) * (q.astype(np.float32) / 65535.0)).astype(np.float32)

    def write_tile(self, lod: int, x: int, y: int, h: np.ndarray):
        lv, linear, path, offset = self._tile_location(lod, x, y)
        finite = h[np.isfinite(h)]
        if finite.size == 0:
            raise ValueError(f"no finite values {self.id} lod{lod} {x},{y}")
        hmin = float(finite.min())
        hmax = float(finite.max())
        if hmax - hmin < 1e-9:
            q = np.zeros(h.shape, dtype="<u2")
        else:
            q = np.clip(
                np.rint((h - hmin) / (hmax - hmin) * 65535.0),
                0, 65535,
            ).astype("<u2")

        with open(path, "r+b") as f:
            f.seek(offset)
            f.write(q.tobytes(order="C"))

        r = self.ranges(lod)
        r[linear * 2] = hmin
        r[linear * 2 + 1] = hmax

    def flush(self):
        for r in self._ranges.values():
            r.flush()


def concat_vertical_edge(store: BlockStore, lod: int, x: int) -> np.ndarray:
    lv = store.level(lod)
    ny = int(lv["countY"])
    parts = []
    for y in range(ny):
        edge = store.read_tile(lod, x, y)[:, -1 if x == int(lv["countX"]) - 1 else 0]
        parts.append(edge if y == ny - 1 else edge[:-1])
    return np.concatenate(parts).astype(np.float64)


def concat_horizontal_edge(store: BlockStore, lod: int, y: int) -> np.ndarray:
    lv = store.level(lod)
    nx = int(lv["countX"])
    parts = []
    for x in range(nx):
        edge = store.read_tile(lod, x, y)[-1 if y == int(lv["countY"]) - 1 else 0, :]
        parts.append(edge if x == nx - 1 else edge[:-1])
    return np.concatenate(parts).astype(np.float64)


def set_vertical_edge(store: BlockStore, lod: int, x: int, target: np.ndarray):
    lv = store.level(lod)
    ny = int(lv["countY"])
    col = -1 if x == int(lv["countX"]) - 1 else 0
    for y in range(ny):
        h = store.read_tile(lod, x, y)
        start = y * STRIDE
        h[:, col] = target[start:start + SAMPLES]
        store.write_tile(lod, x, y, h)


def set_horizontal_edge(store: BlockStore, lod: int, y: int, target: np.ndarray):
    lv = store.level(lod)
    nx = int(lv["countX"])
    row = -1 if y == int(lv["countY"]) - 1 else 0
    for x in range(nx):
        h = store.read_tile(lod, x, y)
        start = x * STRIDE
        h[row, :] = target[start:start + SAMPLES]
        store.write_tile(lod, x, y, h)


def seam_error_vertical(a: BlockStore, b: BlockStore, lod: int):
    la = a.level(lod)
    ea = concat_vertical_edge(a, lod, int(la["countX"]) - 1)
    eb = concat_vertical_edge(b, lod, 0)
    d = np.abs(ea - eb)
    return float(d.max()), float(d.mean())


def seam_error_horizontal(south: BlockStore, north: BlockStore, lod: int):
    ls = south.level(lod)
    es = concat_horizontal_edge(south, lod, 0)
    en = concat_horizontal_edge(north, lod, int(north.level(lod)["countY"]) - 1)
    d = np.abs(es - en)
    return float(d.max()), float(d.mean())


def build_adjacency(index):
    blocks = index["blocks"]
    rows = {}
    for b in blocks:
        rows.setdefault((float(b["south"]), float(b["north"])), []).append(b)
    for row in rows.values():
        row.sort(key=lambda x: float(x["west"]))

    vertical = []
    for _, row in sorted(rows.items()):
        for i, a in enumerate(row):
            b = row[(i + 1) % len(row)]
            vertical.append((a["id"], b["id"]))

    horizontal = []
    ordered_rows = sorted(rows.keys())
    for i in range(len(ordered_rows) - 1):
        sr = rows[ordered_rows[i]]
        nr = rows[ordered_rows[i + 1]]
        # Neighboring latitude bands share the same eight longitude blocks.
        for south, north in zip(sr, nr):
            horizontal.append((south["id"], north["id"]))
    return vertical, horizontal



def corner_members(index, lat: float, lon: float):
    out = []
    for b in index["blocks"]:
        south, north = float(b["south"]), float(b["north"])
        west, east = float(b["west"]), float(b["east"])
        touches_lat = abs(south - lat) < 1e-9 or abs(north - lat) < 1e-9
        touches_lon = (
            abs(west - lon) < 1e-9
            or abs(east - lon) < 1e-9
            or (abs(lon) < 1e-9 and abs(east - 360.0) < 1e-9)
        )
        if touches_lat and touches_lon:
            out.append(b)
    return out


def read_corner(store: BlockStore, lod: int, lat: float, lon: float):
    lv = store.level(lod)
    nx, ny = int(lv["countX"]), int(lv["countY"])
    b = store.manifest["bounds"]
    west, east = float(b["west"]), float(b["east"])
    south, north = float(b["south"]), float(b["north"])

    if abs(west - lon) < 1e-9:
        x, col = 0, 0
    elif abs(east - lon) < 1e-9 or (abs(lon) < 1e-9 and abs(east - 360.0) < 1e-9):
        x, col = nx - 1, -1
    else:
        raise ValueError((store.id, "lon", lon))

    if abs(north - lat) < 1e-9:
        y, row = 0, 0
    elif abs(south - lat) < 1e-9:
        y, row = ny - 1, -1
    else:
        raise ValueError((store.id, "lat", lat))

    h = store.read_tile(lod, x, y)
    return float(h[row, col]), x, y, row, col


def write_corner(store: BlockStore, lod: int, x: int, y: int, row: int, col: int, value: float):
    h = store.read_tile(lod, x, y)
    h[row, col] = value
    store.write_tile(lod, x, y, h)


def stitch_block_corners(index, stores, lod: int, validate_only: bool):
    # Internal latitude boundaries are where four independently-built source
    # blocks meet. Longitude 0 is treated as the 360/0 wrap corner.
    for lat in (-30.0, 0.0, 30.0):
        for lon in (0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0):
            members = corner_members(index, lat, lon)
            samples = []
            for b in members:
                store = stores[b["id"]]
                value, x, y, row, col = read_corner(store, lod, lat, lon)
                samples.append((store, x, y, row, col, value))
            if len(samples) < 2:
                continue
            target = float(sum(x[5] for x in samples) / len(samples))
            if not validate_only:
                for store, x, y, row, col, _ in samples:
                    write_corner(store, lod, x, y, row, col, target)

def stitch(root: Path, lods: list[int], validate_only: bool):
    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    stores = {b["id"]: BlockStore(root, b["id"]) for b in index["blocks"]}
    vertical, horizontal = build_adjacency(index)

    before = []
    after = []

    for lod in lods:
        print(f"\n=== LOD {lod} ===")

        # Longitude seams first, including 360/0 wrap.
        for aid, bid in vertical:
            a, b = stores[aid], stores[bid]
            max0, mean0 = seam_error_vertical(a, b, lod)
            before.append(max0)
            if not validate_only:
                la = a.level(lod)
                ea = concat_vertical_edge(a, lod, int(la["countX"]) - 1)
                eb = concat_vertical_edge(b, lod, 0)
                target = ((ea + eb) * 0.5).astype(np.float32)
                set_vertical_edge(a, lod, int(la["countX"]) - 1, target)
                set_vertical_edge(b, lod, 0, target)
                max1, mean1 = seam_error_vertical(a, b, lod)
            else:
                max1, mean1 = max0, mean0
            after.append(max1)
            print(f"[lon] {aid} <-> {bid}: {max0:.3f}m -> {max1:.3f}m")

        # Latitude seams second. This also makes all four block-corner samples
        # converge to the same value after the longitude pass.
        for sid, nid in horizontal:
            south, north = stores[sid], stores[nid]
            max0, mean0 = seam_error_horizontal(south, north, lod)
            before.append(max0)
            if not validate_only:
                es = concat_horizontal_edge(south, lod, 0)
                en = concat_horizontal_edge(north, lod, int(north.level(lod)["countY"]) - 1)
                target = ((es + en) * 0.5).astype(np.float32)
                set_horizontal_edge(south, lod, 0, target)
                set_horizontal_edge(north, lod, int(north.level(lod)["countY"]) - 1, target)
                max1, mean1 = seam_error_horizontal(south, north, lod)
            else:
                max1, mean1 = max0, mean0
            after.append(max1)
            print(f"[lat] {sid} <-> {nid}: {max0:.3f}m -> {max1:.3f}m")

        # Reconcile the exact four-way corner samples after the edge passes.
        # This is especially important at the 360/0 wrap intersections.
        stitch_block_corners(index, stores, lod, validate_only)

    for s in stores.values():
        s.flush()

    print("\n=== SUMMARY ===")
    print(f"seams checked: {len(after)}")
    print(f"max error before: {max(before):.3f} m")
    print(f"max error after : {max(after):.3f} m")
    if not validate_only:
        print("External block seam stitching complete.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        default=str(Path(__file__).resolve().parents[2] / "public" / "moon" / "global"),
    )
    parser.add_argument("--lod", type=int, action="append", help="Only stitch this LOD; may be repeated.")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    max_lod = int(index["maxLod"])
    lods = sorted(set(args.lod)) if args.lod else list(range(max_lod + 1))
    for lod in lods:
        if lod < 0 or lod > max_lod:
            raise ValueError(f"LOD {lod} outside 0..{max_lod}")

    stitch(root, lods, args.validate_only)


if __name__ == "__main__":
    main()
