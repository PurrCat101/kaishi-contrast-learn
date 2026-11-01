import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AudioButton, Button, Card, Eyebrow, Furigana, ProgressBar, Tag } from "@/components/ui-kit";
import {
  LEARN_AHEAD_MS,
  RATING_LABEL,
  getCard,
  intervalLabel,
  newRemainingToday,
  planSession,
  previewIntervals,
  rate,
  recordContrast,
  useSrs,
  type CardMemory,
  type Rating,
} from "@/lib/srs";
import { confusablesFrom, type Word } from "@/lib/vocab";
import { bundledCatalog, signedMediaUrl, useVocabularyCatalog } from "@/lib/vocabulary-catalog";

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

type Mode = "recall" | "contrast";
/**
 * `queue` is fixed when the session starts. Cards answered in this session that are
 * still in learning/relearning wait in `pending` until their FSRS step is due.
 */
type Session = { queue: string[]; pos: number; pending: Record<string, number>; current: string | null; mode: Mode; done: number; again: number; confused: number };

function pickNext(session: Session, catalogueById: Map<string, Word>, catalogue: Word[], now = Date.now()): Session {
  const pending = Object.entries(session.pending).sort((a, b) => a[1] - b[1]);
  const modeFor = (id: string): Mode => {
    const word = catalogueById.get(id);
    // Contrast checks are for words already learned; new and learning words are shown as recall cards.
    return word && getCard(id).state === "review" && confusablesFrom(word, catalogue) ? "contrast" : "recall";
  };
  const dueLearning = pending.find(([, due]) => due <= now);
  if (dueLearning) return { ...session, current: dueLearning[0], mode: modeFor(dueLearning[0]) };
  let pos = session.pos;
  while (pos < session.queue.length) {
    const id = session.queue[pos]!;
    pos++;
    if (!getCard(id).suspended && !(id in session.pending)) return { ...session, pos, current: id, mode: modeFor(id) };
  }
  // Nothing else left: show a learning card early if it is due soon (Anki's learn-ahead).
  const ahead = pending.find(([, due]) => due <= now + LEARN_AHEAD_MS);
  return { ...session, pos, current: ahead ? ahead[0] : null, mode: ahead ? modeFor(ahead[0]) : "recall" };
}

