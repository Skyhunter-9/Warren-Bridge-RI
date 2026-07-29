# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An iTwin.js web viewer (scaffolded from Bentley's `itwin-web-viewer-template` via degit) for the
"Warren Bridge" iModel, extended with a custom IoT sensor layer: colored markers in the 3D view
that link to live (simulated or real-hardware) structural/environmental telemetry charts.

## Commands

- `npm start` — runs the Vite dev server at `http://localhost:3000` (requires `.env` configured, see below)
- `npm run build` — `tsc -b && vite build`; use this (not a separate `tsc` invocation) to typecheck, since `tsconfig.json` has `noEmit: true` and is a build-mode config (`tsc -b`)
- `npm run lint` — ESLint over the whole repo
- `npm run preview` — serves the production `dist` build on port 3000
- `cd python && .venv\Scripts\activate && uvicorn api.main:app --reload --port 8000` — runs the
  separate Python signal-processing backend (see "Python backend" below); the dashboard's
  Geophone Displacement card needs this running to show anything other than a connection error

There is no test suite (`"test": ""` in package.json, no test files present) for the TS app;
`python/geophonetest/displacement.py demo` is the closest thing on the Python side (a
synthetic self-check, not an automated test suite either).

### Required `.env`

The app throws at startup (see `src/index.tsx`) if any of `IMJS_AUTH_CLIENT_CLIENT_ID`,
`IMJS_AUTH_CLIENT_SCOPES`, or `IMJS_AUTH_CLIENT_REDIRECT_URI` are missing. `IMJS_AUTH_CLIENT_LOGOUT_URI`
and `IMJS_AUTH_AUTHORITY` are also read (see `Authorization.tsx`) but not guarded by a startup
check. Also `IMJS_ITWIN_ID`/`IMJS_IMODEL_ID` (or pass `?iTwinId=...&iModelId=...` in the URL instead
— see `src/components/Routes.tsx`). Sensor-service mode is controlled by `VITE_SENSOR_MODE`
(`SIMULATED` default, or `REAL` — see `VITE_COMPANY_A_URL`
/ `VITE_COMPANY_B_URL` for vendor endpoints); the same switch also gates the wave radar display
(see `VITE_RADAR_VENDOR_URL`, `src/radar/radarprocessing/radarService.ts`). `VITE_PYTHON_API_URL`
points at the separate Python signal-processing backend, shared by every "result script" endpoint
(see "Python backend" below) — unlike the other vendor URLs, this one isn't gated by
`VITE_SENSOR_MODE` since Python handles its own simulated/real distinction internally. See
`README.md` for how to obtain OIDC/iTwin/iModel values.

## Architecture

### App shell and auth

`src/index.tsx` → `src/components/Routes.tsx` (TanStack Router) → `RootLayout.tsx` (theme +
error boundary + `AuthorizationProvider`) → `App.tsx` (the actual iTwin `<Viewer>`).
`Authorization.tsx` wraps `BrowserAuthorizationClient` in a React context; sign-in is silent-first,
falling back to a full redirect to Bentley's login, landing back at the `/signin-callback` route.

### Custom side-panel tabs

Each tab is a `UiItemsProvider` class (id + `provideWidgets`) registered in the `uiProviders` array
in `App.tsx`. All of this app's tabs use `StagePanelLocation.Right` + `StagePanelSection.Start`, so
they stack together in the same right-side panel group. `src/Templates/WidgetTemplate.tsx` is a
copy-paste starting point for adding a new one (component + provider class), with the exact
import/registration snippet to paste into `App.tsx`.

Existing tabs: `MyCustomUiProvider.tsx` (IoT Dashboard), `ProcessedResultsUiProvider.tsx`
(Processed Results — charts backed by real signal-processing math from the Python backend,
kept separate from IoT Dashboard's raw/simulated sensor charts; content lives in
`ProcessedResultsDashboard.tsx`), `Developer_Tab.tsx` (Hex ID inspector — click an element to
copy its ID to clipboard, used to populate sensor lists), `SensorInspectorTab.tsx`
(Sensor Station Registry — lists configured sensors per type with resolved coordinates).
`UiProviders.tsx` holds the built-in model tree / property grid providers (from
`@itwin/tree-widget-react` / `@itwin/property-grid-react`), both sharing `selectionStorage.ts`
(a single `@itwin/unified-selection` store, so selecting an element highlights consistently across
panels).

