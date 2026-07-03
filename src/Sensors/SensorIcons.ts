import { Point2d, XYAndZ } from "@itwin/core-geometry";
import { Marker } from "@itwin/core-frontend";

export const HARDCODED_SENSORS = [
  "0x2000000027b",
];

const MARKER_SIZE = Point2d.create(32, 32);

/** A Marker that draws a sensor icon at a fixed world location in the 3D view. */
export class ElementIconMarker extends Marker {
  public readonly elementId: string;

  constructor(worldLocation: XYAndZ, elementId: string, image: HTMLImageElement) {
    super(worldLocation, MARKER_SIZE);
    this.elementId = elementId;
    this.setImage(image);
    this.title = `Sensor ${elementId}`;
  }
}