function Review() {
  const s = useSrs();
  const { data, isFetching } = useVocabularyCatalog();
  const catalogue = data ?? bundledCatalog;
  const catalogueById = useMemo(() => new Map(catalogue.map((word) => [word.id, word])), [catalogue]);
  const [session, setSession] = useState<Session | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  // Build the queue once, after both the saved state and the catalogue are ready.
  // Later state changes (each rating) must not rebuild it.
  useEffect(() => {
    if (session || !s.hydrated || s.loadError || isFetching) return;
    const plan = planSession(s, catalogue);
    setSession(pickNext({ queue: plan.ids, pos: 0, pending: {}, current: null, mode: "recall", done: 0, again: 0, confused: 0 }, catalogueById, catalogue));
  }, [session, s, catalogue, catalogueById, isFetching]);

  const word = session?.current ? catalogueById.get(session.current) : undefined;
  const [wordAudio, setWordAudio] = useState<string>();
  const [sentenceAudio, setSentenceAudio] = useState<string>();
  useEffect(() => {
    setWordAudio(undefined); setSentenceAudio(undefined);
    if (!word || !("media" in word)) return;
    let cancelled = false;
    void Promise.all([signedMediaUrl(word, "WORD_AUDIO"), signedMediaUrl(word, "SENTENCE_AUDIO")]).then(([wordUrl, sentenceUrl]) => {
      if (!cancelled) { setWordAudio(wordUrl); setSentenceAudio(sentenceUrl); }
    });
    return () => { cancelled = true; };
  }, [word]);

  if (s.loadError) {
    return <Card className="mx-auto max-w-xl p-8 text-center text-body" role="alert">{s.loadError}</Card>;
  }
  if (!session) {
    return <Card className="mx-auto max-w-xl p-8 text-center text-muted-foreground">Preparing your review queue…</Card>;
  }

  const advance = () => {
    setRevealed(false);
    setPick(null);
    setSession((current) => current && pickNext(current, catalogueById, catalogue));
  };
  const answered = (id: string, updated: CardMemory, again: boolean, confused: boolean) => {
    setSession((current) => {
      if (!current) return current;
      const pending = { ...current.pending };
      if (!updated.suspended && (updated.state === "learning" || updated.state === "relearning")) pending[id] = updated.due;
      else delete pending[id];
      return { ...current, pending, done: current.done + 1, again: current.again + (again ? 1 : 0), confused: current.confused + (confused ? 1 : 0) };
    });
  };

  if (!session.current || !word) {
    const plan = planSession(s, catalogue);
    const pendingDue = Object.values(session.pending).sort((a, b) => a - b)[0];
    const firstSession = session.done === 0 && session.queue.length === 0;
    return (
      <Summary
        tally={session}
        title={firstSession ? (newRemainingToday(s) === 0 ? "All done for today! 🎉" : "Nothing due right now") : "Session complete"}
        message={firstSession
          ? newRemainingToday(s) === 0
            ? `You've introduced all ${s.newPerDay} new words for today and nothing is due. Come back tomorrow, or raise the limit in Settings.`
            : "Nothing is due right now — come back later or browse the deck."
          : "Nice work. Your schedule is updated."}
        learningNote={pendingDue ? `${Object.keys(session.pending).length} card(s) still in learning — next one in ${intervalLabel(pendingDue - Date.now())}.` : undefined}
        onCheckAgain={pendingDue ? advance : undefined}
        moreCards={plan.ids.length}
        onStartAnother={plan.ids.length ? () => setSession(pickNext({ queue: plan.ids, pos: 0, pending: session.pending, current: null, mode: "recall", done: 0, again: 0, confused: 0 }, catalogueById, catalogue)) : undefined}
      />
    );
  }

  const card = getCard(word.id);
  const conf = confusablesFrom(word, catalogue);
  const mode: Mode = session.mode === "contrast" && conf ? "contrast" : "recall";

  // Remaining counts, Anki style: new / learning / review (including the current card).
  const rest = [...session.queue.slice(session.pos), ...(session.current in session.pending ? [] : [session.current])]
    .filter((id) => !(id in session.pending) && !getCard(id).suspended);
  const remainingNew = rest.filter((id) => getCard(id).state === "new").length;
  const remainingReview = rest.filter((id) => getCard(id).state === "review").length;
  const remainingLearning = rest.length - remainingNew - remainingReview + Object.keys(session.pending).length;
  const remaining = rest.length + Object.keys(session.pending).length;

  const onRate = (r: Rating) => {
    const updated = rate(word.id, r);
    answered(word.id, updated, r === 1, false);
    advance();
  };

  const onPick = (w: Word) => {
    if (pick !== null) return;
    setPick(w.id);
    const correct = w.id === word.id;
    recordContrast(word.id, correct);
    const updated = rate(word.id, correct ? 3 : 1);
    answered(word.id, updated, !correct, !correct);
  };

  const options = conf ? shuffle([word, ...conf.words.slice(0, 2)], word.id) : [word];

  return (
    <div className="space-y-4 sm:space-y-5 md:space-y-6">
      <header className="space-y-2 sm:space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <Eyebrow className="text-xs sm:text-sm">Card {session.done + 1} of {session.done + remaining}</Eyebrow>
            {card.state === "new" && <Tag tone="mint" className="text-[10px] sm:text-xs">New</Tag>}
            {(card.state === "learning" || card.state === "relearning") && <Tag tone="secondary" className="text-[10px] sm:text-xs">{card.state === "learning" ? "Learning" : "Relearning"}</Tag>}
            {mode === "contrast" && conf && <Tag tone="accent" className="text-[10px] sm:text-xs">{conf.kind}</Tag>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 md:gap-4">
            <span className="flex flex-wrap gap-1" aria-label="Cards remaining">
              <Tag tone="info" className="text-[10px] sm:text-xs">{remainingNew} new</Tag>
              <Tag tone="destructive" className="text-[10px] sm:text-xs">{remainingLearning} learning</Tag>
              <Tag tone="mint" className="text-[10px] sm:text-xs">{remainingReview} review</Tag>
            </span>
            <Link to="/" className="font-mono text-xs sm:text-sm text-muted-foreground no-underline hover:text-foreground">End session</Link>
          </div>
        </div>
        <ProgressBar value={session.done} max={session.done + remaining} />
      </header>

      {mode === "contrast" && conf ? (
        <Card className="p-4 sm:p-6 md:p-8 lg:p-10 text-center">
          <Eyebrow>Which word means this?</Eyebrow>
          <p className="mt-2 text-2xl sm:text-3xl md:text-4xl">{word.meaning}</p>
          <div className="mt-3 sm:mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <span lang="ja" className="font-jp text-base sm:text-lg text-muted-foreground">reading: {word.reading}</span>
            <AudioButton text={word.word} src={wordAudio} />
          </div>

          <div className="mt-6 sm:mt-8 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
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
                    "card-hard pressable-sm flex flex-col items-center gap-1 sm:gap-2 p-3 sm:p-4 md:p-6 text-center disabled:pointer-events-none",
                    show && right ? "bg-mint text-mint-foreground" : "",
                    show && chosen && !right ? "bg-destructive text-destructive-foreground" : "",
                    show && !right && !chosen ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <span lang="ja" className="text-jp-display text-3xl sm:text-4xl md:text-5xl">{o.word}</span>
                  {show && <span className="text-xs sm:text-sm font-semibold">{o.meaning}</span>}
                  {show && right && <Check className="size-5" />}
                  {show && chosen && !right && <X className="size-5" />}
                </button>
              );
            })}
          </div>

          {pick !== null && (
            <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4 text-left">
              <div className="rounded-lg border-2 border-border bg-secondary p-3 sm:p-4 md:p-5">
                <Eyebrow className="text-foreground/70">Tell them apart</Eyebrow>
                <p className="mt-2 whitespace-pre-line text-xs sm:text-sm text-body">{word.notes || `${word.word} = ${word.meaning}.`}</p>
                <ul className="mt-2 sm:mt-3 space-y-1">
                  {conf.words.map((x) => (
                    <li key={x.id} className="font-mono text-xs sm:text-sm text-body">
                      <span lang="ja" className="font-jp text-sm sm:text-base">{x.word}（{x.reading}）</span> — {x.meaning}
                    </li>
                  ))}
                </ul>
              </div>
              <Button size="lg" className="mx-auto text-xs sm:text-sm" onClick={advance}>Continue <ArrowRight className="size-4 sm:size-5" /></Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-4 sm:p-6 md:p-8 lg:p-10 text-center">
          <div className="mx-auto max-w-3xl">
            <h1 lang="ja" className="text-jp-display text-4xl sm:text-5xl md:text-6xl lg:text-8xl">{word.word}</h1>
            {revealed && <p lang="ja" className="mt-2 font-jp text-lg sm:text-xl md:text-2xl text-muted-foreground">{word.reading}</p>}

            <div className="mt-3 sm:mt-4 md:mt-5 flex justify-center">
              <AudioButton text={word.word} src={wordAudio} size="md" label={`Listen to ${word.word}`} />
            </div>

            <div className="mt-6 sm:mt-8 border-y-2 border-dashed border-border/50 py-4 sm:py-6">
              <Eyebrow className="text-sm sm:text-base">Example sentence</Eyebrow>
              {revealed ? (
                <Furigana text={word.sentenceFurigana || word.sentence} className="mt-2 sm:mt-3 block text-base sm:text-lg md:text-xl lg:text-2xl leading-relaxed sm:leading-loose text-foreground" />
              ) : (
                <p lang="ja" className="mt-2 sm:mt-3 font-jp text-base sm:text-lg md:text-xl lg:text-2xl leading-relaxed sm:leading-loose text-foreground">{word.sentence}</p>
              )}
            </div>

            {revealed ? (
              <div className="mt-6 sm:mt-7 md:mt-8 space-y-4 sm:space-y-5 md:space-y-6 lg:space-y-7">
                <div>
                  <Eyebrow className="text-sm sm:text-base">Answer</Eyebrow>
                  <p className="mt-2 text-2xl sm:text-3xl md:text-4xl text-foreground">{word.meaning}</p>
                </div>

                <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                  <AudioButton text={word.word} src={wordAudio} size="md" label={`Listen to the word ${word.word}`} buttonText="Word" />
                  <AudioButton text={word.sentence} src={sentenceAudio} size="md" label="Listen to the example sentence" buttonText="Sentence" />
                </div>

                <div className="space-y-1 sm:space-y-2">
                  <Eyebrow className="text-sm sm:text-base">English translation</Eyebrow>
                  <p className="text-sm sm:text-base md:text-lg leading-relaxed text-body">{word.sentenceEn}</p>
                </div>

                {word.notes && (
                  <div className="border-t-2 border-dashed border-border/50 pt-4 sm:pt-6 text-left">
                    <Eyebrow className="text-sm sm:text-base">Note</Eyebrow>
                    <p className="mt-2 whitespace-pre-line text-xs sm:text-sm leading-relaxed text-body">{word.notes}</p>
                  </div>
                )}

                {conf && (
                  <div className="rounded-lg border-2 border-border bg-accent p-3 sm:p-4 text-left">
                    <p className="text-xs sm:text-sm text-accent-foreground">
                      <Sparkles className="mr-2 inline size-4" />
                      Don't mix up with{" "}
                      <span lang="ja" className="font-jp font-bold">{conf.words.map((x) => x.word).join(" · ")}</span>
                    </p>
                  </div>
                )}

                <Link to="/vocab/$id_number" params={{ id_number: String(word.idNumber) }} className="inline-block font-mono text-xs sm:text-sm text-muted-foreground no-underline hover:text-foreground">
                  Open full card →
                </Link>
              </div>
            ) : (
              <p className="mt-6 sm:mt-7 md:mt-8 font-mono text-xs sm:text-sm text-muted-foreground">Recall the reading and meaning, then reveal the answer.</p>
            )}
          </div>

          <div className="mt-6 sm:mt-8 border-t-2 border-dashed border-border/50 pt-4 sm:pt-6">
            {revealed ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
                {previewIntervals(card).map(({ rating, label }) => (
                  <Button
                    key={rating}
                    size="lg"
                    variant={rating === 1 ? "again" : rating === 2 ? "hard" : rating === 3 ? "good" : "easy"}
                    onClick={() => onRate(rating)}
                    className="flex-col gap-0"
                  >
                    <span className="text-xs sm:text-sm">{RATING_LABEL[rating]}</span>
                    <span className="font-mono text-[10px] sm:text-xs font-medium opacity-80">{label}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <Button size="lg" className="w-full text-sm sm:text-base" onClick={() => setRevealed(true)}>Show answer</Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function shuffle(list: Word[], seedId: string) {
  const seed = [...seedId].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 0);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (seed * (i + 7)) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function Summary({ tally, title, message, learningNote, onCheckAgain, moreCards, onStartAnother }: {
  tally: { done: number; again: number; confused: number };
  title: string;
  message: string;
  learningNote?: string | undefined;
  onCheckAgain?: (() => void) | undefined;
  moreCards: number;
  onStartAnother?: (() => void) | undefined;
}) {
  return (
    <Card className="mx-auto max-w-xl p-6 sm:p-8 md:p-10 text-center">
      <h1 className="text-3xl sm:text-4xl md:text-5xl">{title}</h1>
      <p className="mt-2 sm:mt-3 text-sm sm:text-base text-body">{message}</p>
      {learningNote && <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">{learningNote}</p>}
      {tally.done > 0 && (
        <div className="mt-6 sm:mt-8 grid grid-cols-3 gap-2 sm:gap-3">
          <Box label="Rated" value={tally.done} />
          <Box label="Again" value={tally.again} />
          <Box label="Mix-ups" value={tally.confused} />
        </div>
      )}
      <div className="mt-6 sm:mt-8 flex flex-wrap justify-center gap-2 sm:gap-3">
        {onStartAnother && <Button size="lg" onClick={onStartAnother}>Next session ({moreCards})</Button>}
        {onCheckAgain && <Button size="lg" variant="surface" onClick={onCheckAgain}>Check again</Button>}
        <Link to="/"><Button size="lg" variant={onStartAnother ? "surface" : "primary"}>Back to today</Button></Link>
        <Link to="/progress"><Button size="lg" variant="surface">See progress</Button></Link>
      </div>
    </Card>
  );
}

function Box({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border-2 border-border bg-background p-2 sm:p-3 md:p-4">
      <p className="font-display text-2xl sm:text-3xl text-foreground">{value}</p>
      <p className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
