#!/usr/bin/env python3
"""Build the lunar DEM runtime data from the project's official source scripts.

Default:
    python tools/lunar-data/download_moon_data.py

This builds BOTH data families at max LOD 4:
    - SLDEM2015 global blocks (60°S..60°N)
    - LOLA north/south polar providers (60°..90°)

"--lod N" means max LOD N, i.e. levels LOD0 through LODN are generated.
The scientific conversion/stitching logic remains in build_global.py,
build_polar.py, stitch_global.py and stitch_polar_boundary.py.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "lunar-data"
GLOBAL_ROOT = ROOT / "public" / "moon" / "global"


def run(cmd: list[str], *, dry_run: bool = False) -> None:
    printable = " ".join(f'"{part}"' if " " in part else part for part in cmd)
    print(f"\n> {printable}")
    if dry_run:
        return
    subprocess.run(cmd, cwd=ROOT, check=True)


def python_cmd(script: str, *args: str) -> list[str]:
    return [sys.executable, str(TOOLS / script), *args]


def have_global_blocks() -> bool:
    blocks = GLOBAL_ROOT / "blocks"
    return blocks.exists() and any(blocks.glob("*/manifest.json"))


def have_polar() -> bool:
    return (
        (GLOBAL_ROOT / "polar" / "north" / "manifest.json").exists()
        and (GLOBAL_ROOT / "polar" / "south" / "manifest.json").exists()
    )


def validate(part: str, *, dry_run: bool = False) -> None:
    if part in ("all", "global"):
        if not have_global_blocks() and not dry_run:
            raise RuntimeError(
                "Global blocks are missing. Build them first, or omit --validate-only."
            )
        run(python_cmd("stitch_global.py", "--validate-only"), dry_run=dry_run)

    if part in ("all", "polar"):
        if (not have_global_blocks() or not have_polar()) and not dry_run:
            raise RuntimeError(
                "Polar validation needs both global blocks and both polar providers."
            )
        run(
            python_cmd("stitch_polar_boundary.py", "--validate-only"),
            dry_run=dry_run,
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download/build lunar DEM data for the Three.js lunar rover."
    )
    parser.add_argument(
        "--lod",
        type=int,
        choices=range(0, 9),
        default=4,
        metavar="0..8",
        help="Maximum LOD to generate. LOD0..LODN are built. Default: 4.",
    )
    parser.add_argument(
        "--part",
        choices=("all", "global", "polar"),
        default="all",
        help="Data family to build. Default: all.",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Do not download/build; only validate existing stitched seams.",
    )
    parser.add_argument(
        "--keep-cache",
        action="store_true",
        help="Keep downloaded source JP2/TIF files after conversion.",
    )
    parser.add_argument(
        "--no-download",
        action="store_true",
        help="Use existing source cache only; fail if source files are missing.",
    )
    parser.add_argument(
        "--skip-stitch",
        action="store_true",
        help="Skip seam stitching (not recommended for normal use).",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip the final seam validation pass.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the commands that would run without changing data.",
    )
    args = parser.parse_args()

    print("Lunar DEM setup")
    print(f"  repository : {ROOT}")
    print(f"  output     : {GLOBAL_ROOT}")
    print(f"  part       : {args.part}")
    print(f"  max LOD    : {args.lod} (builds LOD0..LOD{args.lod})")
    print(f"  source cache kept: {args.keep_cache}")

    if args.validate_only:
        validate(args.part, dry_run=args.dry_run)
        print("\nValidation complete.")
        return

    clean_arg = [] if args.keep_cache else ["--clean-cache"]
    no_download_arg = ["--no-download"] if args.no_download else []

    if args.part in ("all", "global"):
        run(
            python_cmd(
                "build_global.py",
                "--all",
                "--max-lod",
                str(args.lod),
                *clean_arg,
                *no_download_arg,
            ),
            dry_run=args.dry_run,
        )
        if not args.skip_stitch:
            run(python_cmd("stitch_global.py"), dry_run=args.dry_run)

    if args.part == "polar" and not args.dry_run:
        if not (GLOBAL_ROOT / "index.json").exists() or not have_global_blocks():
            raise RuntimeError(
                "--part polar requires an existing global build. "
                "Run with --part all, or build --part global first."
            )

    if args.part in ("all", "polar"):
        run(
            python_cmd(
                "build_polar.py",
                "--all",
                "--max-lod",
                str(args.lod),
                *clean_arg,
                *no_download_arg,
            ),
            dry_run=args.dry_run,
        )
        if not args.skip_stitch:
            # Freshly generated data does not need a pre-stitch backup archive.
            run(
                python_cmd("stitch_polar_boundary.py", "--no-backup"),
                dry_run=args.dry_run,
            )

    # Rebuilding only the mid-latitude blocks changes the ±60° boundary.
    # If polar data already exists, re-stitch that provider boundary too.
    if (
        args.part == "global"
        and not args.skip_stitch
        and (args.dry_run or have_polar())
    ):
        run(
            python_cmd("stitch_polar_boundary.py", "--no-backup"),
            dry_run=args.dry_run,
        )

    if not args.skip_validation and not args.skip_stitch:
        validate(args.part, dry_run=args.dry_run)

    if not args.dry_run and (GLOBAL_ROOT / "index.json").exists():
        index = json.loads((GLOBAL_ROOT / "index.json").read_text(encoding="utf-8"))
        print("\nGenerated index:")
        print(f"  dataset    : {index.get('dataset')}")
        print(f"  maxLod     : {index.get('maxLod')}")
        print(f"  globalCoverage: {index.get('globalCoverage', False)}")

    print("\nDone.")
    print("Start the project with: npm run dev")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        print(f"\nERROR: command failed with exit code {exc.returncode}", file=sys.stderr)
        raise SystemExit(exc.returncode)
    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
