// src/Sensors/SensorService.ts
//
// Data layer for the IoT Dashboard tab (IoTDashboard.tsx). Nothing here touches the 3D
// viewer or iModel - it's a plain data source that either fabricates realistic-looking
// telemetry (SIMULATED mode) or calls real vendor HTTP APIs (REAL mode), selected by the
// VITE_SENSOR_MODE env var (see getMode() below). Edit here to add a new sensor type/field,
// or to point REAL mode at different vendor endpoints.
// NOTE: VITE_SENSOR_MODE / VITE_COMPANY_A_URL / VITE_COMPANY_B_URL are read via
// import.meta.env but are not declared in vite-env.d.ts, so TypeScript treats them as `any`.

// 1. Define the full data structure interface
export interface SensorSnapshot {
  timeString: string;
  accelerometers: { x: number; y: number; z: number }[];
  strainGauges: number[];
  gnss: { Easting: number; Northing: number; Elevation: number }[];
  waterLevel: number[];
  waterVelocity: number;
  scour: number[];
  weather: { temp: number; windSpeed: number; humidity: number };
}

// 2. Data conversion functions
const mGToIn = (mg: number) => parseFloat((mg * 0.386).toFixed(2));
const usToPsi = (us: number) => parseFloat((us * 0.029).toFixed(2));
const mmToIn = (mm: number) => parseFloat((mm * 0.039).toFixed(2));
const mpsToMph = (mps: number) => parseFloat((mps * 2.23).toFixed(1));

export class SensorService {
  // 3. Mode Toggle
  // Set VITE_SENSOR_MODE=REAL in .env to hit real vendor hardware instead of simulated data.
  // Defaults to SIMULATED if unset, so the dashboard works out of the box with no hardware.
  private static getMode(): 'SIMULATED' | 'REAL' {
    return (import.meta.env.VITE_SENSOR_MODE as 'SIMULATED' | 'REAL') || 'SIMULATED';
  }

  // 4. Unified Data Fetcher
  // Called once per second by IoTDashboard.tsx to get one new data point for all charts.
  public static async getLatestSnapshot(): Promise<SensorSnapshot> {
    return this.getMode() === 'REAL' ? this.fetchRealHardwareData() : this.generateSimulatedData();
  }

  // 4b. Unified Historical Data Fetcher
  // Only meaningful in REAL mode - fetches a vendor's own logged history for a given
  // timeframe (e.g. "last 24 Hours") so charts can show data older than this session.
  public static async getHistoricalData(timeframe: string): Promise<SensorSnapshot[]> {
    if (this.getMode() === 'SIMULATED') {
      // Simulation mode accumulates history locally in your dashboard, so return empty here
      return [];
    }

    const COMPANY_A_API = import.meta.env.VITE_COMPANY_A_URL || "http://structural-vendor.com";
    try {
      // Sends a request to your vendor API asking for logs within a specific time window
      const response = await fetch(`${COMPANY_A_API}/historical-logs?window=${encodeURIComponent(timeframe)}`);
      if (!response.ok) throw new Error("Historical endpoint returned an error status");
      
      const pastLogData = await response.json();
      return pastLogData; // Assumes your real API returns an array of past logs
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Could not retrieve real-time historical data from hardware APIs:", error);
      return [];
    }
  }

  // 5. Encapsulated Simulation Logic (Preserving your exact math loops for learning)
  // Fabricates plausible-looking sensor values using sine/cosine waves seeded off the
  // current timestamp (`t`), so every call produces smoothly-varying, non-repeating-looking
  // data without needing any real sensors. Edit the amplitude/offset numbers here to change
  // how "active" the simulated bridge looks.
  private static generateSimulatedData(): SensorSnapshot {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const t = now.getTime();

    return {
      timeString: timeStr,
      accelerometers: Array.from({ length: 10 }, (_, i) => ({ 
        x: mGToIn(Math.sin(t / 1000 + i) * 15 + 5), 
        y: mGToIn(Math.cos(t / 800 + i) * 12 + 5), 
        z: mGToIn(Math.sin(t / 1200 + i) * 10 + 2) 
      })),
      strainGauges: Array.from({ length: 24 }, (_, i) => usToPsi(120 + Math.sin(t / 3000 + i) * 8 + 2)),
      gnss: Array.from({ length: 6 }, (_, i) => ({ 
        Easting: mmToIn(Math.sin(t / 5000 + i) * 3), 
        Northing: mmToIn(Math.cos(t / 5000 + i) * 3), 
        Elevation: mmToIn(Math.sin(t / 10000 + i) * 5) 
      })),
      waterLevel: [
        parseFloat((184.8 + Math.sin(t / 20000) * 6).toFixed(2)), 
        parseFloat((184.8 + Math.cos(t / 20000) * 6).toFixed(2))
      ],
      waterVelocity: mpsToMph(1.2 + Math.sin(t / 4000) * 0.3),
      scour: [
        parseFloat((50.4 + Math.cos(t / 15000) * 2).toFixed(2)), 
        parseFloat((50.4 + Math.sin(t / 15000) * 2).toFixed(2))
      ],
      weather: { 
        temp: parseFloat((22 * 1.8 + 32 + Math.sin(t / 60000) * 3).toFixed(1)), 
        windSpeed: mpsToMph(4.5), 
        humidity: 55 
      }
    };
  }

