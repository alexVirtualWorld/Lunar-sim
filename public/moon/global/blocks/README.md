# Generated SLDEM blocks

This directory is intentionally empty in Git.

Generate the 60°S–60°N global SLDEM runtime data with:

```bash
python tools/lunar-data/download_moon_data.py
```

Default maximum LOD: **4**.

For example:

```bash
python tools/lunar-data/download_moon_data.py --lod 6 --part global
```

`--lod 6` builds LOD0 through LOD6.

Do not commit the generated pack/range files.
