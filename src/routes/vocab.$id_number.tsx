import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, BookmarkCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AudioButton, Button, Card, Eyebrow, Furigana, Tag, WordChip } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { removeWord, saveWord, updateNote, useLibrary } from "@/lib/library";
import { getCard, intervalLabel, retrievability, useSrs } from "@/lib/srs";
import { useAuth } from "@/lib/auth";
import { antonymSpellingsOf, type Word } from "@/lib/vocab";
import { signedMediaUrl, useVocabularyBySpelling, useVocabularyWord, useVocabularyWords } from "@/lib/vocabulary-catalog";

export const Route = createFileRoute("/vocab/$id_number")({
  head: () => ({ meta: [{ title: "Vocabulary — Hashi" }] }),
  component: Detail,
});

function Detail() {
  const { id_number } = Route.useParams();
  const { data: w, isPending, isError, refetch } = useVocabularyWord(Number(id_number));
  const relatedIds = w ? [...new Set([...w.homophones, ...w.sharedKanji, ...w.similarMeaning])] : [];
  const related = useVocabularyWords(relatedIds, Boolean(w));
  const antonymWords = useVocabularyBySpelling(w ? antonymSpellingsOf(w.word) : [], Boolean(w));
  useSrs();
  const library = useLibrary();
  const { session } = useAuth();
  const [note, setNote] = useState("");
  const [wordAudio, setWordAudio] = useState<string>();
  const [sentenceAudio, setSentenceAudio] = useState<string>();
  useEffect(() => {
    if (!w) return;
    setNote(library[w.id]?.note ?? "");
    void Promise.all([signedMediaUrl(w, "WORD_AUDIO"), signedMediaUrl(w, "SENTENCE_AUDIO")]).then(([wordUrl, sentenceUrl]) => {
      setWordAudio(wordUrl); setSentenceAudio(sentenceUrl);
    });
  }, [library, w]);

  if (!w) {
    if (isPending) {
      return (
        <div className="space-y-8">
          <Link to="/vocab" className="inline-flex items-center gap-2 font-mono text-sm text-muted-foreground no-underline hover:text-foreground">
            <ArrowLeft className="size-4" /> All words
          </Link>
          <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Card className="p-8 md:p-10 space-y-6">
              <div className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-8 w-32" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
              </div>
              <Skeleton className="h-12 w-40" />
            </Card>
            <Card className="p-6 space-y-4">
              <Skeleton className="h-40 w-full" />
            </Card>
          </section>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <Link to="/vocab" className="font-mono text-sm text-muted-foreground">← All words</Link>
        <p className="card-hard p-6 text-body">
          {isError ? "This word didn't load." : "This vocabulary entry was not found."}
          {isError && <Button className="ml-3" onClick={() => void refetch()}>Try again</Button>}
        </p>
      </div>
    );
  }

  const saved = Boolean(library[w.id]);
  const c = getCard(w.id);
  // Related words are fetched by id, so a stale previous word's list must not be shown for this one.
  const relatedLoading = related.isPending || related.isPlaceholderData || antonymWords.isPending || antonymWords.isPlaceholderData;
  const relatedError = (related.isError || antonymWords.isError) && !relatedLoading;
  const pick = (ids: string[], pool: Word[] | undefined) => {
    const lookup = new Map((pool ?? []).map((word) => [word.id, word]));
    return ids.map((id) => lookup.get(id)).filter((word): word is Word => Boolean(word) && word!.id !== w.id);
  };
  const rel = {
    homophones: pick(w.homophones, related.data),
    sharedKanji: pick(w.sharedKanji, related.data),
    similarMeaning: pick(w.similarMeaning, related.data),
    antonyms: (antonymWords.data ?? []).filter((word) => word.id !== w.id),
  };
  const retryRelated = () => { void related.refetch(); void antonymWords.refetch(); };
  const now = Date.now();
  const r = Math.round(retrievability(c, now) * 100);

  return (
    <div className="space-y-8">
      <Link to="/vocab" className="inline-flex items-center gap-2 font-mono text-sm text-muted-foreground no-underline hover:text-foreground">
        <ArrowLeft className="size-4" /> All words
      </Link>

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-8 md:p-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p lang="ja" className="font-jp text-2xl text-muted-foreground">{w.reading}</p>
              <h1 lang="ja" className="text-jp-display mt-1 text-7xl md:text-8xl">{w.word}</h1>
              <p className="mt-4 text-2xl text-foreground">{w.meaning}</p>
            </div>
            <AudioButton text={w.word} src={wordAudio} size="md" />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {w.pitch && <Tag tone="info">Pitch {w.pitch}</Tag>}
            {w.freq && <Tag>Freq #{w.freq}</Tag>}
            {rel.homophones.length > 0 && <Tag tone="accent">Homophone</Tag>}
            {c.confusions >= 2 && <Tag tone="destructive">Often confused</Tag>}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              variant={saved ? "secondary" : "primary"}
              onClick={() => saved ? removeWord(w.id) : saveWord(w.id)}
            >
              {saved ? <BookmarkCheck className="size-5" /> : <Bookmark className="size-5" />}
              {saved ? "Saved to My Words" : "Add to My Words"}
            </Button>
            {saved && <span className="text-sm text-muted-foreground">Your collection is saved in this browser. Account sync for My Words is not available yet.</span>}
          </div>

          <div className="mt-8 rounded-lg border-2 border-border bg-background p-5">
            <Eyebrow>Example</Eyebrow>
            <div className="mt-3 flex items-start justify-between gap-4">
              <Furigana text={w.sentenceFurigana || w.sentence} className="text-2xl leading-loose text-foreground" />
              <AudioButton text={w.sentence} src={sentenceAudio} />
            </div>
            <p className="mt-2 text-body">{w.sentenceEn}</p>
          </div>

          {w.notes && (
            <div className="mt-6 rounded-lg border-2 border-border bg-secondary p-5">
              <Eyebrow className="text-foreground/70">Notes</Eyebrow>
              <p className="mt-2 whitespace-pre-line text-body">{w.notes}</p>
            </div>
          )}

          {saved && session && (
            <div className="mt-6 rounded-lg border-2 border-border bg-info p-5">
              <Eyebrow>My note</Eyebrow>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onBlur={() => updateNote(w.id, note)}
                placeholder="Add a memory hook, distinction, or example..."
                rows={4}
                className="mt-3 w-full resize-y rounded-md border-2 border-border bg-card p-3 text-body outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-2 font-mono text-xs text-muted-foreground">Saved when you leave the field.</p>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <Eyebrow>Memory</Eyebrow>
            <dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm">
              <Row k="State" v={c.state} />
              <Row k="Recall now" v={c.state === "new" ? "—" : `${r}%`} />
              <Row k="Stability" v={c.state === "new" ? "—" : `${c.stability}d`} />
              <Row k="Difficulty" v={c.difficulty.toFixed(1)} />
              <Row k="Reviews" v={String(c.reps)} />
              <Row k="Lapses" v={String(c.lapses)} />
              <Row k="Next due" v={c.state === "new" ? "not started" : c.due <= now ? "now" : `in ${intervalLabel(c.due - now)}`} />
              <Row k="Confusions" v={String(c.confusions)} />
            </dl>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Group title="Homophones" hint="Same sound, different word" tone="accent" list={rel.homophones} loading={relatedLoading} error={relatedError} onRetry={retryRelated} />
        <Group title="Commonly confused" hint="Shares a kanji or looks alike" tone="secondary" list={rel.sharedKanji} loading={relatedLoading} error={relatedError} onRetry={retryRelated} />
        <Group title="Similar meanings" hint="Easy to swap in translation" tone="info" list={rel.similarMeaning} loading={relatedLoading} error={relatedError} onRetry={retryRelated} />
        <Group title="Antonyms" hint="Learn them as a pair" tone="mint" list={rel.antonyms} loading={relatedLoading} error={relatedError} onRetry={retryRelated} />
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed border-border/40 pb-1">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-semibold text-foreground">{v}</dd>
    </div>
  );
}

function Group({ title, hint, tone, list, loading, error, onRetry }: { title: string; hint: string; tone: "accent" | "secondary" | "info" | "mint"; list: Word[]; loading: boolean; error: boolean; onRetry: () => void }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl">{title}</h2>
        {loading ? <Skeleton className="h-6 w-8 rounded-full" /> : <Tag tone={tone}>{list.length}</Tag>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-4 space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </>
        ) : error ? (
          <p className="rounded-md border-2 border-dashed border-border/40 p-3 text-center font-mono text-xs text-muted-foreground">
            couldn't load · <button onClick={onRetry} className="underline">retry</button>
          </p>
        ) : list.length === 0 ? (
          <p className="rounded-md border-2 border-dashed border-border/40 p-3 text-center font-mono text-xs text-muted-foreground">none in this deck</p>
        ) : (
          list.map((x) => <WordChip key={x.id} w={x} />)
        )}
      </div>
    </Card>
  );
}
