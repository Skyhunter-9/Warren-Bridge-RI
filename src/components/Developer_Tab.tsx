import React, { useEffect, useState } from "react";
import { StagePanelLocation, StagePanelSection, UiItemsProvider, Widget } from "@itwin/appui-react";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from "@itwin/core-frontend";

// Renders the "Developer Tab" side panel: a toggleable "Hex ID Inspector" that watches
// whatever element you click in the 3D view and copies its Hex ID to the clipboard. This is
// the fastest way to find the real element ID for a new sensor to add to
// SENSOR_GROUPS (src/Sensors/SensorIcons.ts) - click the element in the viewport with
// this active, then paste the copied ID into that array.
const NewFeatureComponent = () => {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [hexId, setHexId] = useState<string>("None");

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

        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Info,
            `Copied Hex ID: ${firstElementId}`
          )
        );
        
        navigator.clipboard.writeText(firstElementId).catch(() => {});
      }
    };

    // Listen to changes on the selection set
    const removeListener = iModelConnection.selectionSet.onChanged.addListener(handleSelectionChange);

    return () => {
      removeListener();
    };
  }, [isEnabled]); // Re-subscribes whenever the toggle flips on/off.

  // Flips the inspector on/off; resets the displayed Hex ID when turning it off.
  const toggleSelectionSpy = () => {
    setIsEnabled((prev) => !prev);
    if (!isEnabled) {
      setHexId("None");
    }
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

      <div style={{ marginTop: "8px", background: "rgba(0,0,0,0.2)", padding: "8px", borderRadius: "4px" }}>
        <span style={{ fontSize: "12px", display: "block", opacity: 0.7 }}>Selected Hex ID:</span>
        <div style={{ fontFamily: "monospace", fontSize: "16px", fontWeight: "bold", color: isEnabled ? "#4caf50" : "inherit", marginTop: "4px" }}>
          {hexId}
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
