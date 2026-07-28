import { SensorType } from "./SensorIcons";

// Per-sensor-type choice between the existing live vendor API polling (SensorService.ts's
// fetchRealHardwareData, called once/sec) and hourly CSV download (csvIngestion.ts). Only
// meaningful in REAL hardware mode (VITE_SENSOR_MODE=REAL) - SIMULATED mode always fabricates
// data locally and never looks at this file.
//
// Geophone and waterLevel are NOT their own SensorType (see chartData.ts's pairing via
// geophoneSeries/waterLevelSeries), so they don't get their own entry here - a geophone
// follows its paired accelerometer's mode, and each waterLevel reading follows whichever of
// waterVelocity/waveRadar it's co-located with (index 0 -> waterVelocity, index 1 -> waveRadar).
export type IngestionMode = "API" | "CSV";

export interface ApiIngestionSettings {
  mode: "API";
}

export interface CsvIngestionSettings {
  mode: "CSV";
  /** Page/endpoint the CSV file is downloaded from - see csvIngestion.ts's expected column
   * contract for this sensor type before pointing this at a real export. */
  csvUrl: string;
  /** How often to re-download and merge in new rows, in ms. Defaults to 1 hour if omitted. */
  pollIntervalMs?: number;
}

export type IngestionSettings = ApiIngestionSettings | CsvIngestionSettings;

export const DEFAULT_CSV_POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * *** Edit this to switch a sensor type from live API polling to hourly CSV download. ***
 * Example: `waterVelocity: { mode: "CSV", csvUrl: "https://hydro-vendor.net/exports/latest.csv" }`
 */
export const SENSOR_INGESTION: Record<SensorType, IngestionSettings> = {
  gnss: { mode: "API" },
  accelerometer: { mode: "API" },
  strainGauge: { mode: "API" },
  waterVelocity: { mode: "API" },
  waveRadar: { mode: "API" },
  scour: { mode: "API" },
};
