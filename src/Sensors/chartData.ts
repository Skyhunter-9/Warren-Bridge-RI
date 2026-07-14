import { SensorSnapshot } from "./SensorService";
import { SensorType } from "./SensorIcons";

/**
 * Flattens the nested SensorSnapshot history into one flat object per data point, with
 * keys like `acc_3_Y` or `gnss_1_E`. Recharts' <Line dataKey="..."> needs flat keys, not
 * nested arrays/objects - shared by IoTDashboard.tsx and SensorGraphPopup.tsx so both read
 * off the exact same field names (see getSensorSeries below for what those names are).
 */
export function buildChartData(snapshots: readonly SensorSnapshot[]) {
  return snapshots.map((d) => {
    const flat: any = { time: d.timeString, waterVelocity: d.waterVelocity };
    d.accelerometers.forEach((acc, i) => { flat[`acc_${i}_X`] = acc.x; flat[`acc_${i}_Y`] = acc.y; flat[`acc_${i}_Z`] = acc.z; });
    d.geophones.forEach((geo, i) => { flat[`geo_${i}_X`] = geo.x; flat[`geo_${i}_Y`] = geo.y; flat[`geo_${i}_Z`] = geo.z; });
    d.strainGauges.forEach((sg, i) => { flat[`sg_${i}`] = sg; });
    d.gnss.forEach((g, i) => { flat[`gnss_${i}_E`] = g.Easting; flat[`gnss_${i}_N`] = g.Northing; flat[`gnss_${i}_Z`] = g.Elevation; });
    flat.waterLevel_1 = d.waterLevel[0]; flat.waterLevel_2 = d.waterLevel[1];
    flat.scour_1 = d.scour[0]; flat.scour_2 = d.scour[1];
    return flat;
  });
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
 * SensorService.ts's SensorSnapshot.geophones. Factored out so it can be appended whenever
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

/**
 * Maps a sensor icon (its type + position within that type's elementIds array in
 * SensorIcons.ts) to the specific chartData field(s) it corresponds to - this is the "link"
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
    case "waterLevel":
      return [{
        title: `Water Level Sensor ${nodeIndex + 1}`,
        unit: "in",
        lines: [{ dataKey: `waterLevel_${nodeIndex + 1}`, name: `WL ${nodeIndex + 1}`, color: "#096dd9" }],
      }];
    case "waterVelocity":
      // Only one field exists (no per-node array) - every waterVelocity marker shows the same series.
      return [{
        title: "Water Velocity Sensor",
        unit: "mph",
        lines: [{ dataKey: "waterVelocity", name: "Velocity", color: "#fa8c16" }],
      }];
    case "scour":
      return [{
        title: `Scour Sensor ${nodeIndex + 1}`,
        unit: "in",
        lines: [{ dataKey: `scour_${nodeIndex + 1}`, name: `Pier ${nodeIndex + 1} Scour`, color: "#722ed1" }],
      }];
  }
}
