import React, { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BeEvent } from "@itwin/core-bentley";
import { ProcessingPoint } from "./createProcessingStore";

// The <select> dropdown pinned to the top-right corner of a chart card - a local copy of
// IoTDashboard.tsx's ChartTimeframeDropdown (not imported from there to avoid a circular
// import - IoTDashboard.tsx doesn't mount this tab's charts, but keeping the copy here means
// every "result script" chart shares this ONE definition instead of each re-copying it).
const ChartTimeframeDropdown: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
  const timeframes = [
    "Real time", "Last 5 Minutes", "last 1 Hour", "last 3 Hours",
    "last 24 Hours", "last 7 Days", "last 30 Days", "last 1 Year", "all time",
  ];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "6px",
        right: "12px",
        zIndex: 10,
        padding: "3px 6px",
        fontSize: "11px",
        borderRadius: "4px",
        border: "1px solid #cbd5e1",
        backgroundColor: "#ffffff",
        color: "#334155",
        cursor: "pointer",
      }}
    >
      {timeframes.map((tf) => (
        <option key={tf} value={tf}>{tf}</option>
      ))}
    </select>
  );
};

// Same cutoff logic as IoTDashboard.tsx's getLookbackCutoff.
function getLookbackCutoff(timeframe: string): number {
  const now = Date.now();
  switch (timeframe) {
    case "Last 5 Minutes": return now - 5 * 60 * 1000;
    case "last 1 Hour": return now - 60 * 60 * 1000;
    case "last 3 Hours": return now - 3 * 60 * 60 * 1000;
    case "last 24 Hours": return now - 24 * 60 * 60 * 1000;
    case "last 7 Days": return now - 7 * 24 * 60 * 60 * 1000;
    case "last 30 Days": return now - 30 * 24 * 60 * 60 * 1000;
    case "last 1 Year": return now - 365 * 24 * 60 * 60 * 1000;
    case "Real time":
    default:
      return now - 45 * 1000;
  }
}

export interface ProcessingLineDef {
  dataKey: string;
  name: string;
  color: string;
  dashed?: boolean;
}

export interface ProcessingLineChartProps {
  /** Card heading, e.g. "📐 Geophone Displacement (Python-processed)". */
  title: string;
  /** Small, muted text after the title, e.g. "relative to baseline". */
  subtitle?: string;
  getPoints: () => readonly ProcessingPoint[];
  getError: () => string | null;
  onDataChanged: BeEvent<() => void>;
  /** One entry per line to draw - `dataKey` must match a field name in the points returned by
   * the Python endpoint (see python/api/main.py's `process` functions). */
  lines: ProcessingLineDef[];
  /** Shown in the connection-error message, e.g. "python/api/main.py" (the default). */
  helpPath?: string;
}

/**
 * Generic chart card for any Python "result script" endpoint (see createProcessingStore.ts
 * and python/api/main.py's "HOW TO ADD A NEW RESULT SCRIPT" recipe) - same
 * ChartTimeframeDropdown + LineChart layout/behavior as every other sensor graph in this
 * dashboard. A new script's chart is just this component configured with its own title/lines -
 * see src/geophone/GeophoneDisplacementChart.tsx for the pattern to copy.
 */
export function ProcessingLineChart({ title, subtitle, getPoints, getError, onDataChanged, lines, helpPath = "python/api/main.py" }: ProcessingLineChartProps) {
  const [timeframe, setTimeframe] = useState("Real time");
  const [, setTick] = useState(0);

  useEffect(() => {
    return onDataChanged.addListener(() => setTick((t) => t + 1));
  }, [onDataChanged]);

  const points = getPoints();
  const error = getError();

  const filteredPoints = timeframe === "Real time"
    ? points.slice(-45)
    : points.filter((p) => p.timestamp >= getLookbackCutoff(timeframe));

  return (
    <div style={{ background: "#fff", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0", position: "relative" }}>
      <h4 style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#2d3748" }}>
        {title}{" "}
        {subtitle && <span style={{ fontSize: "11px", opacity: 0.55, fontWeight: "normal" }}>{subtitle}</span>}
      </h4>
      <ChartTimeframeDropdown value={timeframe} onChange={setTimeframe} />
      {error && (
        <div style={{ fontSize: "11px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "4px", padding: "4px 8px", marginBottom: "6px" }}>
          Can&apos;t reach the Python processing API ({error}). Is it running? See <code>{helpPath}</code>.
        </div>
      )}
      <div style={{ width: "100%", height: "180px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredPoints} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
            <XAxis dataKey="time" stroke="#718096" style={{ fontSize: "9px" }} />
            <YAxis stroke="#718096" style={{ fontSize: "9px" }} domain={["auto", "auto"]} />
            <Tooltip wrapperStyle={{ zIndex: 9999 }} contentStyle={{ fontSize: "11px" }} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }} />
            {lines.map((line) => (
              <Line
                key={line.dataKey}
                name={line.name}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.color}
                strokeDasharray={line.dashed ? "3 3" : undefined}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
