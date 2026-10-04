# Open-Source Release Checklist

This folder was prepared as a clean GitHub upload copy.

Before making the repository public, verify the items below.

## Required checks

- [x] Record rover-model provenance: `public/models/rover.glb` was created by the project owner using Hunyuan.
- [ ] Replace the generic MIT copyright line (`Project contributors`) with the preferred copyright holder if desired.
- [ ] Review `DATA_SOURCES.md` and keep upstream attribution when assets/data are changed.
- [ ] Confirm the three screenshots in `docs/images/` are acceptable to publish.
- [ ] Run `git status` before the first commit and confirm generated DEM files are not staged.
- [ ] Do not use `git add -f` on `public/moon/global/blocks/` or `public/moon/global/polar/`.

## Recommended first Git commands

From this folder:

```bash
git init
git add .
git status
git commit -m "Initial open-source release"
```

Then create an empty GitHub repository and add its remote URL.

## Expected generated-data state

Before terrain download, these directories should contain only their README files:

```text
public/moon/global/blocks/
public/moon/global/polar/
```

The tracked `public/moon/global/index.json` is a lightweight LOD4 starter index. Running the data builder rewrites it to match the locally generated dataset.

## Local validation performed when this release folder was prepared

- Python data scripts compiled successfully.
- `download_moon_data.py --lod 4 --dry-run` resolved the expected build/stitch/validation pipeline.
- A clean max-LOD4 global index was generated.
- `npm install` completed with 0 reported vulnerabilities at preparation time.
- `npm run build` completed successfully.

## 2026-10-04 UI synchronization

The public repository copy was updated from the active Lunar Sim development project with:

- the simplified Lunar Sim interface;
- English, Simplified Chinese, Japanese, and Korean localization;
- the optional Debug HUD and F10 shortcut;
- the separate Debug-only SLDEM/LOLA provider-boundary overlay;
- localized Browse/Drive, exploration, multiplayer, minimap, gravity, and celestial UI;
- updated Browse filter and UI/i18n regression tests;
- README controls and feature documentation for the new UI.

Files synchronized:

```text
index.html
src/main.js
src/i18n.js
src/browse/LunarBrowse.js
src/ui/RoverMiniMap.js
src/network/Multiplayer.js
tools/lunar-data/test_browse_layers_filters.mjs
tools/lunar-data/test_open_source_ui_i18n.mjs
```

Validation after synchronization:

- JavaScript syntax checks passed.
- Four-language translation coverage passed: 129 keys per language.
- Browse filter, stable-label, exploration feedback, headlights, and camera recenter tests passed.
- Vite production build passed with 57 modules.
- Isolated Edge smoke test passed for all four language switches and the Debug HUD, with no uncaught JavaScript exceptions.
- `npm ci` reported 0 vulnerabilities.
- Generated lunar DEM directories remained untracked and were not copied.

## 2026-10-04 — Defer driving DEM until explicit Drive entry

- Removed main.js's 120 ms landing prefetch timer, obsolete serial state, and selection-triggered prefetch call.
- Initial default selection and subsequent Browse selections now request only overview terrain (LOD0–2); they do not request the selected block's maximum-LOD driving samples.
- Explicit Drive entry still uses the existing switchSite/activateAt path, ground validation, critical landing meshes, and progressive far-field loading.
- Applied to both the development project and the open-source copy.
- Backups: src/main.js and this record file, suffix .bak_20261004_085015.
- Validation: JavaScript syntax, UI/i18n regression, and Vite production build passed.
- Browser network regression with browser cache disabled and a complete LOD8 dataset: initial Browse and two selections produced zero LOD3–8 pack requests. After clicking Drive, detailed terrain was requested, driving became available, and Browse/Drive return worked. No uncaught JavaScript exceptions.
- This removes premature driving-data requests; it does not eliminate the landing preparation required on the first explicit Drive entry. No measured speedup is claimed.

## 2026-10-04 — Development startup watcher and Browse imagery performance

### Changes
- Added vite.config.js with dependency scanning limited to index.html.
- Excluded public/, offline tools/, docs/, and .bak_* files from development watching. Ignoring parent directories prevents recursive watcher registration across generated DEM data.
- Source directories remain watched. Public assets are still served normally; production public-file copying is unchanged. After changing public assets, manually refresh the browser (automatic asset-triggered reload is disabled).
- LunarBrowse.js now uses 2K imagery for the initial global view. 4K requires camera distance below 270; 8K below 180. Upgrades wait for completed overview terrain and 2.5 seconds without camera interaction, in active/nonbusy Browse mode.
- Upgrade eligibility is checked both before fetching and before assigning the texture. A high-resolution upload may still briefly stall when a close-view upgrade occurs; it is removed from the default startup path, not made asynchronous.
- Same vite.config.js and LunarBrowse.js installed in development and open-source directories.
- Restart npm run dev to ensure the newly added Vite configuration is loaded.

### Backups
- Existing LunarBrowse.js and record files backed up with suffix .bak_20261004_092514 in both relevant directories.
- vite.config.js is new; remove that new file to revert configuration, and restore the corresponding Browse backup.

### Validation
- Full LOD8 data kept in place.
- Before: independent first-page HTTP requests timed out at 12/20 seconds; server profiler attributed about 13.2 of 15 seconds to filesystem watcher setup.
- After: fresh-server first-page HTTP response about 191 ms (Vite reported readiness in 1.817 seconds in that run).
- Comparable isolated headless Edge measurements: first contentful paint changed from 5.904 s to 0.856 s; first WebGL draw from 5.963 s to 0.899 s. These are local test results, not guaranteed timings on every browser.
- Initial texture upload: only 2K, about 40 ms in the measured run, instead of the previous 8K upload taking about 661 ms. Warm reload 2K upload was about 93 ms.
- Actual watcher inspection: 14 watched directories; src present; public/tools absent.
- High-LOD asset serving verified: LOD8 pack returned HTTP 200 and 2,163,200 bytes.
- Browser interaction regression: no startup 8K request; close zoom plus settled interaction successfully upgraded to 8K; no LOD3–8 requests on startup or two Browse selections; explicit Drive requested detailed data and entered Drive; Browse/Drive return and language refresh passed; no uncaught JavaScript exceptions.
- Syntax checks, Browse filter/stable-label regression, UI/i18n regression, and Vite production build passed.
- Temporary test servers/browser processes closed. No Git commit or push performed.
