import { registerSW } from "virtual:pwa-register";
import {
  fetchDeckManifest,
  startDeckManifestPolling,
} from "./decks";
import { Game } from "./game";
import type { HeadPositionState } from "./headPosition";
import { TiltDetector } from "./tilt";
import type { DeckMeta, DeckManifest, RoundEntry } from "./types";

registerSW({ immediate: true });

const deckSelect = document.querySelector<HTMLSelectElement>("#deck-select")!;
const deckEmpty = document.querySelector<HTMLParagraphElement>("#deck-empty")!;
const startButton = document.querySelector<HTMLButtonElement>("#start-game")!;
const startDesktopButton = document.querySelector<HTMLButtonElement>("#start-desktop")!;
const roundMinutes = document.querySelector<HTMLInputElement>("#round-minutes")!;
const roundSeconds = document.querySelector<HTMLInputElement>("#round-seconds")!;
const motionOverlay = document.querySelector<HTMLDivElement>("#motion-permission")!;
const enableMotionBtn = document.querySelector<HTMLButtonElement>("#enable-motion")!;
const skipMotionBtn = document.querySelector<HTMLButtonElement>("#skip-motion")!;

const screens = {
  home: document.querySelector<HTMLElement>("#screen-home")!,
  ready: document.querySelector<HTMLElement>("#screen-ready")!,
  play: document.querySelector<HTMLElement>("#screen-play")!,
  results: document.querySelector<HTMLElement>("#screen-results")!,
};

const readyCountdown = document.querySelector<HTMLElement>("#ready-countdown")!;
const checkLandscape = document.querySelector<HTMLElement>("#check-landscape")!;
const checkForehead = document.querySelector<HTMLElement>("#check-forehead")!;
const positionHint = document.querySelector<HTMLElement>("#position-hint")!;
const positionBadge = document.querySelector<HTMLElement>("#position-badge")!;
const positionBadgeText = document.querySelector<HTMLElement>(
  "#position-badge-text",
)!;
const timerEl = document.querySelector<HTMLElement>("#timer")!;
const scoreEl = document.querySelector<HTMLElement>("#score")!;
const wordEl = document.querySelector<HTMLElement>("#current-word")!;
const feedbackEl = document.querySelector<HTMLElement>("#feedback")!;

const resultCorrect = document.querySelector<HTMLElement>("#result-correct")!;
const resultPassed = document.querySelector<HTMLElement>("#result-passed")!;
const resultCorrectList = document.querySelector<HTMLUListElement>(
  "#result-correct-list",
)!;
const resultPassedList = document.querySelector<HTMLUListElement>(
  "#result-passed-list",
)!;
const playAgainBtn = document.querySelector<HTMLButtonElement>("#play-again")!;
const backHomeBtn = document.querySelector<HTMLButtonElement>("#back-home")!;
const btnCorrect = document.querySelector<HTMLButtonElement>("#btn-correct")!;
const btnPass = document.querySelector<HTMLButtonElement>("#btn-pass")!;
const endGameBtn = document.querySelector<HTMLButtonElement>("#end-game")!;
const tiltLegend = document.querySelector<HTMLElement>("#tilt-legend")!;

const MIN_ROUND_SEC = 10;
const MAX_ROUND_SEC = 60 * 60;

let deckCatalog: DeckMeta[] = [];
let selectedDeck: DeckMeta | null = null;
let motionGranted = !TiltDetector.needsPermission();
let game: Game | null = null;
let lastStartWasDesktop = false;

function showScreen(name: keyof typeof screens): void {
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
    el.classList.toggle("screen-active", key === name);
  }
}

function getRoundDurationSeconds(): number {
  const minutes = Math.max(0, Number.parseInt(roundMinutes.value, 10) || 0);
  const seconds = Math.max(0, Number.parseInt(roundSeconds.value, 10) || 0);
  let total = minutes * 60 + seconds;
  if (total < MIN_ROUND_SEC) total = MIN_ROUND_SEC;
  if (total > MAX_ROUND_SEC) total = MAX_ROUND_SEC;
  return total;
}

