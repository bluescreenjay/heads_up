import type { DeckManifest, DeckMeta } from "./types";

const MANIFEST_URL = "/decks/index.json";
const POLL_MS = 2000;

let manifestCache: DeckManifest | null = null;
let lastUpdatedAt: string | null = null;

export async function fetchDeckManifest(force = false): Promise<DeckManifest> {
  const url = force
    ? `${MANIFEST_URL}?t=${Date.now()}`
    : MANIFEST_URL;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load deck list (${response.status})`);
  }

  const manifest = (await response.json()) as DeckManifest;
  manifestCache = manifest;
  lastUpdatedAt = manifest.updatedAt;
  return manifest;
}

export function startDeckManifestPolling(
  onUpdate: (manifest: DeckManifest) => void,
): () => void {
  const tick = async () => {
    try {
      const previous = lastUpdatedAt;
      const manifest = await fetchDeckManifest(true);
      if (manifest.updatedAt !== previous) {
        onUpdate(manifest);
      }
    } catch {
      /* ignore transient errors while dev server rescans */
    }
  };

  const id = window.setInterval(tick, POLL_MS);
  return () => window.clearInterval(id);
}

export async function loadDeckWords(deck: DeckMeta): Promise<string[]> {
  const response = await fetch(`/decks/${deck.filename}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load deck "${deck.name}"`);
  }

  const text = await response.text();
  return parseDeckText(text);
}

export function parseDeckText(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return lines;
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getCachedManifest(): DeckManifest | null {
  return manifestCache;
}
