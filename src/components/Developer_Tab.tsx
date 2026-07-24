import React, { useEffect, useState } from "react";
import { StagePanelLocation, StagePanelSection, UiItemsProvider, Widget } from "@itwin/appui-react";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@itwin/core-frontend";
import { resolveSensorPosition } from "../Sensors/resolveSensorPosition";
import { modelShiftProvider } from "../modelshift/ModelShiftProvider";

// Renders the "Developer Tab" side panel: a toggleable "Hex ID Inspector" that watches
// whatever element you click in the 3D view, copies its Hex ID to the clipboard, and shows
// its resolved spatial position (meters) plus which Model it belongs to. This is the fastest
// way to find:
//   - the real element ID for a new sensor to add to SENSOR_GROUPS (src/Sensors/SensorIcons.ts);
//   - the Model ID for excludedModelIds (src/modelshift/modelShiftConfig.ts) - note this is
//     NOT the same as the element's own Hex ID above it (a common mixup - the Properties
//     panel's "Model" field only shows a human-readable name, not this raw id, which is why
//     it's surfaced here instead);
//   - the currentPosition value for modelShiftConfig.ts's reference point - click the
//     reference element with this active and read its resolved X/Y/Z below.
const NewFeatureComponent = () => {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [hexId, setHexId] = useState<string>("None");
  const [modelId, setModelId] = useState<string>("None");
  const [categoryId, setCategoryId] = useState<string>("None");
  const [position, setPosition] = useState<{ x: number; y: number; z: number } | undefined>(undefined);
  // Mirrors modelShiftProvider's own enabled flag so this button's label stays in sync -
  // initialized from the provider itself rather than assuming true, in case it's ever
  // toggled from somewhere else.
  const [isShiftEnabled, setIsShiftEnabled] = useState<boolean>(() => modelShiftProvider.isEnabled);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const iModelConnection = IModelApp.viewManager.selectedView?.iModel;
    if (!iModelConnection) return;

    // Fixed: Ignore the ev argument payload completely to prevent version-specific type mismatches
    const handleSelectionChange = () => {
      const selectionSet = iModelConnection.selectionSet;

      if (selectionSet && selectionSet.size > 0) {
        // Fixed: Directly access elements from the active selection set container safely
        const elementsArray = Array.from(selectionSet.elements);
        const firstElementId = String(elementsArray[0]);

        setHexId(firstElementId);
        setModelId("...");
        setCategoryId("...");
        setPosition(undefined);

        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Info,
            `Copied Hex ID: ${firstElementId}`
          )
        );

        navigator.clipboard.writeText(firstElementId).catch(() => {});

        // Same bbox-center resolution SensorDecorator.tsx uses for markers - shown here so
        // you can read off a currentPosition value for modelshift/modelShiftConfig.ts without
        // having to temporarily add the element as a sensor just to see its coordinates.
        void resolveSensorPosition(iModelConnection, firstElementId).then((location) => {
          if (location) setPosition({ x: location.x, y: location.y, z: location.z });
        });

        // ElementProps.model is the Hex ID of the Model this element lives in - what
        // modelshift/modelShiftConfig.ts's excludedModelIds actually needs (not the
        // element's own id above). category (only present on GeometricElementProps, hence
        // the `any` cast) is here to check whether terrain and structural elements can be
        // told apart by category when they share a Model - see ModelShiftProvider.ts.
        void iModelConnection.elements.getProps(firstElementId).then((propsArray) => {
          const props = propsArray[0] as any;
          setModelId(props?.model ?? "unknown");
          setCategoryId(props?.category ?? "unknown");
        });
      }
    };

    // Listen to changes on the selection set
    const removeListener = iModelConnection.selectionSet.onChanged.addListener(handleSelectionChange);

    return () => {
      removeListener();
    };
  }, [isEnabled]); // Re-subscribes whenever the toggle flips on/off.

  // Flips the inspector on/off; resets the displayed fields when turning it off.
  const toggleSelectionSpy = () => {
    setIsEnabled((prev) => !prev);
    if (!isEnabled) {
      setHexId("None");
      setModelId("None");
      setCategoryId("None");
      setPosition(undefined);
    }
  };

  // Flips the bridge's geolocation correction (modelshift/ModelShiftProvider.ts) off/on live,
  // without touching modelShiftConfig.ts or reloading the page - e.g. turn it off to see the
  // model at its raw, un-shifted position while you pick a reference element and read its
  // true position above, then turn it back on once you've updated the config.
  const toggleModelShift = () => {
    const next = !isShiftEnabled;
    modelShiftProvider.setEnabled(next);
    setIsShiftEnabled(next);
  };

  return (
    <div style={{ padding: "16px", color: "var(--itwin-color-text)", display: "flex", flexDirection: "column", gap: "12px" }}>
      <h3>Developer Utilities</h3>
      
      <button 
        onClick={toggleSelectionSpy}
        style={{
          padding: "8px 12px",
          backgroundColor: isEnabled ? "#008b45" : "#333",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        {isEnabled ? "🟢 Hex ID Inspector Active" : "⚫ Activate Hex ID Inspector"}
      </button>

      <button
        onClick={toggleModelShift}
        style={{
          padding: "8px 12px",
          backgroundColor: isShiftEnabled ? "#008b45" : "#a33",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        {isShiftEnabled ? "🟢 Model Shift ON (bridge corrected)" : "🔴 Model Shift OFF (raw position)"}
      </button>

      <div style={{ marginTop: "8px", background: "rgba(0,0,0,0.2)", padding: "8px", borderRadius: "4px" }}>
        <span style={{ fontSize: "12px", display: "block", opacity: 0.7 }}>Selected Hex ID:</span>
        <div style={{ fontFamily: "monospace", fontSize: "16px", fontWeight: "bold", color: isEnabled ? "#4caf50" : "inherit", marginTop: "4px" }}>
          {hexId}
        </div>
        <span style={{ fontSize: "12px", display: "block", opacity: 0.7, marginTop: "8px" }}>Model ID (for excludedModelIds):</span>
        <div style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: "bold", color: isEnabled ? "#ffa726" : "inherit", marginTop: "4px" }}>
          {modelId}
        </div>
        <span style={{ fontSize: "12px", display: "block", opacity: 0.7, marginTop: "8px" }}>Category ID:</span>
        <div style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: "bold", color: isEnabled ? "#42a5f5" : "inherit", marginTop: "4px" }}>
          {categoryId}
        </div>
        <span style={{ fontSize: "12px", display: "block", opacity: 0.7, marginTop: "8px" }}>Resolved Position (meters):</span>
        <div style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: "bold", color: isEnabled ? "#4caf50" : "inherit", marginTop: "4px" }}>
          {position ? `X: ${position.x.toFixed(3)}  Y: ${position.y.toFixed(3)}  Z: ${position.z.toFixed(3)}` : "—"}
        </div>
      </div>
    </div>
  );
};

export class Developer_Tab implements UiItemsProvider {
  public readonly id = "Developer_Tab";

  public provideWidgets(
    _stageId: string,
    _stageUsage: string,
    location: StagePanelLocation,
    section?: StagePanelSection
  ): ReadonlyArray<Widget> {
    const widgets: Widget[] = [];

    if (location === StagePanelLocation.Right && section === StagePanelSection.Start) {
      widgets.push({
        id: "my-developer-tab-id",
        label: "Developer Tab",
        icon: "icon-settings",
        content: <NewFeatureComponent />,
      });
    }
    return widgets;
  }
}
