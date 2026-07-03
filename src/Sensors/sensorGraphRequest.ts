import { BeEvent } from "@itwin/core-bentley";
import { SensorType } from "./SensorIcons";

// Bridges a marker click (fired imperatively inside SensorIcons.ts/SensorDecorator.tsx,
// outside the React tree entirely - iTwin.js decorators aren't React components) over to
// the React-rendered SensorGraphPopup.tsx, which subscribes to this event to know what to
// display. BeEvent (from @itwin/core-bentley) is the same pub-sub primitive iTwin.js itself
// uses for this kind of native/React bridging (see Authorization.tsx's
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
