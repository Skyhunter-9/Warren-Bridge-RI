// src/Sensors/sensorIngestion.ts
//
// Everything about getting sensor data INTO the app, whether fabricated (SIMULATED mode),
// pulled from live vendor HTTP APIs (REAL mode), or pulled in periodic batches (REAL
// mode, Periodic-configured types) - plus the shared 1-second polling buffer built on top of it.
// Consolidated from four separate files (SensorService.ts, sensorDataStore.ts,
// ingestionConfig.ts, csvIngestion.ts) since they're really one pipeline: "how sensor data
// enters this app and gets buffered for consumption." Display code (3D markers/popup, the
// Sensor tab, the IoT tab's chart-shaping) lives in its own files and only ever reads from
// what's exported here.
// NOTE: VITE_SENSOR_MODE / VITE_COMPANY_A_URL / VITE_COMPANY_B_URL are read via
// import.meta.env but are not declared in vite-env.d.ts, so TypeScript treats them as `any`.

import { BeEvent } from "@itwin/core-bentley";
import type { SensorType } from "./Sensor3DDisplay";

// ===================================================================================
// Live/simulated data source (formerly SensorService.ts)
// ===================================================================================

// 1. Define the full data structure interface
export interface SensorSnapshot {
  timeString: string;
  // Epoch ms this snapshot was generated/fetched at - lets chartData.ts's mergeChartRows sort
  // this live buffer alongside periodic-sourced history (below), which has its own independent,
  // non-1Hz timestamps.
  timestamp: number;
  accelerometers: { x: number; y: number; z: number }[];
  // Triaxial, one geophone co-located with each accelerometer node (same count/order) - see
  // chartData.ts's getSensorSeries(), which pairs the two by nodeIndex so clicking an
  // accelerometer marker's popup shows both readings for that physical location.
  geophones: { x: number; y: number; z: number }[];
  strainGauges: number[];
  gnss: { Easting: number; Northing: number; Elevation: number }[];
  // Index 0 is co-located with the water velocity sensor, index 1 with the wave radar
  // sensor - see chartData.ts's getSensorSeries(), which pairs each with its own water level
  // reading the same way accelerometer/geophone are paired.
  waterLevel: number[];
  waterVelocity: number;
  // Significant wave height from a radar wave gauge, co-located with waterLevel[1].
  waveHeight: number;
  scour: number[];
  // Modeled on an Airmar WX-series ultrasonic weather station: windSpeed/windDirDeg/temp/
  // pressure/humidity are the sensor's raw readings (apparent wind, air temp, barometric
  // pressure, relative humidity); windChill/dewPoint/heatIndex are never measured directly -
  // they're always calculated from those raw readings (see calcWindChill/calcDewPoint/
  // calcHeatIndex below), the same way a real weather station display derives them, in both
  // SIMULATED and REAL mode.
  weather: {
    windSpeed: number; // apparent wind speed, mph
    windDirDeg: number; // apparent wind direction, deg True
    temp: number; // air temperature, °F
    windChill: number; // calculated, °F
    pressure: number; // barometric pressure, inHg
    humidity: number; // relative humidity, %
    dewPoint: number; // calculated, °F
    heatIndex: number; // calculated, °F
  };
}

// 2. Data conversion functions
const mGToIn = (mg: number) => parseFloat((mg * 0.386).toFixed(2));
const usToPsi = (us: number) => parseFloat((us * 0.029).toFixed(2));
const mmToIn = (mm: number) => parseFloat((mm * 0.039).toFixed(2));
const mpsToMph = (mps: number) => parseFloat((mps * 2.23).toFixed(1));

// 2b. Weather calculations - derived from raw temp (°F)/humidity (%)/wind speed (mph), never
// read directly off the sensor. Shared by both generateSimulatedData and fetchRealHardwareData
// so the two modes always compute these the exact same way.

// National Weather Service wind chill formula - only has a cooling effect at <=50°F and
// wind >=3mph; outside that range "wind chill" is just the air temperature.
function calcWindChill(tempF: number, windMph: number): number {
  if (tempF > 50 || windMph < 3) return parseFloat(tempF.toFixed(1));
  const v16 = Math.pow(windMph, 0.16);
  return parseFloat((35.74 + 0.6215 * tempF - 35.75 * v16 + 0.4275 * tempF * v16).toFixed(1));
}

