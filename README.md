# Lunar Sim

A browser-based lunar simulator built with **Three.js, Vite, and Socket.IO**.

The project renders a real-scale Moon (`1 unit = 1 meter`) from lunar DEM data, supports global latitude/longitude driving with a floating origin, provides a Google-Earth-style lunar browser, reproduces the Sun/Earth/star sky by time, and adds exploration gameplay on top of official USGS/IAU lunar nomenclature.

![Browse Mode](docs/images/moon-browse.png)

![Drive Mode](docs/images/drive-mode.png)

## Highlights

- Real lunar reference radius: **1,737,400 m**
- Global terrain:
  - **SLDEM2015 512 ppd** for 60°S–60°N
  - **NASA/GSFC LOLA adjusted polar DEM** for 60°–90° north and south
- Runtime quadtree LOD, packed DEM tiles, cross-LOD seam handling, and floating origin
- Progressive terrain loading: the landing area becomes drivable before the full far field is built
- Third-person rover with adjustable gravity, headlights, free camera, camera recenter, odometer, and route history
- Browse Mode with official USGS/IAU Moon place names and exploration filters
- 9,000+ adopted lunar nomenclature features in the bundled compact catalog
- Deterministic local exploration POIs, area completion, and unlockable obelisks
- Date/time-controlled Sun and Earth directions, Earth phase, NASA Earth textures/cloud layer, and a real bright-star catalog
- Socket.IO multiplayer state synchronization
- English, Simplified Chinese, Japanese, and Korean interface with a persisted language preference
- Optional Debug HUD for terrain-provider, block, LOD, cache, floating-origin, and rover diagnostics

## Important: terrain data is not stored in Git

The generated DEM folders are intentionally excluded:

```text
public/moon/global/blocks/
public/moon/global/polar/
```

They are built locally from the upstream scientific datasets.

The code repository stays small; each user can choose a maximum LOD appropriate for their disk and setup.

## Quick start

### Requirements

- Node.js 20+ recommended
- Python 3.10+
- A modern desktop browser with WebGL2
- Enough disk space for the LOD you choose

### 1. Install dependencies

```bash
npm install
python -m pip install -r tools/lunar-data/requirements.txt
```

### 2. Download/build lunar terrain

