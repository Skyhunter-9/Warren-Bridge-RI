import React from "react";
import { StagePanelLocation, StagePanelSection, UiItemsProvider, Widget } from "@itwin/appui-react";

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
        id: "my-blank-tab",
        label: "My Custom Tab",
        icon: "icon-developer",
        content: (
          <div style={{ padding: "16px", color: "var(--itwin-color-text)" }}>
            <h3>My New Panel</h3>
            <p>This space is completely blank and ready for your custom tools!</p>
          </div>
        ),
      });
    }

    return widgets;
  }
}