// Magnus-Tetens approximation - computed in Celsius, then converted back to °F.
function calcDewPoint(tempF: number, humidityPct: number): number {
  const tempC = (tempF - 32) * (5 / 9);
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(humidityPct / 100);
  const dewC = (b * alpha) / (a - alpha);
  return parseFloat((dewC * (9 / 5) + 32).toFixed(1));
}

// NWS Rothfusz regression - only has a meaningful effect at >=80°F; below that "heat index" is
// just the air temperature.
function calcHeatIndex(tempF: number, humidityPct: number): number {
  if (tempF < 80) return parseFloat(tempF.toFixed(1));
  const T = tempF;
  const R = humidityPct;
  const hi =
    -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T -
    0.05481717 * R * R + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
  return parseFloat(hi.toFixed(1));
}

export class SensorService {
  // 3. Mode Toggle
  // Set VITE_SENSOR_MODE=REAL in .env to hit real vendor hardware instead of simulated data.
  // Defaults to SIMULATED if unset, so the dashboard works out of the box with no hardware.
  private static getMode(): 'SIMULATED' | 'REAL' {
    return (import.meta.env.VITE_SENSOR_MODE as 'SIMULATED' | 'REAL') || 'SIMULATED';
  }

  // 4. Unified Data Fetcher
  // Called once per second by the shared polling buffer below to get one new data point for
  // all charts.
  public static async getLatestSnapshot(): Promise<SensorSnapshot> {
    return this.getMode() === 'REAL' ? this.fetchRealHardwareData() : this.generateSimulatedData();
  }

  // 4b. Unified Historical Data Fetcher
  // Only meaningful in REAL mode - fetches a vendor's own logged history for a given
  // timeframe (e.g. "last 24 Hours") so charts can show data older than this session.
  public static async getHistoricalData(timeframe: string): Promise<SensorSnapshot[]> {
    if (this.getMode() === 'SIMULATED') {
      // Simulation mode accumulates history locally in your dashboard, so return empty here
      return [];
    }

    const COMPANY_A_API = import.meta.env.VITE_COMPANY_A_URL || "http://structural-vendor.com";
    try {
      // Sends a request to your vendor API asking for logs within a specific time window
      const response = await fetch(`${COMPANY_A_API}/historical-logs?window=${encodeURIComponent(timeframe)}`);
      if (!response.ok) throw new Error("Historical endpoint returned an error status");

      const pastLogData = await response.json();
      return pastLogData; // Assumes your real API returns an array of past logs
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Could not retrieve real-time historical data from hardware APIs:", error);
      return [];
    }
  }

