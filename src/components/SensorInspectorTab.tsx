import React, { useEffect, useRef, useState } from "react";
import { StagePanelLocation, StagePanelSection, UiItemsProvider, Widget } from "@itwin/appui-react";
import { IModelApp } from "@itwin/core-frontend";
import { Point3d, Range3d } from "@itwin/core-geometry";
import { ElementIconMarker, HARDCODED_SENSORS, IconDecorator } from "../Sensors/SensorIcons";

interface ActiveSensorNode {
  hexId: string;
  x: string;
  y: string;
  z: string;
}

const SensorInspectorComponent = () => {
  const [loadedSensors, setLoadedSensors] = useState<ActiveSensorNode[]>([]);
  const decoratorRef = useRef<IconDecorator | null>(null);

  useEffect(() => {
    if (!decoratorRef.current) {
      decoratorRef.current = new IconDecorator();
      IModelApp.viewManager.addDecorator(decoratorRef.current);
    }

    const bootloadHardcodedSensors = async () => {
      const activeViewport = IModelApp.viewManager.selectedView;
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
              
              // Calculate center horizontal coordinates, but grab the absolute highest point (ceiling)
              const centerX = range.center.x;
              const centerY = range.center.y;
              const highestZ = range.high.z; // Peak top elevation of the concrete element mesh
              
              // Apply a 1.5-meter upward displacement offset so the circle marker floats clearly above the beam
              targetLocation.set(centerX, centerY, highestZ + 1.5);
              positionFound = true;
            } else if (props.placement && props.placement.origin) {
              // Alternate fallback elevation push for placement parameters
              targetLocation.set(props.placement.origin.x, props.placement.origin.y, props.placement.origin.z + 1.5);
              positionFound = true;
            }
          }

          // Fallback to project center extents if properties return missing structural box coordinates
          if (!positionFound || (targetLocation.x === 0 && targetLocation.y === 0)) {
            const projectExtents = iModelConnection.projectExtents;
            if (projectExtents) {
              targetLocation.set(projectExtents.center.x, projectExtents.center.y, projectExtents.center.z + 2.0);
              positionFound = true;
            }
          }

          if (positionFound) {
            const newMarker = new ElementIconMarker(targetLocation, { x: 28, y: 28 }, hexId);
            decoratorRef.current?.addMarker(newMarker);

            initializedNodes.push({
              hexId,
              x: targetLocation.x.toFixed(2),
              y: targetLocation.y.toFixed(2),
              z: targetLocation.z.toFixed(2),
            });
          }
        } catch (error) {
          /* eslint-disable-next-line no-console */
          console.error(`Failed to map structural node ${hexId}:`, error);
        }
      }

      setLoadedSensors(initializedNodes);
    };

    const timeoutHandle = setTimeout(() => {
      bootloadHardcodedSensors().catch(() => {});
    }, 2000);

    return () => {
      clearTimeout(timeoutHandle);
      if (decoratorRef.current) {
        IModelApp.viewManager.dropDecorator(decoratorRef.current);
      }
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
                style={{ 
                  padding: "8px", 
                  background: "rgba(255,255,255,0.05)", 
                  borderRadius: "3px", 
                  cursor: "pointer", 
                  fontSize: "12px",
                  display: "flex",
                  flexDirection: "column",
                  borderLeft: "4px solid #00ff33",
                  borderTop: "none",
                  borderRight: "none",
                  borderBottom: "none",
                  textAlign: "left",
                  width: "100%",
                  color: "inherit"
                }}
              >
                <span style={{ fontFamily: "monospace", fontWeight: "bold", color: "#00ff33" }}>
                  {sensor.hexId}
                </span>
                <span style={{ fontSize: "10px", opacity: 0.6, marginTop: "2px" }}>
                  Coordinates: X:{sensor.x} Y:{sensor.y} Z:{sensor.z}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export class SensorInspectorTab implements UiItemsProvider {
  public readonly id = "SensorInspectorTab";

  public provideWidgets(
    _stageId: string,
    _stageUsage: string,
    location: StagePanelLocation,
    section?: StagePanelSection
  ): ReadonlyArray<Widget> {
    const widgets: Widget[] = [];

    if (location === StagePanelLocation.Right && section === StagePanelSection.Start) {
      widgets.push({
        id: "sensor-inspector-widget-id",
        label: "Sensors", 
        icon: "icon-pin", 
        content: <SensorInspectorComponent />,
      });
    }
    return widgets;
  }
}