### Sensor system (`src/Sensors/`)

This is the core custom feature, spanning several coordinated modules:

- **`SensorIcons.ts`** — `SENSOR_GROUPS`: the single source of truth for sensor types (gnss,
  accelerometer, strainGauge, waterLevel, waterVelocity, scour), each with a color, icon URL, an
  `expectedCount`, and an `elementIds: string[]` array of real element Hex IDs. **This is the file
  to edit to add/remove physical sensors** — grab a Hex ID via the Developer Tab and paste it into
  the right group's array. Also defines `ElementIconMarker` (an iTwin.js `Marker` subclass) whose
  `onMouseButton` fires a click event (see below).
- **`resolveSensorPosition.ts`** — given an element ID, resolves its real world-space marker
  position. Important nuance: `placement.origin` alone is *not* reliable (can sit at a local/model
  origin far from the visible geometry) — this transforms the element's own bbox through its
  placement via `Placement3d.calculateRange()` to land the marker on the actual geometry. This bug
  (marker rendering at world 0,0 instead of on the element) has already been hit once; don't
  simplify this back to raw `origin.x/y/z`.
- **`SensorDecorator.tsx`** — an iTwin.js `Decorator` (registered in `App.tsx`'s `onIModelAppInit`)
  that walks `SENSOR_GROUPS`, resolves each element's position, and draws the markers every frame.
  Caches one icon image per icon URL.
- **`SensorService.ts`** — data layer, decoupled from the 3D viewer entirely. `getMode()` switches
  on `VITE_SENSOR_MODE`: `generateSimulatedData()` fabricates deterministic sine/cosine-based
  telemetry; `fetchRealHardwareData()` calls vendor HTTP APIs in parallel with per-field fallback,
  and falls back to simulated data entirely if the whole batch throws.
- **`sensorDataStore.ts`** — single app-wide polling loop (1/sec) and snapshot buffer, started as
  an eager module-level singleton (same pattern as `selectionStorage.ts`). Exists so live data
  isn't tied to any one component's mount state — both the IoT Dashboard tab and marker-click
  popups read from this same buffer, so there's exactly one poll per second regardless of how many
  consumers are watching.
- **`chartData.ts`** — `buildChartData()` flattens nested `SensorSnapshot`s into flat
  `acc_0_X`/`gnss_1_E`/`sg_3`-style keys for Recharts; `getSensorSeries(sensorType, nodeIndex)` maps
  a specific sensor (by type + its 0-based index within that type's `elementIds` array) to the
  chart series it corresponds to. This is the link between a clicked marker and the chart it opens.
- **`sensorGraphRequest.ts`** — a `BeEvent` (from `@itwin/core-bentley`) bridging a marker click
  (which happens imperatively inside the iTwin.js decorator, entirely outside the React tree) over
  to `SensorGraphPopup.tsx`, which subscribes to it. This is the standard pattern for wiring
  non-React iTwin.js callbacks (decorators, tool events) into React state in this codebase.

`SensorGraphPopup.tsx` is mounted once in `App.tsx` as a sibling of `<Viewer>` (not one of the
AppUI tabs), so a marker's popup chart can appear regardless of which side tab is currently open.

`IoTDashboard.tsx` (rendered inside the "IoT Dashboard" tab) mirrors `sensorDataStore` rather than
polling itself, and reuses `buildChartData`/the same field-naming convention as the popup so both
stay in sync.

### Wave radar display (`src/radar/radarprocessing/`, `src/radar/radargraph/`)

Two chart cards rendered under the Hydrology Summary card in `IoTDashboard.tsx`, for a
**Geolux LX80-O** — a fixed, non-contact microwave (Doppler) wave/tide sensor. Modeling this
correctly matters: it has no rotating antenna (there's nothing to scan, unlike marine
navigation radar), and being a single fixed beam it cannot resolve wave *direction* at all
(that needs multiple sensors or a scanning array) — only period/frequency. An earlier version
of this feature assumed a rotating PPI sweep with a directional wave-energy plot; both were
wrong and were replaced with what's described below. Both folders live under `src/radar/` and
are split the same way the rest of this app separates data from rendering: `radarprocessing/`
owns data/derivation, `radargraph/` only draws it (as two plain Recharts `LineChart` cards, in
the same visual style as every other sensor graph in the dashboard — no custom canvas drawing).

- **`radarprocessing/radarTypes.ts`** — `RadarWaveformSample` (one raw surface-elevation
  reading, feet) and `WaveEnergySpectrum` (a single-peaked *non-directional* energy-vs-period
  curve: peak period/spread/energy) — the contract between the two folders.
- **`radarprocessing/radarService.ts`** — mirrors `SensorService.ts`'s `getMode()` split
  exactly: `VITE_SENSOR_MODE=REAL` calls `VITE_RADAR_VENDOR_URL`'s `/wave-radar-status`
  endpoint (per-field fallback, whole-batch fallback to simulated on failure); this is the
  integration point for a real LX80-O — point the env var at it, no code changes needed as
  long as the vendor returns the flat JSON shape documented in that file.
- **`radarprocessing/radarWaveformSimulator.ts`** / **`waveSpectrumProcessor.ts`** —
  SIMULATED-mode fabrication; the spectrum's period/energy scale off the `waveRadar` sensor's
  current `waveHeight` (`SensorService.ts`), and the waveform's oscillation period is driven by
  the spectrum's `peakPeriodSec` (both generated from one shared timestamp per tick in
  `radarService.ts`, so they always describe the same "sea state" instant) — so this isn't
  disconnected from the rest of the dashboard's hydrology data.
- **`radarprocessing/radarDataStore.ts`** — eager-singleton polling loop (1Hz, same cadence as
  `sensorDataStore.ts`) accumulating a `RadarWaveformSample` history (capped, same pattern as
  `sensorDataStore.ts`'s snapshot buffer) plus the latest spectrum, same `BeEvent` pattern.
- **`radargraph/RadarWaveWidget.tsx`** — renders two sibling cards (not a toggle): "Wave Radar
  Signal" is a live time-series of `surfaceElevationFeet` with the same
  `ChartTimeframeDropdown` + `LineChart` layout as other sensor graphs (a local copy of that
  dropdown lives in this file to avoid a circular import with `IoTDashboard.tsx`); "Wave Energy
  Spectrum" samples the Gaussian curve at many period points and charts energy vs. period — its
  X-axis is period, not time, so (unlike every other chart here) a timeframe dropdown doesn't
  apply and is intentionally omitted.

### Python backend (`python/`)

A separate, standalone Python project (own venv, own dependencies — not part of the `npm`/Vite
build at all) for signal-processing math that doesn't belong in the browser: FFT on
accelerometers (planned), and — built so far — geophone velocity→displacement recovery. More
"result scripts" are expected over time, so both the Python and TS sides are built around a
shared, reusable pattern rather than one-off code per script — **see `python/api/main.py`'s
module docstring ("HOW TO ADD A NEW RESULT SCRIPT") for the exact steps to add the next one.**

- **`python/geophonetest/displacement.py`** — the actual math, runnable standalone with no web
  app involved (`python displacement.py demo` for a synthetic known-answer validation,
  `python displacement.py live --file x.csv` for a real recording). Geophones measure
  *velocity*; getting displacement means integrating it (`integrate_trapezoidal`/
  `integrate_simpsons`), which drifts badly unless the bias/slow-wander is removed first
  (`highpass_filter`, a zero-phase Butterworth in second-order-sections form — the plain
  transfer-function form is numerically unstable at this cutoff-to-sample-rate ratio).
  **Important, non-obvious result**: after high-pass-filter drift correction, the recovered
  displacement's *shape* is accurate but its absolute/DC position is not (a high-pass filter
  discards that by definition) — that's fine, since detecting a vehicle's deflection wobble
  only needs relative motion, not absolute position (see `rmse_shape()`'s docstring for the
  full reasoning). `generate_live_window()` is the continuous, wall-clock-time-keyed version
  of the demo's synthetic signal, used by the API so consecutive polls see an evolving signal
  rather than restarting from t=0 each time — every new result script needs one of these.
- **`python/api/buffered_series.py`** — `BufferedSeries`, the shared plumbing every endpoint in
  `main.py` uses: a persistent, append-only buffer of raw samples (module-level state per
  script, capped at `max_buffer_seconds` — default 1hr, same idea as `sensorDataStore.ts`'s
  `MAX_HISTORY=5000`), only ever extended with genuinely new samples rather than regenerated
  from scratch. That distinction matters: an earlier version regenerated a fresh window per
  request, and since `generate_live_window`'s noise is unseeded, overlapping requests invented
  different values for the same past instant, making already-displayed history silently
  rewrite itself on every poll. `BufferedSeries.poll()` also handles filter-settle-in
  trimming and downsampling to ~1 point/sec - the boilerplate that's identical for every
  script; a new one only supplies a `generate(end_time, window_seconds)` and a
  `process(t, raw) -> {name: array}` function (see `main.py`'s `_process_geophone` +
  `geophone_series`).
- **`python/api/main.py`** — the FastAPI app: CORS setup, one `BufferedSeries` instance +
  one `@app.get(...)` route per result script. Run with
  `cd python && .venv\Scripts\activate && uvicorn api.main:app --reload --port 8000`. This is
  this app's established "REAL mode vendor endpoint" pattern (see
  `SensorService.ts`/`radarService.ts`), just running as an actual process instead of an
  imagined vendor box. Currently every script generates a continuous synthetic signal (no real
  hardware/file feed wired in yet) — swapping that in later only changes what a script's
  `generate`/`process` functions read from, not `BufferedSeries` or anything on the TS side.
