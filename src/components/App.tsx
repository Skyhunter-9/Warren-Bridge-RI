/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  Viewer,
  ViewerContentToolsProvider,
  ViewerNavigationToolsProvider,
  ViewerPerformance,
  ViewerStatusbarItemsProvider,
} from "@itwin/web-viewer-react";
import {
  FitViewTool,
  IModelApp,
  type ScreenViewport,
  StandardViewId,
} from "@itwin/core-frontend";
import { useCallback } from "react";
import { TreeWidget } from "@itwin/tree-widget-react";
import { PropertyGridManager } from "@itwin/property-grid-react";
import {
  MeasurementActionToolbar,
  MeasureTools,
  MeasureToolsUiItemsProvider,
} from "@itwin/measure-tools-react";
import { selectionStorage } from "../selectionStorage";
import { propertyGridUiProvider, SensorInspectorTab, treeWidgetUiProvider } from "./UiProviders";
import { useAuthorizationContext } from "./Authorization";
import { MyCustomUiProvider } from "./MyCustomUiProvider";
import { Developer_Tab } from "./Developer_Tab";
import { sensorDecorator } from "../Sensors/SensorDecorator";
import { SensorGraphPopup } from "./SensorGraphPopup";

interface AppProps {
  iTwinId: string;
  iModelId: string;
  changesetId?: string;
}

// The core 3D viewer screen. Wraps Bentley's <Viewer> component (which does all the heavy
// lifting: loading the iModel, rendering the 3D scene, toolbars, etc.) and wires in this
// project's custom widgets via `uiProviders`. To add a new side-panel tab, create a
// UiItemsProvider class (see WidgetTemplate.tsx for a copy-paste starting point) and add
// an instance of it to the `uiProviders` array below.
export function App({ iTwinId, iModelId, changesetId }: AppProps) {
  const { client: authClient } = useAuthorizationContext();

  // Runs once, after the underlying IModelApp (iTwin.js core) has finished starting up but
  // before the viewport is shown. This is where any one-time startup/registration work goes.
  const onIModelAppInit = useCallback(async () => {
    // iModel now initialized
    await TreeWidget.initialize();
    await PropertyGridManager.initialize();
    await MeasureTools.startup();
    MeasurementActionToolbar.setDefaultActionProvider();

    // Register the sensor icon decorator, then load sensor markers once a view opens.
    // `addDecorator` just registers the decorate() callback (see SensorDecorator.tsx) so it
    // draws every frame; `onViewOpen.addOnce` waits until a viewport/iModel actually exists
    // before we try to query element positions from it.
    IModelApp.viewManager.addDecorator(sensorDecorator);
    IModelApp.viewManager.onViewOpen.addOnce((viewport) => {
      void sensorDecorator.loadSensors(viewport.iModel);
    });
  }, []);

  return (
    <>
      <Viewer
        iTwinId={iTwinId}
        iModelId={iModelId}
        changeSetId={changesetId}
        authClient={authClient}
        viewCreatorOptions={viewCreatorOptions}
        enablePerformanceMonitors={true}
        onIModelAppInit={onIModelAppInit}
        mapLayerOptions={{
          BingMaps: {
            key: "key",
            value: import.meta.env.IMJS_BING_MAPS_KEY ?? "",
          },
        }}
        uiProviders={[
          // Built-in Bentley providers: navigation cube/tools, content toolbar, status bar,
          // and the measure-tools toolbar. These come from @itwin packages, not this repo.
          new ViewerNavigationToolsProvider(),
          new ViewerContentToolsProvider({
            vertical: {
              measureGroup: false,
            },
          }),
          new ViewerStatusbarItemsProvider(),
          new MeasureToolsUiItemsProvider(),
          // Model tree / categories tree and the element property grid (right-side panel
          // seen when you click an element) - defined in UiProviders.tsx.
          treeWidgetUiProvider,
          propertyGridUiProvider,
          // This project's custom tabs. Each is a small class implementing UiItemsProvider;
          // add/remove entries here to add/remove a right-panel tab.
          new MyCustomUiProvider(),   // "IoT Dashboard" tab (live sensor charts) - MyCustomUiProvider.tsx
          new Developer_Tab(),        // "Developer Tab" - click-to-copy element Hex ID tool - Developer_Tab.tsx
          new SensorInspectorTab(),   // "Sensors" tab - lists SENSOR_GROUPS with resolved coordinates - SensorInspectorTab.tsx
        ]}
        selectionStorage={selectionStorage}
      />
      {/* Sits outside the AppUI tab system entirely (see SensorGraphPopup.tsx) so a marker
          click can pop up its chart no matter which side tab is currently open. */}
      <SensorGraphPopup />
    </>
  );
}

const viewCreatorOptions = { viewportConfigurer: viewConfiguration };

/**
 * NOTE: This function will execute the "Fit View" tool after the iModel is loaded into the Viewer.
 * This will provide an "optimal" view of the model. However, it will override any default views that are
 * stored in the iModel. Delete this function and the prop that it is passed to if you prefer
 * to honor default views when they are present instead (the Viewer will still apply a similar function to iModels that do not have a default view).
 */
function viewConfiguration(viewPort: ScreenViewport) {
  // default execute the fitview tool and use the iso standard view after tile trees are loaded
  const tileTreesLoaded = async () => {
    return new Promise((resolve, reject) => {
      const start = new Date();
      // Poll every 100ms until all 3D tiles have streamed in, since there's no event for this.
      const intvl = setInterval(() => {
        if (viewPort.areAllTileTreesLoaded) {
          ViewerPerformance.addMark("TilesLoaded");
          ViewerPerformance.addMeasure(
            "TileTreesLoaded",
            "ViewerStarting",
            "TilesLoaded"
          );
          clearInterval(intvl);
          resolve(true);
        }
        const now = new Date();
        // after 20 seconds, stop waiting and fit the view
        if (now.getTime() - start.getTime() > 20000) {
          reject(new Error("Timeout waiting for tile trees to load"));
        }
      }, 100);
    });
  };

  // Once tiles are in (or we gave up waiting), snap the camera to an isometric view that
  // frames the whole model - this is why the bridge appears nicely centered on first load.
  void tileTreesLoaded().finally(() => {
    void IModelApp.tools.run(FitViewTool.toolId, viewPort, true, false);
    viewPort.view.setStandardRotation(StandardViewId.Iso);
  });
}