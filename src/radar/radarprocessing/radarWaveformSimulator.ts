import { RadarWaveformSample } from "./radarTypes";
import { getSnapshots } from "../../Sensors/sensorIngestion";

// Fabricates the raw surface-elevation waveform for SIMULATED mode. The Geolux LX80-O
// continuously measures the distance down to the water surface and (via its own onboard DSP,
// or ours if this ever processes real samples) derives an oscillating elevation signal from
// it; in SIMULATED mode there's no real signal to measure, so this synthesizes a plausible
// oscillation instead - a primary swell component plus a smaller secondary harmonic, both
// scaled by the waveRadar sensor's current significant wave height (sensorIngestion.ts's
// SensorSnapshot.waveHeight) and oscillating at the wave spectrum's current dominant period
// (passed in as `peakPeriodSec` - see radarService.ts's generateSimulatedRadarData, which
// derives both the waveform and the spectrum from the same underlying "sea state" per tick).
export function generateSimulatedWaveform(timestamp: number, peakPeriodSec: number): RadarWaveformSample {
  const timeString = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  const snapshots = getSnapshots();
  const waveHeightIn = snapshots.length > 0 ? snapshots[snapshots.length - 1].waveHeight : 9;
  const waveHeightFeet = waveHeightIn / 12;

  const t = timestamp / 1000;
  const primary = (waveHeightFeet / 2) * Math.sin((2 * Math.PI * t) / peakPeriodSec);
  const harmonic = (waveHeightFeet / 6) * Math.sin((2 * Math.PI * t) / (peakPeriodSec * 0.4) + 1.3);

  return {
    timestamp,
    timeString,
    surfaceElevationFeet: parseFloat((primary + harmonic).toFixed(2)),
  };
}
