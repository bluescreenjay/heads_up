import type { DeckMeta, GuessResult, RoundEntry } from "./types";
import { loadDeckWords } from "./decks";
import { TiltDetector } from "./tilt";

export type GameCallbacks = {
  onScreen: (screen: "ready" | "play" | "results") => void;
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
  private feedbackTimeout: number | null = null;

  constructor(private readonly callbacks: GameCallbacks) {}

  async start(deck: DeckMeta, durationSec: number): Promise<void> {
    this.words = await loadDeckWords(deck);
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

    this.tilt.onAction((action) => this.handleTilt(action));

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

  private handleTilt(action: GuessResult): void {
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
    this.tilt.pause();

    window.setTimeout(() => {
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

    const current = this.words[this.index];
    if (
      current &&
      !this.entries.some((e) => e.word === current && e.result !== "timeout")
    ) {
      this.entries.push({ word: current, result: "timeout" });
    }

    this.tilt.stop();
    this.callbacks.onScreen("results");
    this.callbacks.onResults(this.entries, this.correct, this.passed);
  }

  destroy(): void {
    this.tilt.stop();
    if (this.timerId != null) window.clearInterval(this.timerId);
    if (this.readyId != null) window.clearInterval(this.readyId);
    if (this.feedbackTimeout != null) window.clearTimeout(this.feedbackTimeout);
  }
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