  // 5. Encapsulated Simulation Logic (Preserving your exact math loops for learning)
  // Fabricates plausible-looking sensor values using sine/cosine waves seeded off the
  // current timestamp (`t`), so every call produces smoothly-varying, non-repeating-looking
  // data without needing any real sensors. Edit the amplitude/offset numbers here to change
  // how "active" the simulated bridge looks.
  private static generateSimulatedData(): SensorSnapshot {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const t = now.getTime();

    const windSpeed = mpsToMph(4.5 + Math.sin(t / 20000) * 1.5);
    const windDirDeg = (25 + Math.sin(t / 40000) * 8 + 360) % 360;
    const temp = parseFloat((22 * 1.8 + 32 + Math.sin(t / 60000) * 3).toFixed(1));
    const pressure = parseFloat((29.92 + Math.sin(t / 45000) * 0.15).toFixed(2));
    const humidity = parseFloat((55 + Math.sin(t / 30000) * 10).toFixed(1));

    return {
      timeString: timeStr,
      timestamp: t,
      accelerometers: Array.from({ length: 10 }, (_, i) => ({
        x: mGToIn(Math.sin(t / 1000 + i) * 15 + 5),
        y: mGToIn(Math.cos(t / 800 + i) * 12 + 5),
        z: mGToIn(Math.sin(t / 1200 + i) * 10 + 2)
      })),
      geophones: Array.from({ length: 10 }, (_, i) => ({
        x: mmToIn(Math.sin(t / 900 + i) * 4 + 1),
        y: mmToIn(Math.cos(t / 1100 + i) * 3 + 1),
        z: mmToIn(Math.sin(t / 1300 + i) * 2 + 0.5)
      })),
      strainGauges: Array.from({ length: 8 }, (_, i) => usToPsi(120 + Math.sin(t / 3000 + i) * 8 + 2)),
      // 4 data-producing nodes - Reference GNSS (Sensor3DDisplay.tsx's SENSOR_GROUPS 5th gnss
      // entry) is noData: true and never gets its own reading, so it's not included here.
      gnss: Array.from({ length: 4 }, (_, i) => ({
        Easting: mmToIn(Math.sin(t / 5000 + i) * 3),
        Northing: mmToIn(Math.cos(t / 5000 + i) * 3),
        Elevation: mmToIn(Math.sin(t / 10000 + i) * 5)
      })),
      waterLevel: [
        parseFloat((184.8 + Math.sin(t / 20000) * 6).toFixed(2)),
        parseFloat((184.8 + Math.cos(t / 20000) * 6).toFixed(2))
      ],
      waterVelocity: mpsToMph(1.2 + Math.sin(t / 4000) * 0.3),
      waveHeight: parseFloat((9 + Math.sin(t / 7000) * 4).toFixed(2)),
      scour: [
        parseFloat((50.4 + Math.cos(t / 15000) * 2).toFixed(2)),
        parseFloat((50.4 + Math.sin(t / 15000) * 2).toFixed(2))
      ],
      weather: {
        windSpeed,
        windDirDeg,
        temp,
        windChill: calcWindChill(temp, windSpeed),
        pressure,
        humidity,
        dewPoint: calcDewPoint(temp, humidity),
        heatIndex: calcHeatIndex(temp, humidity),
      }
    };
  }

