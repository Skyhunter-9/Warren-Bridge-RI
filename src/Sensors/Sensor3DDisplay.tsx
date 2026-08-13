// src/Sensors/Sensor3DDisplay.tsx
//
// Everything involved in showing sensors *in the 3D view itself*: what marker to draw and
// where (SENSOR_GROUPS, ElementIconMarker), how a marker's element resolves to a real-world
// position (resolveSensorPosition), the per-frame iTwin.js Decorator that actually draws them
// (SensorDecorator), and the marker-click -> popup-chart bridge (the onSensorGraphRequested
// BeEvent + SensorGraphPopup, the floating overlay a click opens). Consolidated from five
// separate files (SensorIcons.ts, resolveSensorPosition.ts, SensorDecorator.tsx,
// sensorGraphRequest.ts, SensorGraphPopup.tsx) since they're really one feature: "sensor
// markers in 3D, and what happens when you click one." Data ingestion
// (SensorService/sensorDataStore/periodic batches, see sensorIngestion.ts) and IoT-tab chart data-shaping
// (chartData.ts) live in their own files and are only imported here for the popup's chart
// rendering.

import React, { useEffect, useMemo, useState } from "react";
import {
  BeButton,
  BeButtonEvent,
  DecorateContext,
  Decorator,
  imageElementFromUrl,
  IModelApp,
  IModelConnection,
  Marker,
} from "@itwin/core-frontend";
import { BeEvent } from "@itwin/core-bentley";
import { Point2d, Point3d, XYAndZ } from "@itwin/core-geometry";
import { Placement3d, Placement3dProps } from "@itwin/core-common";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildChartData, getSensorSeries, mergeChartRows } from "./chartData";
import { getPeriodicHistory, getSnapshots, onPeriodicHistoryChanged, onSnapshotsChanged, SENSOR_INGESTION } from "./sensorIngestion";

// iTwin.js's spatial coordinate system is always in meters (a BIS/iModel standard, not
// something this app can change) - shared by the offset conversion below and by
// resolveSensorPosition's marker-height clearance.
const FEET_TO_METERS = 0.3048;

// ===================================================================================
// Sensor type/config (formerly SensorIcons.ts)
// ===================================================================================

export type SensorType =
  | "gnss"
  | "accelerometer"
  | "strainGauge"
  | "waterVelocity"
  | "waveRadar"
  | "scour"
  | "weather"
  | "camera";

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
  /** Human-readable label shown in the Sensor Station Registry tab instead of the raw Hex ID
   * (e.g. "Reference GNSS", "North Pier Strain Gauge"). If omitted, getEntryName() below falls
   * back to a generic "<group label> <position>" name, so this is optional to fill in. */
  name?: string;
  /** Marks this entry as a physical sensor that should still get a 3D marker/icon, but has no
   * data feeding it (either by design - e.g. Reference GNSS, which never produces its own
   * readings - or because no ingestion path exists yet - e.g. Camera). Clicking a `noData`
   * marker does nothing (see ElementIconMarker.onMouseButton below) instead of opening an
   * empty/broken graph popup. Defaults to false. */
  noData?: boolean;
}

/** A bare Hex ID (marker centers on the element) or a SensorPlacement (element + offset). */
export type SensorElementEntry = string | SensorPlacement;

/** The real element Hex ID for this entry - every entry is anchored to a real element, so
 * this is always defined (unlike offset/name, which are optional). */
export function getEntryElementId(entry: SensorElementEntry): string {
  return typeof entry === "string" ? entry : entry.elementId;
}

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

/** Returns the entry's `name` if one was set, else `fallback` (typically a generic
 * "<group label> <position>" computed by the caller, which knows the group/index this entry
 * came from - see SensorInspectorTab.tsx). A bare Hex ID string entry has nowhere to store a
 * name, so it always falls back too. */