function syncDurationInputs(totalSec: number): void {
  const clamped = Math.min(MAX_ROUND_SEC, Math.max(MIN_ROUND_SEC, totalSec));
  roundMinutes.value = String(Math.floor(clamped / 60));
  roundSeconds.value = String(clamped % 60);
}

function applyDeckSelection(id: string): void {
  selectedDeck = deckCatalog.find((deck) => deck.id === id) ?? null;
  startButton.disabled = selectedDeck == null;
}

function renderDecks(manifest: DeckManifest): void {
  deckCatalog = manifest.decks;
  const previousId = deckSelect.value;

  deckSelect.replaceChildren();

  if (manifest.decks.length === 0) {
    deckEmpty.hidden = false;
    deckSelect.disabled = true;
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "No decks";
    deckSelect.append(empty);
    selectedDeck = null;
    startButton.disabled = true;
    return;
  }

  deckEmpty.hidden = true;
  deckSelect.disabled = false;

  for (const deck of manifest.decks) {
    const option = document.createElement("option");
    option.value = deck.id;
    option.textContent = deck.name;
    deckSelect.append(option);
  }

  const stillValid = manifest.decks.some((deck) => deck.id === previousId);
  deckSelect.value = stillValid ? previousId : manifest.decks[0].id;
  applyDeckSelection(deckSelect.value);
}

function maybePromptForMotion(): void {
  if (motionGranted || !TiltDetector.needsPermission()) return;
  motionOverlay.hidden = false;
}

function setCheck(el: HTMLElement, ok: boolean | null): void {
  el.classList.remove("position-check-ok", "position-check-bad", "position-check-pending");
  if (ok === null) {
    el.classList.add("position-check-pending");
    return;
  }
  el.classList.add(ok ? "position-check-ok" : "position-check-bad");
}

function renderPosition(state: HeadPositionState, phase: "ready" | "play"): void {
  if (!state.hasOrientationData) {
    setCheck(checkLandscape, null);
    setCheck(checkForehead, null);
    positionHint.textContent = state.hint;
    if (phase === "play") positionBadge.hidden = true;
    return;
  }

  setCheck(checkLandscape, state.isLandscape);
  setCheck(checkForehead, state.isOnForehead);
  positionHint.textContent = state.hint;

  if (phase !== "play") {
    positionBadge.hidden = true;
    return;
  }

  positionBadge.hidden = false;
  positionBadge.classList.toggle("position-badge-ok", state.isReady);
  positionBadge.classList.toggle("position-badge-warn", !state.isReady);
  positionBadgeText.textContent = state.isReady
    ? "Position OK"
    : state.isLandscape
      ? "Adjust forehead angle"
      : "Rotate to landscape";
}

