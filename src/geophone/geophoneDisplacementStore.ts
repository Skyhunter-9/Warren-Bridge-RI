import { createProcessingStore } from "../processing/createProcessingStore";

// Geophone displacement data, fetched from the Python signal-processing service's
// /geophone-displacement route (see python/api/main.py) - see createProcessingStore.ts for
// what this actually does; every new "result script" gets a store this small.
export const { getPoints: getGeophoneDisplacementPoints, getError: getGeophoneApiError, onDataChanged: onGeophoneDataChanged } =
  createProcessingStore("/geophone-displacement");
