import { BeEvent } from "@itwin/core-bentley";
import SensorService, { SensorSnapshot } from "./SensorService";

// A single, app-wide buffer of polled sensor snapshots - analogous to selectionStorage.ts's
// shared selection store. This exists (rather than each chart polling independently) so that
// a SensorGraphPopup opened from a 3D marker click always has live data, even if the user
// has never opened the IoT Dashboard tab in this session, and so REAL mode only makes one
// round of vendor API calls per second no matter how many charts are subscribed.

const MAX_HISTORY = 5000;
let snapshots: SensorSnapshot[] = [];

/** Fired whenever `snapshots` changes (new poll, or a historical replace) - has no payload,
 * listeners should call getSnapshots() to read the current data. */
export const onSnapshotsChanged = new BeEvent<() => void>();

export function getSnapshots(): readonly SensorSnapshot[] {
  return snapshots;
}

/** Used by REAL-mode historical fetches (see IoTDashboard.tsx) to swap in a vendor's logged
 * history wholesale, instead of appending. */
export function replaceSnapshots(next: SensorSnapshot[]): void {
  snapshots = next;
  onSnapshotsChanged.raiseEvent();
}

// Poll once per second, forever, starting as soon as this module is first imported
// (mirrors the eager-singleton pattern in selectionStorage.ts).
setInterval(() => {
  SensorService.getLatestSnapshot()
    .then((latest) => {
      snapshots = [...snapshots, latest].slice(-MAX_HISTORY);
      onSnapshotsChanged.raiseEvent();
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("sensorDataStore failed to poll latest snapshot:", error);
    });
}, 1000);
