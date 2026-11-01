import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "./supabase";
import { words as bundledWords, type Word } from "./vocab";

type MediaAsset = { storage_bucket: string; storage_path: string; mime_type: string; status: string };
type VocabularyRow = {
  id: string; id_number: number; word: string; meaning: string | null; notes: string | null;
  pitch_accent_raw: string | null; pitch_accent_notes: string | null; frequency: number | null;
  vocabulary_readings: { reading: string; is_primary: boolean }[] | null;
  vocabulary_examples: { sentence: string; translation: string | null; furigana: string | null; sort_order: number }[] | null;
  vocabulary_media: { role: "WORD_AUDIO" | "SENTENCE_AUDIO" | "PICTURE" | "OTHER"; sort_order: number; media_assets: MediaAsset | null }[] | null;
  vocabulary_relations: { relation_type: string; related_vocabulary_id: string }[] | null;
};

export type CatalogWord = Word & { media: { role: string; asset: MediaAsset }[] };
export const bundledCatalog: CatalogWord[] = bundledWords.map((word) => ({ ...word, media: [] }));

/** The APKG stores display markup in text fields; UI cards need plain text. */
function plainText(value: string | null | undefined) {
  if (!value) return "";
  const withLineBreaks = value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, "\n");
  if (typeof document !== "undefined") {
    const container = document.createElement("div");
    container.innerHTML = withLineBreaks;
    return (container.textContent ?? "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }
  return withLineBreaks.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").trim();
}

function toWord(row: VocabularyRow): CatalogWord {
  const reading = [...(row.vocabulary_readings ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]?.reading ?? "";
  const example = [...(row.vocabulary_examples ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  const relationIds = (type: string) => (row.vocabulary_relations ?? []).filter((relation) => relation.relation_type === type).map((relation) => relation.related_vocabulary_id);
  return {
    id: row.id, idNumber: row.id_number, word: plainText(row.word), reading: plainText(reading), meaning: plainText(row.meaning), sentence: plainText(example?.sentence),
    sentenceEn: plainText(example?.translation), sentenceFurigana: plainText(example?.furigana), notes: plainText(row.notes),
    pitch: plainText(row.pitch_accent_raw ?? row.pitch_accent_notes), freq: row.frequency, imageAlt: row.word,
    homophones: relationIds("HOMOPHONE"), sharedKanji: relationIds("SAME_KANJI"),
    similarMeaning: [...relationIds("SIMILAR_MEANING"), ...relationIds("EASILY_CONFUSED")],
    media: (row.vocabulary_media ?? []).filter((media) => media.media_assets?.status === "uploaded").sort((a, b) => a.sort_order - b.sort_order).flatMap((media) => media.media_assets ? [{ role: media.role, asset: media.media_assets }] : []),
  };
}

const FULL_SELECT = "id,id_number,word,meaning,notes,pitch_accent_raw,pitch_accent_notes,frequency,vocabulary_readings(reading,is_primary),vocabulary_examples(sentence,translation,furigana,sort_order),vocabulary_media(role,sort_order,media_assets(storage_bucket,storage_path,mime_type,status)),vocabulary_relations!vocabulary_relations_vocabulary_id_fkey(relation_type,related_vocabulary_id)";

async function fetchCatalog(): Promise<CatalogWord[]> {
  if (!supabase) return bundledCatalog;
  const result: VocabularyRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("vocabulary")
      // Relations have two foreign keys back to vocabulary. Select the source
      // side explicitly so PostgREST does not reject the embedded query.
      .select(FULL_SELECT)
      .order("id_number")
      .range(start, start + 999);
    if (error) throw error;
    result.push(...(data as unknown as VocabularyRow[]));
    if (!data || data.length < 1000) break;
  }
  return result.length ? result.map(toWord) : bundledCatalog;
}

type CatalogPage = { words: CatalogWord[]; total: number };

/** Fetches just one page with the few columns the word list renders. */
async function fetchCatalogPage(page: number, pageSize: number): Promise<CatalogPage> {
  const fallback = () => ({ words: bundledCatalog.slice((page - 1) * pageSize, page * pageSize), total: bundledCatalog.length });
  if (!supabase) return fallback();
  const start = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("vocabulary")
    .select("id,id_number,word,meaning,vocabulary_readings(reading,is_primary)", { count: "exact" })
    .order("id_number")
    .range(start, start + pageSize - 1);
  if (error) throw error;
  if (!count) return fallback();
  return { words: (data as unknown as VocabularyRow[]).map(toWord), total: count };
}

/** One page of the catalogue, fetched on demand. Use for unfiltered browsing; searches need the full catalogue. */
export function useVocabularyCatalogPage(page: number, pageSize: number, enabled = true) {
  return useQuery({
    queryKey: ["vocabulary-catalog-page", page, pageSize],
    queryFn: () => fetchCatalogPage(page, pageSize),
    placeholderData: keepPreviousData,
    enabled: isSupabaseConfigured && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fetchWordsByIds(ids: string[]): Promise<CatalogWord[]> {
  const bundled = bundledCatalog.filter((word) => ids.includes(word.id));
  const remoteIds = ids.filter((id) => UUID.test(id));
  if (!supabase || !remoteIds.length) return bundled;
  const chunks: string[][] = [];
  for (let i = 0; i < remoteIds.length; i += 100) chunks.push(remoteIds.slice(i, i + 100));
  const rows = await Promise.all(chunks.map(async (chunk) => {
    const { data, error } = await supabase!
      .from("vocabulary")
      .select("id,id_number,word,meaning,vocabulary_readings(reading,is_primary)")
      .in("id", chunk);
    if (error) throw error;
    return data as unknown as VocabularyRow[];
  }));
  return [...bundled, ...rows.flat().map(toWord)];
}

/** Only the given words, with the columns a word chip needs. Much cheaper than the full catalogue. */
export function useVocabularyWords(ids: string[], enabled = true) {
  const key = [...ids].sort();
  return useQuery({
    queryKey: ["vocabulary-words", key],
    queryFn: () => fetchWordsByIds(key),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

async function fetchWordByNumber(idNumber: number): Promise<CatalogWord | null> {
  const bundled = bundledCatalog.find((word) => word.idNumber === idNumber) ?? null;
  if (!supabase) return bundled;
  const { data, error } = await supabase.from("vocabulary").select(FULL_SELECT).eq("id_number", idNumber).maybeSingle();
  if (error) throw error;
  return data ? toWord(data as unknown as VocabularyRow) : bundled;
}

/** One word with its media and relation ids. The detail page needs this, not the whole catalogue. */
export function useVocabularyWord(idNumber: number) {
  return useQuery({
    queryKey: ["vocabulary-word", idNumber],
    queryFn: () => fetchWordByNumber(idNumber),
    enabled: Number.isFinite(idNumber),
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

async function fetchWordsBySpelling(spellings: string[]): Promise<CatalogWord[]> {
  const bundled = bundledCatalog.filter((word) => spellings.includes(word.word));
  if (!supabase || !spellings.length) return bundled;
  const { data, error } = await supabase
    .from("vocabulary")
    .select("id,id_number,word,meaning,vocabulary_readings(reading,is_primary)")
    .in("word", spellings);
  if (error) throw error;
  const remote = (data as unknown as VocabularyRow[]).map(toWord);
  return remote.length ? remote : bundled;
}

/** Words looked up by spelling (used for antonym pairs, which are defined by spelling). */
export function useVocabularyBySpelling(spellings: string[], enabled = true) {
  const key = [...spellings].sort();
  return useQuery({
    queryKey: ["vocabulary-spelling", key],
    queryFn: () => fetchWordsBySpelling(key),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

/** Shared vocabulary catalogue. Imported Supabase data wins; bundled data remains an offline fallback. */
export function useVocabularyCatalog(enabled = true) {
  return useQuery({
    queryKey: ["vocabulary-catalog"],
    queryFn: fetchCatalog,
    placeholderData: bundledCatalog,
    enabled: isSupabaseConfigured && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export async function signedMediaUrl(word: CatalogWord, role: "WORD_AUDIO" | "SENTENCE_AUDIO" | "PICTURE") {
  const asset = word.media.find((media) => media.role === role)?.asset;
  if (!asset || !supabase) return undefined;
  const { data, error } = await supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 60);
  if (error) {
    console.warn(`Unable to create a signed URL for ${role}`, error);
    return undefined;
  }
  return data.signedUrl;
}