  // 6. Upgraded Multi-Vendor Hardware API Ingestion (Replaced older single endpoint)
  // Fires all 6 vendor requests in parallel (Promise.all), then falls back per-field to a
  // hardcoded default if that specific vendor's response failed (`res.ok` check) so one dead
  // API doesn't blank out the whole dashboard. If the whole batch throws (e.g. network down),
  // the catch below falls all the way back to simulated data.
  // Edit COMPANY_A_API / COMPANY_B_API / WEATHER_STATION_API (or add a new one) to point at
  // your actual vendor URLs via the .env VITE_COMPANY_A_URL / VITE_COMPANY_B_URL /
  // VITE_WEATHER_STATION_URL variables.
  private static async fetchRealHardwareData(): Promise<SensorSnapshot> {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    const COMPANY_A_API = import.meta.env.VITE_COMPANY_A_URL || "http://structural-vendor.com";
    const COMPANY_B_API = import.meta.env.VITE_COMPANY_B_URL || "http://hydro-vendor.net";
    // An Airmar WX-series-style ultrasonic weather station mounted on the bridge - see the
    // SensorSnapshot.weather doc comment above for its raw vs. calculated fields.
    const WEATHER_STATION_API = import.meta.env.VITE_WEATHER_STATION_URL || "http://weather-station-vendor.net";

    // A type set to "Periodic" mode in SENSOR_INGESTION below has no live push/pull API to poll
    // (that's the whole point of it - it only supplies periodic batches, see the periodic
    // ingestion section below) - so its request is skipped here entirely rather than hitting
    // a vendor endpoint for data nothing will use. Structural types (accel/geo/strain/gnss)
    // each have their own vendor request, so they gate independently; the hydro types share
    // one bundled endpoint, so it's only skipped if ALL THREE are Periodic-mode. Weather gates
    // the same independent way as the structural types.
    const fetchOrSkip = async (mode: "API" | "Periodic", url: string): Promise<Response | null> =>
      mode === "API" ? fetch(url) : null;
    const hydroNeeded =
      SENSOR_INGESTION.waterVelocity.mode === "API" ||
      SENSOR_INGESTION.waveRadar.mode === "API" ||
      SENSOR_INGESTION.scour.mode === "API";

    try {
      const [accelRes, geoRes, strainRes, gnssRes, hydroRes, weatherRes] = await Promise.all([
        fetchOrSkip(SENSOR_INGESTION.accelerometer.mode, `${COMPANY_A_API}/accelerometers`),
        fetchOrSkip(SENSOR_INGESTION.accelerometer.mode, `${COMPANY_A_API}/geophones`),
        fetchOrSkip(SENSOR_INGESTION.strainGauge.mode, `${COMPANY_A_API}/strain-gauges`),
        fetchOrSkip(SENSOR_INGESTION.gnss.mode, `${COMPANY_A_API}/gnss-positioning`),
        hydroNeeded ? fetch(`${COMPANY_B_API}/river-metrics`) : Promise.resolve(null),
        fetchOrSkip(SENSOR_INGESTION.weather.mode, `${WEATHER_STATION_API}/weather-status`)
      ]);

      const accelData = accelRes?.ok ? await accelRes.json() : null;
      const geoData = geoRes?.ok ? await geoRes.json() : null;
      const strainData = strainRes?.ok ? await strainRes.json() : null;
      const gnssData = gnssRes?.ok ? await gnssRes.json() : null;
      const hydroData = hydroRes?.ok ? await hydroRes.json() : null;
      const weatherData = weatherRes?.ok ? await weatherRes.json() : null;

      const wsWindSpeed = weatherData ? parseFloat(weatherData.windSpeed) || 4.5 : 4.5;
      const wsWindDirDeg = weatherData ? parseFloat(weatherData.windDirDeg) || 0 : 0;
      const wsTemp = weatherData ? parseFloat(weatherData.temp) || 72 : 72;
      const wsPressure = weatherData ? parseFloat(weatherData.pressure) || 29.92 : 29.92;
      const wsHumidity = weatherData ? parseFloat(weatherData.humidity) || 55 : 55;

      return {
        timeString: timeStr,
        timestamp: now.getTime(),

        accelerometers: accelData ? accelData.map((device: any) => ({
          x: device.x,
          y: device.y,
          z: device.z
        })) : Array(10).fill({ x: 0, y: 0, z: 0 }),

        // Same vendor/device shape as accelerometers - paired 1:1 by array position.
        geophones: geoData ? geoData.map((device: any) => ({
          x: device.x,
          y: device.y,
          z: device.z
        })) : Array(10).fill({ x: 0, y: 0, z: 0 }),

        strainGauges: strainData ? Array.from({ length: 8 }, (_, i) => strainData[`SG_${String(i+1).padStart(2, '0')}`] || 0)
                                 : Array(8).fill(0),

        // 4 data-producing nodes - Reference GNSS never produces its own reading (see the
        // matching comment in generateSimulatedData above).
        gnss: gnssData ? gnssData.devices.map((g: any) => ({
          Easting: g.easting,
          Northing: g.northing,
          Elevation: g.elevation
        })) : Array(4).fill({ Easting: 0, Northing: 0, Elevation: 0 }),

        waterLevel: hydroData ? [hydroData.upstreamSensor, hydroData.downstreamSensor] : [184.8, 184.8],
        waterVelocity: hydroData ? hydroData.flowVelocityMph : 1.2,
        waveHeight: hydroData ? hydroData.waveHeightInches : 9.0,
        scour: hydroData ? [hydroData.pier1ScourInches, hydroData.pier2ScourInches] : [50.4, 50.4],

        // windChill/dewPoint/heatIndex are always calculated here from the station's raw
        // readings (see calcWindChill/calcDewPoint/calcHeatIndex above), never read off the
        // vendor response - the Airmar-style sensor itself only reports wind/temp/pressure/
        // humidity.
        weather: {
          windSpeed: wsWindSpeed,
          windDirDeg: wsWindDirDeg,
          temp: wsTemp,
          windChill: calcWindChill(wsTemp, wsWindSpeed),
          pressure: wsPressure,
          humidity: wsHumidity,
          dewPoint: calcDewPoint(wsTemp, wsHumidity),
          heatIndex: calcHeatIndex(wsTemp, wsHumidity),
        }
      };

    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("One or more hardware APIs failed, falling back to simulated loops:", error);
      return this.generateSimulatedData();
    }
  }
}

