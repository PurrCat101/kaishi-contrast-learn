import { useEffect, useSyncExternalStore } from "react";
import { createEmptyCard, fsrs, State as FsrsState, type Card, type Grade } from "ts-fsrs";
import { supabase } from "./supabase";
import { words } from "./vocab";

export type Rating = 1 | 2 | 3 | 4;
export type CardState = "new" | "learning" | "review" | "relearning";

export type CardMemory = {
  id: string; state: CardState; due: number; stability: number; difficulty: number;
  elapsedDays: number; scheduledDays: number; learningSteps: number; reps: number; lapses: number;
  confusions: number; last: number | null; suspended: boolean;
};
/** `prev` is the card state before this rating; it tells new introductions apart from reviews. */
export type LogEntry = { t: number; id: string; rating: Rating; prev?: CardState; contrast?: boolean; correct?: boolean };
export type SrsState = {
  version: 3; hydrated: boolean; loadError: string | null; cards: Record<string, CardMemory>; log: LogEntry[];
  newPerDay: number; dailyReviewLimit: number; sessionSize: number;
};

const DAY = 86_400_000;
const KEY = "kaishi-contrast-srs-v1";
const LEECH_THRESHOLD = 8;
const PAGE = 1000;
/** Like Anki's learn-ahead limit: learning cards due within this window may be shown early when nothing else is left. */
export const LEARN_AHEAD_MS = 20 * 60_000;
export const DESIRED_RETENTION = 0.9;
export const RATING_LABEL: Record<Rating, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };
const scheduler = fsrs({ request_retention: DESIRED_RETENTION, maximum_interval: 36500, enable_fuzz: true, enable_short_term: true, learning_steps: ["1m", "10m"], relearning_steps: ["10m"] });
const stateToFsrs: Record<CardState, FsrsState> = { new: FsrsState.New, learning: FsrsState.Learning, review: FsrsState.Review, relearning: FsrsState.Relearning };
const fsrsToState: Record<FsrsState, CardState> = { [FsrsState.New]: "new", [FsrsState.Learning]: "learning", [FsrsState.Review]: "review", [FsrsState.Relearning]: "relearning" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fromFsrs(id: string, card: Card, previous?: CardMemory): CardMemory {
  return { id, state: fsrsToState[card.state], due: card.due.getTime(), stability: card.stability, difficulty: card.difficulty, elapsedDays: card.elapsed_days, scheduledDays: card.scheduled_days, learningSteps: card.learning_steps, reps: card.reps, lapses: card.lapses, confusions: previous?.confusions ?? 0, last: card.last_review?.getTime() ?? null, suspended: previous?.suspended ?? false };
}
function toFsrs(card: CardMemory): Card {
  return { due: new Date(card.due), stability: card.stability, difficulty: card.difficulty, elapsed_days: card.elapsedDays, scheduled_days: card.scheduledDays, learning_steps: card.learningSteps, reps: card.reps, lapses: card.lapses, state: stateToFsrs[card.state], ...(card.last ? { last_review: new Date(card.last) } : {}) };
}
export const blankCard = (id: string): CardMemory => fromFsrs(id, createEmptyCard(new Date()));
function makeInitialState(): SrsState { return { version: 3, hydrated: false, loadError: null, cards: {}, log: [], newPerDay: 10, dailyReviewLimit: 100, sessionSize: 20 }; }

function migrateV2(saved: Partial<SrsState>): SrsState {
  const oldCards = (saved.cards ?? {}) as Record<string, Partial<CardMemory> & { last?: number | null }>;
  const cards = Object.fromEntries(Object.entries(oldCards).map(([rawId, card]) => {
    const id = String(rawId);
    return [id, { id, state: card.state ?? "new", due: card.due ?? Date.now(), stability: card.stability ?? 0, difficulty: card.difficulty ?? 0, elapsedDays: card.elapsedDays ?? 0, scheduledDays: card.scheduledDays ?? 0, learningSteps: card.learningSteps ?? 0, reps: card.reps ?? 0, lapses: card.lapses ?? 0, confusions: card.confusions ?? 0, last: card.last ?? null, suspended: card.suspended ?? false } satisfies CardMemory];
  }));
  return { ...makeInitialState(), cards, log: saved.log ?? [], newPerDay: saved.newPerDay ?? 10, dailyReviewLimit: saved.dailyReviewLimit ?? 100, sessionSize: saved.sessionSize ?? 20 };
}

let state: SrsState = makeInitialState();
/** Signed-in user whose data is loaded, or null for a guest. */
let accountUserId: string | null = null;
/** Bumped on every (re)load so a slow, stale load cannot overwrite a newer one. */
let generation = 0;
let started = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
function persist() {
  // Signed-in learners use Supabase. Local data intentionally stays separate
  // and is never copied into an account automatically.
  if (accountUserId) return;
  try { const { hydrated: _hydrated, loadError: _error, ...stored } = state; localStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* Browser storage is optional. */ }
}
function loadGuest(): SrsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<SrsState>;
      if (saved.version === 3) return { ...makeInitialState(), ...saved, hydrated: true, loadError: null };
      if (saved.version === 2) return { ...migrateV2(saved), hydrated: true };
    }
  } catch { /* Start clean if malformed browser storage cannot be parsed. */ }
  return { ...makeInitialState(), hydrated: true };
}
type FsrsRow = {
  vocabulary_id: string; due: string | null; stability: number | null; difficulty: number | null; elapsed_days: number; scheduled_days: number;
  learning_steps: number | null; reps: number; lapses: number; state: number; last_review: string | null; confusions: number | null;
};
function databaseCard(row: FsrsRow, status?: string): CardMemory {
  const fsrsState = Number(row.state ?? 0) as FsrsState;
  const base = fromFsrs(String(row.vocabulary_id), {
    due: new Date(String(row.due ?? new Date().toISOString())), stability: Number(row.stability ?? 0), difficulty: Number(row.difficulty ?? 0),
    elapsed_days: Number(row.elapsed_days ?? 0), scheduled_days: Number(row.scheduled_days ?? 0), learning_steps: Number(row.learning_steps ?? 0), reps: Number(row.reps ?? 0), lapses: Number(row.lapses ?? 0), state: fsrsState,
    ...(row.last_review ? { last_review: new Date(String(row.last_review)) } : {}),
  });
  return { ...base, confusions: Number(row.confusions ?? 0), suspended: status === "SUSPENDED" };
}

