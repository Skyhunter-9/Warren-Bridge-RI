// src/components/IoTDashboard.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SensorService, { SensorSnapshot } from '../Sensors/SensorService';


export const IoTDashboard: React.FC = () => {
  const [data, setData] = useState<SensorSnapshot[]>([]);
  const [expandedSection, setExpandedSection] = useState<'none' | 'accel' | 'strain' | 'hydro' | 'gnss'>('none');

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const latestSnapshot = await SensorService.getLatestSnapshot();
        setData((prev) => [...prev, latestSnapshot].slice(-15));
          } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Dashboard failed to retrieve next telemetry node:", error);
    }

    }, 1000);

    return () => clearInterval(interval);
  }, []);


  const chartData = useMemo(() => data.map(d => {
    const flat: any = { time: d.timeString, waterVelocity: d.waterVelocity };
    d.accelerometers.forEach((acc, i) => { flat[`acc_${i}_X`] = acc.x; flat[`acc_${i}_Y`] = acc.y; flat[`acc_${i}_Z`] = acc.z; });
    d.strainGauges.forEach((sg, i) => { flat[`sg_${i}`] = sg; });
    d.gnss.forEach((g, i) => { flat[`gnss_${i}_E`] = g.Easting; flat[`gnss_${i}_N`] = g.Northing; flat[`gnss_${i}_Z`] = g.Elevation; });
    flat.waterLevel_1 = d.waterLevel[0]; flat.waterLevel_2 = d.waterLevel[1];
    flat.scour_1 = d.scour[0]; flat.scour_2 = d.scour[1];
    return flat;
  }), [data]);

  const latest = data[data.length - 1];
  const colors = ['#ff4d4f', '#faad14', '#13c2c2', '#52c41a', '#1890ff', '#722ed1', '#eb2f96', '#2f54eb', '#fa8c16', '#a0d911'];

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
          <div style={{ background: '#fff', padding: '12px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase' }}>🌤️ Weather Station</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '4px' }}>{latest.weather.temp}°F</div>
            <div style={{ fontSize: '11px', color: '#555' }}>Wind: {latest.weather.windSpeed} mph | Hum: {latest.weather.humidity}%</div>
          </div>
          <div role="button" tabIndex={0} onClick={() => setExpandedSection('hydro')} onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('hydro')} style={{ background: '#fff', padding: '12px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
            <div style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase' }}>💧 Hydro & Scour Dynamics</div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', marginTop: '4px' }}>Vel: {latest.waterVelocity} mph</div>
            <div style={{ fontSize: '11px', color: '#555' }}>WL1: {latest.waterLevel[0]} in | Scour1: {latest.scour[0]} in</div>
          </div>
          <div role="button" tabIndex={0} onClick={() => setExpandedSection('gnss')} onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('gnss')} style={{ background: '#fff', padding: '12px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
            <div style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase' }}>🛰️ GNSS Displacement (6 Nodes)</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}><b>Node 1 Deflection:</b></div>
            <div style={{ fontSize: '11px', color: '#555' }}>E: {latest.gnss[0]?.Easting || 0} in | N: {latest.gnss[0]?.Northing || 0} in</div>
          </div>
        </div>
      )}

      {expandedSection === 'none' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
          <div role="button" tabIndex={0} onClick={() => setExpandedSection('accel')} onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('accel')} style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#2d3748' }}>🔊 Accel Array (All 10 Nodes) <span style={{color:'#005A9C', fontSize:'11px'}}>🔍 Click to Explode</span></h4>
            <div style={{ width: '100%', height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: '9px' }} />
                  <YAxis stroke="#718096" style={{ fontSize: '9px' }} domain={['auto','auto']} />
                  <Tooltip contentStyle={{ fontSize: '11px' }} />
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

          <div role="button" tabIndex={0} onClick={() => setExpandedSection('strain')} onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('strain')} style={{ background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#2d3748' }}>📐 Strain Gauge Matrix (All 24 Channels) <span style={{color:'#005A9C', fontSize:'11px'}}>🔍 Click to Explode</span></h4>
            <div style={{ width: '100%', height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: '9px' }} />
                  <YAxis stroke="#718096" style={{ fontSize: '9px' }} domain={['auto','auto']} />
                  <Tooltip contentStyle={{ fontSize: '11px' }} />
                  {Array.from({ length: 24 }).map((_, i) => (
                    <Line key={i} name={`G${i+1}`} type="monotone" dataKey={`sg_${i}`} stroke={colors[i % colors.length]} strokeWidth={1} dot={false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div role="button" tabIndex={0} onClick={() => setExpandedSection('hydro')} onKeyDown={(e) => e.key === 'Enter' && setExpandedSection('hydro')} style={{ background: '#fff', padding: '12px', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#2d3748' }}>🌊 Hydrology Summary <span style={{color:'#005A9C', fontSize:'11px'}}>🔍 Click to Explode</span></h4>
            <div style={{ width: '100%', height: '180px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: '9px' }} />
                  <YAxis stroke="#718096" style={{ fontSize: '9px' }} domain={['auto','auto']} />
                  <Tooltip contentStyle={{ fontSize: '11px' }} />
                  <Line name="Water Level 1" type="monotone" dataKey="waterLevel_1" stroke="#096dd9" dot={false} isAnimationActive={false} />
                  <Line name="Water Level 2" type="monotone" dataKey="waterLevel_2" stroke="#1890ff" strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                  <Line name="Scour Pier 1" type="monotone" dataKey="scour_1" stroke="#722ed1" dot={false} isAnimationActive={false} />
                  <Line name="Scour Pier 2" type="monotone" dataKey="scour_2" stroke="#eb2f96" strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                  <Line name="Stream Velocity" type="monotone" dataKey="waterVelocity" stroke="#fa8c16" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '12px', fontWeight: 'bold', color: '#005A9C' }}>ℹ️ Exploded View Grid.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            
            {expandedSection === 'accel' && Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9' }}>
                <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🔊 Accel Node {i + 1} (in/s²)</h5>
                <div style={{ width: '100%', height: '130px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
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

            {expandedSection === 'strain' && Array.from({ length: 24 }).map((_, i) => (
              <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9' }}>
                <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>📐 Gauge Channel {i + 1} (PSI)</h5>
                <div style={{ width: '100%', height: '130px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                      <Line name="Load" type="monotone" dataKey={`sg_${i}`} stroke="#1890ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}

            {expandedSection === 'gnss' && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9' }}>
                <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🛰️ GNSS Node {i + 1} (in)</h5>
                <div style={{ width: '100%', height: '130px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                      <Line name="E" type="monotone" dataKey={`gnss_${i}_E`} stroke="#52c41a" dot={false} isAnimationActive={false} />
                      <Line name="N" type="monotone" dataKey={`gnss_${i}_N`} stroke="#13c2c2" dot={false} isAnimationActive={false} />
                      <Line name="Z" type="monotone" dataKey={`gnss_${i}_Z`} stroke="#722ed1" dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}

            {expandedSection === 'hydro' && (
              <>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>💧 River Bed Levels (Water Level 1 & 2)</h5>
                  <div style={{ width: '100%', height: '130px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="WL 1 (in)" type="monotone" dataKey="waterLevel_1" stroke="#096dd9" dot={false} isAnimationActive={false} />
                        <Line name="WL 2 (in)" type="monotone" dataKey="waterLevel_2" stroke="#1890ff" dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🌊 Water Runoff Stream Velocity</h5>
                  <div style={{ width: '100%', height: '130px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Velocity (mph)" type="monotone" dataKey="waterVelocity" stroke="#fa8c16" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #d9d9d9' }}>
                  <h5 style={{ margin: '0 0 6px 0', fontSize: '12px' }}>🏗 Structural Pier Scour Penetration</h5>
                  <div style={{ width: '100%', height: '130px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" style={{ fontSize: '8px' }} /><YAxis style={{ fontSize: '8px' }} domain={['auto', 'auto']} /><Tooltip contentStyle={{ fontSize: '10px' }} />
                        <Line name="Pier 1 Scour" type="monotone" dataKey="scour_1" stroke="#722ed1" dot={false} isAnimationActive={false} />
                        <Line name="Pier 2 Scour" type="monotone" dataKey="scour_2" stroke="#eb2f96" dot={false} isAnimationActive={false} />
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
