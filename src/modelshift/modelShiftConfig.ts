// src/modelshift/modelShiftConfig.ts
//
// *** Edit this file to correct the bridge's geolocation. ***
//
// The bridge model was authored at the wrong real-world location. Rather than editing every
// element's stored position (a permanent, backend write operation this frontend-only app
// isn't set up to do safely), ModelShiftProvider.ts applies a single rigid-body shift to the
// model's *display* only - the underlying iModel data is never touched, so this is easy to
// re-tune or undo by just changing the numbers below and refreshing.
//
// The shift is computed as: target - currentPosition. In other words:
//   1. currentPosition is where a known reference point on the bridge sits RIGHT NOW, in the
//      iModel's own spatial coordinates (meters) - i.e. its position before any correction.
//   2. target is where that exact same physical point should actually be in the real world
//      (WGS84 latitude/longitude - see Sensors/SensorIcons.ts's SensorGeoPlacement for the
//      same coordinate convention used elsewhere in this app).
//   3. Every model in the iModel gets shifted by (target - currentPosition), except any
//      model ID listed in excludedModelIds (e.g. an already-correctly-placed terrain TIN
//      that lives in its own separate model).
//   4. If terrain and bridge structure are elements *within the same model* (as they are
//      here - confirmed via the Developer Tab), a whole-model shift can't separate them: it's
//      all-or-nothing per model. List the model under mixedModels for this case, along with
//      the Category ID(s) that should be excluded.
//      *** CURRENT STATUS: mixedModels entries are NOT actually shifted right now. *** An
//      attempt at shifting them element-by-element via a RenderSchedule.Script crashed the
//      renderer outright (an internal "Programmer Error" assertion), so ModelShiftProvider.ts
//      currently just treats mixedModels the same as excludedModelIds - the whole model,
//      terrain and bridge alike, stays at its original position until a safe way to separate
//      them is found (most likely: re-importing terrain into its own model upstream, or
//      finding a working non-destructive per-element technique).

export interface ModelShiftConfig {
  /**
   * The current spatial position (in the iModel's own meters) of the reference point used to
   * compute the correction - here, the southwest-most edge of the bridge, start station,
   * right side. Find this by selecting the corresponding element (Developer Tab or the model
   * tree) and reading its resolved position - e.g. via the same bbox-center technique as
   * Sensors/resolveSensorPosition.ts, or the "Coordinates" shown in the Sensor Station
   * Registry tab if you temporarily add it there as a sensor.
   */
  currentPosition: { x: number; y: number; z: number };

  /**
   * Where that same reference point should actually be, in WGS84 latitude/longitude.
   * elevationFt is optional (height above the WGS84 ellipsoid, in feet) - defaults to 0.
   */
  target: {
    latitude: number;
    longitude: number;
    elevationFt?: number;
  };

  /**
   * Model IDs (Hex IDs) to exclude from the shift entirely - use this when terrain lives in
   * its own separate model from the bridge structure. Find a model's Hex ID via the
   * Developer Tab (click any element in it, read the "Model ID" field - not the "Selected
   * Hex ID" field, which is the element's own id).
   */
  excludedModelIds: string[];

  /**
   * Use this instead of excludedModelIds when terrain and bridge structure are elements
   * within the *same* model (check both elements' "Model ID" in the Developer Tab - if they
   * match, you need this, not excludedModelIds). Every element in `modelId` gets shifted
   * except those whose Category is in `excludedCategoryIds` - find a Category ID the same
   * way as a Model ID, via the Developer Tab's "Category ID" field.
   */
  mixedModels: {
    modelId: string;
    excludedCategoryIds: string[];
  }[];
}

export const MODEL_SHIFT_CONFIG: ModelShiftConfig = {
  // The handrail at the southwest edge, start station, right side (Category 0x200000000c3) -
  // this is the reference point the whole correction is anchored on.
  currentPosition: { x: 117475.954, y: 72652.595, z: 6.211 },
  // Where that same handrail point should actually be: GNSS sensor #1's real-world location
  // (Sensors/SensorIcons.ts's gnss group, index 0), which is attached to this handrail.
  // elevationFt is 14, not 15, because the GNSS sensor itself renders 1ft above the handrail
  // (see that sensor's own elevationFt: 15) - this is the handrail's elevation, one foot below it.
  target: { latitude: 41.737358, longitude: -71.289568, elevationFt: 14 },
  // 0x2000000000e was removed from here - it's actually the bridge structure's own model
  // (confirmed via the Developer Tab), not terrain, so excluding it was freezing the real
  // bridge in place instead of shifting it. It belongs in mixedModels below instead, since
  // terrain lives in this same model, distinguished only by Category.
  excludedModelIds: [],
  mixedModels: [
    {
      modelId: "0x2000000000e",
      // TODO: add the terrain's Category ID here (Developer Tab -> click a terrain/contour
      // element -> "Category ID") so it stays put while the rest of this model shifts.
      excludedCategoryIds: [],
    },
  ],
};
