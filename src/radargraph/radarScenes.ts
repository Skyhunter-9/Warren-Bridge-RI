import { RadarSweep, WaveSpectrum } from "../radarprocessing/radarTypes";
import {
  compassToPoint,
  drawCompassRose,
  drawRings,
  drawSpokes,
  GradientStop,
  IDENTITY_TRANSFORM,
  sampleGradient,
  setSceneTransform,
  ViewTransform,
} from "./polarCanvasUtils";
import { buildEchoGrid, echoIntensityAt, MAX_PERIOD_SEC, waveEnergyAt } from "./radarFields";

// Scene-drawing functions shared by the inline preview canvases (RadarEchoCanvas.tsx,
// WaveSpectrumCanvas.tsx) and the interactive zoom/pan modal (RadarZoomModal.tsx) - kept in
// their own plain (non-component) module rather than alongside the React components, since
// Vite's Fast Refresh can't hot-reload a file that mixes component and non-component exports
// (it falls back to a full page reload instead - harmless, but worth avoiding).

export const ECHO_SIZE = 260;
export const SPECTRUM_SIZE = 260;

// Soft ocean tones (navy -> blue -> teal -> seafoam -> a warm sun-glint highlight) rather than
// a "thermal" blue-to-red palette - reads calmer and more water-like.
const CLUTTER_GRADIENT: GradientStop[] = [
  [0.0, [2, 14, 48]],
  [0.35, [7, 84, 150]],
  [0.62, [22, 150, 140]],
  [0.85, [140, 200, 120]],
  [1.0, [235, 200, 90]],
];

const ENERGY_GRADIENT: GradientStop[] = [
  [0.0, [4, 20, 60]],
  [0.3, [0, 90, 170]],
  [0.55, [0, 170, 120]],
  [0.78, [235, 215, 40]],
  [1.0, [230, 40, 30]],
];

function buildEchoTexture(size: number, cx: number, cy: number, radius: number, timestamp: number): HTMLCanvasElement {
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const octx = offscreen.getContext("2d");
  if (!octx) return offscreen;

  const grid = buildEchoGrid(timestamp);
  const image = octx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const idx = (py * size + px) * 4;
      if (r > radius) {
        image.data[idx + 3] = 0; // transparent outside the sweep circle
        continue;
      }
      const rNorm = r / radius;
      const angleDeg = (((Math.atan2(dx, -dy) * 180) / Math.PI) % 360 + 360) % 360;
      const intensity = echoIntensityAt(grid, angleDeg, rNorm);
      const [red, green, blue] = sampleGradient(CLUTTER_GRADIENT, intensity);
      image.data[idx] = red;
      image.data[idx + 1] = green;
      image.data[idx + 2] = blue;
      image.data[idx + 3] = 255;
    }
  }
  octx.putImageData(image, 0, 0);
  return offscreen;
}

/**
 * Draws the full echo scene (sea-clutter texture + compass rose + fixed mounting-bearing
 * marker + antenna HUD text) onto `ctx`, at whatever pan/zoom `transform` describes. Used by
 * both the inline preview (RadarEchoCanvas.tsx, identity transform) and the zoomed-in modal
 * (RadarZoomModal.tsx, a live transform).
 */
export function drawEchoScene(ctx: CanvasRenderingContext2D, size: number, sweep: RadarSweep, transform: ViewTransform = IDENTITY_TRANSFORM): void {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 18;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#04102b";
  ctx.fillRect(0, 0, size, size);

  const texture = buildEchoTexture(size, cx, cy, radius, sweep.timestamp);

  // The texture bitmap and every vector overlay below are drawn under the same transform, so
  // they all pan/zoom together as one scene - drawImage (unlike putImageData) respects it.
  setSceneTransform(ctx, size, transform);
  ctx.drawImage(texture, 0, 0);
  drawCompassRose(ctx, cx, cy, radius);

  // Fixed reference line showing the antenna's as-installed mounting bearing - this unit is
  // bolted to the bridge, so unlike a ship's heading marker this never moves on its own.
  const bearingPoint = compassToPoint(cx, cy, radius, sweep.mountingBearingDeg);
  ctx.strokeStyle = "#ff3b30";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(bearingPoint.x, bearingPoint.y);
  ctx.stroke();

  // Antenna info readout - fixed screen position/size regardless of zoom, like a HUD overlay.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "9px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${sweep.antenna.id} ${sweep.antenna.gainLabel}`, size - 4, size - 22);
  ctx.fillText(`PULSE: ${sweep.antenna.pulseLengthLabel}`, size - 4, size - 12);
  ctx.fillText(`RANGE: ${sweep.antenna.rangeFeet.toFixed(0)} ft`, size - 4, size - 2);
}

function buildSpectrumTexture(size: number, cx: number, cy: number, radius: number, spectrum: WaveSpectrum): HTMLCanvasElement {
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const octx = offscreen.getContext("2d");
  if (!octx) return offscreen;

  const image = octx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const idx = (py * size + px) * 4;
      if (r > radius) {
        image.data[idx + 3] = 0;
        continue;
      }
      const periodSec = (r / radius) * MAX_PERIOD_SEC;
      const angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      const energy = waveEnergyAt(spectrum, angleDeg, periodSec);
      const [red, green, blue] = sampleGradient(ENERGY_GRADIENT, energy);
      image.data[idx] = red;
      image.data[idx + 1] = green;
      image.data[idx + 2] = blue;
      image.data[idx + 3] = 255;
    }
  }
  octx.putImageData(image, 0, 0);
  return offscreen;
}

/**
 * Draws the full wave-spectrum scene (energy blob + period rings + compass rose + wind arrow
 * + telemetry HUD text) onto `ctx`, at whatever pan/zoom `transform` describes. Used by both
 * the inline preview (WaveSpectrumCanvas.tsx, identity transform) and the zoomed-in modal
 * (RadarZoomModal.tsx, a live transform).
 */
export function drawSpectrumScene(ctx: CanvasRenderingContext2D, size: number, spectrum: WaveSpectrum, transform: ViewTransform = IDENTITY_TRANSFORM): void {
  const cx = size / 2;
  const cy = size / 2 - 6;
  const radius = size / 2 - 30;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#04102b";
  ctx.fillRect(0, 0, size, size);

  const texture = buildSpectrumTexture(size, cx, cy, radius, spectrum);

  setSceneTransform(ctx, size, transform);
  ctx.drawImage(texture, 0, 0);
  drawSpokes(ctx, cx, cy, radius, 12);
  drawRings(ctx, cx, cy, radius, [0.25, 0.5, 0.75], ["5 [s]", "10 [s]", "15 [s]"]);
  drawCompassRose(ctx, cx, cy, radius);

  // Wind arrow - points toward the direction the wind is blowing FROM.
  const windTip = compassToPoint(cx, cy, radius * 0.55, spectrum.windDirDeg);
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(windTip.x, windTip.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(windTip.x, windTip.y, 3, 0, Math.PI * 2);
  ctx.fill();

  // Wind readout, bottom-left - fixed screen position/size regardless of zoom, like a HUD
  // overlay. No heading/course/speed-over-ground block here - this unit is fixed to the
  // bridge, not aboard a moving vessel (see radarTypes.ts's WaveSpectrum).
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "9px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("WIND", 6, size - 24);
  ctx.fillText(`DIR: ${spectrum.windDirDeg.toFixed(1)} T`, 6, size - 14);
  ctx.fillText(`SPD: ${spectrum.windSpeedMph.toFixed(1)} mph`, 6, size - 4);
}
