import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Flame, Sparkles } from "lucide-react";
import mascot from "@/assets/ill-mascot.png";
import { Button, Card, Eyebrow, ProgressBar, Tag, WordChip } from "@/components/ui-kit";
import { dueCards, newCards, reviewedToday, stats, streak, useSrs } from "@/lib/srs";
import { confusablesOf, getWord } from "@/lib/vocab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today's Review — Hashi" },
      { name: "description", content: "Your daily Japanese vocabulary review with contrast cards for homophones and look-alike words from Kaishi 1.5k." },
      { property: "og:title", content: "Today's Review — Hashi" },
      { property: "og:description", content: "Daily Japanese vocabulary review built to stop mixing up confusing words." },
    ],
  }),
  component: Today,
});

function Today() {
  const s = useSrs();
  const due = dueCards(s);
  const fresh = newCards(s);
  const done = reviewedToday(s);
  const total = due.length + fresh.length + done;
  const st = stats(s);
  const days = streak(s);
  const contrastCount = due.filter((c) => confusablesOf(getWord(c.id)!)).length;
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const hardToday = due.map((c) => getWord(c.id)!).filter((w) => confusablesOf(w)).slice(0, 4);

  return (
    <div className="space-y-10">
      <section className="grid items-stretch gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="relative flex flex-col justify-between overflow-hidden p-8 md:p-10">
          <div>
            <Eyebrow>{dateLabel}</Eyebrow>
            <h1 className="mt-3 text-4xl md:text-5xl">
              {due.length + fresh.length === 0 ? "All caught up." : "Ready when you are."}
            </h1>
            <p className="mt-3 max-w-md text-lg text-body">
              {due.length} reviews due, {fresh.length} new words, and {contrastCount} contrast checks for words you tend to confuse.
            </p>
          </div>

          <div className="mt-8">
            <div className="mb-2 flex items-end justify-between">
              <span className="font-mono text-sm text-muted-foreground">Today's progress</span>
              <span className="font-display text-2xl text-foreground">
                {done}<span className="text-muted-foreground"> / {total}</span>
              </span>
            </div>
            <ProgressBar value={done} max={total} />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link to="/review">
              <Button size="lg">
                Start Review <ArrowRight className="size-5" />
              </Button>
            </Link>
            <span className="font-mono text-sm text-muted-foreground">≈ {Math.max(1, Math.round((due.length + fresh.length) * 0.35))} min</span>
          </div>
          <img src={mascot} alt="" width={816} height={816} className="pointer-events-none absolute -right-6 -bottom-8 hidden w-56 opacity-90 md:block" />
        </Card>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
          <Card tone="secondary" className="flex items-center justify-between">
            <div>
              <Eyebrow className="text-foreground/70">Streak</Eyebrow>
              <p className="mt-1 font-display text-5xl text-foreground">{days}<span className="ml-2 text-xl">days</span></p>
              <p className="mt-1 text-sm text-body">Keep it going — one session a day.</p>
            </div>
            <Flame className="size-12 text-foreground" strokeWidth={2.25} />
          </Card>
          <Card tone="info" className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Due" value={due.length} />
            <Stat label="New" value={fresh.length} />
            <Stat label="Contrast" value={contrastCount} />
          </Card>
          <Card tone="mint" className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 size-5 shrink-0" />
              <p className="text-sm text-body">
                <strong>{st.learned}</strong> words known well · <strong>{st.learning}</strong> still learning · <strong>{st.difficult.length}</strong> flagged as confusing.
              </p>
            </div>
          </Card>
        </div>
      </section>

      {hardToday.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-2xl">Watch out for these today</h2>
            <Tag tone="accent">Contrast cards</Tag>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {hardToday.map((w) => (
              <div key={w.id} className="space-y-2">
                <WordChip w={w} />
                <p className="pl-1 font-mono text-xs text-muted-foreground">
                  vs {confusablesOf(w)!.words.map((x) => x.word).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-3xl text-foreground">{value}</p>
      <p className="font-mono text-xs uppercase tracking-wider text-foreground/70">{label}</p>
    </div>
  );
}
