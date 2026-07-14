import {
  DecorateContext,
  Decorator,
  imageElementFromUrl,
  IModelApp,
  IModelConnection,
} from "@itwin/core-frontend";
import { ElementIconMarker, getEntryDisplayId, getEntryOffset, isGeoPlacement, SENSOR_GROUPS } from "./SensorIcons";
import { resolveGeoPosition, resolveSensorPosition } from "./resolveSensorPosition";

// A "Decorator" is iTwin.js's mechanism for drawing custom graphics (things that aren't part
// of the actual iModel geometry) into the 3D viewport every frame - here, the colored sensor
// icons. Registered once in App.tsx via `IModelApp.viewManager.addDecorator(sensorDecorator)`.

export class SensorDecorator implements Decorator {
  private markers: ElementIconMarker[] = [];
  // Cached per icon URL so each sensor type's icon image is only fetched/decoded once,
  // even though many sensors (e.g. 9 strain gauges) share the same icon.
  private imagesByUrl = new Map<string, HTMLImageElement>();

  private async getImage(iconUrl: string): Promise<HTMLImageElement> {
    let image = this.imagesByUrl.get(iconUrl);
    if (!image) {
      image = await imageElementFromUrl(iconUrl);
      this.imagesByUrl.set(iconUrl, image);
    }
    return image;
  }

  // Walks every group in SENSOR_GROUPS (SensorIcons.ts) and every Hex ID within each group,
  // resolving each one's real-world position and building a colored ElementIconMarker for
  // it. Called once from App.tsx after the first view opens - if you need markers to
  // move/refresh live, call this again.
  public async loadSensors(iModel: IModelConnection): Promise<void> {
    const markers: ElementIconMarker[] = [];

    for (const group of SENSOR_GROUPS) {
      const image = await this.getImage(group.iconUrl);

      // `nodeIndex` (position within this group's elementIds array) is what links a marker
      // back to a specific chart series in SensorGraphPopup - see chartData.ts.
      for (let nodeIndex = 0; nodeIndex < group.elementIds.length; nodeIndex++) {
        const entry = group.elementIds[nodeIndex];
        const displayId = getEntryDisplayId(entry);
        try {
          // Geo-placed entries resolve from an exact lat/long instead of an element's
          // geometry - see SensorGeoPlacement in SensorIcons.ts.
          const location = isGeoPlacement(entry)
            ? await resolveGeoPosition(iModel, entry)
            : await resolveSensorPosition(iModel, typeof entry === "string" ? entry : entry.elementId);
          if (location) {
            // Nudges the marker away from its resolved position, if this entry specified an
            // offset (see SensorPlacement/SensorGeoPlacement in SensorIcons.ts) - defaults to
            // {0,0,0} for plain Hex ID entries, i.e. no change from before.
            const offset = getEntryOffset(entry);
            location.x += offset.x;
            location.y += offset.y;
            location.z += offset.z;
            markers.push(new ElementIconMarker(location, displayId, group.type, nodeIndex, image));
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Failed to load ${group.label} sensor ${displayId}:`, error);
        }
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
