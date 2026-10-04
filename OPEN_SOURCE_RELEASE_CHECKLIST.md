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
