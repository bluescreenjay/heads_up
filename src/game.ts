import type { DeckMeta, GuessResult, RoundEntry } from "./types";
import { loadDeckWords, shuffle } from "./decks";
import {
  HeadPositionMonitor,
  POSITION_TIMEOUT_MS,
  type HeadPositionState,
} from "./headPosition";
import { TiltDetector } from "./tilt";

export type GameCallbacks = {
  onScreen: (screen: "ready" | "play" | "results") => void;
  onPosition: (state: HeadPositionState) => void;
  onReadyWaiting: () => void;
  onReadyTick: (secondsLeft: number) => void;
  onWord: (word: string) => void;
  onFeedback: (text: string, kind: "correct" | "pass" | "") => void;
  onTimer: (secondsLeft: number) => void;
  onScore: (correct: number) => void;
  onResults: (entries: RoundEntry[], correct: number, passed: number) => void;
};

export class Game {
  private words: string[] = [];
  private index = 0;
  private correct = 0;
  private passed = 0;
  private entries: RoundEntry[] = [];
  private timerId: number | null = null;
  private readyId: number | null = null;
  private secondsLeft = 60;
  private readonly tilt = new TiltDetector();
  private readonly headPosition = new HeadPositionMonitor();
  private feedbackTimeout: number | null = null;
  private acceptingInput = false;
  private playing = false;
  private positionTimeoutId: number | null = null;
  private waitingForPosition = false;

  constructor(private readonly callbacks: GameCallbacks) {}

  async start(deck: DeckMeta, durationSec: number): Promise<void> {
    this.words = shuffle(await loadDeckWords(deck));
    if (this.words.length === 0) {
      throw new Error(`Deck "${deck.name}" has no words.`);
    }

    this.index = 0;
    this.correct = 0;
    this.passed = 0;
    this.entries = [];
    this.secondsLeft = durationSec;

    this.callbacks.onScreen("ready");
    this.tilt.startCalibration();
    this.waitingForPosition = true;
    this.callbacks.onReadyWaiting();

    this.headPosition.start((state) => {
      this.callbacks.onPosition(state);
      if (this.waitingForPosition && state.isReady) {
        this.startCountdown();
      }
    });

    this.positionTimeoutId = window.setTimeout(() => {
      if (this.waitingForPosition) this.startCountdown();
    }, POSITION_TIMEOUT_MS);
  }

  /** Skip orientation checks and go straight to the round (desktop / buttons). */
  startDesktop(): void {
    if (this.playing) return;

    this.waitingForPosition = false;
    if (this.positionTimeoutId != null) {
      window.clearTimeout(this.positionTimeoutId);
      this.positionTimeoutId = null;
    }
    if (this.readyId != null) {
      window.clearInterval(this.readyId);
      this.readyId = null;
    }

    this.headPosition.stop();
    this.tilt.stop();
    this.beginPlay();
  }

  private startCountdown(): void {
    if (!this.waitingForPosition) return;
    this.waitingForPosition = false;

    if (this.positionTimeoutId != null) {
      window.clearTimeout(this.positionTimeoutId);
      this.positionTimeoutId = null;
    }

    let countdown = 3;
    this.callbacks.onReadyTick(countdown);

    this.readyId = window.setInterval(() => {
      countdown -= 1;
      if (countdown > 0) {
        this.callbacks.onReadyTick(countdown);
        return;
      }

      if (this.readyId != null) {
        window.clearInterval(this.readyId);
        this.readyId = null;
      }

      this.beginPlay();
    }, 1000);
  }

  private beginPlay(): void {
    this.callbacks.onScreen("play");
    this.callbacks.onTimer(this.secondsLeft);
    this.callbacks.onScore(this.correct);
    this.showCurrentWord();

    this.playing = true;
    this.acceptingInput = true;
    this.tilt.recalibrate();
    this.tilt.onAction((action) => this.recordGuess(action));

    this.timerId = window.setInterval(() => {
      this.secondsLeft -= 1;
      this.callbacks.onTimer(this.secondsLeft);
      if (this.secondsLeft <= 0) {
        this.endRound();
      }
    }, 1000);
  }

  private showCurrentWord(): void {
    if (this.index >= this.words.length) {
      this.words = shuffle([...this.words]);
      this.index = 0;
    }
    this.callbacks.onWord(this.words[this.index]);
    this.callbacks.onFeedback("", "");
  }

  markCorrect(): void {
    this.recordGuess("correct");
  }

  markPass(): void {
    this.recordGuess("pass");
  }

  endRoundNow(): void {
    if (!this.playing) return;
    this.endRound();
  }

  private recordGuess(action: GuessResult): void {
    if (!this.playing || !this.acceptingInput) return;

    const word = this.words[this.index];
    this.entries.push({ word, result: action });

    if (action === "correct") {
      this.correct += 1;
      this.flash("Correct!", "correct");
    } else {
      this.passed += 1;
      this.flash("Pass", "pass");
    }

    this.callbacks.onScore(this.correct);
    this.index += 1;
    this.acceptingInput = false;
    this.tilt.pause();

    window.setTimeout(() => {
      if (!this.playing) return;
      this.acceptingInput = true;
      this.tilt.resume();
      this.showCurrentWord();
    }, 450);
  }

  private flash(text: string, kind: "correct" | "pass"): void {
    this.callbacks.onFeedback(text, kind);
    if (this.feedbackTimeout != null) {
      window.clearTimeout(this.feedbackTimeout);
    }
    this.feedbackTimeout = window.setTimeout(() => {
      this.callbacks.onFeedback("", "");
    }, 400);
  }

  private endRound(): void {
    if (this.timerId != null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.readyId != null) {
      window.clearInterval(this.readyId);
      this.readyId = null;
    }

    this.playing = false;
    this.acceptingInput = false;
    this.tilt.stop();
    this.headPosition.stop();
    this.callbacks.onScreen("results");
    this.callbacks.onResults(this.entries, this.correct, this.passed);
  }

  destroy(): void {
    this.waitingForPosition = false;
    this.tilt.stop();
    this.headPosition.stop();
    if (this.timerId != null) window.clearInterval(this.timerId);
    if (this.readyId != null) window.clearInterval(this.readyId);
    if (this.positionTimeoutId != null) {
      window.clearTimeout(this.positionTimeoutId);
    }
    if (this.feedbackTimeout != null) window.clearTimeout(this.feedbackTimeout);
  }
}