export default SensorService;

// ===================================================================================
// Per-type ingestion mode config (formerly ingestionConfig.ts)
// ===================================================================================

// Per-type choice between the live vendor API polling above (fetchRealHardwareData, called
// once/sec) and periodic batch pulls (see the periodic ingestion section below). Only
// meaningful in REAL hardware mode (VITE_SENSOR_MODE=REAL) - SIMULATED mode always fabricates
// data locally and never looks at this config.
//
// Covers every SensorType, including "weather" (a single-station marker in Sensor3DDisplay.tsx's
// SENSOR_GROUPS same as waterVelocity/waveRadar, even though its readings are dashboard summary
// fields rather than a per-node array).
//
// Geophone and waterLevel are NOT their own SensorType (see chartData.ts's pairing via
// geophoneSeries/waterLevelSeries), so they don't get their own entry here either - a geophone
// follows its paired accelerometer's mode, and each waterLevel reading follows whichever of
// waterVelocity/waveRadar it's co-located with (index 0 -> waterVelocity, index 1 -> waveRadar).

export type IngestionMode = "API" | "Periodic";

export interface ApiIngestionSettings {
  mode: "API";
}

export interface PeriodicIngestionSettings {
  mode: "Periodic";
  /** Page/endpoint this type's periodic batch is fetched from - see the periodic ingestion
   * section below's expected column contract before pointing this at a real vendor endpoint. */
  url: string;
  /** How often to re-fetch and merge in new rows, in ms. Defaults to 1 hour if omitted. */
  pollIntervalMs?: number;
}

export type IngestionSettings = ApiIngestionSettings | PeriodicIngestionSettings;

export const DEFAULT_PERIODIC_POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * *** Edit this to switch a type from live API polling to a periodic batch pull. ***
 * Example: `waterVelocity: { mode: "Periodic", url: "https://hydro-vendor.net/exports/latest.csv" }`
 */
export const SENSOR_INGESTION: Record<SensorType, IngestionSettings> = {
  // GNSS is fed by src/scratch/playwrightCapture.ts - a standalone script (not part of the
  // Vite app) that logs into GeoCloud, captures live SignalR/MessagePack traffic, and serves
  // it back out as CSV-formatted text on localhost:4000. Must be running (npx tsx
  // src/scratch/playwrightCapture.ts) for this to have anything to fetch. GeoCloud only
  // actually updates this data once an hour, hence the matching pollIntervalMs below.
  gnss: { mode: "Periodic", url: "http://localhost:4000", pollIntervalMs: 60 * 60 * 1000 },
  accelerometer: { mode: "API" },
  strainGauge: { mode: "API" },
  waterVelocity: { mode: "API" },
  waveRadar: { mode: "API" },
  scour: { mode: "API" },
  weather: { mode: "API" },
  // Placeholder only - camera has no data ingestion path yet (see Sensor3DDisplay.tsx's
  // camera SENSOR_GROUPS entry, all noData: true), this entry just satisfies
  // Record<SensorType, ...>. "API" mode is a no-op here since fetchRealHardwareData() below
  // never fetches a camera field, and the Periodic-eager-singleton loop skips anything not
  // set to "Periodic".
  camera: { mode: "API" },
};

// ===================================================================================
// Periodic batch ingestion (formerly csvIngestion.ts; still CSV-formatted text under the hood)
// ===================================================================================

