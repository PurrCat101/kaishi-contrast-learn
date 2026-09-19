import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AudioButton, Button, Card, Eyebrow, Furigana, Illustration, ProgressBar, Tag } from "@/components/ui-kit";
import {
  RATING_LABEL,
  blankCard,
  dueCards,
  getCard,
  newCards,
  previewIntervals,
  rate,
  recordContrast,
  useSrs,
  type Rating,
} from "@/lib/srs";
import { confusablesOf, getWord, type Word } from "@/lib/vocab";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review Session — Hashi" },
      { name: "description", content: "Work through today's Japanese vocabulary queue with reveal cards and contrast checks for words you mix up." },
      { property: "og:title", content: "Review Session — Hashi" },
      { property: "og:description", content: "Reveal, rate, and untangle confusable Japanese words one card at a time." },
    ],
  }),
  component: Review,
});

type Step = { id: number; contrast: boolean };

function Review() {
  const s = useSrs();
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [tally, setTally] = useState({ done: 0, again: 0, confused: 0 });

  // Queue is built once per session from the store snapshot.
  const queue = useMemo<Step[]>(() => {
    const due = dueCards(s).map((c) => c.id);
    const fresh = newCards(s).map((c) => c.id);
    const ids = [...fresh.slice(0, 4), ...due, ...fresh.slice(4)].slice(0, 30);
    return ids.map((id) => ({ id, contrast: !!confusablesOf(getWord(id)!) && Math.random() < 0.55 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = queue[i];
  const word = step ? getWord(step.id) : undefined;

  const advance = () => {
    setRevealed(false);
    setPick(null);
    setI((n) => n + 1);
  };

  if (!step || !word) return <Summary tally={tally} total={queue.length} />;

  const card = getCard(step.id);
  const conf = confusablesOf(word);

  const onRate = (r: Rating) => {
    rate(word.id, r);
    setTally((t) => ({ ...t, done: t.done + 1, again: t.again + (r === 1 ? 1 : 0) }));
    advance();
  };

  const onPick = (w: Word) => {
    if (pick !== null) return;
    setPick(w.id);
    const correct = w.id === word.id;
    recordContrast(word.id, correct);
    setTally((t) => ({ ...t, confused: t.confused + (correct ? 0 : 1) }));
  };

  const options = conf ? shuffle([word, ...conf.words.slice(0, 2)], word.id) : [word];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eyebrow>Card {i + 1} of {queue.length}</Eyebrow>
            {card.state === "new" && <Tag tone="mint">New</Tag>}
            {step.contrast && conf && <Tag tone="accent">Contrast · {conf.kind}</Tag>}
          </div>
          <Link to="/" className="font-mono text-sm text-muted-foreground no-underline hover:text-foreground">End session</Link>
        </div>
        <ProgressBar value={i} max={queue.length} />
      </header>

      {step.contrast && conf ? (
        <Card className="p-6 text-center md:p-10">
          <Eyebrow>Which word means this?</Eyebrow>
          <p className="mt-2 text-3xl md:text-4xl">{word.meaning}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <span lang="ja" className="font-jp text-xl text-muted-foreground">reading: {word.reading}</span>
            <AudioButton text={word.word} />
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {options.map((o) => {
              const chosen = pick === o.id;
              const right = o.id === word.id;
              const show = pick !== null;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onPick(o)}
                  disabled={show}
                  className={[
                    "card-hard pressable-sm flex flex-col items-center gap-2 p-6 text-center disabled:pointer-events-none",
                    show && right ? "bg-mint text-mint-foreground" : "",
                    show && chosen && !right ? "bg-destructive text-destructive-foreground" : "",
                    show && !right && !chosen ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <span lang="ja" className="text-jp-display text-5xl">{o.word}</span>
                  {show && <span className="text-sm font-semibold">{o.meaning}</span>}
                  {show && right && <Check className="size-5" />}
                  {show && chosen && !right && <X className="size-5" />}
                </button>
              );
            })}
          </div>

          {pick !== null && (
              <div className="mt-6 space-y-4 text-left">
              <div className="rounded-lg border-2 border-border bg-secondary p-5">
                <Eyebrow className="text-foreground/70">Tell them apart</Eyebrow>
                <p className="mt-2 whitespace-pre-line text-body">{word.notes || `${word.word} = ${word.meaning}.`}</p>
                <ul className="mt-3 space-y-1">
                  {conf.words.map((x) => (
                    <li key={x.id} className="font-mono text-sm text-body">
                      <span lang="ja" className="font-jp text-base">{x.word}（{x.reading}）</span> — {x.meaning}
                    </li>
                  ))}
                </ul>
              </div>
              <Button size="lg" className="mx-auto" onClick={advance}>Continue <ArrowRight className="size-5" /></Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6 text-center md:p-10">
          <div className="mx-auto max-w-3xl">
            <h1 lang="ja" className="text-jp-display text-6xl md:text-8xl">{word.word}</h1>
            {revealed && <p lang="ja" className="mt-2 font-jp text-2xl text-muted-foreground">{word.reading}</p>}

            <div className="mt-5 flex justify-center">
              <AudioButton text={word.word} size="md" label={`Listen to ${word.word}`} />
            </div>

            <div className="mt-8 border-y-2 border-dashed border-border/50 py-6">
              <Eyebrow>Example sentence</Eyebrow>
              {revealed ? (
                <Furigana text={word.sentenceFurigana || word.sentence} className="mt-3 block text-xl leading-loose text-foreground md:text-2xl" />
              ) : (
                <p lang="ja" className="mt-3 font-jp text-xl leading-loose text-foreground md:text-2xl">{word.sentence}</p>
              )}
            </div>

            {revealed ? (
              <div className="mt-7 space-y-7">
                <div>
                  <Eyebrow>Answer</Eyebrow>
                  <p className="mt-2 text-3xl text-foreground">{word.meaning}</p>
                </div>

                <div className="flex flex-wrap justify-center gap-3">
                  <AudioButton text={word.word} size="md" label={`Listen to the word ${word.word}`} buttonText="Word" />
                  <AudioButton text={word.sentence} size="md" label="Listen to the example sentence" buttonText="Sentence" />
                </div>

                <Illustration w={word} className="mx-auto w-full max-w-sm" />

                <div className="space-y-2">
                  <Eyebrow>English translation</Eyebrow>
                  <p className="text-xl leading-relaxed text-body">{word.sentenceEn}</p>
                </div>

                {word.notes && (
                  <div className="border-t-2 border-dashed border-border/50 pt-6 text-left">
                    <Eyebrow>Note</Eyebrow>
                    <p className="mt-2 whitespace-pre-line leading-relaxed text-body">{word.notes}</p>
                  </div>
                )}

                {conf && (
                  <div className="rounded-lg border-2 border-border bg-accent p-4 text-left">
                    <p className="text-sm text-accent-foreground">
                      <Sparkles className="mr-2 inline size-4" />
                      Don't mix up with{" "}
                      <span lang="ja" className="font-jp font-bold">{conf.words.map((x) => x.word).join(" · ")}</span>
                    </p>
                  </div>
                )}

                <Link to="/vocab/$id" params={{ id: String(word.id) }} className="inline-block font-mono text-sm text-muted-foreground no-underline hover:text-foreground">
                  Open full card →
                </Link>
              </div>
            ) : (
              <p className="mt-7 font-mono text-sm text-muted-foreground">Recall the reading and meaning, then reveal the answer.</p>
            )}
          </div>

          <div className="mt-8 border-t-2 border-dashed border-border/50 pt-6">
            {revealed ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {previewIntervals(card.state === "new" ? blankCard(word.id) : card).map(({ rating, label }) => (
                  <Button
                    key={rating}
                    size="lg"
                    variant={rating === 1 ? "again" : rating === 2 ? "hard" : rating === 3 ? "good" : "easy"}
                    onClick={() => onRate(rating)}
                    className="flex-col gap-0"
                  >
                    <span>{RATING_LABEL[rating]}</span>
                    <span className="font-mono text-xs font-medium opacity-80">{label}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <Button size="lg" className="w-full" onClick={() => setRevealed(true)}>Show answer</Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function shuffle(list: Word[], seedId: number) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seedId * (i + 7)) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function Summary({ tally, total }: { tally: { done: number; again: number; confused: number }; total: number }) {
  return (
    <Card className="mx-auto max-w-xl p-8 text-center md:p-10">
      <h1 className="text-4xl">Session complete</h1>
      <p className="mt-3 text-body">
        {total === 0 ? "Nothing is due right now — come back later or browse the deck." : "Nice work. Your schedule is updated."}
      </p>
      <div className="mt-8 grid grid-cols-3 gap-3">
        <Box label="Rated" value={tally.done} />
        <Box label="Again" value={tally.again} />
        <Box label="Mix-ups" value={tally.confused} />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/"><Button size="lg">Back to today</Button></Link>
        <Link to="/progress"><Button size="lg" variant="surface">See progress</Button></Link>
      </div>
    </Card>
  );
}

function Box({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border-2 border-border bg-background p-4">
      <p className="font-display text-3xl text-foreground">{value}</p>
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
