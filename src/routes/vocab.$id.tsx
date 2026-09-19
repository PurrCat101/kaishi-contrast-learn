import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, BookmarkCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AudioButton, Button, Card, Eyebrow, Furigana, Illustration, Tag, WordChip } from "@/components/ui-kit";
import { removeWord, saveWord, updateNote, useLibrary } from "@/lib/library";
import { getCard, intervalLabel, retrievability, useSrs } from "@/lib/srs";
import { getWord, related, type Word } from "@/lib/vocab";

export const Route = createFileRoute("/vocab/$id")({
  loader: ({ params }) => {
    const w = getWord(Number(params.id));
    if (!w) throw notFound();
    return { w };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Word not found — Hashi" }, { name: "robots", content: "noindex" }] };
    const { w } = loaderData;
    const t = `${w.word}（${w.reading}）— ${w.meaning} · Hashi`;
    return {
      meta: [
        { title: t },
        { name: "description", content: `${w.word} (${w.reading}) means "${w.meaning}". Example: ${w.sentence} Related and commonly confused words.` },
        { property: "og:title", content: t },
        { property: "og:description", content: `${w.word} (${w.reading}) — ${w.meaning}. Homophones, look-alikes, and notes.` },
      ],
    };
  },
  component: Detail,
});

function Detail() {
  const { w } = Route.useLoaderData();
  useSrs();
  const library = useLibrary();
  const saved = Boolean(library[w.id]);
  const [note, setNote] = useState(() => library[w.id]?.note ?? "");
  useEffect(() => { setNote(library[w.id]?.note ?? ""); }, [library, w.id]);
  const c = getCard(w.id);
  const rel = related(w);
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
            <AudioButton text={w.word} size="md" />
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
            {saved && <span className="text-sm text-muted-foreground">Your collection is stored in this browser.</span>}
          </div>

          <div className="mt-8 rounded-lg border-2 border-border bg-background p-5">
            <Eyebrow>Example</Eyebrow>
            <div className="mt-3 flex items-start justify-between gap-4">
              <Furigana text={w.sentenceFurigana || w.sentence} className="text-2xl leading-loose text-foreground" />
              <AudioButton text={w.sentence} />
            </div>
            <p className="mt-2 text-body">{w.sentenceEn}</p>
          </div>

          {w.notes && (
            <div className="mt-6 rounded-lg border-2 border-border bg-secondary p-5">
              <Eyebrow className="text-foreground/70">Notes</Eyebrow>
              <p className="mt-2 whitespace-pre-line text-body">{w.notes}</p>
            </div>
          )}

          {saved && (
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
          <Illustration w={w} className="w-full" />
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
        <Group title="Homophones" hint="Same sound, different word" tone="accent" list={rel.homophones} />
        <Group title="Commonly confused" hint="Shares a kanji or looks alike" tone="secondary" list={rel.sharedKanji} />
        <Group title="Similar meanings" hint="Easy to swap in translation" tone="info" list={rel.similarMeaning} />
        <Group title="Antonyms" hint="Learn them as a pair" tone="mint" list={rel.antonyms} />
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

function Group({ title, hint, tone, list }: { title: string; hint: string; tone: "accent" | "secondary" | "info" | "mint"; list: Word[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl">{title}</h2>
        <Tag tone={tone}>{list.length}</Tag>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-4 space-y-2">
        {list.length === 0 ? (
          <p className="rounded-md border-2 border-dashed border-border/40 p-3 text-center font-mono text-xs text-muted-foreground">none in this deck</p>
        ) : (
          list.map((x) => <WordChip key={x.id} w={x} />)
        )}
      </div>
    </Card>
  );
}
