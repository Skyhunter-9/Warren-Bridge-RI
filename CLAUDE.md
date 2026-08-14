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

This is the core custom feature. It's deliberately consolidated into four files, one per
responsibility, rather than one file per class/function — merge new code into the matching file
below instead of splitting it back out:

- **`sensorIngestion.ts`** — everything about getting sensor data *into* the app. `SensorService`
  is the data layer proper: `getMode()` switches on `VITE_SENSOR_MODE`; `generateSimulatedData()`
  fabricates deterministic sine/cosine-based telemetry; `fetchRealHardwareData()` calls vendor
  HTTP APIs in parallel with per-field fallback, falling back to simulated data entirely if the
  whole batch throws. `SENSOR_INGESTION` is the per-type API-vs-Periodic mode config (edit this
  to switch a type to a periodic batch pull instead of live polling — each type sets its own
  `pollIntervalMs`, so different sensors can update at completely different rates), keyed by
  `SensorType` — this includes `"weather"`, whose single-station marker has no per-node array but
  still needs the same live-vs-Periodic toggle every other sensor gets; `fetchRealHardwareData()`
  gates its weather fetch the same per-field way it gates accel/geo/strain/gnss, so setting
  `weather: { mode: "Periodic", url: ... }` skips the live HTTP call entirely instead of always
  hitting `VITE_WEATHER_STATION_URL`. The periodic parsing/merge/history functions
  (`getPeriodicHistory`, `getLatestPeriodicRow`, etc.) and their own `onPeriodicHistoryChanged`
  BeEvent live here too — the batches themselves are still CSV-formatted text under the hood
  (`csvToFlatRows`/`parseCsv`), just not necessarily downloaded as literal files; a vendor can
  serve that text however it wants (a static file, or a small server generating it on the fly).
  Finally, `getSnapshots`/`onSnapshotsChanged` are the single app-wide 1/sec polling
  loop and snapshot buffer, started as an eager module-level singleton (same pattern as
  `selectionStorage.ts`) — exists so live data isn't tied to any one component's mount state, both
  the IoT Dashboard tab and marker-click popups read from this same buffer, and REAL mode only
  makes one round of vendor calls per second no matter how many consumers are watching.
- **`Sensor3DDisplay.tsx`** — everything about showing sensors *in the 3D view* and reacting to a
  click on one. `SENSOR_GROUPS` is the single source of truth for sensor types (gnss,
  accelerometer, strainGauge, waterVelocity, waveRadar, scour, weather, camera), each with a
  color, icon URL, an `expectedCount`, and an `elementIds` array of real element Hex IDs. Note
  `waterVelocity`/`waveRadar` are the internal `SensorType` identifiers (unchanged, to limit
  rename blast radius through `sensorIngestion.ts`/`chartData.ts`) but display as "Flow Sensor"/
  "Radar Wave Profile" everywhere user-facing — see each group's `label`. **This is the file to
  edit to add/remove physical sensors** — grab a Hex ID via the Developer Tab and paste it into the
  right group's array (weather's/camera's `elementIds` start empty — add each one's Hex ID the
  same way). Each entry can also set an optional `name` (e.g. `"Reference GNSS"`) shown by the
  Sensor Station Registry tab instead of the raw Hex ID — see `getEntryName()`; entries without
  one fall back to a generic "`<group label> <position>`" name. An entry can also set
  `noData: true` (see `getEntryNoData()`) for a sensor that has a real physical marker but no
  data feeding it — either by design (Reference GNSS, the baseline the other 4 GNSS nodes are
  measured relative to, so it never produces its own displacement reading) or because no
  ingestion path exists yet (camera — no image/video display is built, every camera entry
  should stay `noData: true` until that changes). Clicking a `noData` marker does nothing
  instead of opening an empty/broken graph popup (see `ElementIconMarker.onMouseButton`), and
  Reference GNSS is excluded from IoTDashboard.tsx's GNSS node loops (which only cover the 4
  data-producing nodes, nodeIndex 0-3). `resolveSensorPosition()` resolves
  an element ID to its real world-space marker
  position — `placement.origin` alone is *not* reliable (can sit at a local/model origin far from
  the visible geometry), so this transforms the element's own bbox through its placement via
  `Placement3d.calculateRange()` to land the marker on the actual geometry; this bug (marker
  rendering at world 0,0 instead of on the element) has already been hit once, don't simplify this
  back to raw `origin.x/y/z`. `ElementIconMarker` (an iTwin.js `Marker` subclass) draws one icon and
  fires `onSensorGraphRequested` (a `BeEvent` from `@itwin/core-bentley`) on click — the standard
  pattern this codebase uses for wiring non-React iTwin.js callbacks into React state, since a
  decorator's click handler runs entirely outside the React tree. `SensorDecorator` (an iTwin.js
  `Decorator`, registered in `App.tsx`'s `onIModelAppInit`) walks `SENSOR_GROUPS`, resolves each
  element's position, and draws the markers every frame, caching one icon image per icon URL.
  Finally, `SensorGraphPopup` is the React component that subscribes to `onSensorGraphRequested`
  and renders the clicked sensor's live chart in a floating overlay — mounted once in `App.tsx` as
  a sibling of `<Viewer>` (not one of the AppUI tabs), so it can appear regardless of which side tab
  is currently open.
