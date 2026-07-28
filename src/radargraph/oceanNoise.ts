// A small, coarse value-noise grid, bilinearly (smoothstep-eased) interpolated into a smooth,
// drifting field. Used for the echo display's sea-clutter texture instead of a per-pixel
// random hash, so it reads as soft, drifting "ocean" patches rather than salt-and-pepper
// static, and is far cheaper to evaluate: a handful of hashed grid points per frame instead of
// one hash call per pixel.

function hash2(a: number, b: number, seed: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233 + seed * 37.719) * 43758.5453123;
  return x - Math.floor(x);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export interface OceanNoiseGrid {
  angleSteps: number;
  radiusSteps: number;
  /** [angleIndex][radiusIndex] - angleIndex wraps (values[angleSteps] === values[0]) so the
   * field tiles seamlessly all the way around the circle. */
  values: number[][];
}

export function buildOceanNoiseGrid(angleSteps: number, radiusSteps: number, phase: number): OceanNoiseGrid {
  const values: number[][] = [];
  for (let a = 0; a <= angleSteps; a++) {
    const ai = a % angleSteps;
    const row: number[] = [];
    for (let r = 0; r <= radiusSteps; r++) {
      row.push(hash2(ai, r, phase));
    }
    values.push(row);
  }
  return { angleSteps, radiusSteps, values };
}

/** Smoothly interpolated sample - `angleFrac` wraps around [0,1), `radiusFrac` is clamped to
 * [0,1]. */
export function sampleOceanNoise(grid: OceanNoiseGrid, angleFrac: number, radiusFrac: number): number {
  const af = ((angleFrac % 1) + 1) % 1;
  const a = af * grid.angleSteps;
  const r = Math.min(grid.radiusSteps, Math.max(0, radiusFrac * grid.radiusSteps));
  const a0 = Math.floor(a);
  const a1 = a0 + 1;
  const r0 = Math.floor(r);
  const r1 = Math.min(grid.radiusSteps, r0 + 1);
  const ta = smoothstep(a - a0);
  const tr = smoothstep(r - r0);

  const v00 = grid.values[a0][r0];
  const v10 = grid.values[a1][r0];
  const v01 = grid.values[a0][r1];
  const v11 = grid.values[a1][r1];

  const v0 = v00 + (v10 - v00) * ta;
  const v1 = v01 + (v11 - v01) * ta;
  return v0 + (v1 - v0) * tr;
}
