import React, { useEffect, useMemo, useRef, useState } from "react";
import { RadarSweep } from "../radarprocessing/radarTypes";
import { IDENTITY_TRANSFORM, pixelToPolar } from "./polarCanvasUtils";
import { buildEchoGrid, echoIntensityAt } from "./radarFields";
import { drawEchoScene, ECHO_SIZE } from "./radarScenes";

interface HoverInfo {
  screenX: number;
  screenY: number;
  bearingDeg: number;
  rangeFeet: number;
  intensityPct: number;
}

/**
 * Renders a plan-position-indicator (PPI) style raw radar echo display: sea-clutter texture
 * with no obvious structure. That's intentional - wave energy only becomes visible after the
 * spectral processing in waveSpectrumProcessor.ts, which is what WaveSpectrumCanvas.tsx shows
 * instead. Hovering shows a bearing/range/intensity readout; clicking (via `onClick`) is meant
 * to open RadarZoomModal.tsx for an interactive zoom/pan view. Actual drawing lives in
 * radarScenes.ts's drawEchoScene, shared with that modal.
 */
export function RadarEchoCanvas({ sweep, onClick }: { sweep: RadarSweep; onClick?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const grid = useMemo(() => buildEchoGrid(sweep.timestamp), [sweep.timestamp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawEchoScene(ctx, ECHO_SIZE, sweep);
  }, [sweep]);

  const cx = ECHO_SIZE / 2;
  const cy = ECHO_SIZE / 2;
  const radius = ECHO_SIZE / 2 - 18;

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = pixelToPolar(e.nativeEvent.offsetX, e.nativeEvent.offsetY, ECHO_SIZE, cx, cy, radius, IDENTITY_TRANSFORM);
    if (!point) {
      setHover(null);
      return;
    }
    setHover({
      screenX: e.nativeEvent.offsetX,
      screenY: e.nativeEvent.offsetY,
      bearingDeg: point.angleDeg,
      rangeFeet: point.rNorm * sweep.antenna.rangeFeet,
      intensityPct: Math.round(Math.min(1, echoIntensityAt(grid, point.angleDeg, point.rNorm)) * 100),
    });
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <canvas
        ref={canvasRef}
        width={ECHO_SIZE}
        height={ECHO_SIZE}
        onClick={onClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", margin: "0 auto", cursor: onClick ? "zoom-in" : "default" }}
      />
      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min(hover.screenX + 10, ECHO_SIZE - 120),
            top: Math.min(hover.screenY + 10, ECHO_SIZE - 60),
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
          <div>Bearing: {hover.bearingDeg.toFixed(1)}° T</div>
          <div>Range: {hover.rangeFeet.toFixed(0)} ft</div>
          <div>Echo Intensity: {hover.intensityPct}%</div>
        </div>
      )}
    </div>
  );
}