- **`chartData.ts`** — the shared chart *data* layer: both `IoTDashboard.tsx` and
  `Sensor3DDisplay.tsx`'s `SensorGraphPopup` call into this file rather than each computing a
  sensor's chart data their own way, which is what used to let the two silently drift apart
  (see `SensorLineChart.tsx` below for the matching *rendering* half of this). `buildChartData()`
  flattens nested `SensorSnapshot`s into flat `acc_0_X`/`gnss_1_E`/`sg_3`-style keys for Recharts.
  `getSensorSeries(sensorType, nodeIndex)` maps a specific sensor (by type + its 0-based index
  within that type's `elementIds` array) to the chart series (title/unit/lines, with dataKey/name/
  color per line) it corresponds to — this is simultaneously the link between a clicked marker and
  the chart it opens, *and* (via `SensorLineChart.tsx`) the line definitions IoTDashboard.tsx's
  per-node exploded cards use, so e.g. "GNSS Node 1"'s line colors are defined in exactly one
  place. `mergeChartRows()` combines several row arrays (live + periodic) into one, sorted by
  timestamp. `getLookbackCutoff(timeframe)` converts an `IoTDashboard.tsx` timeframe-dropdown
  string ("last 1 Hour", "all time", ...) into an epoch-ms cutoff.
  `getMergedSensorChartData(types, cutoffTimestamp)` is THE single source of truth for what data a
  chart covering these types, from this point in time onward, should show — it decides whether to
  include the live 1Hz buffer at all (skipped entirely when every requested type is Periodic-mode,
  since that buffer always has *some* value for every field, real or fabricated/zero-filled, which
  would otherwise flood real periodic readings with meaningless noise — this exact bug used to
  make the 3D popup show fake data spliced onto the end of real GNSS history, since it had its own
  separate, incomplete copy of this rule).
- **`SensorLineChart.tsx`** — the shared chart *rendering* layer: one `<LineChart>` component
  (title/dropdown/card chrome stays with the caller; this just draws the axes/grid/lines) used by
  both `IoTDashboard.tsx`'s per-node/per-sensor exploded cards and `SensorGraphPopup`'s per-series
  mini-charts, taking `data` (from `getMergedSensorChartData`) and `lines` (from
  `getSensorSeries(...).lines`) as props. Together with the two functions above, a given sensor's
  chart — data, line colors, and rendering — is defined in exactly one place and referenced from
  both UI surfaces, rather than two hand-copied implementations that only looked similar. Combined
  "all nodes at once" charts (the Accel/Strain/Geophone overview cards, the 3 Combined GNSS
  charts, River Bed Levels, Structural Pier Scour) have no marker-click equivalent — a click only
  ever shows one sensor's own data — so those stay hand-rolled in `IoTDashboard.tsx` rather than
  going through `getSensorSeries`.
