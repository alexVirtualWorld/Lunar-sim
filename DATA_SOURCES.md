# Data Sources and Attribution

This document records the scientific datasets and third-party data currently used by the project.

The repository's **MIT software license applies to project code only**. It does not automatically relicense scientific datasets, imagery, catalogs, models, or other third-party assets.

## 1. SLDEM2015

Use in this project:

- global/mid-latitude lunar elevation
- nominal runtime coverage: 60°S to 60°N
- source blocks converted into packed runtime DEM tiles
- runtime maximum supported LOD: 8

Source URL used by the build script:

```text
https://imbrium.mit.edu/EXTRAS/SLDEM2015/TILES/JP2/
```

Project builder:

```text
tools/lunar-data/build_global.py
```

Project attribution metadata:

> SLDEM2015: Barker et al. (2016), LOLA/LRO + SELENE Terrain Camera

Relevant publication cited by the project:

> Barker, M. K. et al. (2016), "A new lunar digital elevation model from the Lunar Orbiter Laser Altimeter and SELENE Terrain Camera", Icarus 273.

The generated `public/moon/global/blocks/` data is not committed to Git.

## 2. NASA/GSFC LOLA adjusted polar DEM

Use in this project:

- north polar terrain: 60°N to 90°N
- south polar terrain: 60°S to 90°S
- polar-stereographic source geometry
- nominal source resolution used by the project: 120 m/pixel

North source URL used by the build script:

```text
https://pgda.gsfc.nasa.gov/data/LOLA_20mpp_NP/LDEM_60N_120MPP_ADJ.TIF
```

South source URL used by the build script:

```text
https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_120MPP_ADJ.TIF
```

Project builder:

```text
tools/lunar-data/build_polar.py
```

The builder currently records:

> NASA/GSFC PGDA LOLA adjusted polar DEM; Barker et al. 2025, Planetary Science Journal 6, 83

The generated `public/moon/global/polar/` data is not committed to Git.

## 3. NASA CGI Moon Kit / LROC Browse imagery

Use in this project:

- global Moon texture in Browse Mode
- packaged 2K / 4K / 8K WebP derivatives

Project source reference:

```text
https://svs.gsfc.nasa.gov/4720/
```

Credit recorded by the project tool:

```text
NASA GSFC / LRO / LROC
```

Project tool:

```text
tools/lunar-data/build_browse_albedo.py
```

The current packaged Browse textures are:

```text
public/moon/albedo/browse-2048.webp
public/moon/albedo/browse-4096.webp
public/moon/albedo/browse-8192.webp
```

## 4. USGS / IAU Gazetteer of Planetary Nomenclature

Use in this project:

- official lunar place-name metadata
- Browse Mode map points and labels
- outbound official feature links
- exploration-location metadata

Official site:

```text
https://planetarynames.wr.usgs.gov/
```

The bundled compact Moon catalog was built from the USGS Gazetteer Moon center-point GIS product.

Project attribution file:

```text
public/data/moon/ATTRIBUTION.md
```

The project currently records the control network for that center-point product as:

```text
LOLA 2011
```

Bundled compact runtime catalog:

```text
public/data/moon/iau_moon_features.json
```

Official feature links remain USGS/IAU URLs.

## 5. NASA Blue Marble Earth surface

Use in this project:

- Earth surface texture in the lunar sky

Project attribution file records:

```text
NASA/GSFC Scientific Visualization Studio, Blue Marble, MODIS-derived
```

Source:

```text
https://svs.gsfc.nasa.gov/2915/
```

Credit recorded in the repository:

> NASA/Goddard Space Flight Center Scientific Visualization Studio; Blue Marble Next Generation data courtesy of Reto Stöckli (NASA/GSFC) and NASA Earth Observatory.

Packaged texture:

```text
public/textures/earth/earth_surface_nasa_2048.png
```

## 6. NASA Visible Earth / MODIS cloud composite

Use in this project:

- Earth cloud shell

Source:

```text
https://visibleearth.nasa.gov/images/57747/blue-marble-clouds
```

The repository attribution states that the packaged PNG is derived from the 2048×1024 grayscale MODIS/Terra cloud composite by converting luminance to transparency.

Important limitation:

- this is a real observed composite
- it is **not** live weather
- it is **not** date-matched to the user's simulated UTC time

Packaged texture:

```text
public/textures/earth/earth_clouds_nasa_modis_2048.png
```

## 7. HYG v4.1 star catalog

Use in this project:

- bright-star sky
- stars packaged to visual magnitude 6.5
- J2000 RA/Dec converted to unit vectors
- B-V color information used for approximate star color

Source:

```text
https://github.com/astronexus/HYG-Database
```

Repository attribution records:

```text
HYG v4.1
David Nash / Astronomy Nexus
License: CC BY-SA 4.0
```

Packaged runtime file:

```text
public/data/astronomy/hyg_bright_v41.json
```

Because HYG has its own license, do not treat this file as MIT-licensed project code.

## 8. Rover model

Runtime file:

```text
public/models/rover.glb
```

Provenance:

- created by the project owner using **Hunyuan**
- included as a project-created runtime asset
- not sourced from an external asset marketplace or third-party model repository

This section records provenance only; the rover model is not a scientific dataset and is separate from the NASA/USGS/IAU/HYG data sources listed above.

## 9. General scientific-use note

The project is a visualization/simulation project, not a certified navigation or mission-planning product.

DEM conversion, resampling, quantization, stitching, runtime interpolation, procedural near-field rendering, and vehicle physics may introduce differences from the original scientific products.

For scientific interpretation, always consult the original provider documentation and source datasets.
