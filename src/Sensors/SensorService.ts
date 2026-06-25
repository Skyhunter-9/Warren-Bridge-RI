// src/services/SensorService.ts

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
  private static getMode(): 'SIMULATED' | 'REAL' {
    return (import.meta.env.VITE_SENSOR_MODE as 'SIMULATED' | 'REAL') || 'SIMULATED';
  }

  // 4. Unified Data Fetcher
  public static async getLatestSnapshot(): Promise<SensorSnapshot> {
    return this.getMode() === 'REAL' ? this.fetchRealHardwareData() : this.generateSimulatedData();
  }

  // 5. Encapsulated Simulation Logic (Preserving your exact math loops)
  private static generateSimulatedData(): SensorSnapshot {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const t = now.getTime();

    return {
      timeString: timeStr,
      accelerometers: Array. from({ length: 10 }, (_, i) => ({ 
        x: mGToIn(Math.sin(t / 1000 + i) * 15 + 5), 
        y: mGToIn(Math.cos(t / 800 + i) * 12 + 5), 
        z: mGToIn(Math.sin(t / 1200 + i) * 10 + 2) 
      })),
      strainGauges: Array. from({ length: 24 }, (_, i) => usToPsi(120 + Math.sin(t / 3000 + i) * 8 + 2)),
      gnss: Array. from({ length: 6 }, (_, i) => ({ 
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

  // 6. Future Hardware API Placeholder
  private static async fetchRealHardwareData(): Promise<SensorSnapshot> {
    try {
      const apiEndpoint = import.meta.env.VITE_HARDWARE_API_URL || "http://localhost:5000/api";
      const response = await fetch(`${apiEndpoint}/telemetry/latest`);
      
      if (!response.ok) throw new Error("Hardware endpoint unreachable");
      return await response.json();
      } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Hardware fetch failed, providing temporary fallback data:", error);
    // Automatically uses your simulated data loop as a fallback if your server crashes

      return this.generateSimulatedData();
    }
  }
}
export default SensorService;
