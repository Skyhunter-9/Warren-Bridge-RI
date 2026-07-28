// Shared data shapes produced by this folder (radarprocessing) and consumed by the display
// components in ../radargraph. Keeping the types here (rather than in radargraph) reflects
// that these are the *processing* layer's output contract - radargraph only ever renders them.

export interface RadarAntennaInfo {
  /** Antenna/unit label shown on the echo display, e.g. "ANT3". */
  id: string;
  /** Gain mode label as radar hardware displays it, e.g. "S-MAG". */
  gainLabel: string;
  /** Pulse length label, kept as a display string (not converted to a number) since real
   * radar UIs show it as vendor-specific text, e.g. "5 [uS]". */
  pulseLengthLabel: string;
  /** Max display range, in feet (this app's unit convention - see CLAUDE.md) rather than
   * nautical miles, since this is a fixed structural-monitoring installation, not marine
   * navigation equipment. */
  rangeFeet: number;
}

/** One radar antenna rotation's worth of metadata. The raw sea-clutter backscatter itself
 * isn't stored here - RadarEchoCanvas.tsx generates that speckle texture procedurally per
 * frame (there's no real hardware feed to capture in SIMULATED mode, so a stored pixel grid
 * would just be discarded noise). */
export interface RadarSweep {
  timestamp: number;
  /** The antenna's fixed, as-installed compass orientation on the bridge structure - this
   * unit is permanently mounted (not aboard a moving vessel), so unlike a ship's heading this
   * never changes on its own; see radarEchoSimulator.ts. */
  mountingBearingDeg: number;
  antenna: RadarAntennaInfo;
}

/** A single-peaked directional wave spectrum - energy as a function of direction (compass
 * degrees) and period (seconds), parameterized as a Gaussian blob rather than a full 2D grid
 * since that's all a simulated "processed" result needs (see waveSpectrumProcessor.ts). A real
 * radar wave-inversion system would instead produce a full direction/frequency energy grid;
 * swapping this out for one later only requires changing how WaveSpectrumCanvas.tsx samples
 * energy at a given (angle, period), not the rest of the pipeline. Deliberately has no
 * heading/course/speed-over-ground fields - those are marine-vessel concepts that don't apply
 * to a fixed bridge-mounted installation. */
export interface WaveSpectrum {
  timestamp: number;
  /** Compass direction (deg True) the dominant wave system is coming FROM. */
  peakDirectionDeg: number;
  peakPeriodSec: number;
  /** Angular spread (roughly a std-dev) of the energy blob, in degrees. */
  dirSpreadDeg: number;
  /** Period-axis spread of the energy blob, in seconds. */
  periodSpreadSec: number;
  /** Peak energy density, 0-1 - drives the blob's color/intensity. */
  peakEnergy: number;
  windDirDeg: number;
  windSpeedMph: number;
}
