"""
Build a globally indexed SLDEM2015 terrain pyramid for the Three.js lunar rover.

Coverage:
  - SLDEM2015 512 ppd: 60 S .. 60 N, all longitudes.
  - Polar slots are described in index.json but intentionally left unbuilt until
    a LOLA polar source is supplied.

Storage is source-block based (30 deg latitude x 45 deg longitude) but runtime
lookup is global lat/lon. Each LOD stores fixed-size 65x65 uint16 tiles in
~2 MiB pack files plus a compact float32 min/max range table.

Examples:
  python tools/lunar-data/build_global.py --index-only
  python tools/lunar-data/build_global.py --block 00N_30N_E000_E045 --max-lod 4 --clean-cache
  python tools/lunar-data/build_global.py --all --max-lod 8 --clean-cache
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import sys
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling

MOON_RADIUS_M = 1_737_400.0
PPD = 512
SAMPLES = 65
DEFAULT_MAX_LOD = 8
PACK_TILES = 256
BASE_URL = "https://imbrium.mit.edu/EXTRAS/SLDEM2015/TILES/JP2"
DATASET = "SLDEM2015 512 ppd (LOLA/LRO + SELENE/Kaguya TC)"


def band_name(south: float, north: float) -> str:
    def fmt(v: float) -> str:
        if v == 0:
            return "00N" if north > 0 else "00S"
        return f"{abs(int(v)):02d}{'N' if v > 0 else 'S'}"
    return f"{fmt(south)}_{fmt(north)}"


def source_band_name(south: float, north: float) -> str:
    if south == 0 and north == 30:
        return "00N_30N"
    if south == 30 and north == 60:
        return "30N_60N"
    if south == -30 and north == 0:
        return "30S_00S"
    if south == -60 and north == -30:
        return "60S_30S"
    raise ValueError((south, north))


def block_id(south: float, north: float, west: float, east: float) -> str:
    lat = source_band_name(south, north)
    return f"{lat}_E{int(west):03d}_E{int(east):03d}"


def source_name(south: float, north: float, west: float, east: float) -> str:
    return f"SLDEM2015_512_{source_band_name(south, north)}_{int(west):03d}_{int(east):03d}"


def all_blocks():
    rows = [(-60.0, -30.0), (-30.0, 0.0), (0.0, 30.0), (30.0, 60.0)]
    out = []
    for south, north in rows:
        for west in range(0, 360, 45):
            east = west + 45
            out.append({
                "id": block_id(south, north, west, east),
                "south": south,
                "north": north,
                "west": float(west),
                "east": float(east),
                "source": source_name(south, north, west, east),
            })
    return out


BLOCKS = {b["id"]: b for b in all_blocks()}


def global_index(max_lod: int = DEFAULT_MAX_LOD):
    blocks = []
    for b in BLOCKS.values():
        blocks.append({
            "id": b["id"],
            "south": b["south"],
            "north": b["north"],
            "west": b["west"],
            "east": b["east"],
            "path": f"blocks/{b['id']}/manifest.json",
            "sourceProduct": b["source"],
        })
    return {
        "version": 2,
        "mode": "global-geodetic",
        "dataset": DATASET,
        "referenceRadiusMeters": MOON_RADIUS_M,
        "nativeResolutionMeters": (2 * math.pi * MOON_RADIUS_M / 360.0) / PPD,
        "coverage": {"south": -60.0, "north": 60.0, "west": 0.0, "east": 360.0},
        "blockSizeDegrees": {"latitude": 30.0, "longitude": 45.0},
        "samplesPerTile": SAMPLES,
        "maxLod": max_lod,
        "packTiles": PACK_TILES,
        "blocks": blocks,
        "polar": {
            "north": {
                "coverage": {"south": 60.0, "north": 90.0},
                "dataset": "LOLA polar DEM",
                "status": "source-not-configured"
            },
            "south": {
                "coverage": {"south": -90.0, "north": -60.0},
                "dataset": "LOLA polar DEM",
                "status": "source-not-configured"
            }
        },
        "attribution": "SLDEM2015: Barker et al. (2016), LOLA/LRO + SELENE Terrain Camera"
    }


def write_index(output_root: Path, max_lod: int):
    output_root.mkdir(parents=True, exist_ok=True)
    old_index = None
    old_index_path = output_root / "index.json"
    if old_index_path.exists():
        try:
            old_index = json.loads(old_index_path.read_text(encoding="utf-8"))
        except Exception:
            old_index = None
    index = global_index(max_lod)

    # Preserve already-built polar providers when the equatorial/global
    # SLDEM index is regenerated later.
    ready = 0
    for hemi in ("north", "south"):
        manifest_path = output_root / "polar" / hemi / "manifest.json"
        if not manifest_path.exists():
            continue
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        index["polar"][hemi] = {
            "id": manifest["id"],
            "coverage": manifest["coverage"],
            "dataset": manifest["dataset"],
            "status": "ready",
            "path": f"polar/{hemi}/manifest.json",
            "sourceProduct": manifest["sourceProduct"],
            "projection": "polar-stereographic",
            "nativeResolutionMeters": manifest["nativeResolutionMeters"],
            "maxLod": manifest["maxLod"],
        }
        ready += 1

    if ready == 2:
        index["coverage"] = {"south": -90.0, "north": 90.0, "west": 0.0, "east": 360.0}
        index["globalCoverage"] = True
        index["dataset"] = (
            "SLDEM2015 512 ppd (60S-60N) + NASA/GSFC LOLA adjusted polar DEM "
            "(60S-90S / 60N-90N)"
        )
    else:
        index["globalCoverage"] = False

    if ready == 2 and old_index and old_index.get("polarSeamTransition"):
        index["polarSeamTransition"] = old_index["polarSeamTransition"]

    (output_root / "index.json").write_text(
        json.dumps(index, indent=2),
        encoding="utf-8"
    )


def download(url: str, path: Path):
    if path.exists() and path.stat().st_size > 1024:
        print(f"[cache] {path.name} ({path.stat().st_size / 1e6:.1f} MB)")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")

    last_error = None
    for attempt in range(1, 5):
        if tmp.exists():
            tmp.unlink()
        print(f"[download {attempt}/4] {url}")
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 lunar-rover-global-dem-builder"}
            )
            with urllib.request.urlopen(req, timeout=180) as src, open(tmp, "wb") as dst:
                expected = int(src.headers.get("Content-Length") or 0)
                done = 0
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
                    done += len(chunk)
                    if expected:
                        print(f"\r  {done / 1e6:7.1f}/{expected / 1e6:7.1f} MB", end="", flush=True)
                if expected:
                    print()
                if expected and done != expected:
                    raise IOError(f"incomplete download: {done} != {expected}")
            tmp.replace(path)
            return
        except Exception as exc:
            last_error = exc
            print(f"[warn] download attempt {attempt} failed: {exc}")
            if tmp.exists():
                tmp.unlink()
    raise IOError(f"download failed after 4 attempts: {url}: {last_error}")


def label_value(text: str, key: str):
    m = re.search(rf"(?mi)^\s*{re.escape(key)}\s*=\s*([^\r\n/]+)", text)
    return m.group(1).strip().strip('"') if m else None


def numeric(value, default=None):
    if value is None:
        return default
    m = re.search(r"[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?", str(value))
    return float(m.group(0)) if m else default


def physical_scale(label_text: str, dataset):
    scale = numeric(label_value(label_text, "SCALING_FACTOR"), None)
    offset = numeric(label_value(label_text, "OFFSET"), None)
    # SLDEM2015 JPEG2000 stores elevation DN at 0.5 metres per integer step.
    # Make that product contract explicit even if the JP2 driver reports scale=1.
    if scale is None or abs(scale - 0.5) > 1e-9:
        scale = 0.5
    if offset is None:
        offset = 0.0
    # Ignore generic UNIT keys used by projection metadata.
    unit = ""
    return scale, offset, unit


def to_elevation(raw: np.ndarray, scale: float, offset: float, unit: str = "") -> np.ndarray:
    value = raw.astype(np.float64) * scale + offset

    finite = value[np.isfinite(value)]
    if finite.size == 0:
        raise RuntimeError("No finite elevations")

    median = float(np.median(finite))
    max_abs = float(np.nanmax(np.abs(finite)))

    # SLDEM2015 512-ppd JP2 tiles decode as topography in metres relative to
    # the 1737.4-km reference sphere. Use magnitude-based fallback detection
    # only so unrelated UNIT=KM projection metadata cannot multiply a tile by 1000.
    if median > 500_000:
        value -= MOON_RADIUS_M
    elif 1_500 < median < 2_000 and max_abs < 3_000:
        value = value * 1000.0 - MOON_RADIUS_M
    elif max_abs < 20.0:
        value *= 1000.0

    return value.astype(np.float32)


def ensure_source(block, cache: Path, no_download: bool):
    base = block["source"]
    jp2 = cache / f"{base}.JP2"
    lbl = cache / f"{base}_JP2.LBL"
    if not no_download:
        download(f"{BASE_URL}/{base}.JP2", jp2)
        download(f"{BASE_URL}/{base}_JP2.LBL", lbl)
    if not jp2.exists() or not lbl.exists():
        raise FileNotFoundError(f"missing {jp2.name} or {lbl.name}")
    return jp2, lbl


def quantize_tile(h: np.ndarray):
    finite = h[np.isfinite(h)]
    if finite.size == 0:
        return None, math.nan, math.nan
    hmin = float(finite.min())
    hmax = float(finite.max())
    if hmax - hmin < 1e-6:
        q = np.zeros(h.shape, dtype="<u2")
    else:
        q = np.clip(
            np.rint((h - hmin) / (hmax - hmin) * 65535.0),
            0, 65535
        ).astype("<u2")
    return q, hmin, hmax


def build_block(block, output_root: Path, cache: Path, max_lod: int, no_download: bool, clean_cache: bool):
    jp2, lbl = ensure_source(block, cache, no_download)
    label_text = lbl.read_text(errors="ignore")
    out = output_root / "blocks" / block["id"]
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    try:
        with rasterio.open(jp2) as src:
            print(f"[source] {jp2.name} {src.width}x{src.height} {src.dtypes[0]} {src.driver}")
            scale, offset, unit = physical_scale(label_text, src)
            levels = []
            tile_bytes = SAMPLES * SAMPLES * 2

            for lod in range(max_lod + 1):
                count = 1 << lod
                grid_n = count * (SAMPLES - 1) + 1
                print(f"[lod {lod}] {count}x{count} tiles, resample grid {grid_n}x{grid_n}")

                raw = src.read(
                    1,
                    out_shape=(grid_n, grid_n),
                    resampling=Resampling.bilinear
                )
                elev = to_elevation(raw, scale, offset, unit)
                del raw

                max_abs_elev = float(np.nanmax(np.abs(elev)))
                if max_abs_elev > 30_000:
                    raise RuntimeError(
                        f"Implausible lunar elevation range in {block['id']}: "
                        f"max abs {max_abs_elev:.1f} m. Check scale/unit metadata."
                    )

                lod_dir = out / f"lod{lod}"
                lod_dir.mkdir(exist_ok=True)
                ranges = np.empty((count * count, 2), dtype="<f4")

                pack_index = -1
                pack_handle = None
                try:
                    for ty in range(count):
                        y0 = ty * (SAMPLES - 1)
                        y1 = y0 + SAMPLES
                        for tx in range(count):
                            x0 = tx * (SAMPLES - 1)
                            x1 = x0 + SAMPLES
                            linear = ty * count + tx
                            q, hmin, hmax = quantize_tile(elev[y0:y1, x0:x1])
                            if q is None:
                                ranges[linear] = (math.nan, math.nan)
                                q = np.zeros((SAMPLES, SAMPLES), dtype="<u2")
                            else:
                                ranges[linear] = (hmin, hmax)

                            desired_pack = linear // PACK_TILES
                            if desired_pack != pack_index:
                                if pack_handle:
                                    pack_handle.close()
                                pack_index = desired_pack
                                pack_handle = open(lod_dir / f"pack_{pack_index:04d}.bin", "wb")
                            pack_handle.write(q.tobytes(order="C"))
                finally:
                    if pack_handle:
                        pack_handle.close()

                ranges.tofile(lod_dir / "ranges.bin")
                del elev

                levels.append({
                    "lod": lod,
                    "countX": count,
                    "countY": count,
                    "samples": SAMPLES,
                    "tileBytes": tile_bytes,
                    "packTiles": PACK_TILES,
                    "rangesPath": f"lod{lod}/ranges.bin",
                    "packPathTemplate": f"lod{lod}/pack_{{pack:04d}}.bin"
                })

            manifest = {
                "version": 2,
                "mode": "global-geodetic-block",
                "id": block["id"],
                "dataset": DATASET,
                "sourceProduct": block["source"],
                "referenceRadiusMeters": MOON_RADIUS_M,
                "nativeResolutionMeters": (2 * math.pi * MOON_RADIUS_M / 360.0) / PPD,
                "heightEncoding": "physical-meters",
                "sourceSampleScaleApplied": 0.5,
                "bounds": {
                    "south": block["south"], "north": block["north"],
                    "west": block["west"], "east": block["east"]
                },
                "levels": levels,
                "maxLod": max_lod,
                "attribution": "SLDEM2015: Barker et al. (2016), LOLA/LRO + SELENE Terrain Camera"
            }
            (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            print(f"[done] {block['id']} -> {out}")
    finally:
        if clean_cache:
            for p in (jp2, lbl):
                try:
                    p.unlink(missing_ok=True)
                except Exception as exc:
                    print(f"[warn] could not remove cache {p}: {exc}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--block", choices=sorted(BLOCKS))
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--index-only", action="store_true")
    parser.add_argument("--max-lod", type=int, default=DEFAULT_MAX_LOD)
    parser.add_argument("--output", default=str(Path(__file__).resolve().parents[2] / "public" / "moon" / "global"))
    parser.add_argument("--cache", default=str(Path(__file__).resolve().parent / "cache"))
    parser.add_argument("--no-download", action="store_true")
    parser.add_argument("--clean-cache", action="store_true")
    args = parser.parse_args()

    if args.max_lod < 0 or args.max_lod > 8:
        raise ValueError("--max-lod must be 0..8")

    output = Path(args.output).resolve()
    cache = Path(args.cache).resolve()
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    write_index(output, args.max_lod)

    if args.index_only:
        print(f"[done] global index -> {output / 'index.json'}")
        return

    if args.all:
        targets = list(BLOCKS.values())
    elif args.block:
        targets = [BLOCKS[args.block]]
    else:
        raise SystemExit("Specify --block ID, --all, or --index-only")

    for i, block in enumerate(targets, 1):
        print(f"\n=== [{i}/{len(targets)}] {block['id']} ===")
        build_block(block, output, cache, args.max_lod, args.no_download, args.clean_cache)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
