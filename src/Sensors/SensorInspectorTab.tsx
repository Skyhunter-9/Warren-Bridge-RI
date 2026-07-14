import React, { useEffect, useState } from "react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { getEntryDisplayId, getEntryOffset, isGeoPlacement, SENSOR_GROUPS, SensorType } from "./SensorIcons";
import { resolveGeoPosition, resolveSensorPosition } from "./resolveSensorPosition";

// Renders the "Sensors" side tab ("Sensor Station Registry" panel in the screenshots).
// This is a diagnostic/debug view: it independently re-resolves every SENSOR_GROUPS Hex ID's
// world coordinates (via the same resolveSensorPosition helper SensorDecorator.tsx uses) so
// you can see exactly where the app thinks each sensor is, grouped by type with a
// "configured/expected" count, and click one to fly the camera to it.

interface ActiveSensorNode {
  // A real Hex ID, or a synthetic "geo:lat,long" label for a sensor placed by coordinates
  // with no linked element - see getEntryDisplayId in SensorIcons.ts.
  displayId: string;
  x: string;
  y: string;
  z: string;
}

// One resolved list of sensors per SENSOR_GROUPS entry, keyed by sensor type.
type ResolvedByType = Partial<Record<SensorType, ActiveSensorNode[]>>;

export const SensorInspectorComponent = () => {
  const [resolvedByType, setResolvedByType] = useState<ResolvedByType>({});

  useEffect(() => {
    let disposed = false;

    const loadSensorList = async (iModel: IModelConnection) => {
      const next: ResolvedByType = {};

      for (const group of SENSOR_GROUPS) {
        const nodes: ActiveSensorNode[] = [];

        for (const entry of group.elementIds) {
          const displayId = getEntryDisplayId(entry);
          try {
            // Geo-placed entries resolve from an exact lat/long instead of an element's
            // geometry - see SensorGeoPlacement in SensorIcons.ts.
            const location = isGeoPlacement(entry)
              ? await resolveGeoPosition(iModel, entry)
              : await resolveSensorPosition(iModel, typeof entry === "string" ? entry : entry.elementId);
            if (location) {
              // Match the same offset SensorDecorator.tsx applies, so this panel shows
              // exactly where the marker actually renders, not just the raw resolved position.
              const offset = getEntryOffset(entry);
              nodes.push({
                displayId,
                x: (location.x + offset.x).toString(),
                y: (location.y + offset.y).toString(),
                z: (location.z + offset.z).toString(),
              });
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`Failed to map node ${displayId}:`, error);
          }
        }

        next[group.type] = nodes;
      }

      if (!disposed) setResolvedByType(next);
    };

    // Handles both cases: the viewport may already be open by the time this tab mounts
    // (use it immediately), or it may still be loading (wait for the one-time open event).
    const existingViewport = IModelApp.viewManager.selectedView;
    if (existingViewport?.iModel) {
      void loadSensorList(existingViewport.iModel);
    } else {
      IModelApp.viewManager.onViewOpen.addOnce((viewport) => {
        void loadSensorList(viewport.iModel);
      });
    }

    return () => {
      disposed = true;
    };
  }, []);

  // Clicking a sensor row selects that element (highlights it) and animates the camera to
  // frame it - handy for confirming a Hex ID actually corresponds to the sensor you expect.
  // No-ops for a synthetic "geo:lat,long" id (see getEntryDisplayId) since there's no element
  // to select for a sensor placed purely by coordinates.
  const handleSelectFromList = async (id: string) => {
    if (!id.startsWith("0x")) return;

    const vp = IModelApp.viewManager.selectedView;
    if (vp) {
      vp.iModel.selectionSet.replace(id);
      try {
        await vp.zoomToElements(id, { animateFrustumChange: true });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Camera sweep alignment failed:", error);
      }
    }
  };

  return (
    <div style={{ padding: "16px", color: "var(--itwin-color-text)", display: "flex", flexDirection: "column", gap: "16px" }}>
      <h3>Sensor Station Registry</h3>
      <p style={{ fontSize: "12px", opacity: 0.7, margin: 0 }}>
        Permanently configured directly inside your application code workspace.
      </p>

      {SENSOR_GROUPS.map((group) => {
        const nodes = resolvedByType[group.type] ?? [];
        return (
          <div key={group.type} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: "bold", opacity: 0.8, display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: group.color, display: "inline-block", border: "1px solid rgba(255,255,255,0.4)" }} />
              {group.label} ({nodes.length}/{group.expectedCount} configured)
            </span>

            {nodes.length === 0 ? (
              <div style={{ fontSize: "12px", opacity: 0.5, fontStyle: "italic", padding: "4px" }}>
                No {group.label} sensors configured yet - add Hex IDs to the &quot;{group.type}&quot; entry in SensorIcons.ts.
              </div>
            ) : (
              <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", background: "rgba(0,0,0,0.1)", borderRadius: "4px", padding: "4px" }}>
                {nodes.map((sensor) => (
                  <button
                    key={sensor.displayId}
                    onClick={async () => handleSelectFromList(sensor.displayId)}
                    type="button"
                    style={{ padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", cursor: "pointer", fontSize: "12px", display: "flex", flexDirection: "column", borderLeft: `4px solid ${group.color}`, borderTop: "none", borderRight: "none", borderBottom: "none", textAlign: "left", width: "100%", color: "inherit" }}
                  >
                    <span style={{ fontFamily: "monospace", fontWeight: "bold", color: group.color }}> {sensor.displayId} </span>
                    <span style={{ fontSize: "10px", opacity: 0.6, marginTop: "2px" }}> Coordinates: X:{sensor.x} Y:{sensor.y} Z:{sensor.z} </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
