import React, { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { onSensorGraphRequested, SensorGraphRequest } from "./sensorGraphRequest";
import { getSnapshots, onSnapshotsChanged } from "./sensorDataStore";
import { buildChartData, getSensorSeries, mergeChartRows } from "./chartData";
import { SENSOR_INGESTION } from "./ingestionConfig";
import { getCsvHistory, onCsvHistoryChanged } from "./csvIngestion";

// Mounted once, permanently, in App.tsx (as a sibling of <Viewer>, not one of the AppUI side
// tabs) so it can pop up regardless of which tab is currently open. Listens for
// onSensorGraphRequested, which SensorIcons.ts's ElementIconMarker.onMouseButton() raises
// when a 3D marker is clicked, and renders that sensor's live chart in a floating overlay.
export function SensorGraphPopup() {
  const [request, setRequest] = useState<SensorGraphRequest | undefined>(undefined);
  // Bumped every time the shared sensor data store gets a new poll, purely to force this
  // component to re-render (and thus recompute chartData below) so the chart keeps
  // scrolling live while the popup is open.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return onSensorGraphRequested.addListener(setRequest);
  }, []);

  useEffect(() => {
    if (!request) return;
    return onSnapshotsChanged.addListener(() => setTick((t) => t + 1));
  }, [request]);

  // Same idea as the listener above, but for csvIngestion.ts's separate hourly-download data
  // path - a CSV-mode sensor's popup should redraw as soon as a new file lands, not just once
  // per live poll (which carries no data for it - see ingestionConfig.ts).
  useEffect(() => {
    if (!request) return;
    return onCsvHistoryChanged.addListener((type) => {
      if (type === request.sensorType) setTick((t) => t + 1);
    });
  }, [request]);

  // An array, not a single series, because some sensors are paired (e.g. an accelerometer
  // marker's click also shows its co-located geophone reading - see chartData.ts's
  // getSensorSeries for the pairing).
  const seriesList = useMemo(
    () => (request ? getSensorSeries(request.sensorType, request.nodeIndex) : undefined),
    [request]
  );

  // Only the most recent 45 points (~45 seconds), matching the "Real time" default window
  // used elsewhere in IoTDashboard.tsx - plus, if this sensor type is in CSV mode (see
  // ingestionConfig.ts), every downloaded CSV row too, since that data never lands in the
  // live 1Hz buffer at all (csvIngestion.ts) and would otherwise never show up here.
  // `tick` isn't read inside the callback - getSnapshots()/getCsvHistory() read external
  // mutable state - but it's what should trigger a recompute (a live poll or CSV download),
  // so it's deliberately kept as a dep despite the lint rule not being able to see that.
  const chartData = useMemo(() => {
    const liveRows = buildChartData(getSnapshots()).slice(-45);
    if (!request || SENSOR_INGESTION[request.sensorType].mode !== "CSV") return liveRows;
    return mergeChartRows(liveRows, getCsvHistory(request.sensorType));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, tick]);

  if (!request || !seriesList || seriesList.length === 0) return null;

  const isCsvSensor = SENSOR_INGESTION[request.sensorType].mode === "CSV";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setRequest(undefined)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setRequest(undefined)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* stopPropagation here just prevents a click inside the card from bubbling up to the
          backdrop's close handler above - Escape (handled on the backdrop) is the keyboard
          equivalent for closing, so no separate key handler is needed on this element. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="dialog"
        aria-label={seriesList[0].title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          color: "#333",
          borderRadius: "8px",
          padding: "16px",
          width: "480px",
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "11px", opacity: 0.6 }}>
            {request.elementId}
            {isCsvSensor && (
              <span style={{ marginLeft: "8px", fontSize: "10px", color: "#8c6d1f", background: "#fff7e0", border: "1px solid #f0d989", borderRadius: "3px", padding: "1px 5px" }}>
                📄 CSV (hourly) - updates on new file, not live
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setRequest(undefined)}
            style={{ border: "none", background: "transparent", fontSize: "18px", cursor: "pointer", lineHeight: 1, color: "#333" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* One sub-chart per paired series (e.g. accelerometer + its co-located geophone) -
            see chartData.ts's getSensorSeries for how that pairing is decided. */}
        {seriesList.map((series) => (
          <div key={series.title} style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 2px 0", fontSize: "14px", color: "#005A9C" }}>{series.title}</h3>
            <span style={{ fontSize: "11px", opacity: 0.6 }}>{series.unit}</span>
            <div style={{ width: "100%", height: "180px", marginTop: "4px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: "9px" }} />
                  <YAxis stroke="#718096" style={{ fontSize: "9px" }} domain={["auto", "auto"]} />
                  <Tooltip wrapperStyle={{ zIndex: 10001 }} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }} />
                  {series.lines.map((line) => (
                    <Line
                      key={line.dataKey}
                      name={line.name}
                      type="monotone"
                      dataKey={line.dataKey}
                      stroke={line.color}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
