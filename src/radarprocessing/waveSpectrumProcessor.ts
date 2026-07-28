import { WaveSpectrum } from "./radarTypes";
import { getSnapshots } from "../Sensors/sensorDataStore";

/** Reads the Weather Station's current wind speed (SensorService.ts's
 * SensorSnapshot.weather.windSpeed, already mph) - the single source of truth for wind speed
 * everywhere it's shown, so the radar/wave display never fabricates or reports its own
 * independent wind reading. Used both here (SIMULATED radar data) and by radarService.ts's
 * fetchRealRadarData (REAL radar data) - "both simulated and real" radar hardware modes defer
 * to the same weather sensor for this field. */
export function getCurrentWeatherWindSpeedMph(): number {
  const snapshots = getSnapshots();
  return snapshots.length > 0 ? snapshots[snapshots.length - 1].weather.windSpeed : 4.5;
}

/** Same idea as getCurrentWeatherWindSpeedMph, for direction (SensorSnapshot.weather.windDirDeg,
 * deg True) - the weather station's apparent wind direction is the single source of truth here
 * too, in both SIMULATED and REAL radar modes. */
export function getCurrentWeatherWindDirDeg(): number {
  const snapshots = getSnapshots();
  return snapshots.length > 0 ? snapshots[snapshots.length - 1].weather.windDirDeg : 0;
}

// Derives the directional wave spectrum shown by WaveSpectrumCanvas.tsx. A real wave radar
// gets here by inverting the raw backscatter image (RadarEchoCanvas.tsx's speckle) into a
// direction/frequency energy grid; in SIMULATED mode there's no real signal to invert, so
// this fabricates a single-peaked spectrum instead - the dominant wave system's direction
// tracks the wind (with a small lag, like a developing sea rather than an exact match), and
// its period/energy scale with the waveRadar sensor's current significant wave height
// (SensorService.ts's SensorSnapshot.waveHeight), so this display isn't disconnected from the
// rest of the dashboard's hydrology data. No heading/course/speed-over-ground here - this unit
// is fixed to the bridge, not a moving vessel (see radarEchoSimulator.ts).
//
// `timestamp` is passed in (rather than each generator calling Date.now() independently) so
// the echo sweep and this spectrum always describe the exact same instant - see
// radarService.ts's generateSimulatedRadarData().
export function generateWaveSpectrum(timestamp: number): WaveSpectrum {
  const windDirDeg = getCurrentWeatherWindDirDeg();

  const snapshots = getSnapshots();
  const waveHeightIn = snapshots.length > 0 ? snapshots[snapshots.length - 1].waveHeight : 9;

  return {
    timestamp,
    // Swell lags the wind direction slightly rather than matching it exactly.
    peakDirectionDeg: (windDirDeg - 15 + 360) % 360,
    peakPeriodSec: 6 + waveHeightIn / 6,
    dirSpreadDeg: 18,
    periodSpreadSec: 1.8,
    peakEnergy: Math.min(1, waveHeightIn / 16),
    windDirDeg,
    windSpeedMph: getCurrentWeatherWindSpeedMph(),
  };
}