/** PostgREST returns at most 1000 rows per request; read every page. */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

type HistoryRow = { vocabulary_id: string; rating: number; reviewed_at: string; card_type: string; prev_state: string | null };
async function loadAccount(userId: string): Promise<SrsState> {
  const client = supabase!;
  const since = new Date(Date.now() - 365 * DAY).toISOString();
  const [fsrsRows, statusRows, historyRows, settings] = await Promise.all([
    readAll<FsrsRow>((from, to) => client.from("user_fsrs_state").select("vocabulary_id,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review,confusions").eq("user_id", userId).eq("dimension", "RECALL").order("vocabulary_id").range(from, to)),
    readAll<{ vocabulary_id: string; status: string }>((from, to) => client.from("user_vocabulary_state").select("vocabulary_id,status").eq("user_id", userId).order("vocabulary_id").range(from, to)),
    readAll<HistoryRow>((from, to) => client.from("review_history").select("vocabulary_id,rating,reviewed_at,card_type,prev_state:previous_state->>state").eq("user_id", userId).gte("reviewed_at", since).order("reviewed_at").order("id").range(from, to)),
    client.from("user_settings").select("daily_new_limit,daily_review_limit,session_size").eq("user_id", userId).maybeSingle(),
  ]);
  if (settings.error) throw settings.error;
  const statusById = new Map(statusRows.map((row) => [row.vocabulary_id, row.status]));
  const cards = Object.fromEntries(fsrsRows.map((row) => [row.vocabulary_id, databaseCard(row, statusById.get(row.vocabulary_id))]));
  const log: LogEntry[] = historyRows.map((row) => ({
    t: Date.parse(row.reviewed_at), id: row.vocabulary_id, rating: row.rating as Rating,
    ...(row.prev_state ? { prev: row.prev_state as CardState } : {}),
    ...(row.card_type === "DISCRIMINATION" ? { contrast: true, correct: row.rating > 1 } : {}),
  }));
  const initial = makeInitialState();
  return {
    ...initial, cards, log, hydrated: true,
    newPerDay: settings.data?.daily_new_limit ?? initial.newPerDay,
    dailyReviewLimit: settings.data?.daily_review_limit ?? initial.dailyReviewLimit,
    sessionSize: settings.data?.session_size ?? initial.sessionSize,
  };
}

