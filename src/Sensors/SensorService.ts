// src/Sensors/SensorService.ts
//
// Data layer for the IoT Dashboard tab (IoTDashboard.tsx). Nothing here touches the 3D
// viewer or iModel - it's a plain data source that either fabricates realistic-looking
// telemetry (SIMULATED mode) or calls real vendor HTTP APIs (REAL mode), selected by the
// VITE_SENSOR_MODE env var (see getMode() below). Edit here to add a new sensor type/field,
// or to point REAL mode at different vendor endpoints.
// NOTE: VITE_SENSOR_MODE / VITE_COMPANY_A_URL / VITE_COMPANY_B_URL are read via
// import.meta.env but are not declared in vite-env.d.ts, so TypeScript treats them as `any`.

import { SENSOR_INGESTION } from "./ingestionConfig";

// 1. Define the full data structure interface
export interface SensorSnapshot {
  timeString: string;
  // Epoch ms this snapshot was generated/fetched at - lets chartData.ts's mergeChartRows sort
  // this live buffer alongside CSV-sourced history (csvIngestion.ts), which has its own
  // independent, non-1Hz timestamps.
  timestamp: number;
  accelerometers: { x: number; y: number; z: number }[];
  // Triaxial, one geophone co-located with each accelerometer node (same count/order) - see
  // chartData.ts's getSensorSeries(), which pairs the two by nodeIndex so clicking an
  // accelerometer marker's popup shows both readings for that physical location.
  geophones: { x: number; y: number; z: number }[];
  strainGauges: number[];
  gnss: { Easting: number; Northing: number; Elevation: number }[];
  // Index 0 is co-located with the water velocity sensor, index 1 with the wave radar
  // sensor - see chartData.ts's getSensorSeries(), which pairs each with its own water level
  // reading the same way accelerometer/geophone are paired.
  waterLevel: number[];
  waterVelocity: number;
  // Significant wave height from a radar wave gauge, co-located with waterLevel[1].
  waveHeight: number;
  scour: number[];
  // Modeled on an Airmar WX-series ultrasonic weather station: windSpeed/windDirDeg/temp/
  // pressure/humidity are the sensor's raw readings (apparent wind, air temp, barometric
  // pressure, relative humidity); windChill/dewPoint/heatIndex are never measured directly -
  // they're always calculated from those raw readings (see calcWindChill/calcDewPoint/
  // calcHeatIndex below), the same way a real weather station display derives them, in both
  // SIMULATED and REAL mode.
  weather: {
    windSpeed: number; // apparent wind speed, mph
    windDirDeg: number; // apparent wind direction, deg True
    temp: number; // air temperature, °F
    windChill: number; // calculated, °F
    pressure: number; // barometric pressure, inHg
    humidity: number; // relative humidity, %
    dewPoint: number; // calculated, °F
    heatIndex: number; // calculated, °F
  };
}

// 2. Data conversion functions
const mGToIn = (mg: number) => parseFloat((mg * 0.386).toFixed(2));
const usToPsi = (us: number) => parseFloat((us * 0.029).toFixed(2));
const mmToIn = (mm: number) => parseFloat((mm * 0.039).toFixed(2));
const mpsToMph = (mps: number) => parseFloat((mps * 2.23).toFixed(1));

// 2b. Weather calculations - derived from raw temp (°F)/humidity (%)/wind speed (mph), never
// read directly off the sensor. Shared by both generateSimulatedData and fetchRealHardwareData
// so the two modes always compute these the exact same way.

// National Weather Service wind chill formula - only has a cooling effect at <=50°F and
// wind >=3mph; outside that range "wind chill" is just the air temperature.
function calcWindChill(tempF: number, windMph: number): number {
  if (tempF > 50 || windMph < 3) return parseFloat(tempF.toFixed(1));
  const v16 = Math.pow(windMph, 0.16);
  return parseFloat((35.74 + 0.6215 * tempF - 35.75 * v16 + 0.4275 * tempF * v16).toFixed(1));
}

// Magnus-Tetens approximation - computed in Celsius, then converted back to °F.
function calcDewPoint(tempF: number, humidityPct: number): number {
  const tempC = (tempF - 32) * (5 / 9);
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(humidityPct / 100);
  const dewC = (b * alpha) / (a - alpha);
  return parseFloat((dewC * (9 / 5) + 32).toFixed(1));
}

