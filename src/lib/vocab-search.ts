import { type CardMemory, type SrsState, todayStart } from "./srs";
import { confusablesOf, type Word } from "./vocab";

const DAY = 86_400_000;

function studiedInRange(srs: SrsState, id: string, start: number, end: number) {
  return srs.log.some((entry) => entry.id === id && !entry.contrast && entry.t >= start && entry.t < end);
}

function firstStudiedAt(srs: SrsState, id: string) {
  const entries = srs.log.filter((entry) => entry.id === id && !entry.contrast);
  return entries.length ? Math.min(...entries.map((entry) => entry.t)) : null;
}

function matchesState(card: CardMemory | undefined, value: string) {
  if (value === "new") return !card || card.state === "new";
  return card?.state === value;
}

function matchesDifficulty(card: CardMemory | undefined, value: string) {
  if (!card) return false;
  if (value === "hard") return card.difficulty >= 7 || card.lapses >= 2 || card.confusions >= 2;
  if (value === "easy") return card.difficulty <= 4 && card.lapses === 0 && card.confusions === 0;
  const comparison = value.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)$/);
  if (!comparison) return false;
  const [, operator = "=", raw] = comparison;
  const target = Number(raw);
  return operator === ">=" ? card.difficulty >= target
    : operator === "<=" ? card.difficulty <= target
      : operator === ">" ? card.difficulty > target
        : operator === "<" ? card.difficulty < target
          : card.difficulty === target;
}

function matchesTerm(word: Word, term: string, srs: SrsState, now: number) {
  const [rawKey, ...valueParts] = term.toLowerCase().split(":");
  const value = valueParts.join(":");
  const card = srs.cards[word.id];
  const start = todayStart(now);
  const weekStart = start - 6 * DAY;

  if (!value) {
    return word.word.includes(term) || word.reading.includes(term) || word.meaning.toLowerCase().includes(term.toLowerCase());
  }
  if (rawKey === "studied" || rawKey === "introduced") {
    const rangeStart = value === "today" ? start : value === "week" ? weekStart : null;
    if (rangeStart === null) return false;
    if (rawKey === "studied") return studiedInRange(srs, word.id, rangeStart, now + 1);
    const first = firstStudiedAt(srs, word.id);
    return first !== null && first >= rangeStart && first <= now;
  }
  if (rawKey === "state") return matchesState(card, value);
  if (rawKey === "difficulty") return matchesDifficulty(card, value);
  if (rawKey === "is") return value === "confusing" ? Boolean(confusablesOf(word)) : false;
  if (rawKey === "due") return value === "today" ? Boolean(card && card.due <= start + DAY) : false;
  return false;
}

export function searchVocabulary(words: Word[], query: string, srs: SrsState, now = Date.now()) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  return words.filter((word) => terms.every((term) => matchesTerm(word, term, srs, now)));
}
