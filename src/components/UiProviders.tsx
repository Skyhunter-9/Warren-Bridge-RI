/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/ 
import React from "react";
import { StagePanelLocation, StagePanelSection, UiItemsProvider, Widget } from "@itwin/appui-react";
import { AncestorsNavigationControls, CopyPropertyTextContextMenuItem, createPropertyGrid, ShowHideNullValuesSettingsMenuItem, } from "@itwin/property-grid-react"; 
import { CategoriesTreeComponent, createTreeWidget, ModelsTreeComponent, } from "@itwin/tree-widget-react"; 
import { selectionStorage } from "../selectionStorage"; 
import { SensorInspectorComponent } from "./SensorInspectorTab"; // Import the clean React view component

export const treeWidgetUiProvider = { 
  id: "TreeWidgetUIProvider", 
  getWidgets: () => [ 
    createTreeWidget({ 
      trees: [ 
        { 
          id: ModelsTreeComponent.id, 
          getLabel: () => ModelsTreeComponent.getLabel(), 
          render: (props) => ( 
            <ModelsTreeComponent getSchemaContext={(imodel) => imodel.schemaContext} density={props.density} selectionStorage={selectionStorage} selectionMode={"extended"} onPerformanceMeasured={props.onPerformanceMeasured} onFeatureUsed={props.onFeatureUsed} /> 
          ), 
        }, 
        { 
          id: CategoriesTreeComponent.id, 
          getLabel: () => CategoriesTreeComponent.getLabel(), 
          render: (props) => ( 
            <CategoriesTreeComponent getSchemaContext={(imodel) => imodel.schemaContext} density={props.density} selectionStorage={selectionStorage} onPerformanceMeasured={props.onPerformanceMeasured} onFeatureUsed={props.onFeatureUsed} /> 
          ), 
        }, 
      ], 
    }), 
  ], 
}; 

export const propertyGridUiProvider = { 
  id: "PropertyGridUIProvider", 
  getWidgets: () => [ 
    createPropertyGrid({ 
      autoExpandChildCategories: true, 
      ancestorsNavigationControls: (props) => ( 
        <AncestorsNavigationControls {...props} /> 
      ), 
      contextMenuItems: [ 
        (props) => <CopyPropertyTextContextMenuItem {...props} />, 
      ], 
      settingsMenuItems: [ 
        (props) => ( 
          <ShowHideNullValuesSettingsMenuItem {...props} persist={true} /> 
        ), 
      ], 
    }), 
  ], 
};

/** Adds the clean class provider wrapper here to safely bypass Vite HMR component export restrictions */
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
