// src/Sensors/SensorLineChart.tsx
//
// The one shared Recharts <LineChart> body used by every per-sensor chart in this app - both
// IoTDashboard.tsx's exploded per-node cards and Sensor3DDisplay.tsx's SensorGraphPopup (the
// 3D marker click popup) render through this component, instead of each hand-writing its own
// near-identical copy of <ResponsiveContainer><LineChart>...</LineChart></ResponsiveContainer>.
// Paired with chartData.ts's getMergedSensorChartData() (the shared DATA source) and
// getSensorSeries() (the shared LINE definitions - which dataKey/color/name each series draws) -
// together these three mean a given sensor's chart (e.g. "GNSS Node 1") really is defined in one
// place, so editing a color or adding a line in chartData.ts changes it everywhere it's shown,
// instead of needing the same edit made twice and silently drifting apart over time.

import React from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SensorSeriesLine } from "./chartData";

export interface SensorLineChartProps {
  data: Record<string, any>[];
  lines: SensorSeriesLine[];
  height?: number;
  /** Shows a Legend below the chart - on for the 3D popup (each mini-chart is otherwise
   * unlabeled besides its title), off for IoTDashboard.tsx's per-node cards (too little room,
   * and there are dozens of them on screen in the exploded grid at once). Defaults to false. */
  showLegend?: boolean;
  /** Only needed when this chart is rendered inside something else with its own z-index
   * stacking context (e.g. SensorGraphPopup's modal overlay) - without it, the Tooltip can
   * render underneath the overlay instead of on top of it. */
  tooltipZIndex?: number;
}

export function SensorLineChart({ data, lines, height = 180, showLegend = false, tooltipZIndex }: SensorLineChartProps) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" style={{ fontSize: "8px" }} />
          <YAxis style={{ fontSize: "8px" }} domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ fontSize: "10px" }} wrapperStyle={tooltipZIndex ? { zIndex: tooltipZIndex } : undefined} />
          {showLegend && <Legend iconType="plainline" wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }} />}
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              name={line.name}
              type="monotone"
              dataKey={line.dataKey}
              stroke={line.color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              // Draws through a missing point instead of breaking the line - matters for
              // Periodic-mode sensors (e.g. GNSS), which genuinely have gaps; harmless for
              // continuously-live sensors, which never have any.
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