// NWS Rothfusz regression - only has a meaningful effect at >=80°F; below that "heat index" is
// just the air temperature.
function calcHeatIndex(tempF: number, humidityPct: number): number {
  if (tempF < 80) return parseFloat(tempF.toFixed(1));
  const T = tempF;
  const R = humidityPct;
  const hi =
    -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T -
    0.05481717 * R * R + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
  return parseFloat(hi.toFixed(1));
}

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

    const windSpeed = mpsToMph(4.5 + Math.sin(t / 20000) * 1.5);
    const windDirDeg = (25 + Math.sin(t / 40000) * 8 + 360) % 360;
    const temp = parseFloat((22 * 1.8 + 32 + Math.sin(t / 60000) * 3).toFixed(1));
    const pressure = parseFloat((29.92 + Math.sin(t / 45000) * 0.15).toFixed(2));
    const humidity = parseFloat((55 + Math.sin(t / 30000) * 10).toFixed(1));

    return {
      timeString: timeStr,
      timestamp: t,
      accelerometers: Array.from({ length: 10 }, (_, i) => ({
        x: mGToIn(Math.sin(t / 1000 + i) * 15 + 5),
        y: mGToIn(Math.cos(t / 800 + i) * 12 + 5),
        z: mGToIn(Math.sin(t / 1200 + i) * 10 + 2)
      })),
      geophones: Array.from({ length: 10 }, (_, i) => ({
        x: mmToIn(Math.sin(t / 900 + i) * 4 + 1),
        y: mmToIn(Math.cos(t / 1100 + i) * 3 + 1),
        z: mmToIn(Math.sin(t / 1300 + i) * 2 + 0.5)
      })),
      strainGauges: Array.from({ length: 9 }, (_, i) => usToPsi(120 + Math.sin(t / 3000 + i) * 8 + 2)),
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
      waveHeight: parseFloat((9 + Math.sin(t / 7000) * 4).toFixed(2)),
      scour: [
        parseFloat((50.4 + Math.cos(t / 15000) * 2).toFixed(2)), 
        parseFloat((50.4 + Math.sin(t / 15000) * 2).toFixed(2))
      ],
      weather: {
        windSpeed,
        windDirDeg,
        temp,
        windChill: calcWindChill(temp, windSpeed),
        pressure,
        humidity,
        dewPoint: calcDewPoint(temp, humidity),
        heatIndex: calcHeatIndex(temp, humidity),
      }
    };
  }

  // 6. Upgraded Multi-Vendor Hardware API Ingestion (Replaced older single endpoint)
  // Fires all 6 vendor requests in parallel (Promise.all), then falls back per-field to a
  // hardcoded default if that specific vendor's response failed (`res.ok` check) so one dead
  // API doesn't blank out the whole dashboard. If the whole batch throws (e.g. network down),
  // the catch below falls all the way back to simulated data.
  // Edit COMPANY_A_API / COMPANY_B_API / WEATHER_STATION_API (or add a new one) to point at
  // your actual vendor URLs via the .env VITE_COMPANY_A_URL / VITE_COMPANY_B_URL /
  // VITE_WEATHER_STATION_URL variables.
  private static async fetchRealHardwareData(): Promise<SensorSnapshot> {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    const COMPANY_A_API = import.meta.env.VITE_COMPANY_A_URL || "http://structural-vendor.com";
    const COMPANY_B_API = import.meta.env.VITE_COMPANY_B_URL || "http://hydro-vendor.net";
    // An Airmar WX-series-style ultrasonic weather station mounted on the bridge - see the
    // SensorSnapshot.weather doc comment above for its raw vs. calculated fields.
    const WEATHER_STATION_API = import.meta.env.VITE_WEATHER_STATION_URL || "http://weather-station-vendor.net";

    // A sensor type set to "CSV" mode in ingestionConfig.ts has no live push/pull API to poll
    // (that's the whole point of it - it only publishes an hourly export file, see
    // csvIngestion.ts) - so its request is skipped here entirely rather than hitting a vendor
    // endpoint for data nothing will use. Structural types (accel/geo/strain/gnss) each have
    // their own vendor request, so they gate independently; the hydro types share one bundled
    // endpoint, so it's only skipped if ALL THREE are CSV-mode.
    const fetchOrSkip = async (mode: "API" | "CSV", url: string): Promise<Response | null> =>
      mode === "API" ? fetch(url) : null;
    const hydroNeeded =
      SENSOR_INGESTION.waterVelocity.mode === "API" ||
      SENSOR_INGESTION.waveRadar.mode === "API" ||
      SENSOR_INGESTION.scour.mode === "API";

    try {
      const [accelRes, geoRes, strainRes, gnssRes, hydroRes, weatherRes] = await Promise.all([
        fetchOrSkip(SENSOR_INGESTION.accelerometer.mode, `${COMPANY_A_API}/accelerometers`),
        fetchOrSkip(SENSOR_INGESTION.accelerometer.mode, `${COMPANY_A_API}/geophones`),
        fetchOrSkip(SENSOR_INGESTION.strainGauge.mode, `${COMPANY_A_API}/strain-gauges`),
        fetchOrSkip(SENSOR_INGESTION.gnss.mode, `${COMPANY_A_API}/gnss-positioning`),
        hydroNeeded ? fetch(`${COMPANY_B_API}/river-metrics`) : Promise.resolve(null),
        fetch(`${WEATHER_STATION_API}/weather-status`)
      ]);

      const accelData = accelRes?.ok ? await accelRes.json() : null;
      const geoData = geoRes?.ok ? await geoRes.json() : null;
      const strainData = strainRes?.ok ? await strainRes.json() : null;
      const gnssData = gnssRes?.ok ? await gnssRes.json() : null;
      const hydroData = hydroRes?.ok ? await hydroRes.json() : null;
      const weatherData = weatherRes.ok ? await weatherRes.json() : null;

      const wsWindSpeed = weatherData ? parseFloat(weatherData.windSpeed) || 4.5 : 4.5;
      const wsWindDirDeg = weatherData ? parseFloat(weatherData.windDirDeg) || 0 : 0;
      const wsTemp = weatherData ? parseFloat(weatherData.temp) || 72 : 72;
      const wsPressure = weatherData ? parseFloat(weatherData.pressure) || 29.92 : 29.92;
      const wsHumidity = weatherData ? parseFloat(weatherData.humidity) || 55 : 55;

      return {
        timeString: timeStr,
        timestamp: now.getTime(),

        accelerometers: accelData ? accelData.map((device: any) => ({
          x: device.x,
          y: device.y,
          z: device.z
        })) : Array(10).fill({ x: 0, y: 0, z: 0 }),

        // Same vendor/device shape as accelerometers - paired 1:1 by array position.
        geophones: geoData ? geoData.map((device: any) => ({
          x: device.x,
          y: device.y,
          z: device.z
        })) : Array(10).fill({ x: 0, y: 0, z: 0 }),

        strainGauges: strainData ? Array.from({ length: 9 }, (_, i) => strainData[`SG_${String(i+1).padStart(2, '0')}`] || 0)
                                 : Array(9).fill(0),

        gnss: gnssData ? gnssData.devices.map((g: any) => ({
          Easting: g.easting,
          Northing: g.northing,
          Elevation: g.elevation
        })) : Array(6).fill({ Easting: 0, Northing: 0, Elevation: 0 }),

        waterLevel: hydroData ? [hydroData.upstreamSensor, hydroData.downstreamSensor] : [184.8, 184.8],
        waterVelocity: hydroData ? hydroData.flowVelocityMph : 1.2,
        waveHeight: hydroData ? hydroData.waveHeightInches : 9.0,
        scour: hydroData ? [hydroData.pier1ScourInches, hydroData.pier2ScourInches] : [50.4, 50.4],

        // windChill/dewPoint/heatIndex are always calculated here from the station's raw
        // readings (see calcWindChill/calcDewPoint/calcHeatIndex above), never read off the
        // vendor response - the Airmar-style sensor itself only reports wind/temp/pressure/
        // humidity.
        weather: {
          windSpeed: wsWindSpeed,
          windDirDeg: wsWindDirDeg,
          temp: wsTemp,
          windChill: calcWindChill(wsTemp, wsWindSpeed),
          pressure: wsPressure,
          humidity: wsHumidity,
          dewPoint: calcDewPoint(wsTemp, wsHumidity),
          heatIndex: calcHeatIndex(wsTemp, wsHumidity),
        }
      };

    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("One or more hardware APIs failed, falling back to simulated loops:", error);
      return this.generateSimulatedData();
    }
  }
}

export default SensorService;
