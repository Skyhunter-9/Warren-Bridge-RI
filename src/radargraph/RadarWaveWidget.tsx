import React, { useEffect, useState } from "react";
import { RadarEchoCanvas } from "./RadarEchoCanvas";
import { WaveSpectrumCanvas } from "./WaveSpectrumCanvas";
import { RadarZoomModal } from "./RadarZoomModal";
import { getLatestSweep, getLatestWaveSpectrum, onRadarDataChanged } from "../radarprocessing/radarDataStore";

type DisplayMode = "echo" | "spectrum";

/**
 * Card meant to sit directly under the Hydrology Summary card in IoTDashboard.tsx - lets the
 * user flip between the raw radar echo (PPI sea clutter) and the processed directional wave
 * spectrum, the same two views a real marine wave radar system offers side by side.
 */
export function RadarWaveWidget() {
  const [mode, setMode] = useState<DisplayMode>("echo");
  const [zoomOpen, setZoomOpen] = useState(false);
  // Bumped whenever radarDataStore.ts generates a new sweep/spectrum, purely to force a
  // re-render so getLatestSweep()/getLatestWaveSpectrum() are re-read.
  const [, setTick] = useState(0);

  useEffect(() => {
    return onRadarDataChanged.addListener(() => setTick((t) => t + 1));
  }, []);

  const sweep = getLatestSweep();
  const spectrum = getLatestWaveSpectrum();

  const buttonStyle = (active: boolean): React.CSSProperties => ({
    padding: "3px 8px",
    fontSize: "11px",
    borderRadius: "4px",
    border: "1px solid #cbd5e1",
    background: active ? "#005A9C" : "#ffffff",
    color: active ? "#ffffff" : "#334155",
    cursor: "pointer",
    fontWeight: active ? "bold" : "normal",
  });

  return (
    <div style={{ background: "#fff", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0", position: "relative" }}>
      <h4 style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#2d3748" }}>
        📡 Wave Radar Display{" "}
        <span style={{ fontSize: "11px", opacity: 0.55, fontWeight: "normal" }}>🔍 click to zoom/pan</span>
      </h4>
      <div style={{ position: "absolute", top: "6px", right: "12px", zIndex: 10, display: "flex", gap: "4px" }}>
        <button type="button" style={buttonStyle(mode === "echo")} onClick={() => setMode("echo")}>Radar Echo</button>
        <button type="button" style={buttonStyle(mode === "spectrum")} onClick={() => setMode("spectrum")}>Wave Spectrum</button>
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        {mode === "echo" ? (
          <RadarEchoCanvas sweep={sweep} onClick={() => setZoomOpen(true)} />
        ) : (
          <WaveSpectrumCanvas spectrum={spectrum} onClick={() => setZoomOpen(true)} />
        )}
      </div>
      {zoomOpen && (
        <RadarZoomModal mode={mode} sweep={sweep} spectrum={spectrum} onClose={() => setZoomOpen(false)} />
      )}
    </div>
  );
}
