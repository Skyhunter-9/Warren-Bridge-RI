import { Point2d, XYAndZ } from "@itwin/core-geometry";
import { BeButton, BeButtonEvent, Marker } from "@itwin/core-frontend";
import { requestSensorGraph } from "./sensorGraphRequest";

export type SensorType =
  | "gnss"
  | "accelerometer"
  | "strainGauge"
  | "waterVelocity"
  | "waveRadar"
  | "scour";

/**
 * A sensor entry with a marker offset - use this instead of a bare Hex ID string when you
 * want the icon to sit somewhere other than dead-center on the element (e.g. several
 * sensors attached to the same element would otherwise stack on top of each other, or the
 * element's center happens to be buried inside other geometry).
 */
export interface SensorPlacement {
  elementId: string;
  /** Added to the element's resolved position, in feet along world X/Y/Z (US customary, to
   * match the rest of this app's units). Any omitted axis defaults to 0. Positive Z is up. */
  offset?: { x?: number; y?: number; z?: number };
}

/** A bare Hex ID (marker centers on the element) or a SensorPlacement (element + offset). */
export type SensorElementEntry = string | SensorPlacement;

/** The real element Hex ID for this entry - every entry is anchored to a real element, so
 * this is always defined (unlike offset, which is optional). */
export function getEntryElementId(entry: SensorElementEntry): string {
  return typeof entry === "string" ? entry : entry.elementId;
}

// iTwin.js's spatial coordinate system is always in meters (a BIS/iModel standard, not
// something this app can change) - so entries specified in feet get converted here, right
// at the boundary, before the offset is added to any world-space Point3d.
const FEET_TO_METERS = 0.3048;

/** Returns the entry's offset converted to meters, ready to add directly to a world-space
 * Point3d - see FEET_TO_METERS above for why the conversion happens here. */
export function getEntryOffset(entry: SensorElementEntry): { x: number; y: number; z: number } {
  const offset = typeof entry === "string" ? undefined : entry.offset;
  return {
    x: (offset?.x ?? 0) * FEET_TO_METERS,
    y: (offset?.y ?? 0) * FEET_TO_METERS,
    z: (offset?.z ?? 0) * FEET_TO_METERS,
  };
}

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
   *
   * Each entry is either:
   *   - a plain Hex ID string - marker centers on the element;
   *   - a SensorPlacement `{ elementId, offset: { x, y, z } }` (feet, local to that element) -
   *     nudges the marker away from center, e.g. `{ elementId: "0x123", offset: { z: 5 } }`
   *     floats it 5ft higher than wherever that element resolves to.
   */
  elementIds: SensorElementEntry[];
}

export const SENSOR_GROUPS: SensorGroup[] = [
  {
    type: "gnss",
    label: "GNSS",
    color: "#ff8800",
    iconUrl: "/icons/sensor-orange.svg",
    expectedCount: 5,
    // TODO: add each GNSS sensor's mount element Hex ID here (Developer Tab), e.g.
    // { elementId: "0x123", offset: { z: 1 } } for one mounted 1ft above its element.
    elementIds: [
      { elementId: "0x2000000052f", offset: { x: -5, y: 0, z: 1 } }, //GNSS 1
      { elementId: "0x2000000053b", offset: { x: -6, y: 0, z: 1 } }, //GNSS 2
      { elementId: "0x20000000547", offset: { x: -6, y: 0, z: 1 } }, //GNSS 3
      { elementId: "0x20000000555", offset: { x: -5, y: 0, z: 1 } }, //GNSS 4
      { elementId: "0x2000000056b", offset: { x: 0, y: 0, z: 1 } } //Reference GNSS
    ],
  },
  {
    type: "accelerometer",
    label: "Accelerometer/Geophone",
    color: "#ff2222",
    iconUrl: "/icons/sensor-red.svg",
    expectedCount: 10,
    elementIds: [
      { elementId: "0x2000000015c", offset: { x: -95, y: -38.5, z: -1 } },
      { elementId: "0x2000000015c", offset: { x: -29.5, y: -29, z: -1 } },
      { elementId: "0x2000000015c", offset: { x: 22, y: -21.5, z: -1 } },
      { elementId: "0x2000000015c", offset: { x: 54, y: -17, z: -1 } },
      { elementId: "0x2000000015c", offset: { x: 102, y: -10, z: -1 } },

      { elementId: "0x2000000015c", offset: { x: -102, y: 10, z: -1 } },
      { elementId: "0x2000000015c", offset: { x: -37, y: 19, z: -1 } },
      { elementId: "0x2000000015c", offset: { x: 12, y: 27, z: -1 } },
      { elementId: "0x2000000015c", offset: { x: 48, y: 32, z: -1 } },
      { elementId: "0x2000000015c", offset: { x: 95, y: 36.5, z: -1 } },
    ],
  },
  {
    type: "strainGauge",
    label: "Strain Gauge",
    color: "#ffdd00",
    iconUrl: "/icons/sensor-yellow.svg",
    expectedCount: 9,
    elementIds: [
      { elementId: "0x20000000504", offset: { x: 0, y: 0, z: -4 } },
      { elementId: "0x2000000049b", offset: { x: 0, y: 0, z: -4 } },
      { elementId: "0x200000004a5", offset: { x: 0, y: 0, z: -4 } },
      { elementId: "0x200000004af", offset: { x: 0, y: 0, z: -4 } },
      { elementId: "0x20000000509", offset: { x: 0, y: 0, z: -4 } },
    ],
  },
  {
    // Co-located with waterLevel[0] - see SensorService.ts's SensorSnapshot.waterLevel and
    // chartData.ts's getSensorSeries(), which pops both readings up together on click.
    type: "waterVelocity",
    label: "Water Velocity",
    color: "#003399",
    iconUrl: "/icons/sensor-darkblue.svg",
    expectedCount: 1,
    // TODO: add this sensor's mount element Hex ID here (Developer Tab).
    elementIds: [
      { elementId: "0x20000000553", offset: { x: 0, y: -1, z: 1 } }
    ],
  },
  {
    // Co-located with waterLevel[1] - see SensorService.ts's SensorSnapshot.waterLevel and
    // chartData.ts's getSensorSeries(), which pops both readings up together on click. Reuses
    // the color/icon freed up by removing the standalone waterLevel marker group above.
    type: "waveRadar",
    label: "Wave Radar",
    color: "#33ccff",
    iconUrl: "/icons/sensor-lightblue.svg",
    expectedCount: 1,
    // TODO: add this sensor's mount element Hex ID here (Developer Tab).
    elementIds: [
      { elementId: "0x20000000545", offset: { x: 0, y: -2, z: -4.5 } }
    ],
  },
  {
    type: "scour",
    label: "Scour",
    color: "#22aa44",
    iconUrl: "/icons/sensor-green.svg",
    expectedCount: 2,
    elementIds: [
      { elementId: "0x200000001ef", offset: { x: 5, y: -29, z: -6 } },
      { elementId: "0x20000000228", offset: { x: 5, y: -33, z: -6 } },
    ],
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
  // by SensorDecorator.loadSensors() from the element's placement/bounding box, plus any
  // local offset (see resolveSensorPosition.ts and getEntryOffset in this file) - this class
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
