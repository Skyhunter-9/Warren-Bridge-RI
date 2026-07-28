import { WaveSpectrum } from "../radarprocessing/radarTypes";
import { angularDiffDeg } from "./polarCanvasUtils";
import { buildOceanNoiseGrid, OceanNoiseGrid, sampleOceanNoise } from "./oceanNoise";

// Pure numeric field-sampling functions shared between the canvas draw code (RadarEchoCanvas,
// WaveSpectrumCanvas, RadarZoomModal) and hover-tooltip hit-testing - both need to evaluate
// "what value is being shown at this (angle, range/period)" the exact same way, so it lives
// here once rather than being re-derived per component.

export const ECHO_GRID_ANGLE_STEPS = 20;
export const ECHO_GRID_RADIUS_STEPS = 8;
export const MAX_PERIOD_SEC = 20;

/** Deterministic per the sweep's timestamp - rebuilding this with the same timestamp always
 * reproduces the exact same grid, so it's safe to call again for tooltip hit-testing without
 * needing to share the same object instance the draw pass used. */
export function buildEchoGrid(timestamp: number): OceanNoiseGrid {
  return buildOceanNoiseGrid(ECHO_GRID_ANGLE_STEPS, ECHO_GRID_RADIUS_STEPS, timestamp / 1500);
}

/** Echo intensity (roughly 0-1, occasionally a bit above from the highlight boost) at a given
 * bearing/normalized-range - the same "sea clutter" value RadarEchoCanvas colors each pixel
 * with. */
export function echoIntensityAt(grid: OceanNoiseGrid, angleDeg: number, rNorm: number): number {
  const noise = sampleOceanNoise(grid, angleDeg / 360, rNorm);
  const falloff = 1 - rNorm * 0.35;
  return Math.max(0, noise * falloff - 0.15) * 1.3;
}

/** Wave energy density (0-1) at a given direction/period - a single Gaussian blob centered on
 * the spectrum's peak, the same value WaveSpectrumCanvas colors each pixel with. */
export function waveEnergyAt(spectrum: WaveSpectrum, angleDeg: number, periodSec: number): number {
  const dirTerm = angularDiffDeg(angleDeg, spectrum.peakDirectionDeg) / spectrum.dirSpreadDeg;
  const periodTerm = (periodSec - spectrum.peakPeriodSec) / spectrum.periodSpreadSec;
  return spectrum.peakEnergy * Math.exp(-0.5 * (dirTerm * dirTerm + periodTerm * periodTerm));
}
