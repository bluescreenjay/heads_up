import {
  foreheadTiltAxis,
  isLandscapeForeheadPose,
  isLandscapeOrientation,
} from "./orientation";

export type TiltAction = "correct" | "pass";

export type TiltDetectorOptions = {
  /** Degrees below baseline = correct (phone tipped toward chin). */
  correctThreshold?: number;
  /** Degrees above baseline = pass (phone tipped toward ceiling). */
  passThreshold?: number;
  /** Minimum ms between triggers. */
  cooldownMs?: number;
  /** Samples averaged for baseline during calibration. */
  calibrationSamples?: number;
};

type Listener = (action: TiltAction) => void;

/**
 * Calibrates the landscape-forehead nod axis (`beta` ≈ 0 at rest). Tilting
 * down triggers correct, up triggers pass.
 */
export class TiltDetector {
  private baseline: number | null = null;
  private calibrationBuffer: number[] = [];
  private calibrating = false;
  private armed = false;
  private lastTrigger = 0;
  private listener: Listener | null = null;

  private readonly correctThreshold: number;
  private readonly passThreshold: number;
  private readonly cooldownMs: number;
  private readonly calibrationSamples: number;

  private readonly onOrientation = (event: DeviceOrientationEvent): void => {
    const beta = event.beta;
    const gamma = event.gamma;
    if (beta == null || gamma == null || Number.isNaN(beta) || Number.isNaN(gamma)) {
      return;
    }

    if (!isLandscapeOrientation()) return;

    const tilt = foreheadTiltAxis(beta);

    if (this.calibrating) {
      if (!isLandscapeForeheadPose(beta, gamma)) return;

      this.calibrationBuffer.push(tilt);
      if (this.calibrationBuffer.length >= this.calibrationSamples) {
        this.baseline =
          this.calibrationBuffer.reduce((a, b) => a + b, 0) /
          this.calibrationBuffer.length;
        this.calibrating = false;
        this.calibrationBuffer = [];
        this.armed = true;
      }
      return;
    }

    if (!this.armed || this.baseline == null) return;

    const delta = tilt - this.baseline;
    const now = performance.now();
    if (now - this.lastTrigger < this.cooldownMs) return;

    if (delta <= -this.correctThreshold) {
      this.lastTrigger = now;
      this.listener?.("correct");
      return;
    }

    if (delta >= this.passThreshold) {
      this.lastTrigger = now;
      this.listener?.("pass");
    }
  };

  constructor(options: TiltDetectorOptions = {}) {
    this.correctThreshold = options.correctThreshold ?? 22;
    this.passThreshold = options.passThreshold ?? 22;
    this.cooldownMs = options.cooldownMs ?? 900;
    this.calibrationSamples = options.calibrationSamples ?? 24;
  }

  static needsPermission(): boolean {
    return (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (
        DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>;
        }
      ).requestPermission === "function"
    );
  }

  static async requestPermission(): Promise<boolean> {
    if (!TiltDetector.needsPermission()) return true;

    const requestPermission = (
      DeviceOrientationEvent as unknown as {
        requestPermission: () => Promise<string>;
      }
    ).requestPermission;

    const state = await requestPermission();
    return state === "granted";
  }

  startCalibration(): void {
    this.baseline = null;
    this.calibrationBuffer = [];
    this.calibrating = true;
    this.armed = false;
    window.addEventListener("deviceorientation", this.onOrientation, true);
  }

  /** Re-sample baseline while the phone is on the forehead in landscape. */
  recalibrate(): void {
    this.baseline = null;
    this.calibrationBuffer = [];
    this.calibrating = true;
    this.armed = false;
  }

  onAction(listener: Listener): void {
    this.listener = listener;
  }

  pause(): void {
    this.armed = false;
  }

  resume(): void {
    if (this.baseline != null) this.armed = true;
  }

  stop(): void {
    this.armed = false;
    this.calibrating = false;
    this.listener = null;
    window.removeEventListener("deviceorientation", this.onOrientation, true);
  }
}