/** Loads the guest or account state for `userId`, discarding the result if a newer load started. */
function load(userId: string | null) {
  const current = ++generation;
  accountUserId = userId;
  state = makeInitialState(); emit();
  const run = async () => {
    let next: SrsState;
    if (userId && supabase) {
      try { next = await loadAccount(userId); }
      catch (error) {
        console.error("Failed to load account review state", error);
        // Never continue with a blank state: a rating would overwrite saved progress in the database.
        next = { ...makeInitialState(), hydrated: true, loadError: "Could not load your saved progress. Reload the page to try again." };
      }
    } else {
      next = loadGuest();
    }
    if (current !== generation) return;
    state = next; emit();
  };
  loading = run();
  return loading;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (!supabase) { void load(null); return; }
  // INITIAL_SESSION fires immediately with the stored session, then on every sign-in/out.
  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user.id ?? null;
    // Token refreshes repeat the same user; only a different user needs a reload.
    if (loading && nextUserId === accountUserId) return;
    void load(nextUserId);
  });
}

const serverSnapshot = state;
export function useSrs(): SrsState {
  const snapshot = useSyncExternalStore((callback) => { listeners.add(callback); return () => listeners.delete(callback); }, () => state, () => serverSnapshot);
  useEffect(() => { start(); }, []);
  return snapshot;
}
export function getCard(id: string): CardMemory { return state.cards[id] ?? blankCard(id); }
export function retrievability(card: CardMemory, now = Date.now()) { return card.state === "new" ? 0 : scheduler.get_retrievability(toFsrs(card), new Date(now), false); }
export function nextMemory(card: CardMemory, rating: Rating, now = Date.now()): CardMemory { return fromFsrs(card.id, scheduler.next(toFsrs(card), new Date(now), rating as Grade).card, card); }
export function intervalLabel(ms: number) {
  const minutes = ms / 60_000; if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60; if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24; if (days < 30) return `${Math.round(days)}d`; if (days < 365) return `${(days / 30).toFixed(1)}mo`; return `${(days / 365).toFixed(1)}y`;
}
export const previewIntervals = (card: CardMemory, now = Date.now()) => ([1, 2, 3, 4] as Rating[]).map((rating) => ({ rating, label: intervalLabel(nextMemory(card, rating, now).due - now) }));
function accountStatus(card: CardMemory) {
  if (card.suspended) return "SUSPENDED";
  if (card.state === "review") return "REVIEW";
  if (card.state === "learning" || card.state === "relearning") return "LEARNING";
  return "NEW";
}
function fsrsPayload(userId: string, card: CardMemory) {
  return {
    user_id: userId, vocabulary_id: card.id, dimension: "RECALL", due: new Date(card.due).toISOString(), stability: card.stability,
    difficulty: card.difficulty, elapsed_days: card.elapsedDays, scheduled_days: card.scheduledDays, learning_steps: card.learningSteps,
    reps: card.reps, lapses: card.lapses, state: stateToFsrs[card.state], last_review: card.last ? new Date(card.last).toISOString() : null, confusions: card.confusions,
  };
}

