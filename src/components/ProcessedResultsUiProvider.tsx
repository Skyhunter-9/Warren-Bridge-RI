import React from "react";
import { StagePanelLocation, StagePanelSection, UiItemsProvider, Widget } from "@itwin/appui-react";
import { ProcessedResultsDashboard } from './ProcessedResultsDashboard';

// Thin UiItemsProvider wrapper that adds the "Processed Results" tab (charts backed by real
// signal-processing math running in the separate Python backend - see src/geophone/), kept
// separate from the "IoT Dashboard" tab. All the actual layout/markup lives in
// ProcessedResultsDashboard.tsx - this class just registers it as a right-panel widget, same
// pattern as MyCustomUiProvider.tsx.
export class ProcessedResultsUiProvider implements UiItemsProvider {
  public readonly id = "ProcessedResultsUiProvider";

  public provideWidgets(
    _stageId: string,
    _stageUsage: string,
    location: StagePanelLocation,
    section?: StagePanelSection
  ): ReadonlyArray<Widget> {
    const widgets: Widget[] = [];

    if (location === StagePanelLocation.Right && section === StagePanelSection.Start) {
      widgets.push({
        id: "Processed-Results",
        label: "Processed Results",
        icon: "icon-calculator",
        content: <ProcessedResultsDashboard />,
      });
    }

    return widgets;
  }
}
