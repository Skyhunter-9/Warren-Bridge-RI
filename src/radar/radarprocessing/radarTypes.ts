// Shared data shapes produced by this folder (radarprocessing) and consumed by the display
// component in ../radargraph. Modeled on a Geolux LX80-O: a fixed, non-contact microwave
// (Doppler) wave/tide sensor - it has no rotating antenna (there's nothing to "scan"), and
// being a single fixed beam, it cannot resolve wave DIRECTION at all (that needs multiple
// sensors or a scanning array) - only period/frequency. Both facts ruled out an earlier
// version of this display that assumed a rotating marine-radar-style PPI sweep with a
// directional wave-energy plot.

/** One raw reading from the sensor's continuous downward/outward-pointed beam - this is what
 * "Wave Radar Signal" charts as a live time series in RadarWaveWidget.tsx. */
export interface RadarWaveformSample {
  timestamp: number;
  timeString: string;
  /** Instantaneous water-surface elevation relative to mean water level, feet - oscillates as
   * waves pass under/past the beam. Derived from the sensor's raw range-to-surface reading. */
  surfaceElevationFeet: number;
}

/** A non-directional wave energy spectrum - energy as a function of period only, parameterized
 * as a single Gaussian peak (peak period/spread/energy) rather than a full sampled curve,
 * since that's all a simulated "processed" result needs; RadarWaveWidget.tsx evaluates the
 * shape at each period sample when charting it. A real onboard DSP (or our own FFT of the raw
 * waveform, if this ever processes real samples instead of simulating) would instead produce a
 * full frequency-domain energy array - swapping this out for one later only requires changing
 * how the energy-vs-period chart samples it, not the rest of the pipeline. */
export interface WaveEnergySpectrum {
  timestamp: number;
  peakPeriodSec: number;
  /** Period-axis spread of the energy peak, in seconds. */
  periodSpreadSec: number;
  /** Peak energy density, 0-1 - drives how tall the curve's peak is. */
  peakEnergy: number;
}