export function getEntryName(entry: SensorElementEntry, fallback: string): string {
  return typeof entry === "string" ? fallback : (entry.name ?? fallback);
}

/** Whether this entry is marker-only (see SensorPlacement.noData above). A bare Hex ID string
 * entry has nowhere to store this, so it's always false. */
export function getEntryNoData(entry: SensorElementEntry): boolean {
  return typeof entry === "string" ? false : (entry.noData ?? false);
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
   * clipboard. Consumed by both SensorDecorator (below, draws the icons) and
   * SensorInspectorTab.tsx (lists them in the "Sensor Station Registry" side panel).
   *
   * Each entry is either:
   *   - a plain Hex ID string - marker centers on the element;
   *   - a SensorPlacement `{ elementId, offset: { x, y, z }, name }` (offset in feet, local to
   *     that element) - nudges the marker away from center, e.g.
   *     `{ elementId: "0x123", offset: { z: 5 } }` floats it 5ft higher than wherever that
   *     element resolves to; `name` (optional) is what the Sensor Station Registry tab shows
   *     instead of the raw Hex ID - see getEntryName() above.
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
      { elementId: "0x2000000052f", offset: { x: -5, y: 0, z: 1 }, name: "GNSS 1" },
      { elementId: "0x2000000053b", offset: { x: -6, y: 0, z: 1 }, name: "GNSS 2" },
      { elementId: "0x20000000547", offset: { x: -6, y: 0, z: 1 }, name: "GNSS 3" },
      { elementId: "0x20000000555", offset: { x: -5, y: 0, z: 1 }, name: "GNSS 4" },
      // Reference GNSS doesn't produce its own displacement data (it's the fixed baseline the
      // other 4 nodes are measured relative to) - noData: true keeps its marker/icon visible
      // (it's a real physical unit on the bridge) but skips the graph popup on click, and it's
      // excluded from IoTDashboard.tsx's GNSS node loops (which only cover nodeIndex 0-3).
      { elementId: "0x2000000056b", offset: { x: 0, y: 0, z: 1 }, name: "Reference GNSS", noData: true },
    ],
  },
  {
    type: "accelerometer",
    label: "Accelerometer/Geophone",
    color: "#ff2222",
    iconUrl: "/icons/sensor-red.svg",
    expectedCount: 10,
    elementIds: [
      { elementId: "0x2000000015c", offset: { x: -95, y: -38.5, z: -1 }, name: "Accel 1" },
      { elementId: "0x2000000015c", offset: { x: -29.5, y: -29, z: -1 }, name: "Accel 2"},
      { elementId: "0x2000000015c", offset: { x: 22, y: -21.5, z: -1 }, name: "Accel 3" },
      { elementId: "0x2000000015c", offset: { x: 54, y: -17, z: -1 }, name: "Accel 4" },
      { elementId: "0x2000000015c", offset: { x: 102, y: -10, z: -1 }, name: "Accel 5" },

      { elementId: "0x2000000015c", offset: { x: -102, y: 10, z: -1 }, name: "Accel 6" },
      { elementId: "0x2000000015c", offset: { x: -37, y: 19, z: -1 }, name: "Accel 7" },
      { elementId: "0x2000000015c", offset: { x: 12, y: 27, z: -1 }, name: "Accel 8" },
      { elementId: "0x2000000015c", offset: { x: 48, y: 32, z: -1 }, name: "Accel 9" },
      { elementId: "0x2000000015c", offset: { x: 95, y: 36.5, z: -1 }, name: "Accel 10" },
    ],
  },
  {
    type: "strainGauge",
    label: "Strain Gauge",
    color: "#ffdd00",
    iconUrl: "/icons/sensor-yellow.svg",
    expectedCount: 8,
    // TODO: add SG06-SG08's mount element Hex IDs here (Developer Tab) once installed.
    elementIds: [
      { elementId: "0x20000000504", offset: { x: 0, y: 0, z: -4 }, name: "SG01" },
      { elementId: "0x2000000049b", offset: { x: 0, y: 0, z: -4 }, name: "SG02" },
      { elementId: "0x200000004a5", offset: { x: 0, y: 0, z: -4 }, name: "SG03" },
      { elementId: "0x200000004af", offset: { x: 0, y: 0, z: -4 }, name: "SG04" },
      { elementId: "0x20000000509", offset: { x: 0, y: 0, z: -4 }, name: "SG05" },
    ],
  },
  {
    // Co-located with waterLevel[0] - see sensorIngestion.ts's SensorSnapshot.waterLevel and
    // chartData.ts's getSensorSeries(), which pops both readings up together on click.
    type: "waterVelocity",
    label: "Flow Sensor",
    color: "#003399",
    iconUrl: "/icons/sensor-darkblue.svg",
    expectedCount: 1,
    // TODO: add this sensor's mount element Hex ID here (Developer Tab).
    elementIds: [
      { elementId: "0x20000000553", offset: { x: 0, y: -1, z: 1 }, name: "Flow Sensor" }
    ],
  },
  {
    // Co-located with waterLevel[1] - see sensorIngestion.ts's SensorSnapshot.waterLevel and
    // chartData.ts's getSensorSeries(), which pops both readings up together on click. Reuses
    // the color/icon freed up by removing the standalone waterLevel marker group above.
    type: "waveRadar",
    label: "Radar Wave Profile",
    color: "#33ccff",
    iconUrl: "/icons/sensor-lightblue.svg",
    expectedCount: 1,
    // TODO: add this sensor's mount element Hex ID here (Developer Tab).
    elementIds: [
      { elementId: "0x20000000545", offset: { x: 0, y: -2, z: -4.5 }, name: "Radar Wave Profile" }
    ],
  },
  {
    type: "scour",
    label: "Scour",
    color: "#22aa44",
    iconUrl: "/icons/sensor-green.svg",
    expectedCount: 2,
    elementIds: [
      { elementId: "0x200000001ef", offset: { x: 5, y: -29, z: -6 }, name: "Scour 1" },
      { elementId: "0x20000000228", offset: { x: 5, y: -33, z: -6 }, name: "Scour 2" },
    ],
  },
  {
    // Not paired with anything else (unlike waterVelocity/waveRadar's shared waterLevel) - a
    // single station reporting windSpeed/windDirDeg/temp/pressure/humidity plus the calculated
    // windChill/dewPoint/heatIndex fields (see sensorIngestion.ts's SensorSnapshot.weather).
    type: "weather",
    label: "Weather Station",
    color: "#9c27b0",
    iconUrl: "/icons/sensor-purple.svg",
    expectedCount: 1,
    // TODO: add this sensor's mount element Hex ID here (Developer Tab).
    elementIds: [
      { elementId: "0x20000000533", offset: { x: 0, y: -2, z: 2 }, name: "Weather Station" },
    ],
  },
  {
    // No image/video ingestion or display exists yet - just a 3D marker for the physical
    // unit's location. Every entry should keep noData: true (see SensorPlacement above) until
    // an actual camera feed pipeline is built, so clicking the marker doesn't try to open a
    // broken/empty chart popup.
    type: "camera",
    label: "Camera",
    color: "#795548",
    iconUrl: "/icons/sensor-brown.svg",
    expectedCount: 1,
    // TODO: add this camera's mount element Hex ID here (Developer Tab), e.g.
    // { elementId: "0x123", name: "Camera 1", noData: true }.
    elementIds: [],
  },
];

