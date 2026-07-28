import { BeEvent } from "@itwin/core-bentley";
import { SensorType } from "./SensorIcons";
import { DEFAULT_CSV_POLL_INTERVAL_MS, SENSOR_INGESTION } from "./ingestionConfig";

// Hourly CSV ingestion for sensor types configured for CSV mode in ingestionConfig.ts. This
// is a completely separate data path from sensorDataStore.ts's 1-second live buffer - CSV
// data never enters that buffer (per-design: a CSV-mode sensor has no live push/pull API to
// poll every second, only a periodically-refreshed export file). Charts read CSV history via
// getCsvHistory()/getLatestCsvRow() and merge it alongside the live buffer themselves (see
// chartData.ts's mergeChartRows, used by IoTDashboard.tsx and SensorGraphPopup.tsx).
//
// *** Expected CSV column contract *** - the file downloaded for a given sensor type must have
// a "timestamp" column (anything Date.parse() can read, e.g. ISO 8601) plus one column per
// chart data key that type owns - i.e. the exact same flat key names chartData.ts's
// buildChartData()/getSensorSeries() already use, so no extra field-mapping layer is needed:
//   gnss:           gnss_0_E, gnss_0_N, gnss_0_Z, gnss_1_E, ... (up to gnss_5_*)
//   accelerometer:  acc_0_X, acc_0_Y, acc_0_Z, ... (up to acc_9_*) + geo_0_X, ... (paired geophone)
//   strainGauge:    sg_0, sg_1, ... sg_8
//   waterVelocity:  waterVelocity, waterLevel_1 (its co-located water level reading)
//   waveRadar:      waveHeight, waterLevel_2 (its co-located water level reading)
//   scour:          scour_1, scour_2
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
      time: new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
    };
    headers.forEach((header, i) => {
      if (i === timestampCol) return;
      const raw = row[i];
      const num = parseFloat(raw);
      flat[header] = Number.isNaN(num) ? raw : num;
    });
    result.push(flat);
  }
  return result;
}

// One accumulated, deduped-by-timestamp history per CSV-mode sensor type. Grows across every
// hourly download for the lifetime of the tab (never wholesale-replaced), which is what lets
// the dropdown timeframes further out than an hour (3 hours, 24 hours, ...) show real backfill
// instead of just whatever the single most recent file contained.
const csvHistory = new Map<SensorType, FlatCsvRow[]>();

/** Fired whenever a sensor type's CSV history changes (new download merged in). No payload -
 * listeners should call getCsvHistory(type)/getLatestCsvRow(type) to read current data. */
export const onCsvHistoryChanged = new BeEvent<(type: SensorType) => void>();

export function getCsvHistory(type: SensorType): readonly FlatCsvRow[] {
  return csvHistory.get(type) ?? [];
}

export function getLatestCsvRow(type: SensorType): FlatCsvRow | undefined {
  const history = csvHistory.get(type);
  return history && history.length > 0 ? history[history.length - 1] : undefined;
}

async function refreshCsvForType(type: SensorType, csvUrl: string): Promise<void> {
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error(`CSV download returned status ${response.status}`);
    const text = await response.text();
    const newRows = csvToFlatRows(text);

    // Merge with whatever's already accumulated, deduping by exact timestamp (a fresh
    // download's row wins ties, in case a vendor re-exports a corrected value for a past point).
    const merged = new Map<number, FlatCsvRow>();
    for (const row of getCsvHistory(type)) merged.set(row.timestamp, row);
    for (const row of newRows) merged.set(row.timestamp, row);

    csvHistory.set(type, Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp));
    onCsvHistoryChanged.raiseEvent(type);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`CSV ingestion failed for sensor type "${type}":`, error);
  }
}

// Eager singleton, same pattern as sensorDataStore.ts: as soon as this module is first
// imported (from IoTDashboard.tsx/SensorGraphPopup.tsx), start one hourly polling timer per
// CSV-mode sensor type, with an immediate first download so history isn't empty on load.
// No-ops entirely in SIMULATED mode.
if ((import.meta.env.VITE_SENSOR_MODE as string) === "REAL") {
  (Object.keys(SENSOR_INGESTION) as SensorType[]).forEach((type) => {
    const settings = SENSOR_INGESTION[type];
    if (settings.mode !== "CSV") return;
    const intervalMs = settings.pollIntervalMs ?? DEFAULT_CSV_POLL_INTERVAL_MS;
    void refreshCsvForType(type, settings.csvUrl);
    setInterval(() => void refreshCsvForType(type, settings.csvUrl), intervalMs);
  });
}
