// src/components/IoTDashboard.tsx
import React, { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';


interface SensorData {
  time: string;
  accelX: number;
  accelY: number;
  strain: number;
}

export const IoTDashboard: React.FC = () => {
  const [data, setData] = useState<SensorData[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Accelerometer: Simulating ambient structure/bridge vibrations (in milli-g)
      const accelX = parseFloat((Math.sin(now.getTime() / 1000) * 15 + (Math.random() * 5)).toFixed(2));
      const accelY = parseFloat((Math.cos(now.getTime() / 800) * 12 + (Math.random() * 5)).toFixed(2));

      // Strain Gauge: Microstrain (µε) representing mechanical tension/compression forces
      const baseStrain = 120; // baseline load
      const strain = parseFloat((baseStrain + Math.sin(now.getTime() / 3000) * 8 + (Math.random() * 2)).toFixed(1));

      setData((prev) => {
        const updated = [...prev, { time: timestamp, accelX, accelY, strain }];
        return updated.slice(-15); // Rolling display window for 15 samples
      });
    }, 1000); // Live updates every 1 second

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '16px', height: '100%', boxSizing: 'border-box', backgroundColor: '#ffffff', color: '#333333', overflowY: 'auto', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', borderBottom: '2px solid #005A9C', paddingBottom: '6px', color: '#005A9C' }}>
        🏗️ Bridge Structural Health IoT
      </h3>

      {/* --- CHART 1: ACCELEROMETER VIBRATION --- */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#555' }}>🔊 Accelerometer Telemetry (milli-g)</h4>
        <div style={{ width: '100%', height: '160px', background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: '4px', padding: '6px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="time" stroke="#777" style={{ fontSize: '9px' }} />
              <YAxis stroke="#777" style={{ fontSize: '9px' }} domain={['-25', '25']} />
              <Tooltip contentStyle={{ fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '-5px' }} />
              <Line name="X-Axis" type="monotone" dataKey="accelX" stroke="#ff4d4f" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line name="Y-Axis" type="monotone" dataKey="accelY" stroke="#52c41a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- CHART 2: STRAIN GAUGE STRESS --- */}
      <div>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#555' }}>📐 Strain Gauge Load Sensor (µε)</h4>
        <div style={{ width: '100%', height: '160px', background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: '4px', padding: '6px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="time" stroke="#777" style={{ fontSize: '9px' }} />
              <YAxis stroke="#777" style={{ fontSize: '9px' }} domain={['100', '140']} />
              <Tooltip contentStyle={{ fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '-5px' }} />
              <Line name="Microstrain" type="monotone" dataKey="strain" stroke="#1890ff" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
