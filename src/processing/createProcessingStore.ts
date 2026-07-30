import { BeEvent } from "@itwin/core-bentley";

// Generic polling store for a Python "result script" API endpoint (see
// python/api/main.py's "HOW TO ADD A NEW RESULT SCRIPT" recipe) - every new script's TS-side
// store is one call to createProcessingStore() below instead of hand-writing the
// fetch/poll/error-tracking boilerplate again (see src/geophone/geophoneDisplacementStore.ts
// for the pattern to copy). All these endpoints share ONE Python backend/base URL
// (VITE_PYTHON_API_URL) - only the path differs per script.

export interface ProcessingPoint {
  time: string;
  timestamp: number;
  [field: string]: string | number;
}

export interface ProcessingStore {
  // Declared as function-valued properties (not method shorthand) so these stay safely
  // "unbound" plain functions - destructuring them (as GeophoneDisplacementChart.tsx does)
  // would otherwise trip @typescript-eslint/unbound-method, since a method signature implies
  // an implicit `this` these arrow functions never use.
  getPoints: () => readonly ProcessingPoint[];
  /** Non-null when the most recent poll failed (e.g. the Python service isn't running) - lets
   * a chart show a helpful message instead of silently going stale. */
  getError: () => string | null;
  /** Fired whenever a poll completes (success or failure) - no payload, listeners should call
   * getPoints()/getError() to read the current state. */
  onDataChanged: BeEvent<() => void>;
}

/**
 * Starts an eager-singleton polling loop (same pattern as sensorIngestion.ts/
 * radarDataStore.ts) against `${VITE_PYTHON_API_URL}${endpointPath}`, and returns getters/an
 * event to read its state. `endpointPath` should match a route registered in
 * python/api/main.py, e.g. "/geophone-displacement".
 */
export function createProcessingStore(endpointPath: string, pollIntervalMs = 2000): ProcessingStore {
  let latestPoints: ProcessingPoint[] = [];
  let lastError: string | null = null;
  const onDataChanged = new BeEvent<() => void>();

  async function poll(): Promise<void> {
    const API_URL = import.meta.env.VITE_PYTHON_API_URL || "http://localhost:8000";
    try {
      const response = await fetch(`${API_URL}${endpointPath}`);
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data = await response.json();
      latestPoints = Array.isArray(data.points) ? data.points : [];
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`Processing store failed to reach ${endpointPath}:`, error);
    }
    onDataChanged.raiseEvent();
  }

  void poll();
  setInterval(() => void poll(), pollIntervalMs);

  return {
    getPoints: () => latestPoints,
    getError: () => lastError,
    onDataChanged,
  };
}
