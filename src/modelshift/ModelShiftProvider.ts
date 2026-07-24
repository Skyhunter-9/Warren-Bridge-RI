import {
  IModelConnection,
  type ModelDisplayTransform,
  type ModelDisplayTransformProvider,
  type ScreenViewport,
} from "@itwin/core-frontend";
import { Point3d, Transform, Vector3d } from "@itwin/core-geometry";
import { resolveGeoPosition } from "../Sensors/resolveSensorPosition";
import { MODEL_SHIFT_CONFIG } from "./modelShiftConfig";

// Corrects the bridge's geolocation by shifting every model's *display* by a single rigid
// translation (see modelShiftConfig.ts for the numbers to edit) - implements iTwin.js's
// ModelDisplayTransformProvider, the same non-destructive per-model transform mechanism used
// for things like correcting misaligned reality data. Registered once in App.tsx via
// `viewport.view.modelDisplayTransformProvider = modelShiftProvider` after computing the
// shift, mirroring SensorDecorator/TerrainDecorator's "resolve once, redraw many times"
// pattern - the transform itself is computed once (it's the same for every model), not
// recomputed per model per frame.
//
// IMPORTANT: an earlier version of this file also tried a RenderSchedule.Script to shift
// individual elements within modelShiftConfig's mixedModels (models where terrain and bridge
// structure share one Model, distinguished only by Category) - that crashed the renderer
// outright with an internal "Programmer Error" assertion in RenderCommands, not just a
// display bug. Do not reintroduce a per-element RenderSchedule transform without validating
// it doesn't hit that same assertion - for now, mixedModels entries are just treated as fully
// excluded (neither the bridge structure nor the terrain in that shared model moves) until a
// safe way to separate them is found.
export class ModelShiftProvider implements ModelDisplayTransformProvider {
  private transform?: Transform;
  // Lets the shift be flipped off/on live (see setEnabled) - e.g. to briefly see the model at
  // its raw, un-shifted position while you pick out a reference element and read its true
  // position via the Developer Tab, without having to comment out code or reload with the
  // provider unregistered. Note this only affects *display*: resolveSensorPosition/getProps
  // always return an element's true raw placement regardless of this flag, since the display
  // transform never touches the underlying iModel data.
  private enabled = true;
  private viewport?: ScreenViewport;

  // Resolves modelShiftConfig's target lat/long to a spatial point (reusing the exact same
  // geo-conversion logic as sensor geo-placements - see resolveGeoPosition), then computes
  // the translation from the reference point's current position to that target. Safe to call
  // again later (e.g. after editing modelShiftConfig.ts) to recompute the shift.
  private async computeShift(iModel: IModelConnection): Promise<void> {
    const target = await resolveGeoPosition(iModel, MODEL_SHIFT_CONFIG.target);
    if (!target) {
      // eslint-disable-next-line no-console
      console.warn("ModelShiftProvider: couldn't resolve the target lat/long to a spatial point - is this iModel geolocated? No shift applied.");
      return;
    }

    const current = Point3d.create(
      MODEL_SHIFT_CONFIG.currentPosition.x,
      MODEL_SHIFT_CONFIG.currentPosition.y,
      MODEL_SHIFT_CONFIG.currentPosition.z
    );
    this.transform = Transform.createTranslation(Vector3d.createStartEnd(current, target));
  }

  /** Computes the shift and installs this provider on the given viewport's view. Call once
   * after a view opens - see App.tsx. */
  public async applyTo(viewport: ScreenViewport): Promise<void> {
    this.viewport = viewport;
    await this.computeShift(viewport.iModel);
    viewport.view.modelDisplayTransformProvider = this;
    // Forces the view to redraw with the newly-installed transform immediately, rather than
    // waiting for some other unrelated change to trigger a redraw.
    viewport.invalidateScene();
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  /** Flips the shift off/on without touching modelShiftConfig.ts or reloading the page - see
   * the Developer Tab's "Model Shift" toggle. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.viewport?.invalidateScene();
  }

  // Called by the view/tile system for every model as it's drawn. Returning undefined means
  // "draw this model at its normal position" - used when disabled, before the shift has been
  // computed, for any model listed in modelShiftConfig's excludedModelIds, and (for now - see
  // the class comment above) for mixedModels entries too, since those can't yet be separated
  // without the RenderSchedule approach that crashed the renderer.
  public getModelDisplayTransform(modelId: string): ModelDisplayTransform | undefined {
    if (!this.enabled || !this.transform) return undefined;
    if (MODEL_SHIFT_CONFIG.excludedModelIds.includes(modelId)) return undefined;
    if (MODEL_SHIFT_CONFIG.mixedModels.some((m) => m.modelId === modelId)) return undefined;
    return { transform: this.transform };
  }
}

export const modelShiftProvider = new ModelShiftProvider();
