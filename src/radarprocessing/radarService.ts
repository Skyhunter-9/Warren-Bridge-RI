import { RadarSweep, WaveSpectrum } from "./radarTypes";
import { generateSimulatedSweep } from "./radarEchoSimulator";
import { generateWaveSpectrum, getCurrentWeatherWindDirDeg, getCurrentWeatherWindSpeedMph } from "./waveSpectrumProcessor";

// Data layer for the wave radar display - mirrors ../Sensors/SensorService.ts's
// SIMULATED/REAL split exactly, so a real radar box is wired in the same way real
// accelerometers/strain gauges/etc. are: point VITE_RADAR_VENDOR_URL at the vendor's HTTP
// endpoint and flip the *same* VITE_SENSOR_MODE=REAL switch the rest of the app already uses
// (see .env) - nothing radar-specific needs its own mode toggle.
export interface RadarDataBundle {
  sweep: RadarSweep;
  spectrum: WaveSpectrum;
}

export class RadarService {
  private static getMode(): "SIMULATED" | "REAL" {
    return (import.meta.env.VITE_SENSOR_MODE as "SIMULATED" | "REAL") || "SIMULATED";
  }

  // Called once per rotation by radarDataStore.ts to get a new sweep + spectrum.
  public static async getLatestRadarData(): Promise<RadarDataBundle> {
    return this.getMode() === "REAL" ? this.fetchRealRadarData() : this.generateSimulatedRadarData();
  }

  // A single shared timestamp for both, rather than each generator calling Date.now()
  // independently - the echo sweep and wave spectrum should always describe the exact same
  // instant, since they're two views of the same underlying radar data.
  private static generateSimulatedRadarData(): RadarDataBundle {
    const timestamp = Date.now();
    return { sweep: generateSimulatedSweep(timestamp), spectrum: generateWaveSpectrum(timestamp) };
  }

  // *** Real hardware integration point ***
  // Expects the vendor endpoint to return one JSON object per poll with (at minimum) the
  // fields read below - this is intentionally the same flat shape as WaveSpectrum/RadarSweep,
  // no translation layer needed:
  //   mountingBearingDeg, antennaId, gainMode, pulseLength, rangeFeet,
  //   peakDirectionDeg, peakPeriodSec, dirSpreadDeg, periodSpreadSec, peakEnergy
  // Note there's deliberately no wind speed/direction field expected here, nor heading/course/
  // speed-over-ground - wind always comes from the Weather Station sensor instead (see
  // getCurrentWeatherWindSpeedMph/getCurrentWeatherWindDirDeg in waveSpectrumProcessor.ts -
  // "both simulated and real" radar hardware defers to that one sensor rather than each
  // reporting its own reading), and this unit is fixed to the bridge structure, not aboard a
  // moving vessel. Units are US customary (feet) per this app's convention, not nautical
  // miles. Any missing field falls back to a static placeholder rather than failing the whole
  // request, matching SensorService.ts's per-field fallback approach; if the request itself
  // fails (network down, bad URL), the catch below falls all the way back to simulated data so
  // the display never just goes blank.
  private static async fetchRealRadarData(): Promise<RadarDataBundle> {
    const RADAR_VENDOR_API = import.meta.env.VITE_RADAR_VENDOR_URL || "http://wave-radar-vendor.com";

    try {
      const response = await fetch(`${RADAR_VENDOR_API}/wave-radar-status`);
      if (!response.ok) throw new Error("Radar vendor endpoint returned an error status");
      const data = await response.json();
      const now = Date.now();

      return {
        sweep: {
          timestamp: now,
          mountingBearingDeg: data.mountingBearingDeg ?? 0,
          antenna: {
            id: data.antennaId ?? "ANT1",
            gainLabel: data.gainMode ?? "AUTO",
            pulseLengthLabel: data.pulseLength ?? "-",
            rangeFeet: data.rangeFeet ?? 3000,
          },
        },
        spectrum: {
          timestamp: now,
          peakDirectionDeg: data.peakDirectionDeg ?? 0,
          peakPeriodSec: data.peakPeriodSec ?? 8,
          dirSpreadDeg: data.dirSpreadDeg ?? 15,
          periodSpreadSec: data.periodSpreadSec ?? 2,
          peakEnergy: data.peakEnergy ?? 0.5,
          windDirDeg: getCurrentWeatherWindDirDeg(),
          windSpeedMph: getCurrentWeatherWindSpeedMph(),
        },
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Wave radar vendor API failed, falling back to simulated data:", error);
      return this.generateSimulatedRadarData();
    }
  }
}

export default RadarService;
