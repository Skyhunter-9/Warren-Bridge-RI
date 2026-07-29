import React from 'react';
import { GeophoneDisplacementChart } from '../geophone/GeophoneDisplacementChart';

// Renders the "Processed Results" tab: charts backed by real signal-processing math running
// in the separate Python backend (see CLAUDE.md's "Python backend" section, src/geophone/),
// as opposed to the "IoT Dashboard" tab's charts, which are either raw simulated/vendor sensor
// readings or simple in-browser math. Kept as its own tab (not just another card in
// IoTDashboard.tsx) so heavier, actually-computed results don't get lost among the raw sensor
// tiles. Same card grid layout/style as IoTDashboard.tsx's overview section - each card here
// (e.g. GeophoneDisplacementChart) is already self-contained with that same styling, so this
// component only needs to provide the matching outer header/grid wrapper.
export const ProcessedResultsDashboard: React.FC = () => {
  return (
    <div style={{ padding: '16px', height: '100%', boxSizing: 'border-box', backgroundColor: '#f4f6f9', color: '#333333', overflowY: 'auto', fontFamily: 'sans-serif' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 16px 0', borderBottom: '3px solid #005A9C', paddingBottom: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: '#005A9C', fontWeight: 700 }}>🧮 Processed Results (Python)</h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        {/* GEOPHONE DISPLACEMENT - drift-corrected integration math running in python/, see
            src/geophone/GeophoneDisplacementChart.tsx */}
        <GeophoneDisplacementChart />
      </div>

    </div>
  );
};
