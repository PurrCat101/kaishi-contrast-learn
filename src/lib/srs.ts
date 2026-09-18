import { useEffect, useSyncExternalStore } from "react";
import { words, confusablesOf } from "./vocab";

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export type CardState = "new" | "learning" | "review" | "relearning";

export type CardMemory = {
  id: number;
  state: CardState;
  stability: number; // days
  difficulty: number; // 1..10
  due: number; // epoch ms
  reps: number;
  lapses: number;
  confusions: number; // wrong picks on contrast cards
  last: number | null;
};

export type LogEntry = { t: number; id: number; rating: Rating; contrast?: boolean; correct?: boolean };

export type SrsState = {
  cards: Record<number, CardMemory>;
  log: LogEntry[];
  newPerDay: number;
};

const DAY = 86_400_000;
const KEY = "kaishi-contrast-srs-v1";
export const DESIRED_RETENTION = 0.9;

export const RATING_LABEL: Record<Rating, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

// ---------- FSRS-style scheduling (simplified) ----------
export function retrievability(c: CardMemory, now = Date.now()) {
  if (!c.last || c.state === "new") return 0;
  const elapsed = Math.max(0, (now - c.last) / DAY);
  return Math.pow(1 + elapsed / (9 * c.stability), -1);
}

export function nextMemory(c: CardMemory, rating: Rating, now = Date.now()): CardMemory {
  const n = { ...c, reps: c.reps + 1, last: now };
  const d = (x: number) => Math.min(10, Math.max(1, x));
  if (c.state === "new" || c.state === "learning" || c.state === "relearning") {
    const init: Record<Rating, number> = { 1: 0.4, 2: 1, 3: 3, 4: 7 };
    n.stability = init[rating];
    n.difficulty = d(c.state === "new" ? 6 - (rating - 2) * 1.2 : c.difficulty + (rating === 1 ? 0.8 : rating === 4 ? -0.5 : 0));
    n.state = rating === 1 ? (c.state === "relearning" ? "relearning" : "learning") : "review";
    n.due = rating === 1 ? now + 10 * 60_000 : now + n.stability * DAY;
    return n;
  }
  // review state
  const r = retrievability(c, now);
  const hardness = 1 + (10 - c.difficulty) * 0.05;
  if (rating === 1) {
    n.lapses = c.lapses + 1;
    n.stability = Math.max(0.5, c.stability * 0.25);
    n.difficulty = d(c.difficulty + 1);
    n.state = "relearning";
    n.due = now + 10 * 60_000;
    return n;
  }
  const growth = rating === 2 ? 1.2 : rating === 3 ? 2.2 * hardness * (1 + (1 - r)) : 3.5 * hardness * (1 + (1 - r));
  n.stability = Math.round(c.stability * growth * 10) / 10;
  n.difficulty = d(c.difficulty + (rating === 2 ? 0.4 : rating === 4 ? -0.4 : -0.05));
  n.state = "review";
  n.due = now + n.stability * DAY;
  return n;
}

export function intervalLabel(ms: number) {
  const m = ms / 60_000;
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${(d / 30).toFixed(1)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

export const previewIntervals = (c: CardMemory, now = Date.now()) =>
  ([1, 2, 3, 4] as Rating[]).map((r) => ({ rating: r, label: intervalLabel(nextMemory(c, r, now).due - now) }));

export const blankCard = (id: number): CardMemory => ({
  id, state: "new", stability: 0, difficulty: 5, due: 0, reps: 0, lapses: 0, confusions: 0, last: null,
});

// ---------- Deterministic demo seed ----------
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function makeSeed(now: number): SrsState {
  const rnd = seeded(42);
  const cards: Record<number, CardMemory> = {};
  const log: LogEntry[] = [];
  const learnedCount = 214;
  const dayStart = new Date(now); dayStart.setHours(4, 0, 0, 0);
  const d0 = dayStart.getTime();
  const pool = words.slice(0, learnedCount);
  // ensure the はし / あつい / あめ demo groups are in rotation and due today
  const featured = [1501, 1502, 1503, 1504, 1505, 1506, 510, 908, 404, 445, 1296]
    .map((id) => words.find((w) => w.id === id)!).filter(Boolean);
  for (const w of [...pool, ...featured]) {
    const age = Math.floor(rnd() * 40) + 1; // days since first seen
    const reps = Math.max(1, Math.floor(age / 4) + Math.floor(rnd() * 3));
    const hasConf = !!confusablesOf(w);
    const difficulty = Math.min(10, Math.max(1, 5 + (hasConf ? 1.5 : 0) + (rnd() - 0.5) * 4));
    const lapses = Math.floor(rnd() * (hasConf ? 3 : 1.4));
    const stability = Math.max(0.5, Math.round(Math.pow(1.9, reps - lapses) * (rnd() * 0.5 + 0.75) * 10) / 10);
    const last = d0 - Math.floor(rnd() * Math.min(age, stability + 2)) * DAY - Math.floor(rnd() * 8) * 3_600_000;
    let due = last + stability * DAY;
    if (featured.includes(w) || rnd() < 0.22) due = d0 + Math.floor(rnd() * 20) * 3_600_000 - DAY * (rnd() < 0.3 ? 1 : 0);
    const state: CardState = reps <= 1 ? "learning" : lapses > 1 && rnd() < 0.3 ? "relearning" : "review";
    cards[w.id] = { id: w.id, state, stability, difficulty, due, reps, lapses, confusions: hasConf ? Math.floor(rnd() * 3) : 0, last };
    for (let i = 0; i < reps; i++) {
      const t = last - i * Math.max(1, stability / 2) * DAY - Math.floor(rnd() * 3) * 3_600_000;
      const roll = rnd();
      log.push({ t, id: w.id, rating: roll < 0.12 ? 1 : roll < 0.3 ? 2 : roll < 0.85 ? 3 : 4 });
    }
  }
  // make sure the streak is alive: at least a few logs per day for the last 12 days
  for (let dd = 1; dd <= 12; dd++) {
    if (!log.some((l) => l.t >= d0 - dd * DAY && l.t < d0 - (dd - 1) * DAY)) {
      const w = pool[Math.floor(rnd() * pool.length)];
      log.push({ t: d0 - dd * DAY + 9 * 3_600_000, id: w.id, rating: 3 });
    }
  }
  log.sort((a, b) => a.t - b.t);
  return { cards, log, newPerDay: 10 };
}

// ---------- Store ----------
let state: SrsState = makeSeed(Date.now());
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { state = JSON.parse(raw) as SrsState; emit(); }
  } catch { /* ignore */ }
}

