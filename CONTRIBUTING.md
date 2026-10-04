# Contributing

Contributions are welcome.

## Before opening a pull request

1. Install dependencies:

```bash
npm install
python -m pip install -r tools/lunar-data/requirements.txt
```

2. Build a practical local terrain set. LOD4 is the recommended development default:

```bash
python tools/lunar-data/download_moon_data.py --lod 4
```

3. Run the project:

```bash
npm run dev
```

4. Run relevant checks/tests for the area you changed.

5. Run a production build:

```bash
npm run build
```

## Do not commit generated lunar DEM data

The following directories are generated locally and intentionally ignored:

```text
public/moon/global/blocks/
public/moon/global/polar/
```

Do not commit raw source downloads or caches either.

## Data-pipeline changes

Changes to:

```text
build_global.py
build_polar.py
stitch_global.py
stitch_polar_boundary.py
GlobalHeightTileLoader.js
LunarTerrainManager.js
TerrainTile.js
```

should be treated carefully.

A terrain change can affect:

- quantization
- provider boundaries
- cross-block seams
- cross-LOD seams
- Floating Origin height sampling
- rover ground contact
- polar geometry

Please run the relevant terrain tests and document the validation performed.

## Scientific data

Do not silently replace or modify an upstream dataset while keeping the old attribution.

If you add or replace data:

- identify the provider;
- record the source URL/product;
- record the license/terms when known;
- explain preprocessing;
- update `DATA_SOURCES.md`.

## Third-party assets

Do not add models, textures, databases or other third-party content unless redistribution rights are clear.

The MIT project-code license does not override third-party licenses.

## Code style

The current codebase is plain JavaScript/ES modules plus Python data tooling.

Prefer:

- focused changes;
- deterministic data processing;
- explicit geographic units;
- meters for runtime distance/elevation;
- no hidden machine-specific absolute paths;
- no credentials in source control.

## Tests

Useful examples include:

```bash
node tools/lunar-data/test_camera_rebase.mjs
node tools/lunar-data/test_rover_camera_freedom.mjs
node tools/lunar-data/test_rover_gravity.mjs
node tools/lunar-data/test_lod_edge_morph.mjs
node tools/lunar-data/test_polar_runtime.mjs
node tools/lunar-data/test_polar_terrain_manager.mjs
node tools/lunar-data/test_polar_seam_v2.mjs
node tools/lunar-data/test_exploration_system.mjs
```

Some tests require generated terrain data.
