import { RadarWaveformSample, WaveEnergySpectrum } from "./radarTypes";
import { generateSimulatedWaveform } from "./radarWaveformSimulator";
import { generateWaveEnergySpectrum } from "./waveSpectrumProcessor";

// Data layer for the wave radar display - mirrors ../../Sensors/SensorService.ts's
// SIMULATED/REAL split exactly, so a real Geolux LX80-O is wired in the same way real
// accelerometers/strain gauges/etc. are: point VITE_RADAR_VENDOR_URL at the vendor's HTTP
// endpoint and flip the *same* VITE_SENSOR_MODE=REAL switch the rest of the app already uses
// (see .env) - nothing radar-specific needs its own mode toggle.
export interface RadarDataBundle {
  waveform: RadarWaveformSample;
  spectrum: WaveEnergySpectrum;
}

export class RadarService {
  private static getMode(): "SIMULATED" | "REAL" {
    return (import.meta.env.VITE_SENSOR_MODE as "SIMULATED" | "REAL") || "SIMULATED";
  }

  // Called once per second by radarDataStore.ts to get a new waveform sample + spectrum.
  public static async getLatestRadarData(): Promise<RadarDataBundle> {
    return this.getMode() === "REAL" ? this.fetchRealRadarData() : this.generateSimulatedRadarData();
  }

  // A single shared timestamp for both, rather than each generator calling Date.now()
  // independently - the waveform sample and spectrum should always describe the exact same
  // instant, since they're two views of the same underlying "sea state". The spectrum is
  // derived first so its peakPeriodSec can drive the waveform's oscillation period - see
  // radarWaveformSimulator.ts.
  private static generateSimulatedRadarData(): RadarDataBundle {
    const timestamp = Date.now();
    const spectrum = generateWaveEnergySpectrum(timestamp);
    const waveform = generateSimulatedWaveform(timestamp, spectrum.peakPeriodSec);
    return { waveform, spectrum };
  }

  // *** Real hardware integration point ***
  // Expects the vendor endpoint (a Geolux LX80-O or similar fixed, non-contact wave/tide
  // sensor) to return one JSON object per poll with (at minimum) the fields read below - this
  // is intentionally the same flat shape as RadarWaveformSample/WaveEnergySpectrum, no
  // translation layer needed:
  //   surfaceElevationFeet, peakPeriodSec, periodSpreadSec, peakEnergy
  // Note there's deliberately no direction field here - a single fixed beam can't resolve
  // wave direction (see radarTypes.ts) - and units are US customary (feet) per this app's
  // convention. Any missing field falls back to a static placeholder rather than failing the
  // whole request, matching SensorService.ts's per-field fallback approach; if the request
  // itself fails (network down, bad URL), the catch below falls all the way back to simulated
  // data so the display never just goes blank.
  private static async fetchRealRadarData(): Promise<RadarDataBundle> {
    const RADAR_VENDOR_API = import.meta.env.VITE_RADAR_VENDOR_URL || "http://wave-radar-vendor.com";

    try {
      const response = await fetch(`${RADAR_VENDOR_API}/wave-radar-status`);
      if (!response.ok) throw new Error("Radar vendor endpoint returned an error status");
      const data = await response.json();
      const now = Date.now();
      const timeString = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

      return {
        waveform: {
          timestamp: now,
          timeString,
          surfaceElevationFeet: data.surfaceElevationFeet ?? 0,
        },
        spectrum: {
          timestamp: now,
          peakPeriodSec: data.peakPeriodSec ?? 8,
          periodSpreadSec: data.periodSpreadSec ?? 2,
          peakEnergy: data.peakEnergy ?? 0.5,
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