const MARKER_SIZE = Point2d.create(32, 32);

// ===================================================================================
// Marker world-position resolution (formerly resolveSensorPosition.ts)
// ===================================================================================

const MARKER_HEIGHT_ABOVE_SURFACE_FT = 0.5; // 6 inches of clearance above the element's top
const MARKER_HEIGHT_ABOVE_SURFACE_M = MARKER_HEIGHT_ABOVE_SURFACE_FT * FEET_TO_METERS;

/**
 * Resolves the real-world marker position for a sensor's linked element: the horizontal
 * center of its bounding box, floating slightly above its highest point.
 *
 * Shared by SensorDecorator (below, draws the 3D markers) and SensorInspectorTab.tsx (lists
 * resolved coordinates in the side panel) so the two never drift out of sync again - this
 * exact duplication is what caused the marker to render at world (0,0,z) instead of on the
 * beam: placement.origin is only the element's local origin, not necessarily near its
 * visible geometry, so the origin alone isn't enough - the bbox has to be transformed by
 * the placement (via calculateRange) to land in the right spot.
 *
 * Returns undefined if the element doesn't exist or has no usable placement.
 */
export async function resolveSensorPosition(
  iModel: IModelConnection,
  elementId: string
): Promise<Point3d | undefined> {
  const propsArray = await iModel.elements.getProps(elementId);
  if (!propsArray || propsArray.length === 0) return undefined;

  const props = propsArray[0] as any;

  if (props.placement?.bbox) {
    const range = Placement3d.fromJSON(props.placement as Placement3dProps).calculateRange();
    if (!range.isNull) {
      return new Point3d(range.center.x, range.center.y, range.high.z + MARKER_HEIGHT_ABOVE_SURFACE_M);
    }
  }

  if (props.placement?.origin) {
    // `?? 0` guards against 2D elements, whose origin has no z component.
    return new Point3d(
      props.placement.origin.x,
      props.placement.origin.y,
      (props.placement.origin.z ?? 0) + MARKER_HEIGHT_ABOVE_SURFACE_M
    );
  }

  return undefined;
}

