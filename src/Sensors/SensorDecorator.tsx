import {
  DecorateContext,
  Decorator,
  IModelApp,
  IModelConnection,
  imageElementFromUrl,
} from "@itwin/core-frontend";
import { Point3d, Range3d } from "@itwin/core-geometry";
import { ElementIconMarker, HARDCODED_SENSORS } from "./SensorIcons";

// Must live under /public so it's served at this exact path in dev and prod builds.
const SENSOR_ICON_URL = "/icons/sensor.svg";

export class SensorDecorator implements Decorator {
  private markers: ElementIconMarker[] = [];
  private image?: HTMLImageElement;

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

        if (props.bbox) {
          const range = Range3d.fromJSON(props.bbox);
          location.set(range.center.x, range.center.y, range.high.z + 1.5);
          positionFound = true;
        } else if (props.placement?.origin) {
          location.set(props.placement.origin.x, props.placement.origin.y, props.placement.origin.z + 1.5);
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
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  public decorate(context: DecorateContext): void {
    for (const marker of this.markers) {
      marker.addDecoration(context);
    }
  }
}

export const sensorDecorator = new SensorDecorator();