**Recommended: Use Pre-processed Data**
To save time, you can download the pre-processed LOD0-4 terrain data directly without running the build script.
1. Go to the [Releases page](https://github.com/alexVirtualWorld/Lunar-sim/releases/tag/data-v1) and download `blocks.zip` and `polar.zip` from the Assets section.
2. Extract the zip files.
3. Place the extracted files into the `public/moon/global/blocks` and `public/moon/global/polar` directories within your project, respectively.

**Alternative: Build from source**
If you prefer to download and build the data yourself, you can run the python script:
```bash
python tools/lunar-data/download_moon_data.py
```

This defaults to **LOD4** and builds:

```text
LOD0
LOD1
LOD2
LOD3
LOD4
```

In other words, `--lod 4` means **maximum LOD 4**, not “LOD4 only”.

Choose another maximum level:

```bash
python tools/lunar-data/download_moon_data.py --lod 6
```

Maximum detail:

```bash
python tools/lunar-data/download_moon_data.py --lod 8
```

The wrapper reuses the project's existing scientific build pipeline:

```text
SLDEM source download/build
  -> global block stitching
LOLA polar download/build
  -> ±60° polar boundary stitching
  -> seam validation
```

### Approximate generated DEM size

Measured from the current complete dataset layout (global blocks + both polar providers):

| Max LOD | Approx. generated size |
|---:|---:|
| 0 | 0.4 MiB |
| 1 | 1.5 MiB |
| 2 | 5.8 MiB |
| 3 | 23.4 MiB |
| **4** | **93.6 MiB** |
| 5 | 374.4 MiB |
| 6 | 1.46 GiB |
| 7 | 5.85 GiB |
| 8 | 23.40 GiB |

These are measurements from this project's current packed format, not guaranteed download sizes from the upstream servers.

### Data builder options

Build both data families (default):

```bash
python tools/lunar-data/download_moon_data.py --lod 4 --part all
```

Build only the 60°S–60°N SLDEM blocks:

```bash
python tools/lunar-data/download_moon_data.py --lod 4 --part global
```

Build only polar data after a global build already exists:

```bash
python tools/lunar-data/download_moon_data.py --lod 4 --part polar
```

Validate existing seam data without rebuilding:

```bash
python tools/lunar-data/download_moon_data.py --validate-only
```

Keep upstream JP2/TIF source caches:

```bash
python tools/lunar-data/download_moon_data.py --keep-cache
```

Show the commands without changing data:

```bash
python tools/lunar-data/download_moon_data.py --dry-run
```

### 3. Run

```bash
npm run dev
```

Development services:

```text
Vite / Three.js: http://localhost:5173
Socket.IO server: http://localhost:3000
```

Production build:

```bash
npm run build
```

## Controls

### Drive Mode

| Input | Action |
|---|---|
| W / S | Accelerate / brake / reverse |
| A / D | Steer |
| Shift | Handbrake |
| Mouse drag | Orbit third-person camera |
| L | Toggle headlights |
| C | Recenter camera |
| B | Open Browse Mode |
| P | Take photo |
| R | Reload/reset the current landing site |
| F10 | Toggle the Debug HUD |

The UI also provides configurable gravity from 0 to 274.8 m/s², with presets for the Moon, planets, and the Sun.

### Browse Mode

- Orbit/pan/zoom the Moon
- Click the lunar surface to choose a landing position
- Click a displayed official place name/point for USGS/IAU information
- Start driving from the selected coordinate
- Toggle map layers:
  - longitude/latitude grid
  - place names / points
  - exploration status filter
  - recorded route
- Enable the Debug HUD to show the ±60° SLDEM/LOLA provider boundaries

Place filters:

```text
ALL
UNEXPLORED
IN PROGRESS
EXPLORED
```

## Terrain architecture

The rover's authoritative position is geographic:

```text
latitude
longitude
elevation
```

Nearby terrain is rendered in a local ENU-like frame:

```text
East / Up / North
```

A **Floating Origin** recenters the render frame while geographic coordinates remain unchanged. This avoids feeding Moon-scale absolute positions directly to Float32 GPU geometry.

Runtime terrain flow:

```text
lat/lon
  -> global DEM provider lookup
  -> block/polar tile selection
  -> distance-based LOD
  -> local terrain mesh
  -> floating-origin transform
  -> rover/camera
```

The global mid-latitude blocks use equirectangular SLDEM data. Polar providers remain in polar-stereographic space and are converted at runtime.

See [ARCHITECTURE.md](ARCHITECTURE.md) for more detail.

## Project layout

```text
src/
  astronomy/    Sun, Earth, stars, time-based sky
  browse/       global lunar Browse Mode
  exploration/  POIs, progress, route, obelisks
  geo/          lunar coordinates and floating origin
  materials/    lunar regolith rendering
  network/      Socket.IO multiplayer
  terrain/      DEM loading, LOD selection and meshes
  ui/           HUD and local minimap
  vehicle/      rover, visual rig and camera

server/
  index.mjs     multiplayer server

tools/lunar-data/
  download_moon_data.py      user-facing data setup
  build_global.py            SLDEM block builder
  stitch_global.py           SLDEM block seam stitching
  build_polar.py             LOLA polar builder
  stitch_polar_boundary.py   direct ±60° boundary stitch
  requirements.txt
  test_*.mjs                 data/runtime regression tests

public/
  data/         astronomy + lunar nomenclature metadata
  models/       rover runtime model
  moon/
    albedo/     Browse Mode Moon imagery
    global/
      index.json
      blocks/   generated locally; not committed
      polar/    generated locally; not committed
  textures/     Earth surface/cloud textures
```

## Data and attribution

Scientific datasets and third-party assets are **not covered automatically by the MIT software license**.

See [DATA_SOURCES.md](DATA_SOURCES.md) for the sources currently used by the project, including:

- SLDEM2015
- NASA/GSFC LOLA polar DEM
- NASA CGI Moon Kit / LROC imagery
- USGS / IAU Gazetteer of Planetary Nomenclature
- NASA Blue Marble / MODIS Earth imagery
- HYG v4.1 star catalog

### Rover model

The runtime rover model is:

```text
public/models/rover.glb
```

This model was created by the project owner using **Hunyuan**. It is a project-created asset, not a model downloaded from an external asset marketplace or third-party model repository.

## Tests

Examples:

```bash
node tools/lunar-data/test_polar_runtime.mjs
node tools/lunar-data/test_polar_terrain_manager.mjs
node tools/lunar-data/test_polar_seam_v2.mjs
node tools/lunar-data/test_lod_edge_morph.mjs
node tools/lunar-data/test_exploration_system.mjs
node tools/lunar-data/test_browse_layers_filters.mjs
node tools/lunar-data/test_open_source_ui_i18n.mjs
```

Some terrain tests require the corresponding generated DEM data to exist.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

In particular, do not commit generated `blocks/`, `polar/`, source-cache files, or local build output.

## License

Project source code is released under the [MIT License](LICENSE).

That license applies to this repository's project code. It does **not** relicense NASA/USGS/IAU datasets, HYG data, imagery, or other third-party scientific/data assets. The included rover model is a project-created Hunyuan-generated asset; see [DATA_SOURCES.md](DATA_SOURCES.md) for provenance notes.
