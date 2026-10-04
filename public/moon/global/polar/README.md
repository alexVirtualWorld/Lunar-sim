# Generated LOLA polar data

This directory is intentionally empty in Git.

Generate both north and south polar providers together with the default global build:

```bash
python tools/lunar-data/download_moon_data.py
```

Or build only polar data after the global blocks already exist:

```bash
python tools/lunar-data/download_moon_data.py --lod 4 --part polar
```

Do not commit the generated polar pack/range files.