- **`src/processing/`** — the reusable TS-side half: `createProcessingStore(endpointPath)`
  (one call = a full polling store: eager-singleton + `BeEvent`, same pattern as
  `sensorDataStore.ts`/`radarDataStore.ts`, hitting `${VITE_PYTHON_API_URL}${endpointPath}` —
  one shared backend URL for every script, only the path differs) and
  `ProcessingLineChart.tsx` (the generic chart: `ChartTimeframeDropdown` + `LineChart`, same
  visual style/behavior as every other sensor graph — works because `BufferedSeries` gives it
  real accumulated history to filter, not a fixed window). A new script's whole TS side is a
  one-line store + a small chart component configured with `title`/`lines` — see
  `src/geophone/geophoneDisplacementStore.ts` + `GeophoneDisplacementChart.tsx` for the exact
  pattern to copy, then render the new chart in `ProcessedResultsDashboard.tsx`.
- **`src/geophone/`** — the first (and so far only) concrete result-script consumer, following
  the `src/processing/` pattern above. Mounted in the separate "Processed Results" tab
  (`ProcessedResultsDashboard.tsx`/`ProcessedResultsUiProvider.tsx`), not IoT Dashboard — see
  "Custom side-panel tabs" above.

### Adding a new sensor

1. Use the Developer Tab to click the physical element in the 3D view and copy its Hex ID.
2. Add it to the appropriate group's `elementIds` array in `SensorIcons.ts`.
3. It will automatically get a marker (via `SensorDecorator`), show up in the Sensor Station
   Registry tab, and its marker's `nodeIndex` (position in that array) will automatically map to
   the corresponding chart series in `chartData.ts`/`IoTDashboard.tsx` — no other wiring needed,
   as long as that node index has a corresponding series (e.g. don't exceed the sensor counts
   `SensorService.ts` actually generates for that type).
