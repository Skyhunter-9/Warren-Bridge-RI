import { Point3d } from "@itwin/core-geometry";
import { Placement3d, Placement3dProps } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";

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
      return new Point3d(range.center.x, range.center.y, range.high.z + 0.2);
    }
  }

  if (props.placement?.origin) {
    // `?? 0` guards against 2D elements, whose origin has no z component.
    return new Point3d(
      props.placement.origin.x,
      props.placement.origin.y,
      (props.placement.origin.z ?? 0) + 0.2
    );
  }

  return undefined;
}
