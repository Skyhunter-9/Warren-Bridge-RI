import React from "react";
import { StagePanelLocation, StagePanelSection, UiItemsProvider, Widget } from "@itwin/appui-react";
import { IoTDashboard } from './IoTDashboard';

// Thin UiItemsProvider wrapper that adds the "IoT Dashboard" tab (the charts/tiles panel
// with Weather Station / Hydro & Scour / GNSS cards). All the actual dashboard logic and
// markup lives in IoTDashboard.tsx - this class just registers it as a right-panel widget.
export class MyCustomUiProvider implements UiItemsProvider {
  public readonly id = "MyCustomUiProvider";

  public provideWidgets(
    _stageId: string,
    _stageUsage: string,
    location: StagePanelLocation,
    section?: StagePanelSection
  ): ReadonlyArray<Widget> {
    const widgets: Widget[] = [];

    if (location === StagePanelLocation.Right && section === StagePanelSection.Start) {
      widgets.push({
        id: "IoT-Dashboard",
        label: "IoT Dashboard",
        icon: "icon-developer",
        content: <IoTDashboard />,

      });
    }

    return widgets;
  }
}
