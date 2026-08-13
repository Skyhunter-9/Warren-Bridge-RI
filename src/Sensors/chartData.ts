import { SensorSnapshot } from "./sensorIngestion";
import { SensorType } from "./Sensor3DDisplay";

/**
 * Flattens the nested SensorSnapshot history into one flat object per data point, with
 * keys like `acc_3_Y` or `gnss_1_E`. Recharts' <Line dataKey="..."> needs flat keys, not
 * nested arrays/objects - shared by IoTDashboard.tsx and Sensor3DDisplay.tsx's SensorGraphPopup
 * so both read
 * off the exact same field names (see getSensorSeries below for what those names are).
 */
export function buildChartData(snapshots: readonly SensorSnapshot[]) {
  return snapshots.map((d) => {
    const flat: any = { time: d.timeString, timestamp: d.timestamp, waterVelocity: d.waterVelocity, waveHeight: d.waveHeight };
    d.accelerometers.forEach((acc, i) => { flat[`acc_${i}_X`] = acc.x; flat[`acc_${i}_Y`] = acc.y; flat[`acc_${i}_Z`] = acc.z; });
    d.geophones.forEach((geo, i) => { flat[`geo_${i}_X`] = geo.x; flat[`geo_${i}_Y`] = geo.y; flat[`geo_${i}_Z`] = geo.z; });
    d.strainGauges.forEach((sg, i) => { flat[`sg_${i}`] = sg; });
    d.gnss.forEach((g, i) => { flat[`gnss_${i}_E`] = g.Easting; flat[`gnss_${i}_N`] = g.Northing; flat[`gnss_${i}_Z`] = g.Elevation; });
    flat.waterLevel_1 = d.waterLevel[0]; flat.waterLevel_2 = d.waterLevel[1];
    flat.scour_1 = d.scour[0]; flat.scour_2 = d.scour[1];
    flat.windSpeed = d.weather.windSpeed; flat.windDirDeg = d.weather.windDirDeg;
    flat.temp = d.weather.temp; flat.windChill = d.weather.windChill;
    flat.pressure = d.weather.pressure; flat.humidity = d.weather.humidity;
    flat.dewPoint = d.weather.dewPoint; flat.heatIndex = d.weather.heatIndex;
    return flat;
  });
}

/**
 * Combines the live 1Hz buffer's flat rows with one or more periodic-sourced flat row arrays
 * (sensorIngestion.ts's getPeriodicHistory) into a single array a Recharts <LineChart> can read,
 * ordered by `timestamp`. Used whenever a chart card mixes an API-mode line with a Periodic-mode
 * line (or is Periodic-only) - see IoTDashboard.tsx and Sensor3DDisplay.tsx's SensorGraphPopup.
 * Rows are kept as separate entries rather than merged into one row per exact timestamp, since
 * live and periodic data essentially never land on the same instant - each <Line> just has a gap
 * wherever its own dataKey is missing on a given row, which Recharts renders fine.
 */
