import { useEffect, useSyncExternalStore } from "react";

export type PersonalWord = {
  addedAt: number;
  note: string;
};

export type LibraryState = Record<number, PersonalWord>;

const KEY = "kaishi-contrast-library-v1";
let state: LibraryState = {};
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const serverSnapshot: LibraryState = {};

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Browser storage is optional; the in-memory collection still works.
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw) as LibraryState;
  } catch {
    state = {};
  }
  emit();
}

export function useLibrary() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => serverSnapshot,
  );
  useEffect(() => { hydrate(); }, []);
  return snapshot;
}

export function isSaved(id: number) {
  return Boolean(state[id]);
}

export function saveWord(id: number) {
  if (!state[id]) state = { ...state, [id]: { addedAt: Date.now(), note: "" } };
  persist();
  emit();
}

export function removeWord(id: number) {
  if (!state[id]) return;
  const next = { ...state };
  delete next[id];
  state = next;
  persist();
  emit();
}

export function updateNote(id: number, note: string) {
  if (!state[id]) return;
  state = { ...state, [id]: { ...state[id], note } };
  persist();
  emit();
}