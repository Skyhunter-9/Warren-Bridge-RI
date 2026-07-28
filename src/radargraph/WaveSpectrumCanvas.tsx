import React, { useEffect, useRef, useState } from "react";
import { WaveSpectrum } from "../radarprocessing/radarTypes";
import { IDENTITY_TRANSFORM, pixelToPolar } from "./polarCanvasUtils";
import { MAX_PERIOD_SEC, waveEnergyAt } from "./radarFields";
import { drawSpectrumScene, SPECTRUM_SIZE } from "./radarScenes";

interface HoverInfo {
  screenX: number;
  screenY: number;
  directionDeg: number;
  periodSec: number;
  energyPct: number;
}

/**
 * Renders the directional wave spectrum produced by waveSpectrumProcessor.ts: energy as a
 * function of direction (angle) and period (radius) as a single Gaussian-shaped "sea state"
 * blob. Hovering shows a direction/period/energy readout; clicking (via `onClick`) is meant to
 * open RadarZoomModal.tsx for an interactive zoom/pan view. Actual drawing lives in
 * radarScenes.ts's drawSpectrumScene, shared with that modal.
 */
export function WaveSpectrumCanvas({ spectrum, onClick }: { spectrum: WaveSpectrum; onClick?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawSpectrumScene(ctx, SPECTRUM_SIZE, spectrum);
  }, [spectrum]);

  const cx = SPECTRUM_SIZE / 2;
  const cy = SPECTRUM_SIZE / 2 - 6;
  const radius = SPECTRUM_SIZE / 2 - 30;

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = pixelToPolar(e.nativeEvent.offsetX, e.nativeEvent.offsetY, SPECTRUM_SIZE, cx, cy, radius, IDENTITY_TRANSFORM);
    if (!point) {
      setHover(null);
      return;
    }
    const periodSec = point.rNorm * MAX_PERIOD_SEC;
    setHover({
      screenX: e.nativeEvent.offsetX,
      screenY: e.nativeEvent.offsetY,
      directionDeg: point.angleDeg,
      periodSec,
      energyPct: Math.round(Math.min(1, waveEnergyAt(spectrum, point.angleDeg, periodSec)) * 100),
    });
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <canvas
        ref={canvasRef}
        width={SPECTRUM_SIZE}
        height={SPECTRUM_SIZE}
        onClick={onClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", margin: "0 auto", cursor: onClick ? "zoom-in" : "default" }}
      />
      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min(hover.screenX + 10, SPECTRUM_SIZE - 130),
            top: Math.min(hover.screenY + 10, SPECTRUM_SIZE - 60),
            pointerEvents: "none",
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: "4px",
            padding: "5px 8px",
            fontSize: "10px",
            color: "#1a1a1a",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            lineHeight: 1.5,
            whiteSpace: "nowrap",
          }}
        >
          <div>Direction: {hover.directionDeg.toFixed(1)}° T</div>
          <div>Period: {hover.periodSec.toFixed(1)} s</div>
          <div>Wave Energy: {hover.energyPct}%</div>
        </div>
      )}
    </div>
  );
}