const serverSnapshot = state;
export function useSrs(): SrsState {
  const s = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => serverSnapshot);
  useEffect(() => { hydrate(); }, []);
  return s;
}

export function getCard(id: number): CardMemory {
  return state.cards[id] ?? blankCard(id);
}

export function rate(id: number, rating: Rating) {
  const now = Date.now();
  const next = nextMemory(getCard(id), rating, now);
  state = { ...state, cards: { ...state.cards, [id]: next }, log: [...state.log, { t: now, id, rating }] };
  persist(); emit();
  return next;
}

export function recordContrast(id: number, correct: boolean) {
  const c = getCard(id);
  const next: CardMemory = correct
    ? c
    : { ...c, confusions: c.confusions + 1, difficulty: Math.min(10, c.difficulty + 0.6), stability: Math.max(0.5, c.stability * 0.7), due: Math.min(c.due, Date.now() + DAY) };
  state = { ...state, cards: { ...state.cards, [id]: next }, log: [...state.log, { t: Date.now(), id, rating: correct ? 3 : 1, contrast: true, correct }] };
  persist(); emit();
}

export function resetProgress() {
  state = makeSeed(Date.now());
  persist(); emit();
}

// ---------- Derived ----------
export function todayStart(now = Date.now()) {
  const d = new Date(now); d.setHours(4, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function dueCards(s: SrsState, now = Date.now()) {
  return Object.values(s.cards).filter((c) => c.state !== "new" && c.due <= now + 20 * 3_600_000 && c.due < todayStart(now) + DAY)
    .sort((a, b) => a.due - b.due);
}

export function newCards(s: SrsState, now = Date.now()) {
  const introducedToday = s.log.filter((l) => l.t >= todayStart(now) && s.cards[l.id]?.reps === 1).length;
  const remaining = Math.max(0, s.newPerDay - introducedToday);
  return words.filter((w) => !s.cards[w.id]).slice(0, remaining).map((w) => blankCard(w.id));
}

export function reviewedToday(s: SrsState, now = Date.now()) {
  const t0 = todayStart(now);
  return new Set(s.log.filter((l) => l.t >= t0 && !l.contrast).map((l) => l.id)).size;
}

export function streak(s: SrsState, now = Date.now()) {
  const t0 = todayStart(now);
  const days = new Set(s.log.map((l) => Math.floor((l.t - t0) / DAY)));
  let n = 0;
  let d = days.has(0) ? 0 : -1;
  while (days.has(d)) { n++; d--; }
  return n;
}

export function stats(s: SrsState, now = Date.now()) {
  const all = Object.values(s.cards);
  const learned = all.filter((c) => c.state === "review" && c.stability >= 7).length;
  const learning = all.filter((c) => c.state === "learning" || c.state === "relearning" || (c.state === "review" && c.stability < 7)).length;
  const difficult = all.filter((c) => c.difficulty >= 7 || c.lapses >= 2 || c.confusions >= 2)
    .sort((a, b) => (b.difficulty + b.lapses + b.confusions) - (a.difficulty + a.lapses + a.confusions));
  const upcoming = all.filter((c) => c.due > now).sort((a, b) => a.due - b.due);
  const history = Array.from({ length: 14 }, (_, i) => {
    const dayStartMs = todayStart(now) - (13 - i) * DAY;
    const entries = s.log.filter((l) => l.t >= dayStartMs && l.t < dayStartMs + DAY && !l.contrast);
    return {
      day: new Date(dayStartMs),
      count: entries.length,
      again: entries.filter((l) => l.rating === 1).length,
    };
  });
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const a = todayStart(now) + i * DAY;
    return { day: new Date(a), count: all.filter((c) => (i === 0 ? c.due < a + DAY : c.due >= a && c.due < a + DAY)).length };
  });
  const retention = (() => {
    const rev = s.log.filter((l) => !l.contrast && l.t > now - 30 * DAY);
    return rev.length ? Math.round((rev.filter((l) => l.rating > 1).length / rev.length) * 100) : 0;
  })();
  return { total: all.length, learned, learning, difficult, upcoming, history, forecast, retention };
}
