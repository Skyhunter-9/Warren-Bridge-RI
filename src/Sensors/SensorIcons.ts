import { XYAndZ } from "@itwin/core-geometry"; 

export const HARDCODED_SENSORS = [
  "0x2000000027b",
];

// Pure data model token with absolutely no rendering dependencies
export class ElementIconMarker {
  constructor(public worldLocation: XYAndZ, public id: string) {}
}
