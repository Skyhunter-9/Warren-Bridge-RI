import {
  DecorateContext,
  Decorator,
  imageElementFromUrl,
  IModelApp,
  IModelConnection,
} from "@itwin/core-frontend";
import { Point3d } from "@itwin/core-geometry";
import { Placement3d, Placement3dProps } from "@itwin/core-common";
import { ElementIconMarker, HARDCODED_SENSORS } from "./SensorIcons";

// A "Decorator" is iTwin.js's mechanism for drawing custom graphics (things that aren't part
// of the actual iModel geometry) into the 3D viewport every frame - here, the red sensor
// icons. Registered once in App.tsx via `IModelApp.viewManager.addDecorator(sensorDecorator)`.

// Must live under /public so it's served at this exact path in dev and prod builds.
const SENSOR_ICON_URL = "/icons/sensor.svg";

export class SensorDecorator implements Decorator {
  private markers: ElementIconMarker[] = [];
  private image?: HTMLImageElement;

  // Looks up each Hex ID in HARDCODED_SENSORS (SensorIcons.ts), figures out its real-world
  // position, and builds an ElementIconMarker for it. Called once from App.tsx after the
  // first view opens - if you need markers to move/refresh live, call this again.
  public async loadSensors(iModel: IModelConnection): Promise<void> {
    if (!this.image) {
      this.image = await imageElementFromUrl(SENSOR_ICON_URL);
    }

    const markers: ElementIconMarker[] = [];

    for (const elementId of HARDCODED_SENSORS) {
      try {
        const propsArray = await iModel.elements.getProps(elementId);
        if (!propsArray || propsArray.length === 0) continue;

        const props = propsArray[0] as any;
        const location = new Point3d(0, 0, 0);
        let positionFound = false;

        // placement.origin is only the local origin of the element's geometry stream, not
        // necessarily near the visible geometry itself. Transforming the placement's own
        // bbox by its origin/rotation (via calculateRange) gives the actual world-space box.
        // This was the bug that made the marker render at world (0,0,z) instead of on the
        // beam: this element's placement.origin sits at the model's local origin, with the
        // real geometry offset from it - only the transformed bbox lands on the real beam.
        if (props.placement?.bbox) {
          const range = Placement3d.fromJSON(props.placement as Placement3dProps).calculateRange();
          if (!range.isNull) {
            // Center the marker over the element footprint, floating 1.5 world units above
            // its highest point so the icon doesn't get buried inside the geometry.
            location.set(range.center.x, range.center.y, range.high.z + 1.5);
            positionFound = true;
          }
        } else if (props.placement?.origin) {
          // Fallback for elements with no bbox at all (rare) - just use the raw origin.
          // `?? 0` guards against 2D elements, whose origin has no z component.
          location.set(props.placement.origin.x, props.placement.origin.y, (props.placement.origin.z ?? 0) + 1.5);
          positionFound = true;
        }

        if (positionFound) {
          markers.push(new ElementIconMarker(location, elementId, this.image));
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to load sensor ${elementId}:`, error);
      }
    }

    this.markers = markers;
    // Tells every open viewport to re-run decorate() on the next frame so the new markers
    // actually appear (decorators don't redraw automatically when their data changes).
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  // Called by the view system every frame for every viewport this decorator is registered
  // on. Just replays the already-computed marker list - all the real work happens in
  // loadSensors() above, not here.
  public decorate(context: DecorateContext): void {
    for (const marker of this.markers) {
      marker.addDecoration(context);
    }
  }
}

export const sensorDecorator = new SensorDecorator();