// Periodic batch ingestion for any SensorType configured for Periodic mode above. This is a
// completely separate data path from the live 1-second buffer below - periodic data never
// enters that buffer (per-design: a Periodic-mode type has no live push/pull API to poll every
// second, only a periodically-refreshed batch). Charts read periodic history via
// getPeriodicHistory()/getLatestPeriodicRow() and merge it alongside the live buffer themselves
// (see chartData.ts's mergeChartRows, used by IoTDashboard.tsx and Sensor3DDisplay.tsx's
// SensorGraphPopup).
//
// *** Expected column contract *** - the CSV-formatted text fetched for a given type must have
// a "timestamp" column (anything Date.parse() can read, e.g. ISO 8601) plus one column per chart
// data key that type owns - i.e. the exact same flat key names chartData.ts's
// buildChartData()/getSensorSeries() already use, so no extra field-mapping layer is needed:
//   gnss:           gnss_0_E, gnss_0_N, gnss_0_Z, gnss_1_E, ... (up to gnss_3_*, the 4
//                   data-producing nodes - Reference GNSS is noData: true and has none)
//   accelerometer:  acc_0_X, acc_0_Y, acc_0_Z, ... (up to acc_9_*) + geo_0_X, ... (paired geophone)
//   strainGauge:    sg_0, sg_1, ... sg_7
//   waterVelocity:  waterVelocity, waterLevel_1 (its co-located water level reading)
//   waveRadar:      waveHeight, waterLevel_2 (its co-located water level reading)
//   scour:          scour_1, scour_2
//   weather:        windSpeed, windDirDeg, temp, windChill, pressure, humidity, dewPoint,
//                   heatIndex - note windChill/dewPoint/heatIndex are CALCULATED fields in the
//                   live path (see calcWindChill/calcDewPoint/calcHeatIndex above); a periodic
//                   batch must supply them pre-computed too, since no calculation runs on these rows.
// Unrecognized columns are kept as-is (harmless extra fields); missing columns just leave
// that line with a gap at that point.

export interface FlatCsvRow {
  time: string;
  timestamp: number;
  [key: string]: string | number;
}

/** Minimal CSV parser - handles comma-separated fields with optional double-quoted values
 * (including escaped "" quotes inside a quoted field). Vendor exports are assumed to be
 * simple tabular CSVs, not full RFC 4180 edge cases beyond that. */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function csvToFlatRows(text: string): FlatCsvRow[] {
  const { headers, rows } = parseCsv(text);
  const timestampCol = headers.findIndex((h) => h.toLowerCase() === "timestamp");
  if (timestampCol === -1) return [];

  const result: FlatCsvRow[] = [];
  for (const row of rows) {
    const timestamp = Date.parse(row[timestampCol]);
    if (Number.isNaN(timestamp)) continue;

    const flat: FlatCsvRow = {
      timestamp,
      // Includes the date, not just the time-of-day - periodic data can span many days, and
      // "07:00:00" alone would be an identical, ambiguous label on every one of those days.
      // Recharts treats each unique label as one x-axis position, so without the date,
      // multiple real days' worth of points collide under the same label, breaking hover
      // tracking past the first day and leaving the axis showing no date information at all.
      time: new Date(timestamp).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }),
    };
    headers.forEach((header, i) => {
      if (i === timestampCol) return;
      const raw = row[i];
      // An empty cell means that sensor had no reading at this timestamp (see buildCsvText's
      // CSV-column-list logic in playwrightCapture.ts) - leave this field out of the row
      // entirely rather than writing an empty string. Recharts treats a genuinely missing
      // field as "no data point here, leave a gap"; an empty string gets coerced to 0 when
      // plotted, silently turning a missing reading into a fake zero-value point.
      if (raw === "") return;
      const num = parseFloat(raw);
      flat[header] = Number.isNaN(num) ? raw : num;
    });
    result.push(flat);
  }
  return result;
}

// One accumulated, deduped-by-timestamp history per Periodic-mode type. Grows across every
// batch pull for the lifetime of the tab (never wholesale-replaced), which is what lets the
// dropdown timeframes further out than an hour (3 hours, 24 hours, ...) show real backfill
// instead of just whatever the single most recent batch contained.
const periodicHistory = new Map<SensorType, FlatCsvRow[]>();

/** Fired whenever a type's periodic history changes (new batch merged in). No payload -
 * listeners should call getPeriodicHistory(type)/getLatestPeriodicRow(type) to read current data. */
export const onPeriodicHistoryChanged = new BeEvent<(type: SensorType) => void>();

export function getPeriodicHistory(type: SensorType): readonly FlatCsvRow[] {
  return periodicHistory.get(type) ?? [];
}

export function getLatestPeriodicRow(type: SensorType): FlatCsvRow | undefined {
  const history = periodicHistory.get(type);
  return history && history.length > 0 ? history[history.length - 1] : undefined;
}

