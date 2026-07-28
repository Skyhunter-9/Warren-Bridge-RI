import { BeEvent } from "@itwin/core-bentley";
import { generateSimulatedSweep } from "./radarEchoSimulator";
import { generateWaveSpectrum } from "./waveSpectrumProcessor";
import { RadarSweep, WaveSpectrum } from "./radarTypes";
import RadarService from "./radarService";

// Shared app-wide radar/wave-spectrum data - mirrors sensorDataStore.ts's eager-singleton +
// BeEvent pattern so RadarWaveWidget.tsx doesn't need to run its own polling loop. Refreshed
// once per antenna rotation rather than the 1Hz cadence used for point sensors, since a real
// marine radar's PPI image only updates that often too. Goes through RadarService.ts (not
// straight to the simulators below) so this respects the same VITE_SENSOR_MODE switch/REAL
// hardware path the rest of the app's sensors use - see radarService.ts.
const ROTATION_INTERVAL_MS = 2000;

// Synchronous placeholder values so getLatestSweep()/getLatestWaveSpectrum() have something
// to return before the first async RadarService poll below resolves - both share one
// timestamp for the same "same instant" reason RadarService.generateSimulatedRadarData() does.
const initialTimestamp = Date.now();
let latestSweep: RadarSweep = generateSimulatedSweep(initialTimestamp);
let latestSpectrum: WaveSpectrum = generateWaveSpectrum(initialTimestamp);

/** Fired whenever a new sweep/spectrum is generated - no payload, listeners should call
 * getLatestSweep()/getLatestWaveSpectrum() to read the current data. */
export const onRadarDataChanged = new BeEvent<() => void>();

export function getLatestSweep(): RadarSweep {
  return latestSweep;
}

export function getLatestWaveSpectrum(): WaveSpectrum {
  return latestSpectrum;
}

setInterval(() => {
  RadarService.getLatestRadarData()
    .then(({ sweep, spectrum }) => {
      latestSweep = sweep;
      latestSpectrum = spectrum;
      onRadarDataChanged.raiseEvent();
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("radarDataStore failed to poll latest radar data:", error);
    });
}, ROTATION_INTERVAL_MS);