function formatTimeRemaining(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

let activePhase: "ready" | "play" | "idle" = "idle";

function bindGame(): Game {
  return new Game({
    onScreen: (screen) => {
      if (screen === "ready") {
        activePhase = "ready";
        startDesktopButton.hidden = false;
        showScreen("ready");
        if (lastStartWasDesktop) game?.startDesktop();
      }
      if (screen === "play") {
        activePhase = "play";
        motionOverlay.hidden = true;
        positionBadge.hidden = true;
        tiltLegend.hidden = lastStartWasDesktop;
        showScreen("play");
      }
      if (screen === "results") {
        activePhase = "idle";
        positionBadge.hidden = true;
        showScreen("results");
      }
    },
    onPosition: (state) => {
      if (activePhase === "ready" || activePhase === "play") {
        renderPosition(state, activePhase);
      }
    },
    onReadyWaiting: () => {
      startDesktopButton.hidden = false;
      readyCountdown.textContent = "…";
      renderPosition(
        {
          isLandscape: false,
          isOnForehead: false,
          isReady: false,
          hasOrientationData: false,
          hint: "Rotate to landscape, then press the phone to your forehead",
        },
        "ready",
      );
    },
    onReadyTick: (n) => {
      startDesktopButton.hidden = true;
      readyCountdown.textContent = String(n);
    },
    onWord: (word) => {
      wordEl.textContent = word;
      wordEl.classList.remove("word-pop");
      void wordEl.offsetWidth;
      wordEl.classList.add("word-pop");
    },
    onFeedback: (text, kind) => {
      feedbackEl.textContent = text;
      feedbackEl.className = `feedback feedback-${kind}`;
    },
    onTimer: (seconds) => {
      timerEl.textContent = formatTimeRemaining(seconds);
      timerEl.classList.toggle("timer-low", seconds <= 10);
    },
    onScore: (correct) => {
      scoreEl.textContent = String(correct);
    },
    onResults: (entries, correct, passed) => {
      renderResults(entries, correct, passed);
    },
  });
}

function fillResultList(
  list: HTMLUListElement,
  words: string[],
  emptyLabel: string,
): void {
  list.replaceChildren();
  if (words.length === 0) {
    const li = document.createElement("li");
    li.className = "result-item result-empty";
    li.textContent = emptyLabel;
    list.append(li);
    return;
  }
  for (const word of words) {
    const li = document.createElement("li");
    li.className = "result-item";
    li.textContent = word;
    list.append(li);
  }
}

function renderResults(
  entries: RoundEntry[],
  correct: number,
  passed: number,
): void {
  resultCorrect.textContent = String(correct);
  resultPassed.textContent = String(passed);

  fillResultList(
    resultCorrectList,
    entries.filter((e) => e.result === "correct").map((e) => e.word),
    "None",
  );
  fillResultList(
    resultPassedList,
    entries.filter((e) => e.result === "pass").map((e) => e.word),
    "None",
  );
}

btnCorrect.addEventListener("click", () => game?.markCorrect());
btnPass.addEventListener("click", () => game?.markPass());
endGameBtn.addEventListener("click", () => game?.endRoundNow());

async function startRound(): Promise<void> {
  if (!selectedDeck) return;

  maybePromptForMotion();

  game?.destroy();
  game = bindGame();

  try {
    const durationSec = getRoundDurationSeconds();
    syncDurationInputs(durationSec);
    await game.start(selectedDeck, durationSec);
  } catch (error) {
    game.destroy();
    game = null;
    alert(error instanceof Error ? error.message : "Could not start game.");
    showScreen("home");
  }
}

startButton.addEventListener("click", () => {
  lastStartWasDesktop = false;
  void startRound();
});
startDesktopButton.addEventListener("click", () => {
  lastStartWasDesktop = true;
  game?.startDesktop();
});

playAgainBtn.addEventListener("click", () => {
  if (!selectedDeck) return;
  void startRound();
});

backHomeBtn.addEventListener("click", () => {
  game?.destroy();
  game = null;
  showScreen("home");
});

function bindMotionPrompt(): void {
  enableMotionBtn.addEventListener("click", async () => {
    enableMotionBtn.disabled = true;
    motionGranted = await TiltDetector.requestPermission();
    enableMotionBtn.disabled = false;
    motionOverlay.hidden = true;
  });

  skipMotionBtn.addEventListener("click", () => {
    motionOverlay.hidden = true;
  });
}

async function init(): Promise<void> {
  bindMotionPrompt();
  deckSelect.addEventListener("change", () => applyDeckSelection(deckSelect.value));

  try {
    const manifest = await fetchDeckManifest();
    renderDecks(manifest);
  } catch (error) {
    deckEmpty.hidden = false;
    deckEmpty.textContent =
      error instanceof Error
        ? error.message
        : "Could not load decks. Run npm run dev.";
  }

  startDeckManifestPolling((manifest) => renderDecks(manifest));
  showScreen("home");
}

void init();
