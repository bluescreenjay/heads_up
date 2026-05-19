export type HeadPositionState = {
  isLandscape: boolean;
  isOnForehead: boolean;
  /** Landscape + forehead pose held steady. */
  isReady: boolean;
  hasOrientationData: boolean;
  hint: string;
};

type Listener = (state: HeadPositionState) => void;

const STABLE_READY_MS = 700;
const CALIBRATION_SAMPLES = 18;
const CALIBRATION_TOLERANCE = 28;
const POSITION_TIMEOUT_MS = 15_000;

function isLandscapeOrientation(): boolean {
  const type = screen.orientation?.type;
  if (type) return type.startsWith("landscape");
  return window.matchMedia("(orientation: landscape)").matches;
}

/** Heuristic forehead pose: landscape, screen roughly vertical facing away. */
function matchesForeheadHeuristic(beta: number, gamma: number): boolean {
  const absBeta = Math.abs(beta);
  const absGamma = Math.abs(gamma);

  return (
    absBeta >= 40 &&
    absBeta <= 125 &&
    absGamma >= 50 &&
    absGamma <= 130
  );
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export { POSITION_TIMEOUT_MS };

/**
 * Tracks device orientation to detect landscape + forehead ("Heads Up") pose.
 * Auto-calibrates when the player holds a steady landscape position.
 */
export class HeadPositionMonitor {
  private listener: Listener | null = null;
  private calibratedBeta: number | null = null;
  private calibratedGamma: number | null = null;
  private calibrationBuffer: Array<{ beta: number; gamma: number }> = [];
  private readySince: number | null = null;
  private lastState: HeadPositionState = {
    isLandscape: false,
    isOnForehead: false,
    isReady: false,
    hasOrientationData: false,
    hint: "Waiting for orientation…",
  };

  private readonly onOrientation = (event: DeviceOrientationEvent): void => {
    const beta = event.beta;
    const gamma = event.gamma;
    if (beta == null || gamma == null || Number.isNaN(beta) || Number.isNaN(gamma)) {
      return;
    }

    this.emit(this.computeState(beta, gamma));
  };

  private readonly onLayoutChange = (): void => {
    this.listener?.(this.lastState);
  };

  private computeState(beta: number, gamma: number): HeadPositionState {
    const isLandscape = isLandscapeOrientation();

    if (isLandscape && matchesForeheadHeuristic(beta, gamma)) {
      this.tryCalibrate(beta, gamma);
    }

    const isOnForehead = this.isForeheadPose(beta, gamma, isLandscape);
    const poseOk = isLandscape && isOnForehead;

    if (poseOk) {
      if (this.readySince == null) this.readySince = performance.now();
    } else {
      this.readySince = null;
    }

    const isReady =
      poseOk &&
      this.readySince != null &&
      performance.now() - this.readySince >= STABLE_READY_MS;

    return {
      isLandscape,
      isOnForehead,
      isReady,
      hasOrientationData: true,
      hint: this.buildHint(isLandscape, isOnForehead, isReady),
    };
  }

  private isForeheadPose(
    beta: number,
    gamma: number,
    isLandscape: boolean,
  ): boolean {
    if (!isLandscape) return false;

    if (this.calibratedBeta != null && this.calibratedGamma != null) {
      return (
        Math.abs(beta - this.calibratedBeta) <= CALIBRATION_TOLERANCE &&
        Math.abs(gamma - this.calibratedGamma) <= CALIBRATION_TOLERANCE
      );
    }

    return matchesForeheadHeuristic(beta, gamma);
  }

  private tryCalibrate(beta: number, gamma: number): void {
    if (this.calibratedBeta != null) return;

    this.calibrationBuffer.push({ beta, gamma });
    if (this.calibrationBuffer.length < CALIBRATION_SAMPLES) return;

    this.calibratedBeta = mean(this.calibrationBuffer.map((s) => s.beta));
    this.calibratedGamma = mean(this.calibrationBuffer.map((s) => s.gamma));
    this.calibrationBuffer = [];
  }

  private buildHint(
    isLandscape: boolean,
    isOnForehead: boolean,
    isReady: boolean,
  ): string {
    if (isReady) return "Perfect — hold steady!";
    if (!isLandscape) return "Rotate to landscape";
    if (!isOnForehead) {
      if (this.calibratedBeta == null) {
        return "Press phone to forehead, screen toward friends";
      }
      return "Adjust angle — screen should face friends";
    }
    return "Hold steady on your forehead…";
  }

  private emit(state: HeadPositionState): void {
    this.lastState = state;
    this.listener?.(state);
  }

  start(listener: Listener): void {
    this.listener = listener;
    this.calibratedBeta = null;
    this.calibratedGamma = null;
    this.calibrationBuffer = [];
    this.readySince = null;

    window.addEventListener("deviceorientation", this.onOrientation, true);
    window.addEventListener("orientationchange", this.onLayoutChange);
    screen.orientation?.addEventListener("change", this.onLayoutChange);

    this.emit({
      ...this.lastState,
      hasOrientationData: false,
      hint: "Waiting for orientation…",
    });
  }

  stop(): void {
    this.listener = null;
    window.removeEventListener("deviceorientation", this.onOrientation, true);
    window.removeEventListener("orientationchange", this.onLayoutChange);
    screen.orientation?.removeEventListener("change", this.onLayoutChange);
  }

  getState(): HeadPositionState {
    return this.lastState;
  }
}
