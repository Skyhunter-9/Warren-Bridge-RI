// Shared drawing helpers for the polar/compass-style displays in this folder
// (RadarEchoCanvas.tsx, WaveSpectrumCanvas.tsx) - both are circular, compass-oriented plots
// (0 deg = North = up, increasing clockwise, the nautical/radar convention) rather than the
// standard math convention canvas angles use natively, so the conversion lives here once.

export function compassToPoint(cx: number, cy: number, radius: number, compassDeg: number): { x: number; y: number } {
  const rad = (compassDeg * Math.PI) / 180;
  return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}

/** Smallest angular distance between two compass bearings, 0-180 deg - handles wraparound
 * (e.g. 350 vs 10 is a 20 deg difference, not 340). */
export function angularDiffDeg(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export type GradientStop = [number, [number, number, number]];

/** Linearly interpolates an RGB color between a sorted list of (t, color) stops - used to
 * colorize both the sea-clutter speckle and the wave-energy blob the same way a real radar
 * display's intensity palette would. */
export function sampleGradient(stops: GradientStop[], t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const f = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export function drawCompassRose(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labels: Array<[string, number]> = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];
  for (const [label, deg] of labels) {
    const p = compassToPoint(cx, cy, radius + 10, deg);
    ctx.fillText(label, p.x, p.y);
  }
  ctx.restore();
}

export function drawSpokes(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, count: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.setLineDash([2, 4]);
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const deg = (360 / count) * i;
    const p = compassToPoint(cx, cy, radius, deg);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Concentric dashed rings at the given fractions of `radius` (0-1), each with an optional
 * label drawn just inside it - used for the wave spectrum's period rings (5s/10s/15s). */
export function drawRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fractions: number[],
  labels?: string[]
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  fractions.forEach((f, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * f, 0, Math.PI * 2);
    ctx.stroke();
    if (labels?.[i]) ctx.fillText(labels[i], cx + 3, cy - radius * f);
  });
  ctx.restore();
}

/** A uniform zoom (around the plot's center) plus screen-space pan - RadarZoomModal.tsx is
 * the only thing that ever changes this away from the identity; RadarEchoCanvas.tsx/
 * WaveSpectrumCanvas.tsx's inline previews always draw at the identity transform. */
export interface ViewTransform {
  scale: number;
  panX: number;
  panY: number;
}

export const IDENTITY_TRANSFORM: ViewTransform = { scale: 1, panX: 0, panY: 0 };

/** Applies `transform` as the canvas's current transformation matrix, so everything drawn
 * afterward (both `drawImage`, which - unlike `putImageData` - respects the transform, and
 * ordinary vector draws) zooms/pans together as one scene. Callers should
 * `ctx.setTransform(1,0,0,1,0,0)` afterward before drawing any fixed-position HUD text. */
export function setSceneTransform(ctx: CanvasRenderingContext2D, size: number, transform: ViewTransform): void {
  const c = size / 2;
  const { scale, panX, panY } = transform;
  ctx.setTransform(scale, 0, 0, scale, c * (1 - scale) + panX, c * (1 - scale) + panY);
}

/** Inverse of setSceneTransform - maps a screen/canvas pixel back to the untransformed model
 * pixel it currently displays, then converts that to (angleDeg, radiusFraction), or null if
 * the point falls outside the plot's circle. Used for hover tooltips and click hit-testing. */
export function pixelToPolar(
  screenX: number,
  screenY: number,
  size: number,
  cx: number,
  cy: number,
  radius: number,
  transform: ViewTransform
): { angleDeg: number; rNorm: number } | null {
  const c = size / 2;
  const { scale, panX, panY } = transform;
  const modelX = (screenX - (c * (1 - scale) + panX)) / scale;
  const modelY = (screenY - (c * (1 - scale) + panY)) / scale;

  const dx = modelX - cx;
  const dy = modelY - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > radius) return null;

  const angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return { angleDeg: ((angleDeg % 360) + 360) % 360, rNorm: r / radius };
}