  // 6. Upgraded Multi-Vendor Hardware API Ingestion (Replaced older single endpoint)
  // Fires all 5 vendor requests in parallel (Promise.all), then falls back per-field to a
  // hardcoded default if that specific vendor's response failed (`res.ok` check) so one dead
  // API doesn't blank out the whole dashboard. If the whole batch throws (e.g. network down),
  // the catch below falls all the way back to simulated data.
  // Edit COMPANY_A_API / COMPANY_B_API (or add a new one) to point at your actual vendor URLs
  // via the .env VITE_COMPANY_A_URL / VITE_COMPANY_B_URL variables.
  private static async fetchRealHardwareData(): Promise<SensorSnapshot> {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    const COMPANY_A_API = import.meta.env.VITE_COMPANY_A_URL || "http://structural-vendor.com";
    const COMPANY_B_API = import.meta.env.VITE_COMPANY_B_URL || "http://hydro-vendor.net";
    const WEATHER_GOV_API = "https://weather.gov";

    try {
      const [accelRes, strainRes, gnssRes, hydroRes, weatherRes] = await Promise.all([
        fetch(`${COMPANY_A_API}/accelerometers`),
        fetch(`${COMPANY_A_API}/strain-gauges`),
        fetch(`${COMPANY_A_API}/gnss-positioning`),
        fetch(`${COMPANY_B_API}/river-metrics`),
        fetch(WEATHER_GOV_API)
      ]);

      const accelData = accelRes.ok ? await accelRes.json() : null;
      const strainData = strainRes.ok ? await strainRes.json() : null;
      const gnssData = gnssRes.ok ? await gnssRes.json() : null;
      const hydroData = hydroRes.ok ? await hydroRes.json() : null;
      const weatherData = weatherRes.ok ? await weatherRes.json() : null;

      return {
        timeString: timeStr,

        accelerometers: accelData ? accelData.map((device: any) => ({
          x: device.x,
          y: device.y,
          z: device.z
        })) : Array(10).fill({ x: 0, y: 0, z: 0 }),

        strainGauges: strainData ? Array.from({ length: 24 }, (_, i) => strainData[`SG_${String(i+1).padStart(2, '0')}`] || 0) 
                                 : Array(24).fill(0),

        gnss: gnssData ? gnssData.devices.map((g: any) => ({
          Easting: g.easting,
          Northing: g.northing,
          Elevation: g.elevation
        })) : Array(6).fill({ Easting: 0, Northing: 0, Elevation: 0 }),

        waterLevel: hydroData ? [hydroData.upstreamSensor, hydroData.downstreamSensor] : [184.8, 184.8],
        waterVelocity: hydroData ? hydroData.flowVelocityMph : 1.2,
        scour: hydroData ? [hydroData.pier1ScourInches, hydroData.pier2ScourInches] : [50.4, 50.4],

        weather: weatherData ? {
          temp: parseFloat(weatherData.properties.temperature.value) || 72,
          windSpeed: parseFloat(weatherData.properties.windSpeed.value) || 4.5,
          humidity: parseFloat(weatherData.properties.relativeHumidity.value) || 55
        } : { temp: 72, windSpeed: 4.5, humidity: 55 }
      };

    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("One or more hardware APIs failed, falling back to simulated loops:", error);
      return this.generateSimulatedData();
    }
  }
}

export default SensorService;