// Writes run one after another so a fast second rating can never land before the first.
let writes: Promise<void> = Promise.resolve();
export const pendingWrites = () => writes;
function canSync(id: string) {
  // Bundled/offline words have numeric ids and no database row; a failed load must not overwrite saved data.
  return Boolean(supabase && accountUserId && !state.loadError && UUID.test(id));
}
function queueWrite(task: () => Promise<void>) {
  writes = writes.then(task).catch((error) => console.error("Failed to save review", error));
}
function syncRecall(userId: string, previous: CardMemory, current: CardMemory, rating: Rating, reviewedAt: number) {
  queueWrite(async () => {
    const client = supabase!;
    const results = await Promise.all([
      client.from("user_fsrs_state").upsert(fsrsPayload(userId, current), { onConflict: "user_id,vocabulary_id,dimension" }),
      client.from("user_vocabulary_state").upsert({ user_id: userId, vocabulary_id: current.id, status: accountStatus(current), recall_state: accountStatus(current) }, { onConflict: "user_id,vocabulary_id" }),
      client.from("review_history").insert({ user_id: userId, vocabulary_id: current.id, card_type: "RECALL", rating, reviewed_at: new Date(reviewedAt).toISOString(), previous_state: previous, new_state: current }),
    ]);
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;
  });
}
function syncContrast(userId: string, card: CardMemory, correct: boolean, reviewedAt: number) {
  queueWrite(async () => {
    const client = supabase!;
    const results = await Promise.all([
      client.from("review_history").insert({ user_id: userId, vocabulary_id: card.id, card_type: "DISCRIMINATION", rating: correct ? 3 : 1, reviewed_at: new Date(reviewedAt).toISOString(), new_state: card }),
      // Mix-up counts live on the recall row; only update it when that row exists.
      client.from("user_fsrs_state").update({ confusions: card.confusions }).eq("user_id", userId).eq("vocabulary_id", card.id).eq("dimension", "RECALL"),
    ]);
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;
  });
}
function saveSuspended(userId: string, card: CardMemory) {
  queueWrite(async () => {
    const { error } = await supabase!.from("user_vocabulary_state").upsert({ user_id: userId, vocabulary_id: card.id, status: accountStatus(card) }, { onConflict: "user_id,vocabulary_id" });
    if (error) throw error;
  });
}
export function rate(id: string, rating: Rating, now = Date.now()) {
  const previous = getCard(id); const next = nextMemory(previous, rating, now);
  const leech = previous.state === "review" && rating === 1 && next.lapses >= LEECH_THRESHOLD;
  const updated = { ...next, suspended: previous.suspended || leech };
  state = { ...state, cards: { ...state.cards, [id]: updated }, log: [...state.log, { t: now, id, rating, prev: previous.state }] }; persist(); emit();
  if (canSync(id)) syncRecall(accountUserId!, previous, updated, rating, now);
  return updated;
}
export function recordContrast(id: string, correct: boolean, now = Date.now()) {
  const current = getCard(id); const next = correct ? current : { ...current, confusions: current.confusions + 1 };
  state = { ...state, cards: { ...state.cards, [id]: next }, log: [...state.log, { t: now, id, rating: correct ? 3 : 1, contrast: true, correct }] }; persist(); emit();
  if (canSync(id)) syncContrast(accountUserId!, next, correct, now);
}
export function setSuspended(id: string, suspended: boolean) {
  const card = { ...getCard(id), suspended };
  state = { ...state, cards: { ...state.cards, [id]: card } }; persist(); emit();
  if (canSync(id)) saveSuspended(accountUserId!, card);
}
export function resetProgress() { state = { ...makeInitialState(), hydrated: true }; persist(); emit(); }
export function updateReviewSettings(newPerDay: number, dailyReviewLimit: number, sessionSize: number) { state = { ...state, newPerDay, dailyReviewLimit, sessionSize }; persist(); emit(); }
export function todayStart(now = Date.now()) { const date = new Date(now); date.setHours(4, 0, 0, 0); if (date.getTime() > now) date.setDate(date.getDate() - 1); return date.getTime(); }

