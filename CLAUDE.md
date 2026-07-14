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

There is no test suite (`"test": ""` in package.json, no test files present).

### Required `.env`

The app throws at startup (see `src/index.tsx`) if any of `IMJS_AUTH_CLIENT_CLIENT_ID`,
`IMJS_AUTH_CLIENT_SCOPES`, or `IMJS_AUTH_CLIENT_REDIRECT_URI` are missing. `IMJS_AUTH_CLIENT_LOGOUT_URI`
and `IMJS_AUTH_AUTHORITY` are also read (see `Authorization.tsx`) but not guarded by a startup
check. Also `IMJS_ITWIN_ID`/`IMJS_IMODEL_ID` (or pass `?iTwinId=...&iModelId=...` in the URL instead
— see `src/components/Routes.tsx`). Sensor-service mode is controlled by `VITE_SENSOR_MODE`
(`SIMULATED` default, or `REAL` — see `VITE_COMPANY_A_URL`
/ `VITE_COMPANY_B_URL` for vendor endpoints). See `README.md` for how to obtain OIDC/iTwin/iModel
values.

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

Existing tabs: `MyCustomUiProvider.tsx` (IoT Dashboard), `Developer_Tab.tsx` (Hex ID inspector —
click an element to copy its ID to clipboard, used to populate sensor lists), `SensorInspectorTab.tsx`
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

### Adding a new sensor

1. Use the Developer Tab to click the physical element in the 3D view and copy its Hex ID.
2. Add it to the appropriate group's `elementIds` array in `SensorIcons.ts`.
3. It will automatically get a marker (via `SensorDecorator`), show up in the Sensor Station
   Registry tab, and its marker's `nodeIndex` (position in that array) will automatically map to
   the corresponding chart series in `chartData.ts`/`IoTDashboard.tsx` — no other wiring needed,
   as long as that node index has a corresponding series (e.g. don't exceed the sensor counts
   `SensorService.ts` actually generates for that type).
