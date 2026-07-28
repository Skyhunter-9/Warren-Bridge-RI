import { RadarSweep } from "./radarTypes";

// This unit is permanently bolted to the bridge structure - it never moves - so unlike a
// ship-mounted radar there's no heading to track. This is simply the fixed compass bearing
// the antenna happened to be installed facing; change it if the physical mounting changes.
export const MOUNTING_BEARING_DEG = 240;

// Fabricates the raw radar antenna sweep's metadata for SIMULATED mode. The sea-clutter
// speckle texture itself is generated on the fly by RadarEchoCanvas.tsx (deterministic noise
// seeded off the sweep's timestamp) rather than computed here, since there's no real
// backscatter signal to process yet - storing a full azimuth x range intensity grid would
// just be discarded pixels-in, pixels-out. When real hardware is wired up, this is the seam
// to replace with an actual antenna feed read.
//
// `timestamp` is passed in (rather than calling Date.now() here) so the echo sweep and the
// wave spectrum generated alongside it (waveSpectrumProcessor.ts) always describe the exact
// same instant - see radarService.ts's generateSimulatedRadarData().
export function generateSimulatedSweep(timestamp: number): RadarSweep {
  return {
    timestamp,
    mountingBearingDeg: MOUNTING_BEARING_DEG,
    antenna: {
      id: "ANT3",
      gainLabel: "S-MAG",
      pulseLengthLabel: "5 [uS]",
      rangeFeet: 3000,
    },
  };
}