// ===================================================================================
// Marker-click event bridge (formerly sensorGraphRequest.ts)
// ===================================================================================

// Bridges a marker click (fired imperatively inside ElementIconMarker.onMouseButton below,
// outside the React tree entirely - iTwin.js decorators aren't React components) over to the
// React-rendered SensorGraphPopup (also below), which subscribes to this event to know what
// to display. BeEvent (from @itwin/core-bentley) is the same pub-sub primitive iTwin.js
// itself uses for this kind of native/React bridging (see Authorization.tsx's
// onAccessTokenChanged.addListener, or selectionSet.onChanged.addListener).

export interface SensorGraphRequest {
  sensorType: SensorType;
  /** 0-based position of the clicked sensor within its group's elementIds array. */
  nodeIndex: number;
  elementId: string;
}

export const onSensorGraphRequested = new BeEvent<(request: SensorGraphRequest) => void>();

export function requestSensorGraph(request: SensorGraphRequest): void {
  onSensorGraphRequested.raiseEvent(request);
}

// ===================================================================================
// The marker itself (formerly SensorIcons.ts's ElementIconMarker)
// ===================================================================================

/** A Marker that draws a sensor icon at a fixed world location in the 3D view, and opens
 * that sensor's live chart (via SensorGraphPopup below) when clicked. */
export class ElementIconMarker extends Marker {
  public readonly elementId: string;
  public readonly sensorType: SensorType;
  public readonly nodeIndex: number;
  public readonly noData: boolean;

  // worldLocation is a real X/Y/Z point in the iModel's spatial coordinate system, computed
  // by SensorDecorator.loadSensors() from the element's placement/bounding box, plus any
  // local offset (see resolveSensorPosition and getEntryOffset above) - this class itself
  // does no positioning logic, it just draws `image` at whatever point it's given.
  // nodeIndex is this sensor's 0-based position within its group's elementIds array
  // (SENSOR_GROUPS) - it's what tells SensorGraphPopup which specific chart series to show
  // (e.g. accelerometer nodeIndex 3 -> the "Accel Node 4" series) - see chartData.ts.
  constructor(
    worldLocation: XYAndZ,
    elementId: string,
    sensorType: SensorType,
    nodeIndex: number,
    image: HTMLImageElement,
    noData: boolean
  ) {
    super(worldLocation, MARKER_SIZE);
    this.elementId = elementId;
    this.sensorType = sensorType;
    this.nodeIndex = nodeIndex;
    this.noData = noData;
    this.setImage(image);
    this.title = `${SENSOR_GROUPS.find((g) => g.type === sensorType)?.label ?? sensorType} - ${elementId}`; // Tooltip shown on hover.
  }

