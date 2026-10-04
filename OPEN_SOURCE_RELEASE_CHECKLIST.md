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


## 2026-10-04 — Performance-aware rover photo mode

### Changes
- Replaced the one-click canvas screenshot with a dedicated driving Photo Mode.
- Added rover-locked orbit and free camera modes, FOV, roll, movement speed, HUD hiding, camera reset, and keyboard controls.
- Added offline pause, slow motion (0.05x/0.25x/0.5x), resume, and single-frame stepping so airborne moments can be held. Multiplayer sessions remain live and disable simulation pause/slow motion to avoid desynchronization.
- Added editable UTC scene lighting time, optional depth of field with rover focus or double-click focus picking, aperture and blur controls.
- Added Raw, Cinema, Warm and Monochrome looks plus exposure, contrast, saturation, color temperature, vignette and grain controls.
- Added Lunar Sim mission/date, coordinate stickers, custom caption, 1x/2x/4K PNG export, and automatic GPU maximum-texture-size limiting.
- Photo post-processing is dynamically imported only when Photo Mode is first opened. Normal Browse/Drive startup does not request PhotoMode.js or allocate its render targets. GPU post-processing resources are released on exit.
- Added English, Simplified Chinese, Japanese and Korean Photo Mode UI strings.

### Controls and behavior
- P or the PHOTO button opens/closes Photo Mode in Drive.
- Locked camera: drag to orbit and use the wheel to zoom.
- Free camera: drag to look; WASD moves; Q/E moves vertically; Shift accelerates; wheel changes movement speed.
- H toggles HUD visibility; Space pauses/resumes offline simulation; Left/Right Arrow advances one frame; Escape exits.
- Depth of field is disabled by default to protect frame rate.

### Backups
- Development index.html, src/main.js, src/i18n.js and WORKLOG.md were backed up with suffix .bak_20261004_112015.
- The synchronized open-source-copy files and release checklist were backed up with the same suffix. src/photo/PhotoMode.js is new.

### Validation
- JavaScript syntax checks passed for main.js, i18n.js and PhotoMode.js.
- Vite production build passed: Photo Mode emitted as a separate 30.20 kB chunk (8.23 kB gzip).
- Headless Edge regression passed: Browse loaded, Drive entered, Photo Mode opened, HUD hid, required controls existed, depth of field and Cinema preset rendered, PNG export completed, and exit restored the driving UI.
- Exported PNG dimensions and file integrity were verified.
- Lazy-load regression passed: PhotoMode.js was absent from startup resource requests and appeared only after opening Photo Mode.
- No uncaught JavaScript exceptions were observed.
- Synchronized to lunar sim. The GitHub test folder was not modified.


## 2026-10-04 — Photo Mode pause, slow-motion and frame-step fix

### Root cause
- Photo Mode disabled rover driving input, but RoverController.update returned immediately whenever input was disabled. This stopped the complete rover simulation, including inertia, airborne motion and gravity, so slow motion and frame step had no visible physical effect.
- The frame-step keyboard shortcut was also ignored while the time-rate select retained focus.

### Changes
- RoverController now separates input acceptance from physics advancement. Photo Mode blocks new throttle/steering/brake input while existing motion, suspension, airborne motion and gravity continue using the selected simulation delta.
- Selecting any nonzero time rate resumes simulation immediately; selecting 0x pauses it.
- STEP and Left/Right Arrow advance one 1/30-second simulation frame and remain paused afterward.
- Left/Right Arrow now work even when the time-rate select has focus, then remove focus so subsequent shortcuts remain reliable.
- Added visible localized simulation state: paused, current rate, and frame-advanced confirmation in English, Simplified Chinese, Japanese and Korean.

### Backups
- Development RoverController.js, PhotoMode.js, index.html, i18n.js and WORKLOG.md backed up with suffix .bak_20261004_123730.
- The synchronized lunar sim files and release checklist use the same backup suffix.

### Validation
- JavaScript syntax checks and Vite production build passed.
- Isolated physics regression: with input disabled and initial speed 6 m/s, a 0.5-second update advanced northing from 0 to 1.774666 m and reduced speed through normal drag, proving physics no longer stops with input.
- Headless Edge interaction regression: entering Photo Mode initially showed paused/0x; changing to 0.5x showed the running state and PAUSE action; pressing an arrow while the select had focus changed to 0x, showed RESUME and displayed the frame-advanced confirmation.
- No browser JavaScript exceptions observed.
- Synchronized to lunar sim. The GitHub test folder was not modified.


## 2026-10-04 — Photo Mode shortcut help and forward-step clarification

- Added visible Photo Mode shortcut help beneath the TIME controls: Space pause/resume, Right Arrow step, H HUD toggle, and Esc exit.
- Added P to the Photo Mode title so the entry/exit shortcut remains visible after the driving HUD is hidden.
- Added the new title and shortcut help in English, Simplified Chinese, Japanese and Korean.
- Removed Left Arrow from frame stepping. The current implementation has no rewind buffer, so only Right Arrow and STEP advance one frame; this avoids implying backward playback.
- Escape now exits Photo Mode even when a form control has focus.
- Development PhotoMode.js, index.html, i18n.js and WORKLOG.md backed up with suffix .bak_20261004_132342. Matching lunar sim files and its release checklist use the same suffix.
- JavaScript syntax and shortcut binding checks passed.
- Synchronized to lunar sim. The GitHub test folder was not modified.


## 2026-10-04 — Mode-specific Photo Mode camera guidance

- Replaced the combined camera help with live mode-specific status and controls.
- Rover Lock now shows only orbit and wheel zoom because free movement keys are inactive in that mode.
- Free Camera now shows look, movement-speed wheel control, WASD movement, Q/E height and Shift boost.
- Added an explicit current-camera-mode label. The toggle button now describes the action: switch to Free Camera while locked, or lock the rover while free.
- Added all new status, button and help strings in English, Simplified Chinese, Japanese and Korean.
- Development PhotoMode.js, index.html, i18n.js and WORKLOG.md backed up with suffix .bak_20261004_134824. Matching lunar sim files and release checklist use the same suffix.
- JavaScript syntax checks and headless Edge interaction tests passed. Both camera modes and all four language refreshes were verified with no JavaScript exceptions.
- Synchronized to lunar sim. The GitHub test folder was not modified.