const recallToday = (s: SrsState, now: number) => { const start = todayStart(now); return s.log.filter((entry) => !entry.contrast && entry.t >= start); };
/** Words seen for the first time since the 04:00 day boundary. */
export function introducedToday(s: SrsState, now = Date.now()) {
  const start = todayStart(now);
  const seenBefore = new Set(s.log.filter((entry) => !entry.contrast && entry.t < start).map((entry) => entry.id));
  // `prev` is exact; older browser entries without it fall back to "first time in the log".
  return new Set(recallToday(s, now).filter((entry) => entry.prev ? entry.prev === "new" : !seenBefore.has(entry.id)).map((entry) => entry.id)).size;
}
/** Due review cards already answered today; they count against `dailyReviewLimit`. */
export function reviewsDoneToday(s: SrsState, now = Date.now()) { return new Set(recallToday(s, now).filter((entry) => entry.prev === "review").map((entry) => entry.id)).size; }
export function newRemainingToday(s: SrsState, now = Date.now()) { return Math.max(0, s.newPerDay - introducedToday(s, now)); }

/** Learning/relearning cards due now (never capped) followed by due reviews within today's remaining review limit. */
export function dueCards(s: SrsState, now = Date.now()) {
  const eligible = Object.values(s.cards).filter((card) => !card.suspended && card.state !== "new" && card.due <= now);
  const learning = eligible.filter((card) => card.state === "learning" || card.state === "relearning").sort((a, b) => a.due - b.due);
  const reviewLimit = Math.max(0, s.dailyReviewLimit - reviewsDoneToday(s, now));
  const reviews = eligible.filter((card) => card.state === "review").sort((a, b) => a.due - b.due).slice(0, reviewLimit);
  return [...learning, ...reviews];
}
export function newCards(s: SrsState, now = Date.now(), catalogue: { id: string }[] = words) {
  return catalogue.filter((word) => !s.cards[word.id]).slice(0, newRemainingToday(s, now)).map((word) => blankCard(word.id));
}
export type SessionPlan = { ids: string[]; learning: number; review: number; fresh: number };
/**
 * One review session: due learning cards first (not limited by session size), then
 * new cards and due reviews up to `sessionSize`. Today and Review both use this so
 * the counts the learner sees are the cards the session will show.
 */
