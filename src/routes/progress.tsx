import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, Eyebrow, ProgressBar, Tag } from "@/components/ui-kit";
import { dueCards, intervalLabel, retrievability, stats, streak, useSrs, DESIRED_RETENTION } from "@/lib/srs";
import { confusablesFrom } from "@/lib/vocab";
import { bundledCatalog, useVocabularyCatalog } from "@/lib/vocabulary-catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — Hashi" },
      { name: "description", content: "Your words learned, words in progress, confusing words, review history, and upcoming review schedule." },
      { property: "og:title", content: "Progress — Hashi" },
      { property: "og:description", content: "Track what you know, what you're learning, and what you keep mixing up." },
    ],
  }),
  component: Progress,
});

function Progress() {
  const s = useSrs();
  const { data } = useVocabularyCatalog();
  const catalogue = data ?? bundledCatalog;
  const byId = new Map(catalogue.map((word) => [word.id, word]));
  const [now, setNow] = useState(Date.now());
  const [showAgain, setShowAgain] = useState(true);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const st = stats(s, now);
  const dueNow = dueCards(s, now).length;
  const maxHist = Math.max(1, ...st.history.map((h) => h.count));
  const maxFc = Math.max(1, ...st.forecast.map((f) => f.count));
  const avgR = (() => {
    const rev = Object.values(s.cards).filter((c) => c.state !== "new");
    return rev.length ? Math.round((rev.reduce((a, c) => a + retrievability(c, now), 0) / rev.length) * 100) : 0;
  })();

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Kaishi 1.5k</Eyebrow>
          <h1 className="mt-2 text-4xl">Progress</h1>
        </div>
      </div>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Big label="Due now" value={dueNow} sub="cards to review" tone="accent" tooltip="Cards scheduled for today" />
        <Big label="Young" value={st.learning} sub="stability under 7 days (Anki: learning)" tone="secondary" tooltip="Learning and relearning cards. Not yet stable." />
        <Big label="Mature" value={st.learned} sub={`of ${catalogue.length} words`} tone="mint" tooltip="Solid knowledge. 7+ days stability." />
        <Big label="Started" value={st.total} sub="words touched" tone="info" tooltip="Total: Mature + Young + New" />
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl">Deck coverage</h2>
          <span className="font-mono text-sm text-muted-foreground">{st.total} / {catalogue.length} words started</span>
        </div>
        <ProgressBar className="mt-4" value={st.learned} max={catalogue.length} tone="mint" />
        <p className="mt-2 font-mono text-xs text-muted-foreground">Green = mature ({st.learned}) · Yellow = young ({st.learning})</p>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl">Review history</h2>
              <p className="text-sm text-muted-foreground">Last 14 days · max: {maxHist}</p>
            </div>
            <button
              onClick={() => setShowAgain(!showAgain)}
              className="rounded-full border-2 border-border bg-muted px-3 py-1 text-xs font-semibold uppercase text-foreground transition-colors hover:bg-muted/80"
              title={showAgain ? "Hide Again count" : "Show Again count"}
            >
              {showAgain ? "Hide Again" : "Show Again"}
            </button>
          </div>
          <div className="mt-6 flex h-40 items-end gap-1.5">
            {st.history.map((h) => (
              <div key={h.day.toISOString()} className="group flex flex-1 flex-col items-center gap-1" title={`${h.day.toLocaleDateString()} · ${h.count} reviews${h.again ? `, ${h.again} again` : ""}`}>
                <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm border-2 border-b-0 border-border bg-info" style={{ height: `${(h.count / maxHist) * 100}%`, minHeight: h.count ? 6 : 0 }}>
                  {showAgain && <div className="w-full bg-destructive" style={{ height: `${h.count ? (h.again / h.count) * 100 : 0}%` }} />}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between border-t-2 border-border pt-1 font-mono text-[10px] text-muted-foreground">
            <span>{st.history[0]?.day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <span>today</span>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl">Upcoming reviews</h2>
              <p className="text-sm text-muted-foreground">Next 7 days · max: {maxFc}</p>
            </div>
          </div>
          <div className="mt-6 flex h-40 items-end gap-1.5">
            {st.forecast.map((f, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${f.day.toLocaleDateString()} · ${f.count} due`}>
                <span className="font-mono text-xs text-foreground">{f.count}</span>
                <div className={cn("w-full rounded-t-sm border-2 border-b-0 border-border", i === 0 ? "bg-primary" : "bg-secondary")} style={{ height: `${(f.count / maxFc) * 100}%`, minHeight: f.count ? 6 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between border-t-2 border-border pt-1 font-mono text-[10px] text-muted-foreground">
            {st.forecast.map((f, i) => <span key={i}>{i === 0 ? "today" : f.day.toLocaleDateString("en-US", { weekday: "short" })}</span>)}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card tone="info" className="space-y-4">
          <h2 className="text-xl">Memory model</h2>
          <dl className="grid grid-cols-2 gap-4 font-mono text-sm">
            <div><dt className="text-foreground/70">Target retention</dt><dd className="font-display text-3xl text-foreground">{DESIRED_RETENTION * 100}%</dd></div>
            <div><dt className="text-foreground/70">Actual (30d)</dt><dd className="font-display text-3xl text-foreground">{st.retention}%</dd></div>
            <div><dt className="text-foreground/70">Avg recall now</dt><dd className="font-display text-3xl text-foreground">{avgR}%</dd></div>
            <div><dt className="text-foreground/70">Contrast groups</dt><dd className="font-display text-3xl text-foreground">{catalogue.filter((w) => confusablesFrom(w, catalogue)).length}</dd></div>
          </dl>
          <p className="text-sm text-body">Based on your recorded reviews (your account when signed in, otherwise this browser). FSRS tracks stability and difficulty; wrong contrast picks are logged alongside the scheduled recall result.</p>
        </Card>

        <Card>
          <h2 className="text-xl">Next up</h2>
          <p className="text-sm text-muted-foreground">Soonest scheduled cards</p>
          <ul className="mt-4 divide-y-2 divide-border/20">
            {st.upcoming.slice(0, 7).map((c) => {
              const w = byId.get(c.id);
              if (!w) return null;
              return (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <Link to="/vocab/$id_number" params={{ id_number: String(w.idNumber) }} lang="ja" className="font-jp text-xl font-semibold text-foreground no-underline">{w.word}</Link>
                  <span className="text-sm text-muted-foreground">{w.meaning}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">R {Math.round(retrievability(c, now) * 100)}%</span>
                  <Tag tone="secondary">in {intervalLabel(c.due - now)}</Tag>
                </li>
              );
            }).filter(Boolean)}
          </ul>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-2xl">Difficult &amp; confusing words</h2>
          <Tag tone="accent">{st.difficult.length}</Tag>
        </div>
        <div className="card-hard overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b-2 border-border bg-muted font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Word</th>
                <th className="px-4 py-3">Meaning</th>
                <th className="px-4 py-3">Confused with</th>
                <th className="px-4 py-3 text-right">Difficulty</th>
                <th className="px-4 py-3 text-right">Lapses</th>
                <th className="px-4 py-3 text-right">Mix-ups</th>
                <th className="px-4 py-3 text-right">Next</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-border/15">
              {st.difficult.slice(0, 15).map((c) => {
                const w = byId.get(c.id);
                if (!w) return null;
                const conf = confusablesFrom(w, catalogue);
                return (
                  <tr key={c.id} className="hover:bg-muted/60">
                    <td className="px-4 py-3">
                      <Link to="/vocab/$id_number" params={{ id_number: String(w.idNumber) }} className="no-underline">
                        <span lang="ja" className="font-jp text-xl font-semibold text-foreground">{w.word}</span>
                        <span lang="ja" className="ml-2 font-jp text-xs text-muted-foreground">{w.reading}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-body">{w.meaning}</td>
                    <td lang="ja" className="px-4 py-3 font-jp text-foreground">{conf ? conf.words.map((x) => x.word).join("・") : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.difficulty.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.lapses}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.confusions}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.due <= now ? "now" : intervalLabel(c.due - now)}</td>
                  </tr>
                );
              }).filter(Boolean)}
              {st.difficult.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No difficult words yet — this will fill from your review results.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Big({ label, value, sub, tone, tooltip }: { label: string; value: number; sub: string; tone: "mint" | "secondary" | "accent" | "info"; tooltip?: string }) {
  return (
    <Card tone={tone} className="p-5 cursor-help" title={tooltip}>
      <Eyebrow className="text-foreground/70">{label}</Eyebrow>
      <p className="mt-1 font-display text-5xl text-foreground">{value}</p>
      <p className="mt-1 text-sm text-body">{sub}</p>
    </Card>
  );
}
