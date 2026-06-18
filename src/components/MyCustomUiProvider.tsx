import React from "react";
import { StagePanelLocation, StagePanelSection, UiItemsProvider, Widget } from "@itwin/appui-react";
import { IoTDashboard } from './IoTDashboard';

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
