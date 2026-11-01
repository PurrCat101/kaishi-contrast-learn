import { useQuery } from "@tanstack/react-query";
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

async function fetchCatalog(): Promise<CatalogWord[]> {
  if (!supabase) return bundledCatalog;
  const result: VocabularyRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("vocabulary")
      // Relations have two foreign keys back to vocabulary. Select the source
      // side explicitly so PostgREST does not reject the embedded query.
      .select("id,id_number,word,meaning,notes,pitch_accent_raw,pitch_accent_notes,frequency,vocabulary_readings(reading,is_primary),vocabulary_examples(sentence,translation,furigana,sort_order),vocabulary_media(role,sort_order,media_assets(storage_bucket,storage_path,mime_type,status)),vocabulary_relations!vocabulary_relations_vocabulary_id_fkey(relation_type,related_vocabulary_id)")
      .order("id_number")
      .range(start, start + 999);
    if (error) throw error;
    result.push(...(data as unknown as VocabularyRow[]));
    if (!data || data.length < 1000) break;
  }
  return result.length ? result.map(toWord) : bundledCatalog;
}

/** Shared vocabulary catalogue. Imported Supabase data wins; bundled data remains an offline fallback. */
export function useVocabularyCatalog() {
  return useQuery({
    queryKey: ["vocabulary-catalog"],
    queryFn: fetchCatalog,
    // Placeholder data must not mark the query fresh; initialData did, which
    // prevented the database catalogue from loading for five minutes.
    placeholderData: bundledCatalog,
    enabled: isSupabaseConfigured,
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
