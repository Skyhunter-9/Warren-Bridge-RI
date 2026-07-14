import { Point3d } from "@itwin/core-geometry";
import { Cartographic, Placement3d, Placement3dProps } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { SensorGeoPlacement } from "./SensorIcons";

// iTwin.js's spatial coordinate system is always in meters (a BIS/iModel standard, not
// something this app can change), so this US-customary constant gets converted right before
// use rather than storing a metric literal below.
const MARKER_HEIGHT_ABOVE_SURFACE_FT = 0.5; // 6 inches of clearance above the element's top
const FEET_TO_METERS = 0.3048;
const MARKER_HEIGHT_ABOVE_SURFACE_M = MARKER_HEIGHT_ABOVE_SURFACE_FT * FEET_TO_METERS;

/**
 * Resolves the real-world marker position for a sensor's linked element: the horizontal
 * center of its bounding box, floating slightly above its highest point.
 *
 * Shared by SensorDecorator.tsx (draws the 3D markers) and SensorInspectorTab.tsx (lists
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

/**
 * Resolves the real-world marker position for a sensor placed by exact latitude/longitude
 * (a SensorGeoPlacement - see SensorIcons.ts) instead of by attaching it to an element.
 * Converts degrees + feet to the iModel's spatial coordinate system via its geographic
 * coordinate system (iModel.cartographicToSpatial) - this requires the iModel to actually be
 * geolocated; if it isn't, or the conversion otherwise fails, this returns undefined (logging
 * a warning) rather than throwing, same as resolveSensorPosition above.
 */
export async function resolveGeoPosition(
  iModel: IModelConnection,
  geo: SensorGeoPlacement
): Promise<Point3d | undefined> {
  try {
    const cartographic = Cartographic.fromDegrees({
      longitude: geo.longitude,
      latitude: geo.latitude,
      height: (geo.elevationFt ?? 0) * FEET_TO_METERS,
    });
    return await iModel.cartographicToSpatial(cartographic);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to convert lat/long (${geo.latitude}, ${geo.longitude}) to a spatial point - is this iModel geolocated?`, error);
    return undefined;
  }
}
