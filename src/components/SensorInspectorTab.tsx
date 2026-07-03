import React, { useEffect, useState } from "react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Point3d, Range3d } from "@itwin/core-geometry";
import { HARDCODED_SENSORS } from "../Sensors/SensorIcons";

interface ActiveSensorNode {
  hexId: string;
  x: string;
  y: string;
  z: string;
}

export const SensorInspectorComponent = () => {
  const [loadedSensors, setLoadedSensors] = useState<ActiveSensorNode[]>([]);

  useEffect(() => {
    let disposed = false;

    const loadSensorList = async (iModel: IModelConnection) => {
      const initializedNodes: ActiveSensorNode[] = [];

      for (const hexId of HARDCODED_SENSORS) {
        try {
          const propsArray = await iModel.elements.getProps(hexId);
          if (!propsArray || propsArray.length === 0) continue;

          const props = propsArray[0] as any;
          const location = new Point3d(0, 0, 0);
          let positionFound = false;

          if (props.bbox) {
            const range = Range3d.fromJSON(props.bbox);
            location.set(range.center.x, range.center.y, range.high.z + 1.5);
            positionFound = true;
          } else if (props.placement?.origin) {
            location.set(props.placement.origin.x, props.placement.origin.y, props.placement.origin.z + 1.5);
            positionFound = true;
          }

          if (positionFound) {
            initializedNodes.push({
              hexId,
              x: location.x.toString(),
              y: location.y.toString(),
              z: location.z.toString(),
            });
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Failed to map node ${hexId}:`, error);
        }
      }

      if (!disposed) setLoadedSensors(initializedNodes);
    };

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

  const handleSelectFromList = async (id: string) => {
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
    <div style={{ padding: "16px", color: "var(--itwin-color-text)", display: "flex", flexDirection: "column", gap: "12px" }}>
      <h3>Sensor Station Registry</h3>
      <p style={{ fontSize: "12px", opacity: 0.7, margin: 0 }}>
        Permanently configured directly inside your application code workspace.
      </p>
      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "13px", fontWeight: "bold", opacity: 0.8 }}>
          Online Nodes ({loadedSensors.length}):
        </span>
        {loadedSensors.length === 0 ? (
          <div style={{ fontSize: "12px", opacity: 0.5, fontStyle: "italic", padding: "4px" }}>
            Loading tracking nodes...
          </div>
        ) : (
          <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", background: "rgba(0,0,0,0.1)", borderRadius: "4px", padding: "4px" }}>
            {loadedSensors.map((sensor) => (
              <button
                key={sensor.hexId}
                onClick={async () => handleSelectFromList(sensor.hexId)}
                type="button"
                style={{ padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", cursor: "pointer", fontSize: "12px", display: "flex", flexDirection: "column", borderLeft: "4px solid #00ff33", borderTop: "none", borderRight: "none", borderBottom: "none", textAlign: "left", width: "100%", color: "inherit" }}
              >
                <span style={{ fontFamily: "monospace", fontWeight: "bold", color: "#00ff33" }}> {sensor.hexId} </span>
                <span style={{ fontSize: "10px", opacity: 0.6, marginTop: "2px" }}> Coordinates: X:{sensor.x} Y:{sensor.y} Z:{sensor.z} </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};