// This file defines a custom tab or "widget" it is a template incase another is needed
// Instructions for App.tsx import at bottom of file along with code to paste
//
// This is the pattern every other custom tab in this app follows (compare to
// src/components/Developer_Tab.tsx, src/components/MyCustomUiProvider.tsx, and
// src/Sensors/SensorInspectorTab.tsx): a plain React component with the actual UI, plus a
// small UiItemsProvider class that
// tells the Viewer where to place it. To add a brand-new tab: copy this file, rename both
// the component and the class, replace the JSX inside the component, then follow the
// import/registration instructions at the bottom of this file to wire it into App.tsx.

import React from "react";
import { StagePanelLocation, StagePanelSection, UiItemsProvider, Widget } from "@itwin/appui-react";

// 1. Rename this custom component wrapper for your new layout features
const NewFeatureComponent = () => {
  return (
    <div style={{ padding: "16px", color: "var(--itwin-color-text)" }}>
      <h3>New Tab View</h3>
      <p>Drop your custom lists, tables, or buttons here.</p>
    </div>
  );
};

// 2. Rename this class name identifier when you want to link it into App.tsx
export class WidgetTemplate implements UiItemsProvider {
  public readonly id = "WidgetTemplate"; // Ensure this ID string is unique

  public provideWidgets(
    _stageId: string,
    _stageUsage: string,
    location: StagePanelLocation,
    section?: StagePanelSection
  ): ReadonlyArray<Widget> {
    const widgets: Widget[] = [];

    // Decides where on the screen the new tab settles (Right, Left, Top, Bottom).
    // All of this app's existing tabs use Right + Start, which is why they all stack
    // together in the same right-side panel group you see in the running app.
    if (location === StagePanelLocation.Right && section === StagePanelSection.Start) {
      widgets.push({
        id: "my-template-tab-id",
        label: "Template View",     // The display text on the tab header button
        icon: "icon-settings",       // Built-in icon descriptor string
        content: <NewFeatureComponent />,
      });
    }

    return widgets;
  }
}



// Inside App.tsx to execute the above code we need to paste the following
// import { WidgetTemplate } from "./WidgetTemplate";
// in the <viewer ...> tag's uiProviders it should look something like this
    //   uiProviders={[
    //     new ViewerNavigationToolsProvider(),
    //     new ViewerContentToolsProvider({
    //       vertical: {
    //         measureGroup: false,
    //       },
    //     }),
    //     new ViewerStatusbarItemsProvider(),
    //     new MeasureToolsUiItemsProvider(),
    //     treeWidgetUiProvider,
    //     propertyGridUiProvider,
    //     new MyCustomUiProvider(), // Your first tab provider
    //     new WidgetTemplate(),     // <-- Add your new template tab right here!
    //   ]}
