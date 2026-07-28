import { WaveEnergySpectrum } from "./radarTypes";
import { getSnapshots } from "../../Sensors/sensorDataStore";

// Derives the non-directional wave energy spectrum shown by RadarWaveWidget.tsx. A real
// Geolux LX80-O computes this (or the raw waveform this could be derived from via our own
// FFT) onboard from its single fixed beam - it has no way to resolve wave DIRECTION (that
// needs multiple sensors or a scanning array), only period/frequency, unlike an earlier
// version of this file that assumed a scanning marine radar and fabricated a direction too.
//
// In SIMULATED mode there's no real signal to analyze, so this fabricates a single-peaked
// spectrum instead - period/energy scale with the waveRadar sensor's current significant wave
// height (SensorService.ts's SensorSnapshot.waveHeight), so this display isn't disconnected
// from the rest of the dashboard's hydrology data.
//
// `timestamp` is passed in (rather than calling Date.now() here) so the raw waveform sample
// generated alongside this always describes a consistent "sea state" - see
// radarService.ts's generateSimulatedRadarData(), which derives both from the same
// waveHeight read and passes this spectrum's peakPeriodSec into the waveform generator.
export function generateWaveEnergySpectrum(timestamp: number): WaveEnergySpectrum {
  const snapshots = getSnapshots();
  const waveHeightIn = snapshots.length > 0 ? snapshots[snapshots.length - 1].waveHeight : 9;

  return {
    timestamp,
    peakPeriodSec: 6 + waveHeightIn / 6,
    periodSpreadSec: 1.8,
    peakEnergy: Math.min(1, waveHeightIn / 16),
  };
}
