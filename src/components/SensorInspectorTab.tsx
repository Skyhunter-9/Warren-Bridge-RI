import React, { useEffect, useState } from "react"; 
import { IModelApp } from "@itwin/core-frontend"; 
import { Point3d, Range3d } from "@itwin/core-geometry"; 
import { HARDCODED_SENSORS } from "../Sensors/SensorIcons"; 

interface ActiveSensorNode { 
  hexId: string; 
  x: string; 
  y: string; 
  z: string; 
  screenX?: number;
  screenY?: number;
  visible?: boolean;
} 

export const SensorInspectorComponent = () => { 
  const [loadedSensors, setLoadedSensors] = useState<ActiveSensorNode[]>([]); 

  useEffect(() => { 
    let activeViewport = IModelApp.viewManager.selectedView;

    const bootloadHardcodedSensors = async () => { 
      activeViewport = IModelApp.viewManager.selectedView; 
      const iModelConnection = activeViewport?.iModel; 
      if (!activeViewport || !iModelConnection) return; 

      const initializedNodes: ActiveSensorNode[] = []; 

      for (const hexId of HARDCODED_SENSORS) { 
        try { 
          const targetLocation = new Point3d(0, 0, 0); 
          let positionFound = false; 

          const propsArray = await iModelConnection.elements.getProps(hexId); 
          if (propsArray && propsArray.length > 0) { 
            const props = propsArray[0] as any; 
            if (props.bbox) { 
              const range = Range3d.fromJSON(props.bbox); 
              targetLocation.set(range.center.x, range.center.y, range.high.z + 1.5); 
              positionFound = true; 
            } else if (props.placement && props.placement.origin) { 
              targetLocation.set(props.placement.origin.x, props.placement.origin.y, props.placement.origin.z + 1.5); 
              positionFound = true; 
            } 
          } 

          if (positionFound) { 
            // Map the initial world position to screen coordinates safely
            const screenPos = activeViewport.worldToView(targetLocation);
            initializedNodes.push({ 
              hexId, 
              x: targetLocation.x.toString(), 
              y: targetLocation.y.toString(), 
              z: targetLocation.z.toString(), 
              screenX: screenPos.x,
              screenY: screenPos.y,
              visible: screenPos.z >= 0 && screenPos.z <= 1
            }); 
          } 
        } catch (error) { 
          /* eslint-disable-next-line no-console */
          console.error(`Failed to map node ${hexId}:`, error);
 
        } 
      } 
      setLoadedSensors(initializedNodes); 
    }; 

    // Listen directly to any view modifications (pan/zoom) to manually update marker points
        // Listen directly to any view modifications (pan/zoom) to manually update marker points
    const handleViewChange = () => {
      const currentViewport = IModelApp.viewManager.selectedView;
      if (!currentViewport) return;

      setLoadedSensors((prev) => 
        prev.map((sensor) => {
          const worldPt = new Point3d(parseFloat(sensor.x), parseFloat(sensor.y), parseFloat(sensor.z));
          const screenPos = currentViewport.worldToView(worldPt);
          return {
            ...sensor,
            screenX: screenPos.x,
            screenY: screenPos.y,
            visible: screenPos.z >= 0 && screenPos.z <= 1
          };
        })
      );
    };


    const timeoutHandle = setTimeout(() => { 
      bootloadHardcodedSensors().then(() => {
        // Register direct change listener, skipping the decorator registry entirely
        activeViewport?.onViewChanged.addListener(handleViewChange);
      }).catch(() => {}); 
    }, 2000); 

    return () => { 
      clearTimeout(timeoutHandle); 
      activeViewport?.onViewChanged.removeListener(handleViewChange);
    }; 
  }, []); 

  const handleSelectFromList = async (id: string) => { 
    const vp = IModelApp.viewManager.selectedView; 
    if (vp) { 
      vp.iModel.selectionSet.replace(id); 
      try { 
        await vp.zoomToElements(id, { animateFrustumChange: true }); 
      } catch (error) { 
        /* eslint-disable-next-line no-console */
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
            Bootloading permanent tracking nodes... 
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

      {/* ============================================================== */}
      {/* DIRECT INJECTED REACT PORTAL OVERLAY CONTAINER                */}
      {/* ============================================================== */}
      {typeof document !== "undefined" && loadedSensors.map((sensor) => {
        if (!sensor.visible || sensor.screenX === undefined || sensor.screenY === undefined) return null;
        
        return (
          <div
            key={`overlay-${sensor.hexId}`}
            style={{
              position: "fixed", // Lock it directly to viewport window space coordinates
              left: `${sensor.screenX - 45}px`,
              top: `${sensor.screenY - 15}px`,
              background: "#ff3300", // Bright warning crimson red
              color: "white",
              padding: "6px 14px",
              borderRadius: "20px",
              fontWeight: "bold",
              fontSize: "13px",
              border: "2px solid white",
              boxShadow: "0px 4px 12px rgba(0,0,0,0.7)",
              pointerEvents: "none", // Allows users to scroll or drag model right through the node label
              zIndex: 99999999 // Ultimate screen visual dominance priority
            }}
          >
            🚨 Sensor: {sensor.hexId.slice(-4)}
          </div>
        );
      })}
    </div> 
  ); 
};
