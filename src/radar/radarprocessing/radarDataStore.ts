import { BeEvent } from "@itwin/core-bentley";
import { generateSimulatedWaveform } from "./radarWaveformSimulator";
import { generateWaveEnergySpectrum } from "./waveSpectrumProcessor";
import { RadarWaveformSample, WaveEnergySpectrum } from "./radarTypes";
import RadarService from "./radarService";

// Shared app-wide radar data - mirrors ../../Sensors/sensorIngestion.ts's eager-singleton +
// BeEvent pattern (and its 1Hz cadence, MAX_HISTORY cap, and history-array shape) so
// RadarWaveWidget.tsx's "Wave Radar Signal" chart can use the exact same timeframe-slicing
// approach as every other sensor graph in the dashboard. Goes through RadarService.ts (not
// straight to the simulators below) so this respects the same VITE_SENSOR_MODE switch/REAL
// hardware path the rest of the app's sensors use - see radarService.ts.
const POLL_INTERVAL_MS = 1000;
const MAX_HISTORY = 5000;

const initialTimestamp = Date.now();
let latestSpectrum: WaveEnergySpectrum = generateWaveEnergySpectrum(initialTimestamp);
let waveformHistory: RadarWaveformSample[] = [generateSimulatedWaveform(initialTimestamp, latestSpectrum.peakPeriodSec)];

/** Fired whenever a new waveform sample/spectrum is generated - no payload, listeners should
 * call getWaveformHistory()/getLatestWaveEnergySpectrum() to read the current data. */
export const onRadarDataChanged = new BeEvent<() => void>();

export function getWaveformHistory(): readonly RadarWaveformSample[] {
  return waveformHistory;
}

export function getLatestWaveEnergySpectrum(): WaveEnergySpectrum {
  return latestSpectrum;
}

setInterval(() => {
  RadarService.getLatestRadarData()
    .then(({ waveform, spectrum }) => {
      waveformHistory = [...waveformHistory, waveform].slice(-MAX_HISTORY);
      latestSpectrum = spectrum;
      onRadarDataChanged.raiseEvent();
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("radarDataStore failed to poll latest radar data:", error);
    });
}, POLL_INTERVAL_MS);
