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

/**
 * A sensor placed by exact real-world coordinates instead of by attaching it to an element -
 * use this when you know a sensor's actual GPS/survey position and want to enter it
 * directly, rather than relying on wherever an element's geometry happens to resolve to.
 * Coordinates are WGS84 (the standard GPS datum) - see resolveGeoPosition()
 * (resolveSensorPosition.ts) for the actual conversion to the iModel's spatial coordinates,
 * which requires the iModel to be geolocated.
 * `offset` (same as SensorPlacement) then nudges the converted point, e.g. to correct for
 * GPS inaccuracy without re-entering the coordinates.
 */
export interface SensorGeoPlacement {
  /** Decimal degrees. Positive = North (e.g. 41.7376). */
  latitude: number;
  /** Decimal degrees. Positive = East - most US locations are negative (e.g. -71.2900). */
  longitude: number;
  /** Height above the WGS84 ellipsoid, in feet. Defaults to 0 - use `offset.z` to fine-tune
   * the vertical position instead of guessing an exact elevation here. */
  elevationFt?: number;
  /** Optional - if this sensor also corresponds to a real element, clicking it in the Sensor
   * Station Registry will still select/zoom to that element. Has no effect on where the
   * marker actually renders (latitude/longitude/elevationFt/offset fully control that). */
  elementId?: string;
  /** Same fine-tuning offset as SensorPlacement (feet, world X/Y/Z), applied after
   * latitude/longitude/elevationFt is converted to a world-space point. */
  offset?: { x?: number; y?: number; z?: number };
}

/** A bare Hex ID (marker centers on the element), a SensorPlacement (element + offset), or a
 * SensorGeoPlacement (exact lat/long, optionally fine-tuned with an offset too). */
export type SensorElementEntry = string | SensorPlacement | SensorGeoPlacement;

export function isGeoPlacement(entry: SensorElementEntry): entry is SensorGeoPlacement {
  return typeof entry === "object" && "latitude" in entry && "longitude" in entry;
}

/** The real element Hex ID for this entry, if it has one - undefined for a SensorGeoPlacement
 * that didn't also specify one. Use getEntryDisplayId() when you need a string unconditionally
 * (e.g. for marker tooltips or list keys). */
export function getEntryElementId(entry: SensorElementEntry): string | undefined {
  return typeof entry === "string" ? entry : entry.elementId;
}

/** A string identity for this entry suitable for marker tooltips, popup labels, and list
 * keys - the real Hex ID if there is one, otherwise a synthetic "lat,long" label. */
export function getEntryDisplayId(entry: SensorElementEntry): string {
  const elementId = getEntryElementId(entry);
  if (elementId) return elementId;
  const geo = entry as SensorGeoPlacement;
  return `geo:${geo.latitude.toFixed(5)},${geo.longitude.toFixed(5)}`;
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
   * Each entry is one of:
   *   - a plain Hex ID string - marker centers on the element;
   *   - a SensorPlacement `{ elementId, offset: { x, y, z } }` (feet) - nudges the marker
   *     away from center, e.g. `{ elementId: "0x123", offset: { z: 5 } }` floats it 5ft higher;
   *   - a SensorGeoPlacement `{ latitude, longitude, elevationFt?, offset? }` (WGS84) -
   *     places the marker at an exact GPS coordinate instead of resolving from any element,
   *     e.g. `{ latitude: 41.7376, longitude: -71.2900, offset: { z: 2 } }`.
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
    elementIds: [
      // elevationFt: 15 on all four - they're mounted 1ft above the handrail top, which
      // (once modelshift/modelShiftConfig.ts's correction is working) sits at 14ft in this
      // same elevation frame - see that file's target.elevationFt.
      { latitude: 41.737358, longitude: -71.289568, elevationFt: 15 },
      { latitude: 41.737380, longitude: -71.289328, elevationFt: 15 },
      { latitude: 41.737411, longitude: -71.289082, elevationFt: 15 },
      { latitude: 41.737438, longitude: -71.288842, elevationFt: 15 }
    ],
  },
  {
    type: "accelerometer",
    label: "Accelerometer/Geophone",
    color: "#ff2222",
    iconUrl: "/icons/sensor-red.svg",
    expectedCount: 10,
    elementIds: [
      { elementId: "0x2000000015c", offset: { x: -80, y: -42, z: -1 } }
    ],
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
  // by SensorDecorator.loadSensors() from either the element's placement/bounding box or an
  // explicit lat/long (see resolveSensorPosition.ts) - this class itself does no positioning
  // logic, it just draws `image` at whatever point it's given. `elementId` is usually a real
  // Hex ID, but may be a synthetic "geo:lat,long" label (see getEntryDisplayId in this file)
  // for a sensor placed by coordinates with no linked element - it's just an identity string
  // here, not necessarily something you can look up in the iModel.
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