export function planSession(s: SrsState, catalogue: { id: string }[], now = Date.now()): SessionPlan {
  const known = new Set(catalogue.map((word) => word.id));
  const due = dueCards(s, now).filter((card) => known.has(card.id));
  const learning = due.filter((card) => card.state !== "review").map((card) => card.id);
  const reviews = due.filter((card) => card.state === "review").map((card) => card.id);
  const fresh = newCards(s, now, catalogue).map((card) => card.id);
  const capped = [...fresh, ...reviews].slice(0, s.sessionSize);
  const freshCount = capped.filter((id) => !s.cards[id]).length;
  return { ids: [...learning, ...capped], learning: learning.length, fresh: freshCount, review: capped.length - freshCount };
}
export function reviewedToday(s: SrsState, now = Date.now()) { return new Set(recallToday(s, now).map((entry) => entry.id)).size; }
export function streak(s: SrsState, now = Date.now()) { const start = todayStart(now); const days = new Set(s.log.map((entry) => Math.floor((entry.t - start) / DAY))); let total = 0; let day = days.has(0) ? 0 : -1; while (days.has(day)) { total++; day--; } return total; }
export function stats(s: SrsState, now = Date.now()) {
  const all = Object.values(s.cards).filter((card) => !card.suspended);
  const learned = all.filter((card) => card.state === "review" && card.scheduledDays >= 7).length;
  const learning = all.filter((card) => card.state === "learning" || card.state === "relearning" || (card.state === "review" && card.scheduledDays < 7)).length;
  const difficult = all.filter((card) => card.difficulty >= 7 || card.lapses >= 2 || card.confusions >= 2).sort((a, b) => (b.difficulty + b.lapses + b.confusions) - (a.difficulty + a.lapses + a.confusions));
  const upcoming = all.filter((card) => card.state !== "new" && card.due > now).sort((a, b) => a.due - b.due);
  const history = Array.from({ length: 14 }, (_, index) => { const start = todayStart(now) - (13 - index) * DAY; const entries = s.log.filter((entry) => entry.t >= start && entry.t < start + DAY && !entry.contrast); return { day: new Date(start), count: entries.length, again: entries.filter((entry) => entry.rating === 1).length }; });
  const forecast = Array.from({ length: 7 }, (_, index) => { const start = todayStart(now) + index * DAY; return { day: new Date(start), count: all.filter((card) => card.state !== "new" && card.due >= start && card.due < start + DAY).length }; });
  const recent = s.log.filter((entry) => !entry.contrast && entry.t > now - 30 * DAY);
  const retention = recent.length ? Math.round((recent.filter((entry) => entry.rating > 1).length / recent.length) * 100) : 0;
  return { total: all.length, learned, learning, difficult, upcoming, history, forecast, retention };
}

/** Day buckets (04:00 boundary) of recall reviews from `fromDay` to `toDay` inclusive; both are day-start timestamps. */
export function historyRange(s: SrsState, fromDay: number, toDay: number) {
  const days = Math.max(1, Math.round((toDay - fromDay) / DAY) + 1);
  const buckets = Array.from({ length: days }, (_, index) => ({ day: new Date(fromDay + index * DAY), count: 0, again: 0, fresh: 0 }));
  for (const entry of s.log) {
    if (entry.contrast) continue;
    const bucket = buckets[Math.floor((entry.t - fromDay) / DAY)];
    if (!bucket || entry.t < fromDay) continue;
    bucket.count++;
    if (entry.rating === 1) bucket.again++;
    if (entry.prev === "new") bucket.fresh++;
  }
  return buckets;
}
/** Reviews due per day for `days` days from today; overdue cards count toward today. */
export function forecastRange(s: SrsState, now: number, days: number) {
  const today = todayStart(now);
  const buckets = Array.from({ length: days }, (_, index) => ({ day: new Date(today + index * DAY), count: 0 }));
  for (const card of Object.values(s.cards)) {
    if (card.suspended || card.state === "new") continue;
    const bucket = buckets[Math.max(0, Math.floor((card.due - today) / DAY))];
    if (bucket) bucket.count++;
  }
  return buckets;
}
/** Summary of recall and contrast reviews with `fromDay <= t < toExclusive`. */
export function periodStats(s: SrsState, fromDay: number, toExclusive: number) {
  const entries = s.log.filter((entry) => entry.t >= fromDay && entry.t < toExclusive);
  const recall = entries.filter((entry) => !entry.contrast);
  const contrast = entries.filter((entry) => entry.contrast);
  const activeDays = new Set(entries.map((entry) => Math.floor((entry.t - fromDay) / DAY))).size;
  const passed = recall.filter((entry) => entry.rating > 1).length;
  return {
    reviews: recall.length,
    again: recall.length - passed,
    accuracy: recall.length ? Math.round((passed / recall.length) * 100) : null,
    activeDays,
    newWords: recall.filter((entry) => entry.prev === "new").length,
    contrastTotal: contrast.length,
    contrastCorrect: contrast.filter((entry) => entry.correct).length,
  };
}
export function firstReviewDay(s: SrsState, now = Date.now()) { return s.log.length ? todayStart(s.log.reduce((min, entry) => Math.min(min, entry.t), Infinity)) : todayStart(now); }
