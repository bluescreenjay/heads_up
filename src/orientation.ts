/**
 * DeviceOrientation axes are fixed to the device, not the screen.
 *
 * Landscape + forehead (screen toward friends): gamma ≈ ±90 (phone vertical
 * in the device frame), beta ≈ 0. Nodding tilts the top toward the chin
 * (negative beta) or ceiling (positive beta).
 */

export function isLandscapeOrientation(): boolean {
  const type = screen.orientation?.type;
  if (type) return type.startsWith("landscape");
  return window.matchMedia("(orientation: landscape)").matches;
}

/** Resting landscape-forehead pose before per-device calibration. */
export function isLandscapeForeheadPose(beta: number, gamma: number): boolean {
  const absBeta = Math.abs(beta);
  const absGamma = Math.abs(gamma);

  return (
    absGamma >= 55 &&
    absGamma <= 125 &&
    absBeta <= 40
  );
}

/** Primary nod axis while playing in landscape on the forehead. */
export function foreheadTiltAxis(beta: number): number {
  return beta;
}

export function nearCalibratedPose(
  beta: number,
  gamma: number,
  calibratedBeta: number,
  calibratedGamma: number,
  tolerance: number,
): boolean {
  return (
    Math.abs(beta - calibratedBeta) <= tolerance &&
    Math.abs(gamma - calibratedGamma) <= tolerance
  );
}
