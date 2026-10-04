# Architecture

This document describes the current runtime architecture of the lunar rover project.

## Coordinate model

The project deliberately separates geographic state from render-space coordinates.

### Authoritative geographic state

The rover's persistent position is expressed in lunar geographic coordinates:

```text
latitude
longitude
elevation
heading
```

This state remains meaningful across:

- long-distance travel
- Floating Origin recentering
- multiplayer clients using different local origins
- route recording
- Browse Mode transitions

### Local ENU-like frame

Nearby terrain is projected into a local frame approximately equivalent to:

```text
East / Up / North
```

The core coordinate helpers live in:

```text
src/geo/LunarCoordinates.js
src/geo/FloatingOrigin.js
```

## Floating Origin

The Moon has a reference radius of 1,737,400 m. Keeping the whole simulation in a single Float32 world coordinate frame would degrade near-field precision.

The project therefore keeps high-precision geographic state and periodically recenters the render frame around the rover.

Conceptually:

```text
geographic position
    -> local east/north
    -> subtract Floating Origin
    -> Three.js render position
```

Main implementation:

```text
src/geo/FloatingOrigin.js
```

Terrain, rover, camera and route rendering are written to tolerate rebasing.

## Terrain providers

### Mid-latitudes

```text
60°S .. 60°N
```

Provider:

```text
SLDEM2015 512 ppd
```

The project divides the source into 32 source blocks:

```text
4 latitude bands × 8 longitude blocks
```

Each block is represented by a packed LOD pyramid.

### Polar regions

```text
60°N .. 90°N
60°S .. 90°S
```

Provider:

```text
NASA/GSFC LOLA adjusted polar DEM
```

The source remains polar-stereographic. Runtime code converts between geographic lat/lon and polar X/Y rather than forcing the poles into the equirectangular block layout.

Primary loader:

```text
src/terrain/GlobalHeightTileLoader.js
```

## Runtime terrain flow

```text
rover lat/lon
    ↓
provider lookup
    ↓
tile / block lookup
    ↓
distance-based LOD selection
    ↓
DEM decode / cache
    ↓
TerrainTile mesh generation
    ↓
Floating Origin transform
    ↓
Three.js scene
```

Primary files:

```text
src/terrain/GlobalHeightTileLoader.js
src/terrain/LunarTerrainManager.js
src/terrain/TerrainTile.js
```

## Packed DEM format

Each DEM tile is sampled on a fixed grid:

```text
65 × 65 samples
```

Runtime storage uses:

- UInt16 quantized samples
- per-tile min/max ranges
- `ranges.bin`
- pack files containing multiple tiles

This reduces file count and browser request overhead compared with storing every tile as a separate file.

## LOD

For a source block, tile count grows as:

```text
LOD0   1 × 1
LOD1   2 × 2
LOD2   4 × 4
...
LOD8 256 × 256
```

`--lod N` in the open-source downloader means the build contains all levels from LOD0 through LODN.

Runtime LOD selection is distance-based.

## Seam handling

The source products are not assumed to meet perfectly at provider or block boundaries.

The data pipeline performs two separate stitching steps.

### SLDEM block seams

```text
tools/lunar-data/stitch_global.py
```

It reconciles:

- east/west block edges
- north/south block edges
- 360° / 0° wrap
- shared block corners

### SLDEM / polar boundary

```text
tools/lunar-data/stitch_polar_boundary.py
```

At ±60°, the current implementation rewrites the outer SLDEM edge to the corresponding sampled LOLA polar boundary.

Runtime mesh logic then handles the geometry difference between equirectangular and polar-stereographic providers.

## Progressive loading

Driving no longer waits for the full far-radius terrain set.

Activation is split into:

1. landing-critical terrain near the rover;
2. immediate Drive Mode entry;
3. background tile loading;
4. frame-budgeted terrain mesh construction.

Primary implementation:

```text
src/terrain/LunarTerrainManager.js
```

This reduces the user-visible delay when entering Drive Mode.

## Rover

Core files:

```text
src/vehicle/RoverController.js
src/vehicle/RoverVisual.js
src/vehicle/RoverCamera.js
```

The rover includes:

- terrain-following / airborne motion
- configurable gravity
- headlights
- steering / braking
- third-person orbit camera
- camera recenter
- Floating Origin-aware camera state

## Browse Mode

Primary implementation:

```text
src/browse/LunarBrowse.js
```

Responsibilities include:

- global Moon browsing
- progressive Browse albedo
- landing-point selection
- official lunar nomenclature
- map-place LOD and label filtering
- global rover route display
- grid / ±60° reference overlay

## Exploration

Primary implementation:

```text
src/exploration/ExplorationManager.js
```

Persistent exploration state includes:

- total driven distance
- route samples stored as lat/lon
- discovered POIs
- completed lunar features
- unlocked obelisks
- visibility preferences

Local POIs are deterministic from official feature IDs. When loaded DEM samples are available, POI semantic classification can use local relief/slope information.

## Astronomy

Primary implementation:

```text
src/astronomy/LunarCelestialSystem.js
```

Current sky system includes:

- Sun direction
- Earth direction and phase
- Earth surface/cloud layers
- HYG bright-star catalog
- UTC time controls
- lunar-night fill / Earthshine

## Multiplayer

Primary implementation:

```text
src/network/Multiplayer.js
server/index.mjs
```

The server uses Socket.IO.

Clients exchange geographic/vehicle state rather than assuming every client uses an identical Three.js world origin.

## Build/data separation

The repository intentionally separates source code from generated DEM output.

Tracked:

```text
source code
scientific-data build scripts
small runtime metadata/assets
```

Not tracked:

```text
public/moon/global/blocks/
public/moon/global/polar/
raw downloaded JP2/TIF cache
node_modules/
dist/
```

The user-facing entry point for terrain generation is:

```bash
python tools/lunar-data/download_moon_data.py
```
