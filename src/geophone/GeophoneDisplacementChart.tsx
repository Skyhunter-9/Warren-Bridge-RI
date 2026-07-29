import React from "react";
import { ProcessingLineChart } from "../processing/ProcessingLineChart";
import { getGeophoneApiError, getGeophoneDisplacementPoints, onGeophoneDataChanged } from "./geophoneDisplacementStore";

/**
 * Chart card for the geophone displacement pipeline running in Python (see
 * python/geophonetest/displacement.py + python/api/main.py) - drift-corrected displacement,
 * recovered from raw velocity via high-pass filtering + cumulative integration, shown relative
 * to its own baseline (a high-pass filter recovers motion shape, not absolute position - see
 * that module's docstrings). This is the pattern to copy for a new result script's chart -
 * everything reusable lives in ProcessingLineChart.tsx, so this file only needs to say what to
 * show.
 */
export function GeophoneDisplacementChart() {
  return (
    <ProcessingLineChart
      title="📐 Geophone Displacement (Python-processed)"
      subtitle="relative to baseline"
      getPoints={getGeophoneDisplacementPoints}
      getError={getGeophoneApiError}
      onDataChanged={onGeophoneDataChanged}
      lines={[
        { dataKey: "trapezoidalIn", name: "Trapezoidal (in)", color: "#1890ff" },
        { dataKey: "simpsonsIn", name: "Simpson's (in)", color: "#fa8c16", dashed: true },
      ]}
    />
  );
}
