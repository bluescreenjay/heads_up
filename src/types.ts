export type DeckMeta = {
  id: string;
  name: string;
  filename: string;
};

export type DeckManifest = {
  decks: DeckMeta[];
  updatedAt: string;
};

export type GuessResult = "correct" | "pass";

export type RoundEntry = {
  word: string;
  result: GuessResult | "timeout";
};
