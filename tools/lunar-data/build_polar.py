#!/usr/bin/env python3
"""
Build LOLA north/south polar DEM pyramids for the lunar rover.

Source:
  NASA/GSFC PGDA LOLA adjusted polar DEMs, polar stereographic, MOON_ME,
  120 m/pixel products covering nominal 60°..90°.

The output reuses the game's packed 65x65 UInt16 tile format, but tile
coordinates remain in polar-stereographic X/Y meters. Runtime converts
lat/lon <-> polar X/Y; it does not force the poles into equirectangular tiles.

Examples:
  python tools/lunar-data/build_polar.py --hemisphere north --clean-cache
  python tools/lunar-data/build_polar.py --hemisphere south --clean-cache
  python tools/lunar-data/build_polar.py --all --clean-cache
  python tools/lunar-data/build_polar.py --hemisphere north --max-lod 4 --test
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import time
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling

MOON_RADIUS_M = 1_737_400.0
SAMPLES = 65
STRIDE = SAMPLES - 1
PACK_TILES = 256
SOURCE_PIXEL_M = 120.0
SOURCE_EXTENT_M = 931_200.0

SOURCES = {
    "north": {
        "id": "POLAR_NORTH",
        "sourceProduct": "LDEM_60N_120MPP_ADJ",
        "url": "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp_NP/LDEM_60N_120MPP_ADJ.TIF",
        "coverage": {"south": 60.0, "north": 90.0, "west": 0.0, "east": 360.0},
        "hemisphere": "north",
    },
    "south": {
        "id": "POLAR_SOUTH",
        "sourceProduct": "LDEM_60S_120MPP_ADJ",
        "url": "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_120MPP_ADJ.TIF",
        "coverage": {"south": -90.0, "north": -60.0, "west": 0.0, "east": 360.0},
        "hemisphere": "south",
    },
}


def download(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 1_000_000:
        print(f"[cache] {path.name} {path.stat().st_size / 1e6:.1f} MB")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    for attempt in range(1, 5):
        try:
            if tmp.exists():
                tmp.unlink()
            print(f"[download] {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "lunar-rover-dem-builder/1.0"})
            with urllib.request.urlopen(req, timeout=60) as src, open(tmp, "wb") as dst:
                expected = int(src.headers.get("Content-Length") or 0)
                done = 0
                while True:
                    chunk = src.read(8 * 1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
                    done += len(chunk)
                    if expected:
                        print(
                            f"\r  {done / 1e6:8.1f}/{expected / 1e6:8.1f} MB "
                            f"({done / expected * 100:5.1f}%)",
                            end="",
                            flush=True,
                        )
                print()
                if expected and done != expected:
                    raise IOError(f"incomplete download {done} != {expected}")
            tmp.replace(path)
            return
        except Exception as exc:
            print(f"[download retry {attempt}/4] {exc}")
            time.sleep(attempt * 2)
    raise RuntimeError(f"failed to download {url}")


def write_level(master: np.ndarray, out: Path, lod: int, max_lod: int) -> dict:
    count = 1 << lod
    step = 1 << (max_lod - lod)
    grid = master[::step, ::step]
    expected_dim = count * STRIDE + 1
    if grid.shape != (expected_dim, expected_dim):
        raise RuntimeError(f"LOD{lod} grid mismatch {grid.shape} != {(expected_dim, expected_dim)}")

    lod_dir = out / f"lod{lod}"
    lod_dir.mkdir(parents=True, exist_ok=True)
    ranges = np.empty((count * count, 2), dtype="<f4")
    tile_bytes = SAMPLES * SAMPLES * 2
    pack_limit = PACK_TILES * tile_bytes
    pack_index = 0
    pack_buf = bytearray()

    print(f"[lod{lod}] {count}x{count} tiles; source grid {grid.shape[0]}x{grid.shape[1]}")

    for y in range(count):
        strip = grid[y * STRIDE : y * STRIDE + SAMPLES, :]
        # A zero-copy view of all horizontally adjacent overlapping 65x65 tiles.
        tiles = np.lib.stride_tricks.as_strided(
            strip,
            shape=(count, SAMPLES, SAMPLES),
            strides=(STRIDE * strip.strides[1], strip.strides[0], strip.strides[1]),
            writeable=False,
        )

        mins = np.nanmin(tiles, axis=(1, 2)).astype(np.float32)
        maxs = np.nanmax(tiles, axis=(1, 2)).astype(np.float32)
        bad = ~np.isfinite(mins) | ~np.isfinite(maxs)
        if np.any(bad):
            raise RuntimeError(f"non-finite polar DEM tile at LOD{lod}, row {y}")

        row0 = y * count
        ranges[row0 : row0 + count, 0] = mins
        ranges[row0 : row0 + count, 1] = maxs

        span = (maxs - mins).astype(np.float32)
        safe = np.where(span > 1e-9, span, 1.0).astype(np.float32)
        vals = np.where(np.isfinite(tiles), tiles, mins[:, None, None])
        q = np.rint(
            (vals - mins[:, None, None]) / safe[:, None, None] * 65535.0
        )
        q = np.clip(q, 0, 65535).astype("<u2")
        q[span <= 1e-9, :, :] = 0

        pack_buf.extend(q.tobytes(order="C"))
        while len(pack_buf) >= pack_limit:
            chunk = pack_buf[:pack_limit]
            del pack_buf[:pack_limit]
            (lod_dir / f"pack_{pack_index:04d}.bin").write_bytes(chunk)
            pack_index += 1

        if count >= 64 and (y + 1) % max(1, count // 8) == 0:
            print(f"  row {y + 1}/{count}")

    if pack_buf:
        (lod_dir / f"pack_{pack_index:04d}.bin").write_bytes(pack_buf)

    ranges.tofile(lod_dir / "ranges.bin")
    return {
        "lod": lod,
        "countX": count,
        "countY": count,
        "samples": SAMPLES,
        "tileBytes": tile_bytes,
        "packTiles": PACK_TILES,
        "rangesPath": f"lod{lod}/ranges.bin",
        "packPathTemplate": f"lod{lod}/pack_{{pack:04d}}.bin",
    }


def patch_global_index(global_root: Path) -> None:
    index_path = global_root / "index.json"
    if not index_path.exists():
        raise RuntimeError("global index.json is missing; build the existing global DEM first")
    index = json.loads(index_path.read_text(encoding="utf-8"))

    polar = index.setdefault("polar", {})
    index.pop("polarSeamTransition", None)
    index.pop("polarBoundaryStitch", None)
    ready = 0
    for hemi in ("north", "south"):
        manifest_path = global_root / "polar" / hemi / "manifest.json"
        src = SOURCES[hemi]
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            polar[hemi] = {
                "id": manifest["id"],
                "coverage": src["coverage"],
                "dataset": manifest["dataset"],
                "status": "ready",
                "path": f"polar/{hemi}/manifest.json",
                "sourceProduct": manifest["sourceProduct"],
                "projection": "polar-stereographic",
                "nativeResolutionMeters": manifest["nativeResolutionMeters"],
                "maxLod": manifest["maxLod"],
            }
            ready += 1
        else:
            polar[hemi] = {
                "coverage": src["coverage"],
                "dataset": "LOLA polar DEM",
                "status": "source-not-configured",
            }

    if ready == 2:
        index["coverage"] = {"south": -90.0, "north": 90.0, "west": 0.0, "east": 360.0}
        index["globalCoverage"] = True
        index["dataset"] = (
            "SLDEM2015 512 ppd (60S-60N) + NASA/GSFC LOLA adjusted polar DEM "
            "(60S-90S / 60N-90N)"
        )
    else:
        index["globalCoverage"] = False

    index_path.write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"[index] polar providers ready: {ready}/2")


def build_one(
    hemisphere: str,
    global_root: Path,
    cache_root: Path,
    max_lod: int,
    clean_cache: bool,
    no_download: bool,
) -> None:
    cfg = SOURCES[hemisphere]
    cache = cache_root / f"{cfg['sourceProduct']}.TIF"
    if not no_download:
        download(cfg["url"], cache)
    if not cache.exists():
        raise RuntimeError(f"source missing: {cache}")

    out = global_root / "polar" / hemisphere
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    try:
        with rasterio.open(cache) as src:
            print(
                f"[source] {cache.name} {src.width}x{src.height} "
                f"{src.dtypes[0]} {src.crs}"
            )
            if src.width != src.height:
                raise RuntimeError("polar source must be square")
            if abs(src.transform.a - SOURCE_PIXEL_M) > 1e-3:
                print(f"[warn] expected {SOURCE_PIXEL_M} m/px, source is {src.transform.a} m/px")

            dim = (1 << max_lod) * STRIDE + 1
            approx_gb = dim * dim * 4 / 1e9
            print(f"[master] resample once to {dim}x{dim} float32 (~{approx_gb:.2f} GB)")
            master = src.read(
                1,
                out_shape=(dim, dim),
                resampling=Resampling.bilinear,
            ).astype(np.float32, copy=False)

        finite = master[np.isfinite(master)]
        if finite.size == 0:
            raise RuntimeError("polar source produced no finite elevations")
        max_abs = float(np.max(np.abs(finite)))
        if max_abs > 30_000:
            raise RuntimeError(f"implausible polar elevation max abs {max_abs:.1f} m")
        print(
            f"[height] min={float(finite.min()):.1f} m "
            f"max={float(finite.max()):.1f} m median={float(np.median(finite)):.1f} m"
        )

        levels = []
        for lod in range(max_lod + 1):
            levels.append(write_level(master, out, lod, max_lod))

        manifest = {
            "version": 3,
            "mode": "polar-stereographic-block",
            "id": cfg["id"],
            "dataset": "NASA/GSFC LOLA adjusted polar DEM",
            "sourceProduct": cfg["sourceProduct"],
            "sourceUrl": cfg["url"],
            "referenceRadiusMeters": MOON_RADIUS_M,
            "nativeResolutionMeters": SOURCE_PIXEL_M,
            "heightEncoding": "physical-meters",
            "sourceSampleScaleApplied": 1.0,
            "coverage": cfg["coverage"],
            "projection": {
                "type": "polar-stereographic",
                "hemisphere": hemisphere,
                "centralMeridianDegrees": 0.0,
                "trueScaleLatitudeDegrees": 90.0 if hemisphere == "north" else -90.0,
                "radiusMeters": MOON_RADIUS_M,
                "xMin": -SOURCE_EXTENT_M,
                "xMax": SOURCE_EXTENT_M,
                "yMin": -SOURCE_EXTENT_M,
                "yMax": SOURCE_EXTENT_M,
                "nominalBoundaryLatitudeDegrees": 60.0 if hemisphere == "north" else -60.0,
            },
            # Keep ordinary bounds for coverage metadata; tile geometry itself
            # uses projection X/Y, never equirectangular interpolation.
            "bounds": cfg["coverage"],
            "maxLod": max_lod,
            "levels": levels,
            "attribution": (
                "NASA/GSFC PGDA LOLA adjusted polar DEM; "
                "Barker et al. 2025, Planetary Science Journal 6, 83"
            ),
        }
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"[done] {hemisphere} -> {out}")
    finally:
        if clean_cache:
            try:
                cache.unlink(missing_ok=True)
                print(f"[cache] removed {cache.name}")
            except Exception as exc:
                print(f"[warn] could not remove cache: {exc}")

    patch_global_index(global_root)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hemisphere", choices=("north", "south"))
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--max-lod", type=int, default=8)
    parser.add_argument("--clean-cache", action="store_true")
    parser.add_argument("--no-download", action="store_true")
    parser.add_argument("--test", action="store_true", help="Shortcut: cap at LOD4")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parents[2] / "public" / "moon" / "global"),
    )
    parser.add_argument(
        "--cache",
        default=str(Path(__file__).resolve().parent / "cache_polar"),
    )
    args = parser.parse_args()

    if not args.all and not args.hemisphere:
        parser.error("use --hemisphere north|south or --all")
    max_lod = min(args.max_lod, 4) if args.test else args.max_lod
    if max_lod < 0 or max_lod > 9:
        raise ValueError("max LOD must be 0..9")

    global_root = Path(args.output).resolve()
    cache_root = Path(args.cache).resolve()
    cache_root.mkdir(parents=True, exist_ok=True)

    targets = ("north", "south") if args.all else (args.hemisphere,)
    for hemi in targets:
        build_one(
            hemi,
            global_root,
            cache_root,
            max_lod=max_lod,
            clean_cache=args.clean_cache,
            no_download=args.no_download,
        )


if __name__ == "__main__":
    main()
