export type TiltAction = "correct" | "pass";

export type TiltDetectorOptions = {
  /** Degrees below baseline = correct (phone tipped forward / face down). */
  correctThreshold?: number;
  /** Degrees above baseline = pass (phone tipped back / face up). */
  passThreshold?: number;
  /** Minimum ms between triggers. */
  cooldownMs?: number;
  /** Samples averaged for baseline during calibration. */
  calibrationSamples?: number;
};

type Listener = (action: TiltAction) => void;

/**
 * Uses DeviceOrientation `beta` (front-back tilt). Calibrate while the phone
 * is held steady on the forehead; tilting down triggers correct, up triggers pass.
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
    if (beta == null || Number.isNaN(beta)) return;

    if (this.calibrating) {
      this.calibrationBuffer.push(beta);
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

    const delta = beta - this.baseline;
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
    this.correctThreshold = options.correctThreshold ?? 28;
    this.passThreshold = options.passThreshold ?? 28;
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
