import React, { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WaveEnergySpectrum } from "../radarprocessing/radarTypes";
import { getLatestWaveEnergySpectrum, getWaveformHistory, onRadarDataChanged } from "../radarprocessing/radarDataStore";

// The <select> dropdown pinned to the top-right corner of a chart card - a local copy of
// IoTDashboard.tsx's ChartTimeframeDropdown (not imported from there to avoid a circular
// import, since IoTDashboard.tsx is the one that mounts this widget). Kept visually identical.
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

// Evaluates the spectrum's Gaussian shape at a given period - the same "processed" curve the
// dashboard would plot if it had a full frequency-domain array; this is the display-side
// sampling of it, so it belongs here (radargraph) rather than in radarprocessing.
function energyAtPeriod(spectrum: WaveEnergySpectrum, periodSec: number): number {
  const term = (periodSec - spectrum.peakPeriodSec) / spectrum.periodSpreadSec;
  return Math.max(0, spectrum.peakEnergy * Math.exp(-0.5 * term * term));
}

const MAX_PERIOD_SEC = 20;
const PERIOD_STEP_SEC = 0.5;

/**
 * Two chart cards for the Geolux LX80-O wave/tide sensor - a fixed, non-contact microwave
 * sensor with no rotating antenna and no ability to resolve wave direction from its single
 * beam (see radarTypes.ts). "Wave Radar Signal" is a live time-series of the raw surface-
 * elevation reading, laid out exactly like the dashboard's other sensor graphs (timeframe
 * dropdown, same chart styling). "Wave Energy Spectrum" is the non-directional energy-vs-
 * period curve derived from it - period is its X-axis instead of time, so a timeframe
 * dropdown doesn't apply the same way; it always shows the current spectrum shape.
 */
export function RadarWaveWidget() {
  const [waveformTimeframe, setWaveformTimeframe] = useState("Real time");
  const [, setTick] = useState(0);

  useEffect(() => {
    return onRadarDataChanged.addListener(() => setTick((t) => t + 1));
  }, []);

  const history = getWaveformHistory();
  const flatHistory = history.map((s) => ({ time: s.timeString, timestamp: s.timestamp, surfaceElevationFeet: s.surfaceElevationFeet }));

  const filteredWaveform = (() => {
    if (flatHistory.length === 0) return [];
    if (waveformTimeframe === "Real time") return flatHistory.slice(-45);
    const cutoff = getLookbackCutoff(waveformTimeframe);
    return flatHistory.filter((row) => row.timestamp >= cutoff);
  })();

  const spectrum = getLatestWaveEnergySpectrum();
  const spectrumCurve: { period: number; energy: number }[] = [];
  for (let p = 0; p <= MAX_PERIOD_SEC; p += PERIOD_STEP_SEC) {
    spectrumCurve.push({ period: parseFloat(p.toFixed(1)), energy: parseFloat(energyAtPeriod(spectrum, p).toFixed(3)) });
  }

  return (
    <>
      <div style={{ background: "#fff", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0", position: "relative" }}>
        <h4 style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#2d3748" }}>📡 Wave Radar Signal</h4>
        <ChartTimeframeDropdown value={waveformTimeframe} onChange={setWaveformTimeframe} />
        <div style={{ width: "100%", height: "180px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredWaveform} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
              <XAxis dataKey="time" stroke="#718096" style={{ fontSize: "9px" }} />
              <YAxis stroke="#718096" style={{ fontSize: "9px" }} domain={["auto", "auto"]} />
              <Tooltip wrapperStyle={{ zIndex: 9999 }} contentStyle={{ fontSize: "11px" }} />
              <Line name="Surface Elevation (ft)" type="monotone" dataKey="surfaceElevationFeet" stroke="#1890ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: "#fff", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0", position: "relative" }}>
        <h4 style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#2d3748" }}>
          🌊 Wave Energy Spectrum{" "}
          <span style={{ fontSize: "11px", opacity: 0.55, fontWeight: "normal" }}>(non-directional - single fixed beam)</span>
        </h4>
        <div style={{ width: "100%", height: "180px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spectrumCurve} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
              <XAxis dataKey="period" stroke="#718096" style={{ fontSize: "9px" }} label={{ value: "Period (s)", position: "insideBottom", offset: -3, fontSize: 9, fill: "#718096" }} />
              <YAxis stroke="#718096" style={{ fontSize: "9px" }} domain={[0, "auto"]} />
              <Tooltip wrapperStyle={{ zIndex: 9999 }} contentStyle={{ fontSize: "11px" }} />
              <Line name="Energy Density" type="monotone" dataKey="energy" stroke="#00b8d9" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
