import { useEffect, useSyncExternalStore } from "react";
import { getWord } from "./vocab";
import { supabase } from "./supabase";

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

function getUserLibrarySource() {
  if (!supabase) return null;
  return supabase.auth.getUser();
}

async function getAuthenticatedUserId() {
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

async function lookupVocabularyIdForWord(wordId: number) {
  const word = getWord(wordId);
  if (!word || !supabase) return null;
  const { data, error } = await supabase
    .from("vocabulary")
    .select("id")
    .eq("word", word.word)
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0]?.id as string | null;
}

async function hydrateRemoteLibrary() {
  if (!supabase) return;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    state = {};
    emit();
    return;
  }

  const { data: savedRows, error: savedError } = await supabase
    .from("user_vocabulary")
    .select("vocabulary_id, added_at")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (savedError) {
    console.error("Failed to load user vocabulary", savedError);
    return;
  }

  const vocabularyIds = (savedRows ?? []).map((row) => row.vocabulary_id);
  if (vocabularyIds.length === 0) {
    state = {};
    persist();
    emit();
    return;
  }

  const { data: vocabularyRows, error: vocabularyError } = await supabase
    .from("vocabulary")
    .select("id, word")
    .in("id", vocabularyIds);

  if (vocabularyError) {
    console.error("Failed to resolve vocabulary rows", vocabularyError);
    return;
  }

  const { data: notesRows, error: notesError } = await supabase
    .from("user_notes")
    .select("vocabulary_id, content")
    .eq("user_id", userId)
    .in("vocabulary_id", vocabularyIds);

  if (notesError) {
    console.error("Failed to load user notes", notesError);
  }

  const noteMap = new Map<string, string>();
  for (const row of notesRows ?? []) {
    noteMap.set(row.vocabulary_id, row.content ?? "");
  }

  const nextState: LibraryState = {};
  for (const row of savedRows ?? []) {
    const vocab = (vocabularyRows ?? []).find((item) => item.id === row.vocabulary_id);
    const localWord = vocab ? Array.from({ length: 1500 }, (_, index) => index).find((index) => getWord(index)?.word === vocab.word) : undefined;
    if (localWord === undefined) continue;

    nextState[localWord] = {
      addedAt: Date.parse((row.added_at as string | null) ?? new Date().toISOString()),
      note: noteMap.get(row.vocabulary_id) ?? "",
    };
  }

  state = nextState;
  persist();
  emit();
}

async function syncRemoteLibraryState() {
  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;
  await hydrateRemoteLibrary();
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
  void syncRemoteLibraryState();
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

export async function saveWord(id: number) {
  if (!state[id]) state = { ...state, [id]: { addedAt: Date.now(), note: "" } };
  persist();
  emit();

  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const vocabularyId = await lookupVocabularyIdForWord(id);
  if (!vocabularyId) return;

  const payload = { user_id: userId, vocabulary_id: vocabularyId, is_active: true, is_suspended: false };
  const { error } = await supabase.from("user_vocabulary").upsert(payload, { onConflict: "user_id,vocabulary_id" });
  if (error) {
    console.error("Failed to save user vocabulary", error);
  }
}

export async function removeWord(id: number) {
  if (!state[id]) return;
  const next = { ...state };
  delete next[id];
  state = next;
  persist();
  emit();

  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const vocabularyId = await lookupVocabularyIdForWord(id);
  if (!vocabularyId) return;

  const { error: vocabError } = await supabase
    .from("user_vocabulary")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("vocabulary_id", vocabularyId);

  const { error: noteError } = await supabase
    .from("user_notes")
    .delete()
    .eq("user_id", userId)
    .eq("vocabulary_id", vocabularyId);

  if (vocabError) console.error("Failed to remove word from user_vocabulary", vocabError);
  if (noteError) console.error("Failed to remove note from user_notes", noteError);
}

export async function updateNote(id: number, note: string) {
  if (!state[id]) return;
  state = { ...state, [id]: { ...state[id], note } };
  persist();
  emit();

  if (!supabase) return;
  const userId = await getAuthenticatedUserId();
  if (!userId) return;

  const vocabularyId = await lookupVocabularyIdForWord(id);
  if (!vocabularyId) return;

  const { error } = await supabase
    .from("user_notes")
    .upsert(
      {
        user_id: userId,
        vocabulary_id: vocabularyId,
        content: note,
      },
      { onConflict: "user_id,vocabulary_id" },
    );

  if (error) {
    console.error("Failed to sync note", error);
  }
}