  // Fired by the view system whenever a mouse button is pressed/released while the pointer
  // is over this marker. We only act on a left-click *release* (the standard iTwin.js
  // marker-click pattern) so a click-drag to pan the camera through a marker doesn't
  // accidentally trigger it. Returning true tells the viewer this marker "handled" the
  // event, so it doesn't also fall through to the default element-selection tool.
  public override onMouseButton(ev: BeButtonEvent): boolean {
    // noData markers (e.g. Reference GNSS, Camera) have no chart to show - see
    // SensorPlacement.noData above. Still return true so the click doesn't fall through to
    // the default element-selection tool; it just does nothing instead of opening a popup.
    if (ev.button === BeButton.Data && !ev.isDown && !this.noData) {
      requestSensorGraph({ sensorType: this.sensorType, nodeIndex: this.nodeIndex, elementId: this.elementId });
    }
    return true;
  }
}

// ===================================================================================
// 3D Decorator - draws the markers every frame (formerly SensorDecorator.tsx)
// ===================================================================================

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

  // Walks every group in SENSOR_GROUPS (above) and every Hex ID within each group, resolving
  // each one's real-world position and building a colored ElementIconMarker for it. Called
  // once from App.tsx after the first view opens - if you need markers to move/refresh live,
  // call this again.
  public async loadSensors(iModel: IModelConnection): Promise<void> {
    const markers: ElementIconMarker[] = [];

    for (const group of SENSOR_GROUPS) {
      const image = await this.getImage(group.iconUrl);

      // `nodeIndex` (position within this group's elementIds array) is what links a marker
      // back to a specific chart series in SensorGraphPopup - see chartData.ts.
      for (let nodeIndex = 0; nodeIndex < group.elementIds.length; nodeIndex++) {
        const entry = group.elementIds[nodeIndex];
        const elementId = getEntryElementId(entry);
        try {
          const location = await resolveSensorPosition(iModel, elementId);
          if (location) {
            // Nudges the marker away from its resolved position, if this entry specified an
            // offset (see SensorPlacement above) - defaults to {0,0,0} for plain Hex ID
            // entries, i.e. no change from before.
            const offset = getEntryOffset(entry);
            location.x += offset.x;
            location.y += offset.y;
            location.z += offset.z;
            markers.push(new ElementIconMarker(location, elementId, group.type, nodeIndex, image, getEntryNoData(entry)));
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Failed to load ${group.label} sensor ${elementId}:`, error);
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

// ===================================================================================
// Marker-click popup chart (formerly SensorGraphPopup.tsx)
// ===================================================================================

// Mounted once, permanently, in App.tsx (as a sibling of <Viewer>, not one of the AppUI side
// tabs) so it can pop up regardless of which tab is currently open. Listens for
// onSensorGraphRequested (above), which ElementIconMarker.onMouseButton() raises when a 3D
// marker is clicked, and renders that sensor's live chart in a floating overlay.
export function SensorGraphPopup() {
  const [request, setRequest] = useState<SensorGraphRequest | undefined>(undefined);
  // Bumped every time the shared sensor data store gets a new poll, purely to force this
  // component to re-render (and thus recompute chartData below) so the chart keeps
  // scrolling live while the popup is open.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return onSensorGraphRequested.addListener(setRequest);
  }, []);

  useEffect(() => {
    if (!request) return;
    return onSnapshotsChanged.addListener(() => setTick((t) => t + 1));
  }, [request]);

  // Same idea as the listener above, but for the periodic ingestion section's separate
  // batch data path (sensorIngestion.ts) - a Periodic-mode sensor's popup should redraw
  // as soon as a new batch lands, not just once per live poll (which carries no data for it).
  useEffect(() => {
    if (!request) return;
    return onPeriodicHistoryChanged.addListener((type) => {
      if (type === request.sensorType) setTick((t) => t + 1);
    });
  }, [request]);

  // An array, not a single series, because some sensors are paired (e.g. an accelerometer
  // marker's click also shows its co-located geophone reading - see chartData.ts's
  // getSensorSeries for the pairing).
  const seriesList = useMemo(
    () => (request ? getSensorSeries(request.sensorType, request.nodeIndex) : undefined),
    [request]
  );

  // Only the most recent 45 points (~45 seconds), matching the "Real time" default window
  // used elsewhere in IoTDashboard.tsx - plus, if this sensor type is in Periodic mode (see
  // sensorIngestion.ts), every fetched periodic row too, since that data never lands in the
  // live 1Hz buffer at all and would otherwise never show up here.
  // `tick` isn't read inside the callback - getSnapshots()/getPeriodicHistory() read external
  // mutable state - but it's what should trigger a recompute (a live poll or periodic fetch),
  // so it's deliberately kept as a dep despite the lint rule not being able to see that.
  const chartData = useMemo(() => {
    const liveRows = buildChartData(getSnapshots()).slice(-45);
    if (!request || SENSOR_INGESTION[request.sensorType].mode !== "Periodic") return liveRows;
    return mergeChartRows(liveRows, getPeriodicHistory(request.sensorType));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, tick]);

  if (!request || !seriesList || seriesList.length === 0) return null;

  const isPeriodicSensor = SENSOR_INGESTION[request.sensorType].mode === "Periodic";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setRequest(undefined)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setRequest(undefined)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* stopPropagation here just prevents a click inside the card from bubbling up to the
          backdrop's close handler above - Escape (handled on the backdrop) is the keyboard
          equivalent for closing, so no separate key handler is needed on this element. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="dialog"
        aria-label={seriesList[0].title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          color: "#333",
          borderRadius: "8px",
          padding: "16px",
          width: "480px",
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "11px", opacity: 0.6 }}>
            {request.elementId}
            {isPeriodicSensor && (
              <span style={{ marginLeft: "8px", fontSize: "10px", color: "#8c6d1f", background: "#fff7e0", border: "1px solid #f0d989", borderRadius: "3px", padding: "1px 5px" }}>
                📄 Periodic (hourly) - updates on new batch, not live
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setRequest(undefined)}
            style={{ border: "none", background: "transparent", fontSize: "18px", cursor: "pointer", lineHeight: 1, color: "#333" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* One sub-chart per paired series (e.g. accelerometer + its co-located geophone) -
            see chartData.ts's getSensorSeries for how that pairing is decided. */}
        {seriesList.map((series) => (
          <div key={series.title} style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 2px 0", fontSize: "14px", color: "#005A9C" }}>{series.title}</h3>
            <span style={{ fontSize: "11px", opacity: 0.6 }}>{series.unit}</span>
            <div style={{ width: "100%", height: "180px", marginTop: "4px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                  <XAxis dataKey="time" stroke="#718096" style={{ fontSize: "9px" }} />
                  <YAxis stroke="#718096" style={{ fontSize: "9px" }} domain={["auto", "auto"]} />
                  <Tooltip wrapperStyle={{ zIndex: 10001 }} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }} />
                  {series.lines.map((line) => (
                    <Line
                      key={line.dataKey}
                      name={line.name}
                      type="monotone"
                      dataKey={line.dataKey}
                      stroke={line.color}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
