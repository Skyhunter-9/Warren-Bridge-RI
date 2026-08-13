// src/components/IoTDashboard.tsx
//
// Renders the "IoT Dashboard" tab: live-updating charts for accelerometers, strain gauges,
// and hydrology, plus summary tiles for weather/hydro/GNSS. Data flow, top to bottom:
//   1. sensorIngestion.ts polls SensorService.getLatestSnapshot() once a second and keeps a
//      shared, app-wide buffer (capped at the last 5000 points) - this component just
//      mirrors that buffer into local state via onSnapshotsChanged, it doesn't poll itself.
//      (The buffer is shared - not owned by this component - so a sensor marker's popup
//      chart, Sensor3DDisplay.tsx's SensorGraphPopup, still has live data even if this tab
//      is never opened.)
//   2. `chartData` (useMemo) flattens each SensorSnapshot into one flat object per point,
//      because Recharts' <Line dataKey="..."> needs flat keys like `acc_0_X`, not nested
//      arrays/objects - via the same buildChartData() used by Sensor3DDisplay.tsx's popup.
//   3. `getFilteredChartData(timeframe)` slices that flat array down to whatever time
//      window the user picked in a chart's dropdown.
// Edit sensorIngestion.ts to change what data is generated/fetched; edit this file to change
// how it's charted/laid out.

import React, { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SensorService, {
  getLatestPeriodicRow,
  getPeriodicHistory,
  getSnapshots,
  onPeriodicHistoryChanged,
  onSnapshotsChanged,
  replaceSnapshots,
  SENSOR_INGESTION,
} from '../Sensors/sensorIngestion';
import { buildChartData, mergeChartRows } from '../Sensors/chartData';
import { SensorType } from '../Sensors/Sensor3DDisplay';
import { RadarWaveWidget } from '../radar/radargraph/RadarWaveWidget';

// ============================================================================
// 1. PASTE THE NEW SCROLL-LOCKED TOOLTIP COMPONENT RIGHT HERE:
// ============================================================================
// Recharts re-renders the tooltip content on every mousemove over the chart, which would
// normally reset scrollTop to 0 on a scrollable tooltip (annoying if you're mid-scroll
// through a 10+ line legend). This stashes scrollTop in a ref before each render and
// restores it via useLayoutEffect right after, so scroll position survives the re-render.
const ScrollLockedTooltipContent: React.FC<any> = ({ active, payload, label }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollPosRef = React.useRef<number>(0);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    scrollPosRef.current = e.currentTarget.scrollTop;
  };

  React.useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = scrollPosRef.current;
    }
  });

  if (!active || !payload) return null;

  return (
    <div 
      ref={containerRef}
      role="button"
      tabIndex={0}
      onScroll={handleScroll}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.key === 'Enter' && e.stopPropagation()}
      style={{
        fontSize: '11px',
        backgroundColor: 'rgba(255, 255, 255, 0.65)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        maxHeight: '200px',
        overflowY: 'auto',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        borderRadius: '8px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
        padding: '10px'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{label}</div>
      {payload.map((item: any, index: number) => (
        <div key={index} style={{ color: item.color, padding: '2px 0' }}>
          {item.name}: {item.value}
        </div>
      ))}
    </div>
  );
};

// The <select> dropdown pinned to the top-right corner of every chart card, letting the
// user pick how much history that specific chart shows (each chart tracks its own
// timeframe independently - see the accelTimeframe/strainTimeframe/etc. state below).
const ChartTimeframeDropdown: React.FC<{
  value: string;
  onChange: (val: string) => void;
}> = ({ value, onChange }) => {
  const timeframes = [
    'Real time', 'Last 5 Minutes', 'last 1 Hour', 'last 3 Hours', 
    'last 24 Hours', 'last 7 Days', 'last 30 Days', 'last 1 Year', 'all time'
  ];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()} 
      style={{
        position: 'absolute',
        top: '6px',
        right: '12px',
        zIndex: 10,
        padding: '3px 6px',
        fontSize: '11px',
        borderRadius: '4px',
        border: '1px solid #cbd5e1',
        backgroundColor: '#ffffff',
        color: '#334155',
        cursor: 'pointer'
      }}
    >
      {timeframes.map((tf) => (
        <option key={tf} value={tf}>{tf}</option>
      ))}
    </select>
  );
};