- **`SensorInspectorTab.tsx`** — the "Sensor Station Registry" side-tab content: independently
  re-resolves every `SENSOR_GROUPS` Hex ID's world coordinates (via the same `resolveSensorPosition`
  `Sensor3DDisplay.tsx` uses) so you can see exactly where the app thinks each sensor is, grouped by
  type with a configured/expected count, and click one to fly the camera to it.

`IoTDashboard.tsx` (in `src/components/`, rendered inside the "IoT Dashboard" tab) mirrors the
`sensorIngestion.ts` buffer rather than polling itself, and reuses `chartData.ts`/`SensorLineChart.tsx`
(the same data + rendering layers `SensorGraphPopup` uses) so both stay in sync — editing a
sensor's line colors or its live/periodic data-merge rule in `chartData.ts` changes it in both
places at once, instead of needing the same edit made twice.

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
- **`radarprocessing/radarService.ts`** — mirrors `sensorIngestion.ts`'s `SensorService.getMode()`
  split exactly: `VITE_SENSOR_MODE=REAL` calls `VITE_RADAR_VENDOR_URL`'s `/wave-radar-status`
  endpoint (per-field fallback, whole-batch fallback to simulated on failure); this is the
  integration point for a real LX80-O — point the env var at it, no code changes needed as
  long as the vendor returns the flat JSON shape documented in that file.
- **`radarprocessing/radarWaveformSimulator.ts`** / **`waveSpectrumProcessor.ts`** —
  SIMULATED-mode fabrication; the spectrum's period/energy scale off the `waveRadar` sensor's
  current `waveHeight` (`sensorIngestion.ts`), and the waveform's oscillation period is driven by
  the spectrum's `peakPeriodSec` (both generated from one shared timestamp per tick in
  `radarService.ts`, so they always describe the same "sea state" instant) — so this isn't
  disconnected from the rest of the dashboard's hydrology data.
- **`radarprocessing/radarDataStore.ts`** — eager-singleton polling loop (1Hz, same cadence as
  `sensorIngestion.ts`'s buffer) accumulating a `RadarWaveformSample` history (capped, same pattern
  as `sensorIngestion.ts`'s snapshot buffer) plus the latest spectrum, same `BeEvent` pattern.
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
  script, capped at `max_buffer_seconds` — default 1hr, same idea as `sensorIngestion.ts`'s
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
  `sensorIngestion.ts`/`radarService.ts`), just running as an actual process instead of an
  imagined vendor box. Currently every script generates a continuous synthetic signal (no real
  hardware/file feed wired in yet) — swapping that in later only changes what a script's
  `generate`/`process` functions read from, not `BufferedSeries` or anything on the TS side.
- **`src/processing/`** — the reusable TS-side half: `createProcessingStore(endpointPath)`
  (one call = a full polling store: eager-singleton + `BeEvent`, same pattern as
  `sensorIngestion.ts`/`radarDataStore.ts`, hitting `${VITE_PYTHON_API_URL}${endpointPath}` —
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
2. Add it to the appropriate group's `elementIds` array in `Sensor3DDisplay.tsx`'s `SENSOR_GROUPS`.
3. It will automatically get a marker (via `SensorDecorator`), show up in the Sensor Station
   Registry tab, and its marker's `nodeIndex` (position in that array) will automatically map to
   the corresponding chart series in `chartData.ts`/`IoTDashboard.tsx` — no other wiring needed,
   as long as that node index has a corresponding series (e.g. don't exceed the sensor counts
   `sensorIngestion.ts`'s `SensorService` actually generates for that type).