export function mergeChartRows(...rowGroups: Array<ReadonlyArray<Record<string, any>>>): Record<string, any>[] {
  return rowGroups.flat().sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

export interface SensorSeriesLine {
  dataKey: string;
  name: string;
  color: string;
}

export interface SensorSeriesDef {
  title: string;
  unit: string;
  lines: SensorSeriesLine[];
}

/** Every geophone is co-located with (and shares a nodeIndex with) an accelerometer - see
 * sensorIngestion.ts's SensorSnapshot.geophones. Factored out so it can be appended whenever
 * an accelerometer's series is requested (see the "accelerometer" case below). */
function geophoneSeries(nodeIndex: number): SensorSeriesDef {
  return {
    title: `Geophone Node ${nodeIndex + 1}`,
    unit: "in/s",
    lines: [
      { dataKey: `geo_${nodeIndex}_X`, name: "X-Axis", color: "#ff4d4f" },
      { dataKey: `geo_${nodeIndex}_Y`, name: "Y-Axis", color: "#faad14" },
      { dataKey: `geo_${nodeIndex}_Z`, name: "Z-Axis", color: "#1890ff" },
    ],
  };
}

/** Every water level reading is co-located with (and shares a nodeIndex with) either the
 * water velocity sensor (index 0) or the wave radar sensor (index 1) - see
 * sensorIngestion.ts's SensorSnapshot.waterLevel. Factored out the same way geophoneSeries is,
 * so it can be appended whenever waterVelocity/waveRadar's series is requested below. Not its
 * own SensorType/marker - like geophone, it's purely a paired reading, not something you'd
 * click on directly in the 3D view. */
function waterLevelSeries(nodeIndex: number): SensorSeriesDef {
  return {
    title: `Water Level Sensor ${nodeIndex + 1}`,
    unit: "in",
    lines: [{ dataKey: `waterLevel_${nodeIndex + 1}`, name: `WL ${nodeIndex + 1}`, color: "#096dd9" }],
  };
}

/**
 * Maps a sensor icon (its type + position within that type's elementIds array in
 * Sensor3DDisplay.tsx) to the specific chartData field(s) it corresponds to - this is the "link"
 * between a 3D marker and one of the existing IoTDashboard charts. `nodeIndex` is 0-based
 * (matches array position); display labels below are 1-based to match the existing
 * IoTDashboard exploded-view labels ("Accel Node 1", "Gauge Channel 1", etc.).
 *
 * Returns an array, not a single series, because accelerometer nodes are physically paired
 * with a geophone at the same location (see geophoneSeries above) - clicking an
 * accelerometer marker should pop up both readings, not just one.
 */
export function getSensorSeries(sensorType: SensorType, nodeIndex: number): SensorSeriesDef[] {
  switch (sensorType) {
    case "accelerometer":
      return [
        {
          title: `Accel Node ${nodeIndex + 1}`,
          unit: "in/s²",
          lines: [
            { dataKey: `acc_${nodeIndex}_X`, name: "X-Axis", color: "#ff4d4f" },
            { dataKey: `acc_${nodeIndex}_Y`, name: "Y-Axis", color: "#faad14" },
            { dataKey: `acc_${nodeIndex}_Z`, name: "Z-Axis", color: "#1890ff" },
          ],
        },
        geophoneSeries(nodeIndex),
      ];
    case "strainGauge":
      return [{
        title: `Gauge Channel ${nodeIndex + 1}`,
        unit: "PSI",
        lines: [{ dataKey: `sg_${nodeIndex}`, name: "Load", color: "#1890ff" }],
      }];
    case "gnss":
      return [{
        title: `GNSS Node ${nodeIndex + 1}`,
        unit: "in",
        lines: [
          { dataKey: `gnss_${nodeIndex}_E`, name: "E", color: "#52c41a" },
          { dataKey: `gnss_${nodeIndex}_N`, name: "N", color: "#13c2c2" },
          { dataKey: `gnss_${nodeIndex}_Z`, name: "Z", color: "#722ed1" },
        ],
      }];
    case "waterVelocity":
      // Only one field exists (no per-node array) - every waterVelocity marker shows the same
      // series. Paired with waterLevel[0] - see waterLevelSeries above.
      return [
        {
          title: "Flow Sensor",
          unit: "mph",
          lines: [{ dataKey: "waterVelocity", name: "Velocity", color: "#fa8c16" }],
        },
        waterLevelSeries(0),
      ];
    case "waveRadar":
      // Only one field exists (no per-node array) - every waveRadar marker shows the same
      // series. Paired with waterLevel[1] - see waterLevelSeries above.
      return [
        {
          title: "Radar Wave Profile",
          unit: "in",
          lines: [{ dataKey: "waveHeight", name: "Wave Height", color: "#00b8d9" }],
        },
        waterLevelSeries(1),
      ];
    case "scour":
      return [{
        title: `Scour Sensor ${nodeIndex + 1}`,
        unit: "in",
        lines: [{ dataKey: `scour_${nodeIndex + 1}`, name: `Pier ${nodeIndex + 1} Scour`, color: "#722ed1" }],
      }];
    case "weather":
      // Only one field set exists (no per-node array, single station) - every weather marker
      // shows the same 5 series, one per raw/calculated reading, matching IoTDashboard.tsx's
      // exploded weather cards' colors exactly so the popup and dashboard read consistently.
      return [
        {
          title: "Wind Speed",
          unit: "mph",
          lines: [{ dataKey: "windSpeed", name: "Wind Speed", color: "#1890ff" }],
        },
        {
          title: "Air Temperature",
          unit: "°F",
          lines: [{ dataKey: "temp", name: "Temp", color: "#fa541c" }],
        },
        {
          title: "Barometric Pressure",
          unit: "inHg",
          lines: [{ dataKey: "pressure", name: "Pressure", color: "#722ed1" }],
        },
        {
          title: "Relative Humidity",
          unit: "%",
          lines: [{ dataKey: "humidity", name: "Humidity", color: "#13c2c2" }],
        },
        {
          title: "Heat Index",
          unit: "°F",
          lines: [{ dataKey: "heatIndex", name: "Heat Index", color: "#eb2f96" }],
        },
      ];
    case "camera":
      // No image/video ingestion exists yet (see Sensor3DDisplay.tsx's camera SENSOR_GROUPS
      // entry) - every camera marker is noData: true, so this never actually gets called from
      // the popup, but the switch still needs a case to stay exhaustive over SensorType.
      return [];
  }
}