async function refreshPeriodicForType(type: SensorType, url: string): Promise<void> {
  // TEMPORARY DIAGNOSTIC LOGGING - remove once periodic ingestion is confirmed working.
  // eslint-disable-next-line no-console
  console.log(`[periodic] refreshPeriodicForType("${type}") called, fetching ${url}`);
  try {
    const response = await fetch(url);
    // eslint-disable-next-line no-console
    console.log(`[periodic] fetch for "${type}" returned status ${response.status}`);
    if (!response.ok) throw new Error(`Periodic fetch returned status ${response.status}`);
    const text = await response.text();
    const newRows = csvToFlatRows(text);
    // eslint-disable-next-line no-console
    console.log(`[periodic] parsed ${newRows.length} new rows for "${type}"`);

    // Merge with whatever's already accumulated, deduping by exact timestamp (a fresh
    // batch's row wins ties, in case a vendor re-sends a corrected value for a past point).
    const merged = new Map<number, FlatCsvRow>();
    for (const row of getPeriodicHistory(type)) merged.set(row.timestamp, row);
    for (const row of newRows) merged.set(row.timestamp, row);

    periodicHistory.set(type, Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp));
    onPeriodicHistoryChanged.raiseEvent(type);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Periodic ingestion failed for type "${type}":`, error);
  }
}

// Eager singleton, same pattern as the live buffer below: as soon as this module is first
// imported (from IoTDashboard.tsx/Sensor3DDisplay.tsx), start one polling timer per
// Periodic-mode type (at that type's own configured interval), with an immediate first fetch so
// history isn't empty on load. No-ops entirely in SIMULATED mode.
// TEMPORARY DIAGNOSTIC LOGGING - remove once periodic ingestion is confirmed working.
// eslint-disable-next-line no-console
console.log(`[periodic] module loaded, VITE_SENSOR_MODE = "${import.meta.env.VITE_SENSOR_MODE as string}"`);
if ((import.meta.env.VITE_SENSOR_MODE as string) === "REAL") {
  (Object.keys(SENSOR_INGESTION) as SensorType[]).forEach((type) => {
    const settings = SENSOR_INGESTION[type];
    // eslint-disable-next-line no-console
    console.log(`[periodic] checking type "${type}", mode = "${settings.mode}"`);
    if (settings.mode !== "Periodic") return;
    const intervalMs = settings.pollIntervalMs ?? DEFAULT_PERIODIC_POLL_INTERVAL_MS;
    void refreshPeriodicForType(type, settings.url);
    setInterval(() => void refreshPeriodicForType(type, settings.url), intervalMs);
  });
}

// ===================================================================================
// Shared 1Hz polling buffer (formerly sensorDataStore.ts)
// ===================================================================================

// A single, app-wide buffer of polled sensor snapshots - analogous to selectionStorage.ts's
// shared selection store. This exists (rather than each chart polling independently) so that
// a SensorGraphPopup opened from a 3D marker click always has live data, even if the user
// has never opened the IoT Dashboard tab in this session, and so REAL mode only makes one
// round of vendor API calls per second no matter how many charts are subscribed.

const MAX_HISTORY = 5000;
let snapshots: SensorSnapshot[] = [];

/** Fired whenever `snapshots` changes (new poll, or a historical replace) - has no payload,
 * listeners should call getSnapshots() to read the current data. */
export const onSnapshotsChanged = new BeEvent<() => void>();

export function getSnapshots(): readonly SensorSnapshot[] {
  return snapshots;
}

/** Used by REAL-mode historical fetches (see IoTDashboard.tsx) to swap in a vendor's logged
 * history wholesale, instead of appending. */
export function replaceSnapshots(next: SensorSnapshot[]): void {
  snapshots = next;
  onSnapshotsChanged.raiseEvent();
}

// Poll once per second, forever, starting as soon as this module is first imported
// (mirrors the eager-singleton pattern in selectionStorage.ts).
setInterval(() => {
  SensorService.getLatestSnapshot()
    .then((latest) => {
      snapshots = [...snapshots, latest].slice(-MAX_HISTORY);
      onSnapshotsChanged.raiseEvent();
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("sensorDataStore failed to poll latest snapshot:", error);
    });
}, 1000);
