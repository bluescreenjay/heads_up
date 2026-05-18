import { registerSW } from "virtual:pwa-register";
import {
  fetchDeckManifest,
  startDeckManifestPolling,
} from "./decks";
import { Game } from "./game";
import { TiltDetector } from "./tilt";
import type { DeckMeta, DeckManifest, RoundEntry } from "./types";

registerSW({ immediate: true });

const deckList = document.querySelector<HTMLUListElement>("#deck-list")!;
const deckEmpty = document.querySelector<HTMLParagraphElement>("#deck-empty")!;
const startButton = document.querySelector<HTMLButtonElement>("#start-game")!;
const roundDuration = document.querySelector<HTMLSelectElement>("#round-duration")!;
const motionOverlay = document.querySelector<HTMLDivElement>("#motion-permission")!;
const enableMotionBtn = document.querySelector<HTMLButtonElement>("#enable-motion")!;

const screens = {
  home: document.querySelector<HTMLElement>("#screen-home")!,
  ready: document.querySelector<HTMLElement>("#screen-ready")!,
  play: document.querySelector<HTMLElement>("#screen-play")!,
  results: document.querySelector<HTMLElement>("#screen-results")!,
};

const readyCountdown = document.querySelector<HTMLElement>("#ready-countdown")!;
const timerEl = document.querySelector<HTMLElement>("#timer")!;
const scoreEl = document.querySelector<HTMLElement>("#score")!;
const wordEl = document.querySelector<HTMLElement>("#current-word")!;
const feedbackEl = document.querySelector<HTMLElement>("#feedback")!;

const resultCorrect = document.querySelector<HTMLElement>("#result-correct")!;
const resultPassed = document.querySelector<HTMLElement>("#result-passed")!;
const resultSkipped = document.querySelector<HTMLElement>("#result-skipped")!;
const resultWords = document.querySelector<HTMLUListElement>("#result-words")!;
const playAgainBtn = document.querySelector<HTMLButtonElement>("#play-again")!;
const backHomeBtn = document.querySelector<HTMLButtonElement>("#back-home")!;

let selectedDeck: DeckMeta | null = null;
let motionGranted = !TiltDetector.needsPermission();
let game: Game | null = null;

function showScreen(name: keyof typeof screens): void {
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
    el.classList.toggle("screen-active", key === name);
  }
}

function renderDecks(manifest: DeckManifest): void {
  deckList.replaceChildren();

  if (manifest.decks.length === 0) {
    deckEmpty.hidden = false;
    startButton.disabled = true;
    selectedDeck = null;
    return;
  }

  deckEmpty.hidden = true;

  for (const deck of manifest.decks) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deck-option";
    button.textContent = deck.name;
    button.dataset.deckId = deck.id;
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => selectDeck(deck, button));
    li.append(button);
    deckList.append(li);
  }

  const stillValid =
    selectedDeck &&
    manifest.decks.some((deck) => deck.id === selectedDeck?.id);

  if (!stillValid) {
    const first = manifest.decks[0];
    const firstBtn = deckList.querySelector<HTMLButtonElement>(".deck-option");
    if (first && firstBtn) selectDeck(first, firstBtn);
  } else {
    const btn = deckList.querySelector<HTMLButtonElement>(
      `[data-deck-id="${selectedDeck!.id}"]`,
    );
    if (btn) btn.setAttribute("aria-pressed", "true");
    startButton.disabled = false;
  }
}

function selectDeck(deck: DeckMeta, button: HTMLButtonElement): void {
  selectedDeck = deck;
  deckList.querySelectorAll(".deck-option").forEach((el) => {
    el.setAttribute("aria-pressed", "false");
    el.classList.remove("deck-option-selected");
  });
  button.setAttribute("aria-pressed", "true");
  button.classList.add("deck-option-selected");
  startButton.disabled = false;
}

async function ensureMotion(): Promise<boolean> {
  if (motionGranted) return true;

  motionOverlay.hidden = false;
  return new Promise((resolve) => {
    const onEnable = async () => {
      enableMotionBtn.disabled = true;
      const granted = await TiltDetector.requestPermission();
      motionGranted = granted;
      motionOverlay.hidden = granted;
      enableMotionBtn.disabled = false;
      resolve(granted);
    };
    enableMotionBtn.addEventListener("click", onEnable, { once: true });
  });
}

function bindGame(): Game {
  return new Game({
    onScreen: (screen) => {
      if (screen === "ready") showScreen("ready");
      if (screen === "play") showScreen("play");
      if (screen === "results") showScreen("results");
    },
    onReadyTick: (n) => {
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
      timerEl.textContent = String(seconds);
      timerEl.classList.toggle("timer-low", seconds <= 10);
    },
    onScore: (correct) => {
      scoreEl.textContent = `${correct} correct`;
    },
    onResults: (entries, correct, passed) => {
      renderResults(entries, correct, passed);
    },
  });
}

function renderResults(
  entries: RoundEntry[],
  correct: number,
  passed: number,
): void {
  const skipped = entries.filter((e) => e.result === "timeout").length;
  resultCorrect.textContent = String(correct);
  resultPassed.textContent = String(passed);
  resultSkipped.textContent = String(skipped);

  resultWords.replaceChildren();
  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = `result-item result-${entry.result}`;
    const label =
      entry.result === "correct"
        ? "Correct"
        : entry.result === "pass"
          ? "Pass"
          : "—";
    li.textContent = `${entry.word} (${label})`;
    resultWords.append(li);
  }
}

startButton.addEventListener("click", async () => {
  if (!selectedDeck) return;

  const ok = await ensureMotion();
  if (!ok) return;

  game?.destroy();
  game = bindGame();

  try {
    await game.start(
      selectedDeck,
      Number.parseInt(roundDuration.value, 10),
    );
  } catch (error) {
    game.destroy();
    game = null;
    alert(error instanceof Error ? error.message : "Could not start game.");
    showScreen("home");
  }
});

playAgainBtn.addEventListener("click", () => {
  if (!selectedDeck) return;
  void startButton.click();
});

backHomeBtn.addEventListener("click", () => {
  game?.destroy();
  game = null;
  showScreen("home");
});

async function init(): Promise<void> {
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