export const IoTDashboard: React.FC = () => {
  // `data` mirrors the shared sensorDataStore buffer - see the onSnapshotsChanged effect below.
  const [data, setData] = useState(() => getSnapshots());
  // 'none' = the overview grid (3 summary cards); any other value = the single-section
  // "exploded" per-node grid triggered by clicking "Click to Explode" on a card.
  const [expandedSection, setExpandedSection] = useState<'none' | 'accel' | 'geophone' | 'strain' | 'hydro' | 'gnss' | 'weather'>('none');

  // Track independent timeframes for each chart section
  const [accelTimeframe, setAccelTimeframe] = useState('Real time');
  const [geophoneTimeframe, setGeophoneTimeframe] = useState('Real time');
  const [strainTimeframe, setStrainTimeframe] = useState('Real time');
  const [hydroTimeframe, setHydroTimeframe] = useState('Real time');
  // "Real time" (45 seconds) would never show anything for GNSS, since it's Periodic-mode
  // and only gets new data once an hour - default to a timeframe that can actually show it.
  const [gnssTimeframe, setGnssTimeframe] = useState('all time');
  const [runoffTimeframe, setRunoffTimeframe] = useState('Real time');
  const [scourTimeframe, setScourTimeframe] = useState('Real time');
  const [waveTimeframe, setWaveTimeframe] = useState('Real time');
  const [weatherTimeframe, setWeatherTimeframe] = useState('Real time');
  const [windSpeedTimeframe, setWindSpeedTimeframe] = useState('Real time');
  const [tempTimeframe, setTempTimeframe] = useState('Real time');
  const [pressureTimeframe, setPressureTimeframe] = useState('Real time');
  const [humidityTimeframe, setHumidityTimeframe] = useState('Real time');
  const [heatIndexTimeframe, setHeatIndexTimeframe] = useState('Real time');

  // Converts timeframe strings to a standard lookback boundary in milliseconds
  const getLookbackCutoff = (timeframe: string): number => {
    const now = Date.now();
    switch (timeframe) {
      case 'Last 5 Minutes': return now - 5 * 60 * 1000;
      case 'last 1 Hour': return now - 60 * 60 * 1000;
      case 'last 3 Hours': return now - 3 * 60 * 60 * 1000;
      case 'last 24 Hours': return now - 24 * 60 * 60 * 1000;
      case 'last 7 Days': return now - 7 * 24 * 60 * 60 * 1000;
      case 'last 30 Days': return now - 30 * 24 * 60 * 60 * 1000;
      case 'last 1 Year': return now - 365 * 24 * 60 * 60 * 1000;
      case 'all time': return 0; // epoch start - every real timestamp is >= this
      case 'Real time':
      default:
        return now - 45 * 1000; // Default view window of 45 seconds
    }
  };

    // Helper to slice chartData based on selected dropdown time windows
  const getFilteredChartData = (timeframe: string) => {
    if (!chartData || chartData.length === 0) return [];
    if (timeframe === 'Real time') return chartData.slice(-45); // last 45 seconds/points

    const cutoffTime = getLookbackCutoff(timeframe);
    const now = Date.now();
    const secondsOfHistory = Math.floor((now - cutoffTime) / 1000);

    // Slices the array from the tail end based on required seconds of history
    // NOTE: this assumes exactly one chartData point per second (true today, since the
    // polling interval above is 1000ms) - if that interval ever changes, this slice count
    // needs to scale with it too.
    return chartData.slice(-secondsOfHistory);
  };

  // Merges the live buffer with any Periodic-mode sensor types' batched history (see
  // sensorIngestion.ts) into one Recharts-ready array, filtered to the same lookback window as
  // the live-only path above. Types still in API mode contribute nothing extra here (their
  // data is already in `chartData`/getFilteredChartData), so this is a safe drop-in
  // replacement for getFilteredChartData on any card that might include a Periodic-mode line.
  //
  // IMPORTANT: the live 1Hz snapshot buffer always contains a value for every SensorSnapshot
  // field, every second, even for Periodic-mode types - SensorService.getLatestSnapshot()
  // can't leave a field empty (SIMULATED mode fabricates it, REAL mode zero-fills it when the
  // live vendor call is skipped). If a card's types are ALL Periodic-mode, we must skip the
  // live buffer entirely here - otherwise real hourly readings get flooded with meaningless
  // per-second noise from that fallback value, which is what caused GNSS charts to visibly
  // "tick" every second instead of only updating once real data actually arrives.
  const getMergedChartData = (timeframe: string, types: SensorType[]) => {
    const periodicTypes = types.filter((t) => SENSOR_INGESTION[t].mode === "Periodic");
    if (periodicTypes.length === 0) return getFilteredChartData(timeframe);

    const cutoff = getLookbackCutoff(timeframe);
    const periodicRows = periodicTypes.flatMap((t) => getPeriodicHistory(t).filter((r) => r.timestamp >= cutoff));

    const stillHasApiTypes = types.some((t) => SENSOR_INGESTION[t].mode === "API");
    if (!stillHasApiTypes) return mergeChartRows(periodicRows);

    return mergeChartRows(getFilteredChartData(timeframe), periodicRows);
  };

  // Reads a sensor type's most recently fetched periodic value for `key` (falling back to the
  // live snapshot's value if that type is in API mode, or if no periodic batch has landed yet) -
  // used by the summary tiles above, which otherwise read straight off the 1Hz `latest` snapshot.
  const getLatestValue = (type: SensorType, key: string, fallback: number): number => {
    if (SENSOR_INGESTION[type].mode !== "Periodic") return fallback;
    const value = getLatestPeriodicRow(type)?.[key];
    return typeof value === "number" ? value : fallback;
  };

  // null when every listed type is in (the default) API mode, so the common case shows no
  // badge at all - only sensors actually switched to Periodic mode in sensorIngestion.ts's
  // SENSOR_INGESTION config get flagged.
  const modeLabel = (types: SensorType[]): string | null => {
    const modes = new Set(types.map((t) => SENSOR_INGESTION[t].mode));
    if (modes.size === 1 && modes.has("API")) return null;
    return modes.size === 1 ? "📄 Periodic (hourly)" : "📄+🔌 Mixed";
  };

  const modeBadgeStyle: React.CSSProperties = { fontSize: '10px', fontWeight: 'normal', color: '#8c6d1f', background: '#fff7e0', border: '1px solid #f0d989', borderRadius: '3px', padding: '1px 5px', marginLeft: '6px' };

  // Mirrors the shared sensorIngestion buffer into local state whenever it changes (new poll,
  // or a historical replace below) - the actual polling loop lives in sensorIngestion.ts, not
  // here, so it keeps running even while this tab isn't mounted.
  useEffect(() => {
    return onSnapshotsChanged.addListener(() => setData(getSnapshots()));
  }, []);

  // Forces a re-render whenever any Periodic-mode sensor type's history changes (new batch
  // merged in) - mirrors the onSnapshotsChanged listener above, but for sensorIngestion.ts's
  // separate, non-1Hz periodic data path.
  const [, setPeriodicTick] = useState(0);
  useEffect(() => {
    return onPeriodicHistoryChanged.addListener(() => setPeriodicTick((t) => t + 1));
  }, []);

  // ======= Timeframe Trigger for real vs simulated data =======
  // Only relevant in REAL mode: whenever any chart's timeframe dropdown changes, ask the
  // vendor API for that historical window and replace `data` with it wholesale (simulated
  // mode ignores this entirely since it has no server-side history to fetch - see
  // SensorService.getHistoricalData()).
  useEffect(() => {
    const isRealHardware = import.meta.env.VITE_SENSOR_MODE === 'REAL';

    if (isRealHardware) {
      // Define an internal async routine to keep the compiler happy
      // NOTE: this always fetches using `accelTimeframe` specifically, even though the
      // effect re-runs when any of the 7 timeframe dropdowns change. If you want each
      // section's dropdown to independently control its own historical window, this would
      // need to fetch/store history per-section rather than replacing all of `data` here.
      const fetchHistory = async () => {
        try {
          const historicalLogs = await SensorService.getHistoricalData(accelTimeframe);
          if (historicalLogs && historicalLogs.length > 0) {
            // Goes through the shared store (not setData directly) so SensorGraphPopup and
            // any other subscriber sees the same historical replacement.
            replaceSnapshots(historicalLogs);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to update dashboard with historical vendor logs:", error);
        }
      };
      fetchHistory().catch(() => {});
    }
  }, [accelTimeframe, geophoneTimeframe, strainTimeframe, hydroTimeframe, gnssTimeframe, runoffTimeframe, scourTimeframe, waveTimeframe, weatherTimeframe, windSpeedTimeframe, tempTimeframe, pressureTimeframe, humidityTimeframe, heatIndexTimeframe]);


  // Flattens each nested SensorSnapshot into one object per data point with keys like
  // `acc_3_Y` or `gnss_1_E`, matching the dataKey props used by the <Line> charts below.
  // Recomputed only when `data` changes (useMemo), since this runs once per new point but
  // is read by every chart on every render. Shared with Sensor3DDisplay.tsx's SensorGraphPopup
  // so both read off the exact same field names.
  const chartData = useMemo(() => buildChartData(data), [data]);

  const latest = data[data.length - 1];
  // Cycled through (via `colors[i % colors.length]`) to give each of the 10 accelerometer/
  // geophone nodes or 8 strain gauges a distinct, repeatable line color.
  const colors = ['#ff4d4f', '#faad14', '#13c2c2', '#52c41a', '#1890ff', '#722ed1', '#eb2f96', '#2f54eb', '#fa8c16', '#a0d911'];

  // Per-card ingestion-mode badges (see modeLabel above) - computed once per render so both
  // the overview cards and their exploded-view counterparts can share the same label.
  const accelMode = modeLabel(['accelerometer']);
  const strainMode = modeLabel(['strainGauge']);
  const gnssMode = modeLabel(['gnss']);
  const hydroMode = modeLabel(['waterVelocity', 'waveRadar', 'scour']);
  const runoffMode = modeLabel(['waterVelocity']);
  const scourCardMode = modeLabel(['scour']);
  const waveMode = modeLabel(['waveRadar']);
  const weatherMode = modeLabel(['weather']);

  return (
    <div style={{ padding: '16px', height: '100%', boxSizing: 'border-box', backgroundColor: '#f4f6f9', color: '#333333', overflowY: 'auto', fontFamily: 'sans-serif' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 16px 0', borderBottom: '3px solid #005A9C', paddingBottom: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: '#005A9C', fontWeight: 700 }}>🌉 Structural & Environmental Health System (US Units)</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {expandedSection !== 'none' && <button onClick={() => setExpandedSection('none')} style={{ background: '#f5222d', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>⬅ Back to Overview</button>}
          {latest && <span style={{ fontSize: '12px', background: '#005A9C', color: '#fff', padding: '4px 8px', borderRadius: '3px' }}>Live: {latest.timeString}</span>}
        </div>
      </div>

      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <div role="button" tabIndex={0} onClick={() => setExpandedSection('weather')} onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('weather')} style={{ background: '#fff', padding: '12px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
            <div style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase' }}>🌤️ Weather Station</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px' }}>
              {getLatestValue('weather', 'temp', latest.weather.temp)}°F{' '}
              <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#555' }}>
                (feels {(() => {
                  const temp = getLatestValue('weather', 'temp', latest.weather.temp);
                  const heatIndex = getLatestValue('weather', 'heatIndex', latest.weather.heatIndex);
                  const windChill = getLatestValue('weather', 'windChill', latest.weather.windChill);
                  return heatIndex >= temp ? heatIndex : windChill;
                })()}°F)
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#555' }}>
              Wind: {getLatestValue('weather', 'windSpeed', latest.weather.windSpeed)} mph | Hum: {getLatestValue('weather', 'humidity', latest.weather.humidity)}% | Baro: {getLatestValue('weather', 'pressure', latest.weather.pressure)} inHg
            </div>
          </div>
          <div role="button" tabIndex={0} onClick={() => setExpandedSection('hydro')} onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('hydro')} style={{ background: '#fff', padding: '12px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
            <div style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase' }}>💧 Hydro & Scour Dynamics</div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', marginTop: '4px' }}>Vel: {getLatestValue('waterVelocity', 'waterVelocity', latest.waterVelocity)} mph | Wave: {getLatestValue('waveRadar', 'waveHeight', latest.waveHeight)} in</div>
            <div style={{ fontSize: '11px', color: '#555' }}>WL1: {getLatestValue('waterVelocity', 'waterLevel_1', latest.waterLevel[0])} in | Scour1: {getLatestValue('scour', 'scour_1', latest.scour[0])} in</div>
          </div>
          <div role="button" tabIndex={0} onClick={() => setExpandedSection('gnss')} onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('gnss')} style={{ background: '#fff', padding: '12px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
            <div style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase' }}>🛰️ GNSS Displacement (4 Nodes)</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}><b>GNSS Sensors</b></div>
          </div>
        </div>
      )}

      {/* Overview mode (expandedSection === 'none'): one combined chart per sensor
          category, all 10/9/etc. nodes overlaid on the same axes. Clicking
          "Click to Explode" on a card's heading switches to the per-node grid below instead. */}
      {expandedSection === 'none' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>

          {/* 1. ACCELEROMETER ARRAY CARD */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', position: 'relative' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#2d3748' }}>
              🔊 Accel Array (All 10 Nodes){' '}
              <span
                role="button"
                tabIndex={0}
                onClick={() => setExpandedSection('accel')}
                onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('accel')}
                style={{ color: '#005A9C', fontSize: '11px', cursor: 'pointer', marginLeft: '4px' }}
              >
                🔍 Click to Explode
              </span>
              {accelMode && <span style={modeBadgeStyle}>{accelMode}</span>}
            </h4>
            <ChartTimeframeDropdown value={accelTimeframe} onChange={setAccelTimeframe} />
            <div style={{ width: '100%', height: '180px',}}>
              <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={getMergedChartData(accelTimeframe, ['accelerometer'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: '9px' }} />
                  <YAxis stroke="#718096" style={{ fontSize: '9px' }} domain={['auto','auto']} />
                  <Tooltip wrapperStyle={{ zIndex: 9999, pointerEvents: 'auto' }} content={<ScrollLockedTooltipContent />} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                  {Array.from({ length: 10 }).map((_, i) => (
                    <React.Fragment key={i}>
                      <Line name={`N${i+1}-X`} type="monotone" dataKey={`acc_${i}_X`} stroke={colors[i % colors.length]} strokeWidth={1} dot={false} isAnimationActive={false} />
                      <Line name={`N${i+1}-Y`} type="monotone" dataKey={`acc_${i}_Y`} stroke={colors[i % colors.length]} strokeWidth={1} strokeDasharray="2 2" dot={false} isAnimationActive={false} />
                      <Line name={`N${i+1}-Z`} type="monotone" dataKey={`acc_${i}_Z`} stroke={colors[i % colors.length]} strokeWidth={1.5} strokeDasharray="1 1" dot={false} isAnimationActive={false} />
                    </React.Fragment>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. GEOPHONE ARRAY CARD - paired 1:1 with the accelerometer nodes above (same
              node count/order - see sensorIngestion.ts's SensorSnapshot.geophones) */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', position: 'relative' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#2d3748' }}>
              📳 Geophone Array (All 10 Nodes){' '}
              <span
                role="button"
                tabIndex={0}
                onClick={() => setExpandedSection('geophone')}
                onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('geophone')}
                style={{ color: '#005A9C', fontSize: '11px', cursor: 'pointer', marginLeft: '4px' }}
              >
                🔍 Click to Explode
              </span>
              {accelMode && <span style={modeBadgeStyle}>{accelMode}</span>}
            </h4>
            <ChartTimeframeDropdown value={geophoneTimeframe} onChange={setGeophoneTimeframe} />
            <div style={{ width: '100%', height: '180px',}}>
              <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={getMergedChartData(geophoneTimeframe, ['accelerometer'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: '9px' }} />
                  <YAxis stroke="#718096" style={{ fontSize: '9px' }} domain={['auto','auto']} />
                  <Tooltip wrapperStyle={{ zIndex: 9999, pointerEvents: 'auto' }} content={<ScrollLockedTooltipContent />} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                  {Array.from({ length: 10 }).map((_, i) => (
                    <React.Fragment key={i}>
                      <Line name={`N${i+1}-X`} type="monotone" dataKey={`geo_${i}_X`} stroke={colors[i % colors.length]} strokeWidth={1} dot={false} isAnimationActive={false} />
                      <Line name={`N${i+1}-Y`} type="monotone" dataKey={`geo_${i}_Y`} stroke={colors[i % colors.length]} strokeWidth={1} strokeDasharray="2 2" dot={false} isAnimationActive={false} />
                      <Line name={`N${i+1}-Z`} type="monotone" dataKey={`geo_${i}_Z`} stroke={colors[i % colors.length]} strokeWidth={1.5} strokeDasharray="1 1" dot={false} isAnimationActive={false} />
                    </React.Fragment>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. STRAIN GAUGE MATRIX CARD */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', position: 'relative' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#2d3748' }}>
              📐 Strain Gauge Matrix (All 8 Channels){' '}
              <span
                role="button"
                tabIndex={0}
                onClick={() => setExpandedSection('strain')}
                onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('strain')}
                style={{ color: '#005A9C', fontSize: '11px', cursor: 'pointer', marginLeft: '4px' }}
              >
                🔍 Click to Explode
              </span>
              {strainMode && <span style={modeBadgeStyle}>{strainMode}</span>}
            </h4>
            <ChartTimeframeDropdown value={strainTimeframe} onChange={setStrainTimeframe} />
            <div style={{ width: '100%', height: '180px',}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={getMergedChartData(strainTimeframe, ['strainGauge'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: '9px' }} />
                  <YAxis stroke="#718096" style={{ fontSize: '9px' }} domain={['auto','auto']} />
                  <Tooltip wrapperStyle={{ zIndex: 9999, pointerEvents: 'auto' }} content={<ScrollLockedTooltipContent />} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Line key={i} name={`G${i+1}`} type="monotone" dataKey={`sg_${ i}`} stroke={colors[i % colors.length]} strokeWidth={1} dot={false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. HYDROLOGY SUMMARY CARD */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', position: 'relative' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#2d3748' }}>
              🌊 Hydrology Summary {' '}
              <span
                role="button"
                tabIndex={0}
                onClick={() => setExpandedSection('hydro')}
                onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('hydro')}
                style={{ color: '#005A9C', fontSize: '11px', cursor: 'pointer', marginLeft: '4px' }}
              >
                🔍 Click to Explode
              </span>
              {hydroMode && <span style={modeBadgeStyle}>{hydroMode}</span>}
            </h4>
            <ChartTimeframeDropdown value={hydroTimeframe} onChange={setHydroTimeframe} />
            <div style={{ width: '100%', height: '180px',}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={getMergedChartData(hydroTimeframe, ['waterVelocity', 'waveRadar', 'scour'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: '9px' }} />
                  <YAxis stroke="#718096" style={{ fontSize: '9px' }} domain={['auto','auto']} />
                  <Tooltip wrapperStyle={{ zIndex: 9999, pointerEvents: 'auto' }} content={<ScrollLockedTooltipContent />} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                  <Line name="Water Level 1" type="monotone" dataKey="waterLevel_1" stroke="#096dd9" dot={false} isAnimationActive={false} />
                  <Line name="Water Level 2" type="monotone" dataKey="waterLevel_2" stroke="#1890ff" strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                  <Line name="Scour Pier 1" type="monotone" dataKey="scour_1" stroke="#722ed1" dot={false} isAnimationActive={false} />
                  <Line name="Scour Pier 2" type="monotone" dataKey="scour_2" stroke="#eb2f96" strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                  <Line name="Stream Velocity" type="monotone" dataKey="waterVelocity" stroke="#fa8c16" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line name="Wave Height" type="monotone" dataKey="waveHeight" stroke="#00b8d9" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. WAVE RADAR (Geolux LX80-O) - a live surface-elevation waveform plus the
              derived non-directional wave energy spectrum (see radar/radarprocessing/ and
              radar/radargraph/). Renders as two sibling cards, not one. */}
          <RadarWaveWidget />

          {/* 6. WEATHER STATION SUMMARY CARD */}
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', position: 'relative' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#2d3748' }}>
              🌤️ Weather Station Summary {weatherMode && <span style={modeBadgeStyle}>{weatherMode}</span>}{' '}
              <span
                role="button"
                tabIndex={0}
                onClick={() => setExpandedSection('weather')}
                onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('weather')}
                style={{ color: '#005A9C', fontSize: '11px', cursor: 'pointer', marginLeft: '4px' }}
              >
                🔍 Click to Explode
              </span>
            </h4>
            <ChartTimeframeDropdown value={weatherTimeframe} onChange={setWeatherTimeframe} />
            <div style={{ width: '100%', height: '180px',}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={getMergedChartData(weatherTimeframe, ['weather'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: '9px' }} />
                  <YAxis stroke="#718096" style={{ fontSize: '9px' }} domain={['auto','auto']} />
                  <Tooltip wrapperStyle={{ zIndex: 9999, pointerEvents: 'auto' }} content={<ScrollLockedTooltipContent />} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} />
                  <Line name="Wind Speed (mph)" type="monotone" dataKey="windSpeed" stroke="#1890ff" dot={false} isAnimationActive={false} />
                  <Line name="Temp (°F)" type="monotone" dataKey="temp" stroke="#fa541c" dot={false} isAnimationActive={false} />
                  <Line name="Pressure (inHg)" type="monotone" dataKey="pressure" stroke="#722ed1" dot={false} isAnimationActive={false} />
                  <Line name="Humidity (%)" type="monotone" dataKey="humidity" stroke="#13c2c2" dot={false} isAnimationActive={false} />
                  <Line name="Heat Index (°F)" type="monotone" dataKey="heatIndex" stroke="#eb2f96" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      ) : (
        // Exploded mode: one small chart card per individual node (e.g. 10 separate
        // accelerometer cards instead of 1 combined one), filtered to whichever
        // `expandedSection` was clicked.
        <div>
          <div style={{ marginBottom: '12px', fontWeight: 'bold', color: '#005A9C' }}>ℹ️ Exploded View Grid.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            
            {expandedSection === 'accel' && Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🔊 Accel Node {i + 1} (in/s²) {accelMode && <span style={modeBadgeStyle}>{accelMode}</span>}</h5>
                 <ChartTimeframeDropdown value={accelTimeframe} onChange={setAccelTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getMergedChartData(accelTimeframe, ['accelerometer'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                      <Line name="X-Axis" type="monotone" dataKey={`acc_${i}_X`} stroke="#ff4d4f" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      <Line name="Y-Axis" type="monotone" dataKey={`acc_${i}_Y`} stroke="#faad14" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      <Line name="Z-Axis" type="monotone" dataKey={`acc_${i}_Z`} stroke="#1890ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}

            {expandedSection === 'geophone' && Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>📳 Geophone Node {i + 1} (in/s) {accelMode && <span style={modeBadgeStyle}>{accelMode}</span>}</h5>
                 <ChartTimeframeDropdown value={geophoneTimeframe} onChange={setGeophoneTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getMergedChartData(geophoneTimeframe, ['accelerometer'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                      <Line name="X-Axis" type="monotone" dataKey={`geo_${i}_X`} stroke="#ff4d4f" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      <Line name="Y-Axis" type="monotone" dataKey={`geo_${i}_Y`} stroke="#faad14" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      <Line name="Z-Axis" type="monotone" dataKey={`geo_${i}_Z`} stroke="#1890ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}

            {expandedSection === 'strain' && Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>📐 Gauge Channel {i + 1} (PSI) {strainMode && <span style={modeBadgeStyle}>{strainMode}</span>}</h5>
                <ChartTimeframeDropdown value={strainTimeframe} onChange={setStrainTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getMergedChartData(strainTimeframe, ['strainGauge'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                      <Line name="Load" type="monotone" dataKey={`sg_${i}`} stroke="#1890ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}

            {expandedSection === 'gnss' && (
              <>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🛰️ Combined Elevation (All 4 Nodes) {gnssMode && <span style={modeBadgeStyle}>{gnssMode}</span>}</h5>
                  <ChartTimeframeDropdown value={gnssTimeframe} onChange={setGnssTimeframe} />
                  <div style={{ width: '100%', height: '180px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(gnssTimeframe, ['gnss'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Line key={i} name={`N${i + 1}-Z`} type="monotone" dataKey={`gnss_${i}_Z`} stroke={colors[i % colors.length]} dot={false} isAnimationActive={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🛰️ Combined Easting (All 4 Nodes) {gnssMode && <span style={modeBadgeStyle}>{gnssMode}</span>}</h5>
                  <ChartTimeframeDropdown value={gnssTimeframe} onChange={setGnssTimeframe} />
                  <div style={{ width: '100%', height: '180px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(gnssTimeframe, ['gnss'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Line key={i} name={`N${i + 1}-E`} type="monotone" dataKey={`gnss_${i}_E`} stroke={colors[i % colors.length]} dot={false} isAnimationActive={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🛰️ Combined Northing (All 4 Nodes) {gnssMode && <span style={modeBadgeStyle}>{gnssMode}</span>}</h5>
                  <ChartTimeframeDropdown value={gnssTimeframe} onChange={setGnssTimeframe} />
                  <div style={{ width: '100%', height: '180px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(gnssTimeframe, ['gnss'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Line key={i} name={`N${i + 1}-N`} type="monotone" dataKey={`gnss_${i}_N`} stroke={colors[i % colors.length]} dot={false} isAnimationActive={false} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                    <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🛰️ GNSS Node {i + 1} (in) {gnssMode && <span style={modeBadgeStyle}>{gnssMode}</span>}</h5>
                    <ChartTimeframeDropdown value={gnssTimeframe} onChange={setGnssTimeframe} />
                      <div style={{ width: '100%', height: '180px',}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={getMergedChartData(gnssTimeframe, ['gnss'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                          <Line name="E" type="monotone" dataKey={`gnss_${i}_E`} stroke="#52c41a" dot={false} isAnimationActive={false} connectNulls />
                          <Line name="N" type="monotone" dataKey={`gnss_${i}_N`} stroke="#13c2c2" dot={false} isAnimationActive={false} connectNulls />
                          <Line name="Z" type="monotone" dataKey={`gnss_${i}_Z`} stroke="#722ed1" dot={false} isAnimationActive={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </>
            )}

            {expandedSection === 'hydro' && (
              <>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>💧 River Bed Levels (Water Level 1 & 2) {hydroMode && <span style={modeBadgeStyle}>{hydroMode}</span>}</h5>
                  <ChartTimeframeDropdown value={hydroTimeframe} onChange={setHydroTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(hydroTimeframe, ['waterVelocity', 'waveRadar'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="WL 1 (in)" type="monotone" dataKey="waterLevel_1" stroke="#096dd9" dot={false} isAnimationActive={false} />
                        <Line name="WL 2 (in)" type="monotone" dataKey="waterLevel_2" stroke="#1890ff" dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🌊 Flow Sensor - Stream Velocity {runoffMode && <span style={modeBadgeStyle}>{runoffMode}</span>}</h5>
                  <ChartTimeframeDropdown value={runoffTimeframe} onChange={setRunoffTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(runoffTimeframe, ['waterVelocity'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Velocity (mph)" type="monotone" dataKey="waterVelocity" stroke="#fa8c16" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🏗 Structural Pier Scour Penetration {scourCardMode && <span style={modeBadgeStyle}>{scourCardMode}</span>}</h5>
                  <ChartTimeframeDropdown value={scourTimeframe} onChange={setScourTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(scourTimeframe, ['scour'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Pier 1 Scour" type="monotone" dataKey="scour_1" stroke="#722ed1" dot={false} isAnimationActive={false} />
                        <Line name="Pier 2 Scour" type="monotone" dataKey="scour_2" stroke="#eb2f96" dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>📡 Radar Wave Profile {waveMode && <span style={modeBadgeStyle}>{waveMode}</span>}</h5>
                  <ChartTimeframeDropdown value={waveTimeframe} onChange={setWaveTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(waveTimeframe, ['waveRadar'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Wave Height (in)" type="monotone" dataKey="waveHeight" stroke="#00b8d9" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line name="WL 2 (in)" type="monotone" dataKey="waterLevel_2" stroke="#1890ff" dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            {expandedSection === 'weather' && (
              <>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>💨 Wind Speed {weatherMode && <span style={modeBadgeStyle}>{weatherMode}</span>}</h5>
                  <ChartTimeframeDropdown value={windSpeedTimeframe} onChange={setWindSpeedTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(windSpeedTimeframe, ['weather'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Wind Speed (mph)" type="monotone" dataKey="windSpeed" stroke="#1890ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🌡️ Air Temperature {weatherMode && <span style={modeBadgeStyle}>{weatherMode}</span>}</h5>
                  <ChartTimeframeDropdown value={tempTimeframe} onChange={setTempTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(tempTimeframe, ['weather'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Temp (°F)" type="monotone" dataKey="temp" stroke="#fa541c" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🧭 Barometric Pressure {weatherMode && <span style={modeBadgeStyle}>{weatherMode}</span>}</h5>
                  <ChartTimeframeDropdown value={pressureTimeframe} onChange={setPressureTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(pressureTimeframe, ['weather'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Pressure (inHg)" type="monotone" dataKey="pressure" stroke="#722ed1" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>💧 Relative Humidity {weatherMode && <span style={modeBadgeStyle}>{weatherMode}</span>}</h5>
                  <ChartTimeframeDropdown value={humidityTimeframe} onChange={setHumidityTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(humidityTimeframe, ['weather'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Humidity (%)" type="monotone" dataKey="humidity" stroke="#13c2c2" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9', position: 'relative' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🥵 Heat Index {weatherMode && <span style={modeBadgeStyle}>{weatherMode}</span>}</h5>
                  <ChartTimeframeDropdown value={heatIndexTimeframe} onChange={setHeatIndexTimeframe} />
                  <div style={{ width: '100%', height: '180px',}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedChartData(heatIndexTimeframe, ['weather'])} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Heat Index (°F)" type="monotone" dataKey="heatIndex" stroke="#eb2f96" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
