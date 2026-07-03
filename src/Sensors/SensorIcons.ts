import { Point2d, XYAndZ } from "@itwin/core-geometry";
import { Marker } from "@itwin/core-frontend";

// The list of element Hex IDs to draw a sensor icon marker for in the 3D view.
// *** This is the file to edit when adding/removing physical sensor stations. ***
// To find an element's Hex ID: use the "Developer Tab" (Developer_Tab.tsx) - it copies the
// Hex ID of whatever you click in the model to your clipboard. Consumed by both
// SensorDecorator.tsx (draws the icons) and SensorInspectorTab.tsx (lists them in the
// "Sensor Station Registry" side panel).
export const HARDCODED_SENSORS = [
  "0x2000000027b",
];

// Marker icon size in screen pixels (not world units) - the rendered image stays this
// size regardless of camera zoom.
const MARKER_SIZE = Point2d.create(32, 32);

/** A Marker that draws a sensor icon at a fixed world location in the 3D view. */
export class ElementIconMarker extends Marker {
  public readonly elementId: string;

  // worldLocation is a real X/Y/Z point in the iModel's spatial coordinate system, computed
  // by SensorDecorator.loadSensors() from the element's placement/bounding box - this class
  // itself does no positioning logic, it just draws `image` at whatever point it's given.
  constructor(worldLocation: XYAndZ, elementId: string, image: HTMLImageElement) {
    super(worldLocation, MARKER_SIZE);
    this.elementId = elementId;
    this.setImage(image);
    this.title = `Sensor ${elementId}`; // Tooltip shown on hover.
  }
}