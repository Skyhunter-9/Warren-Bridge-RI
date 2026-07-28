import React, { useEffect, useRef, useState } from "react";
import { RadarSweep, WaveSpectrum } from "../radarprocessing/radarTypes";
import { buildEchoGrid, echoIntensityAt, MAX_PERIOD_SEC, waveEnergyAt } from "./radarFields";
import { IDENTITY_TRANSFORM, pixelToPolar, ViewTransform } from "./polarCanvasUtils";
import { drawEchoScene, drawSpectrumScene } from "./radarScenes";

const MODAL_SIZE = 480;
const MIN_SCALE = 1;
const MAX_SCALE = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface HoverInfo {
  screenX: number;
  screenY: number;
  line1: string;
  line2: string;
  line3: string;
}

/**
 * Full-screen interactive view opened by clicking either RadarEchoCanvas or WaveSpectrumCanvas
 * - mirrors SensorGraphPopup.tsx's modal pattern (dark backdrop, centered card, close on
 * backdrop click/Escape), but instead of a Recharts chart it hosts an interactive zoom/pan
 * canvas rendering the exact same scene (drawEchoScene/drawSpectrumScene) the small preview
 * uses, just at a bigger size and a live pan/zoom transform. Scroll to zoom (toward the
 * cursor), drag to pan, hover for a bearing/range or direction/period readout depending on
 * `mode`, double-click to reset the view.
 */
export function RadarZoomModal({
  mode,
  sweep,
  spectrum,
  onClose,
}: {
  mode: "echo" | "spectrum";
  sweep: RadarSweep;
  spectrum: WaveSpectrum;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [transform, setTransform] = useState<ViewTransform>(IDENTITY_TRANSFORM);
  const [isDragging, setIsDragging] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  const cx = MODAL_SIZE / 2;
  const cy = mode === "echo" ? MODAL_SIZE / 2 : MODAL_SIZE / 2 - 6;
  const radius = mode === "echo" ? MODAL_SIZE / 2 - 24 : MODAL_SIZE / 2 - 42;

  // Redraw whenever the live data or the view transform changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (mode === "echo") drawEchoScene(ctx, MODAL_SIZE, sweep, transform);
    else drawSpectrumScene(ctx, MODAL_SIZE, spectrum, transform);
  }, [mode, sweep, spectrum, transform]);

  // Wheel-to-zoom needs a non-passive native listener - React's synthetic onWheel can't
  // reliably preventDefault() (some builds register it as passive), so it's attached here.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setTransform((prev) => {
        const zoomFactor = Math.exp(-e.deltaY * 0.001);
        const newScale = clamp(prev.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
        if (newScale === prev.scale) return prev;

        // Keep the model point under the cursor fixed on screen while zooming.
        const c = MODAL_SIZE / 2;
        const modelX = (mouseX - (c * (1 - prev.scale) + prev.panX)) / prev.scale;
        const modelY = (mouseY - (c * (1 - prev.scale) + prev.panY)) / prev.scale;
        const maxPan = (newScale - 1) * c + 40;
        return {
          scale: newScale,
          panX: clamp(mouseX - c * (1 - newScale) - modelX * newScale, -maxPan, maxPan),
          panY: clamp(mouseY - c * (1 - newScale) - modelY * newScale, -maxPan, maxPan),
        };
      });
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // Escape closes the modal, same as SensorGraphPopup.tsx.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Drag-to-pan needs window-level listeners so the drag keeps tracking even if the cursor
  // leaves the canvas mid-drag.
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      setTransform((prev) => {
        const c = MODAL_SIZE / 2;
        const maxPan = (prev.scale - 1) * c + 40;
        return {
          scale: prev.scale,
          panX: clamp(dragStart.current.panX + (e.clientX - dragStart.current.mouseX), -maxPan, maxPan),
          panY: clamp(dragStart.current.panY + (e.clientY - dragStart.current.mouseY), -maxPan, maxPan),
        };
      });
    };
    const handleUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setHover(null);
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, panX: transform.panX, panY: transform.panY };
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) return;
    const point = pixelToPolar(e.nativeEvent.offsetX, e.nativeEvent.offsetY, MODAL_SIZE, cx, cy, radius, transform);
    if (!point) {
      setHover(null);
      return;
    }

    if (mode === "echo") {
      const grid = buildEchoGrid(sweep.timestamp);
      const intensityPct = Math.round(Math.min(1, echoIntensityAt(grid, point.angleDeg, point.rNorm)) * 100);
      const rangeFeet = point.rNorm * sweep.antenna.rangeFeet;
      setHover({
        screenX: e.nativeEvent.offsetX,
        screenY: e.nativeEvent.offsetY,
        line1: `Bearing: ${point.angleDeg.toFixed(1)}° T`,
        line2: `Range: ${rangeFeet.toFixed(0)} ft`,
        line3: `Echo Intensity: ${intensityPct}%`,
      });
    } else {
      const periodSec = point.rNorm * MAX_PERIOD_SEC;
      const energyPct = Math.round(Math.min(1, waveEnergyAt(spectrum, point.angleDeg, periodSec)) * 100);
      setHover({
        screenX: e.nativeEvent.offsetX,
        screenY: e.nativeEvent.offsetY,
        line1: `Direction: ${point.angleDeg.toFixed(1)}° T`,
        line2: `Period: ${periodSec.toFixed(1)} s`,
        line3: `Wave Energy: ${energyPct}%`,
      });
    }
  };

  const resetView = () => setTransform(IDENTITY_TRANSFORM);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClose}
      onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="dialog"
        aria-label={mode === "echo" ? "Radar Echo (zoom/pan)" : "Wave Spectrum (zoom/pan)"}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          color: "#333",
          borderRadius: "8px",
          padding: "16px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div>
            <span style={{ fontWeight: "bold", fontSize: "13px" }}>{mode === "echo" ? "📡 Radar Echo" : "🌊 Wave Spectrum"}</span>
            <span style={{ fontSize: "11px", opacity: 0.6, marginLeft: "8px" }}>scroll to zoom - drag to pan - double-click to reset</span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              onClick={resetView}
              style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "4px", padding: "3px 8px", fontSize: "11px", cursor: "pointer" }}
            >
              Reset View
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ border: "none", background: "transparent", fontSize: "18px", cursor: "pointer", lineHeight: 1, color: "#333" }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ position: "relative", width: MODAL_SIZE, height: MODAL_SIZE }}>
          <canvas
            ref={canvasRef}
            width={MODAL_SIZE}
            height={MODAL_SIZE}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHover(null)}
            onDoubleClick={resetView}
            style={{ display: "block", cursor: isDragging ? "grabbing" : "grab" }}
          />
          {hover && !isDragging && (
            <div
              style={{
                position: "absolute",
                left: Math.min(hover.screenX + 12, MODAL_SIZE - 150),
                top: Math.min(hover.screenY + 12, MODAL_SIZE - 70),
                pointerEvents: "none",
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "4px",
                padding: "6px 10px",
                fontSize: "11px",
                color: "#1a1a1a",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                lineHeight: 1.6,
                whiteSpace: "nowrap",
              }}
            >
              <div>{hover.line1}</div>
              <div>{hover.line2}</div>
              <div>{hover.line3}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
