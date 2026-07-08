import { Point2d, XYAndZ } from "@itwin/core-geometry";
import { BeButton, BeButtonEvent, Marker } from "@itwin/core-frontend";
import { requestSensorGraph } from "./sensorGraphRequest";

export type SensorType =
  | "gnss"
  | "accelerometer"
  | "strainGauge"
  | "waterLevel"
  | "waterVelocity"
  | "scour";

export interface SensorGroup {
  type: SensorType;
  label: string;
  /** Display color for this sensor type's icon/legend swatch. */
  color: string;
  /** Icon drawn in the 3D view for every sensor in this group - must live under /public. */
  iconUrl: string;
  /** How many physical sensors of this type actually exist (for "3/9 configured" style UI). */
  expectedCount: number;
  /**
   * Element Hex IDs linked to this sensor type, one per physical sensor. *** Edit this
   * array to add/remove sensors. *** To find an element's Hex ID: use the "Developer Tab"
   * (Developer_Tab.tsx) - it copies the Hex ID of whatever you click in the model to your
   * clipboard. Consumed by both SensorDecorator.tsx (draws the icons) and
   * SensorInspectorTab.tsx (lists them in the "Sensor Station Registry" side panel).
   */
  elementIds: string[];
}

export const SENSOR_GROUPS: SensorGroup[] = [
  {
    type: "gnss",
    label: "GNSS",
    color: "#ff8800",
    iconUrl: "/icons/sensor-orange.svg",
    expectedCount: 5,
    elementIds: ["0x2000000055f"],
  },
  {
    type: "accelerometer",
    label: "Accelerometer",
    color: "#ff2222",
    iconUrl: "/icons/sensor-red.svg",
    expectedCount: 10,
    elementIds: [],
  },
  {
    type: "strainGauge",
    label: "Strain Gauge",
    color: "#ffdd00",
    iconUrl: "/icons/sensor-yellow.svg",
    expectedCount: 9,
    elementIds: [],
  },
  {
    type: "waterLevel",
    label: "Water Level",
    color: "#33ccff",
    iconUrl: "/icons/sensor-lightblue.svg",
    expectedCount: 1,
    elementIds: [],
  },
  {
    type: "waterVelocity",
    label: "Water Velocity",
    color: "#003399",
    iconUrl: "/icons/sensor-darkblue.svg",
    expectedCount: 1,
    elementIds: [],
  },
  {
    type: "scour",
    label: "Scour",
    color: "#22aa44",
    iconUrl: "/icons/sensor-green.svg",
    expectedCount: 2,
    elementIds: [],
  },
];

const MARKER_SIZE = Point2d.create(32, 32);

/** A Marker that draws a sensor icon at a fixed world location in the 3D view, and opens
 * that sensor's live chart (via SensorGraphPopup.tsx) when clicked. */
export class ElementIconMarker extends Marker {
  public readonly elementId: string;
  public readonly sensorType: SensorType;
  public readonly nodeIndex: number;

  // worldLocation is a real X/Y/Z point in the iModel's spatial coordinate system, computed
  // by SensorDecorator.loadSensors() from the element's placement/bounding box - this class
  // itself does no positioning logic, it just draws `image` at whatever point it's given.
  // nodeIndex is this sensor's 0-based position within its group's elementIds array
  // (SENSOR_GROUPS) - it's what tells SensorGraphPopup which specific chart series to show
  // (e.g. accelerometer nodeIndex 3 -> the "Accel Node 4" series) - see chartData.ts.
  constructor(
    worldLocation: XYAndZ,
    elementId: string,
    sensorType: SensorType,
    nodeIndex: number,
    image: HTMLImageElement
  ) {
    super(worldLocation, MARKER_SIZE);
    this.elementId = elementId;
    this.sensorType = sensorType;
    this.nodeIndex = nodeIndex;
    this.setImage(image);
    this.title = `${SENSOR_GROUPS.find((g) => g.type === sensorType)?.label ?? sensorType} - ${elementId}`; // Tooltip shown on hover.
  }

  // Fired by the view system whenever a mouse button is pressed/released while the pointer
  // is over this marker. We only act on a left-click *release* (the standard iTwin.js
  // marker-click pattern) so a click-drag to pan the camera through a marker doesn't
  // accidentally trigger it. Returning true tells the viewer this marker "handled" the
  // event, so it doesn't also fall through to the default element-selection tool.
  public override onMouseButton(ev: BeButtonEvent): boolean {
    if (ev.button === BeButton.Data && !ev.isDown) {
      requestSensorGraph({ sensorType: this.sensorType, nodeIndex: this.nodeIndex, elementId: this.elementId });
    }
    return true;
  }
}
