import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, HelpCircle } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Card, Eyebrow, Tag } from "@/components/ui-kit";
import { BarChart, type Bar } from "@/components/progress-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dueCards, firstReviewDay, forecastRange, historyRange, intervalLabel, periodStats, retrievability, stats, todayStart, useSrs, DESIRED_RETENTION } from "@/lib/srs";
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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
type Preset = 7 | 14 | 30 | 90 | "all" | "custom";
const PRESETS: { value: Preset; label: string }[] = [
  { value: 7, label: "7D" }, { value: 14, label: "14D" }, { value: 30, label: "30D" }, { value: 90, label: "90D" }, { value: "all", label: "All" },
];
const pill = (active: boolean) => cn("rounded-full border-2 border-border px-3 py-1 font-mono text-xs font-semibold transition-colors", active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70");

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

  const today = todayStart(now);
  const [preset, setPreset] = useState<Preset>(14);
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [horizon, setHorizon] = useState(7);
  // Buttons reflect the selection at once; data follows after a short delay while skeletons show.
  const [applied, setApplied] = useState<{ preset: Preset; custom: DateRange | undefined; horizon: number }>({ preset: 14, custom: undefined, horizon: 7 });
  useEffect(() => {
    const timer = setTimeout(() => setApplied({ preset, custom, horizon }), 350);
    return () => clearTimeout(timer);
  }, [preset, custom, horizon]);
  const rangeLoading = preset !== applied.preset || (preset === "custom" && custom !== applied.custom);
  const forecastLoading = horizon !== applied.horizon;
  const dayOf = (date: Date) => Math.min(today, todayStart(date.getTime() + 12 * HOUR));
  const [from, to] = useMemo(() => {
    if (applied.preset === "custom" && applied.custom?.from) return [dayOf(applied.custom.from), dayOf(applied.custom.to ?? applied.custom.from)];
    if (applied.preset === "all") return [Math.min(firstReviewDay(s, now), today - 6 * DAY), today];
    const n = typeof applied.preset === "number" ? applied.preset : 14;
    return [today - (n - 1) * DAY, today];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied.preset, applied.custom, s.log, today]);
  const spanDays = Math.round((to - from) / DAY) + 1;
  const bucketDays = spanDays <= 31 ? 1 : spanDays <= 180 ? 7 : 30;
  const per = periodStats(s, from, to + DAY);
  const historyBars: Bar[] = useMemo(() => {
    const days = historyRange(s, from, to);
    const bars: Bar[] = [];
    for (let i = 0; i < days.length; i += bucketDays) {
      const chunk = days.slice(i, i + bucketDays);
      const value = chunk.reduce((a, d) => a + d.count, 0);
      const again = chunk.reduce((a, d) => a + d.again, 0);
      const first = chunk[0]!.day;
      const last = chunk[chunk.length - 1]!.day;
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      bars.push({
        key: String(first.getTime()),
        label: bucketDays === 30 ? first.toLocaleDateString("en-US", { month: "short" }) : fmt(first),
        value,
        secondary: again,
        highlight: last.getTime() === today,
        tooltip: `${chunk.length > 1 ? `${fmt(first)} – ${fmt(last)}` : first.toLocaleDateString()} · ${value} reviews${again ? `, ${again} again` : ""}`,
      });
    }
    return bars;
  }, [s.log, from, to, bucketDays, today]);
  const forecastBars: Bar[] = useMemo(() => {
    const days = forecastRange(s, now, applied.horizon);
    const bucket = applied.horizon <= 14 ? 1 : 7;
    const bars: Bar[] = [];
    for (let i = 0; i < days.length; i += bucket) {
      const chunk = days.slice(i, i + bucket);
      const value = chunk.reduce((a, d) => a + d.count, 0);
      const first = chunk[0]!.day;
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      bars.push({
        key: String(first.getTime()),
        label: i === 0 && bucket === 1 ? "today" : applied.horizon <= 7 ? first.toLocaleDateString("en-US", { weekday: "short" }) : fmt(first),
        value,
        highlight: i === 0,
        tooltip: `${bucket > 1 ? `${fmt(first)} – ${fmt(chunk[chunk.length - 1]!.day)}` : first.toLocaleDateString()} · ${value} due`,
      });
    }
    return bars;
  }, [s.cards, now, applied.horizon]);
  const forecastTotal = forecastBars.reduce((a, b) => a + b.value, 0);
  const rangeLabel = `${new Date(from).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(to).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const customLabel = custom?.from ? (custom.to && custom.to.getTime() !== custom.from.getTime() ? `${shortDate(custom.from)} – ${shortDate(custom.to)}` : shortDate(custom.from)) : "Custom";
  const avgR = (() => {
    const rev = Object.values(s.cards).filter((c) => c.state !== "new");
    return rev.length ? Math.round((rev.reduce((a, c) => a + retrievability(c, now), 0) / rev.length) * 100) : 0;
  })();

  return (
    <div className="space-y-6 sm:space-y-8 md:space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <div>
          <Eyebrow>Kaishi 1.5k</Eyebrow>
          <h1 className="mt-2 text-3xl sm:text-4xl md:text-5xl">Progress</h1>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 md:gap-5 lg:grid-cols-4 lg:gap-6">
        <Big label="Due now" value={dueNow} sub="cards to review" tone="accent" tooltip="Cards scheduled for today" />
        <Big label="Young" value={st.learning} sub="stability under 7 days (Anki: learning)" tone="secondary" tooltip="Learning and relearning cards. Not yet stable." />
        <Big label="Mature" value={st.learned} sub={`of ${catalogue.length} words`} tone="mint" tooltip="Solid knowledge. 7+ days stability." />
        <Big label="Started" value={st.total} sub="words touched" tone="info" tooltip="Total: Mature + Young + New" />
      </section>

      <Card className="p-4 sm:p-5 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl md:text-2xl">Deck coverage</h2>
            <span title="Progress through the 1500-word deck. Green = mature (7+ days). Yellow = young (still learning)." className="flex cursor-help">
              <HelpCircle className="size-4 text-foreground/50" />
            </span>
          </div>
          <span className="font-mono text-xs sm:text-sm text-muted-foreground">{st.total} / {catalogue.length} words started</span>
        </div>
        <div className="mt-4 flex h-5 overflow-hidden rounded-full border-2 border-border bg-card">
          <div className="bg-mint" style={{ width: `${(st.learned / Math.max(1, catalogue.length)) * 100}%`, minWidth: st.learned ? 6 : 0 }} />
          <div className="border-l-2 border-border bg-secondary" style={{ width: `${(st.learning / Math.max(1, catalogue.length)) * 100}%`, minWidth: st.learning ? 6 : 0 }} />
        </div>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Green = mature ({st.learned}) · Yellow = young ({st.learning})</p>
      </Card>

      <section className="space-y-4 sm:space-y-5 md:space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-xl sm:text-2xl md:text-3xl">Activity</h2>
          {PRESETS.map((p) => (
            <button key={p.value} onClick={() => setPreset(p.value)} className={pill(preset === p.value)}>{p.label}</button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(pill(preset === "custom"), "inline-flex items-center gap-1.5")}>
                <CalendarDays className="size-3.5" />
                {preset === "custom" && custom?.from ? customLabel : "Custom"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="range"
                numberOfMonths={1}
                selected={custom}
                defaultMonth={custom?.from ?? new Date(from)}
                disabled={{ after: new Date(today + 12 * HOUR) }}
                onSelect={(range) => { setCustom(range); if (range?.from) setPreset("custom"); }}
              />
            </PopoverContent>
          </Popover>
          <span className="ml-auto font-mono text-xs text-muted-foreground">{rangeLoading ? <Skeleton className="inline-block h-3 w-40 align-middle" /> : `${rangeLabel} · ${spanDays} ${spanDays === 1 ? "day" : "days"}${bucketDays > 1 ? ` · per ${bucketDays === 7 ? "week" : "month"}` : ""}`}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Mini loading={rangeLoading} label="Reviews" value={per.reviews} sub={`${(per.reviews / spanDays).toFixed(1)} per day`} />
          <Mini loading={rangeLoading} label="Accuracy" value={per.accuracy === null ? "—" : `${per.accuracy}%`} sub={`${per.again} marked again`} />
          <Mini loading={rangeLoading} label="Active days" value={`${per.activeDays}/${spanDays}`} sub="days with a review" />
          <Mini loading={rangeLoading} label="New words" value={per.newWords} sub="first-time cards" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 md:gap-6 lg:grid-cols-2">
          <Card className="p-4 sm:p-5 md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl md:text-2xl">Review history</h2>
                <span title="How many cards you reviewed. Red shows the share you got wrong (Again). The scale adapts to your range." className="flex cursor-help">
                  <HelpCircle className="size-4 text-foreground/50" />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs sm:text-sm text-muted-foreground">total: {per.reviews}</span>
                <button onClick={() => setShowAgain(!showAgain)} className={pill(showAgain)} title={showAgain ? "Hide Again share" : "Show Again share"}>Again</button>
              </div>
            </div>
            <BarChart loading={rangeLoading} bars={historyBars} barClass="bg-info" highlightClass="bg-primary" showSecondary={showAgain} empty="No reviews in this range" />
          </Card>

          <Card className="p-4 sm:p-5 md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl md:text-2xl">Upcoming reviews</h2>
                <span title="Forecast from your current SRS schedule. Overdue cards count toward today." className="flex cursor-help">
                  <HelpCircle className="size-4 text-foreground/50" />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs sm:text-sm text-muted-foreground">total: {forecastTotal}</span>
                {[7, 14, 30].map((n) => (
                  <button key={n} onClick={() => setHorizon(n)} className={pill(horizon === n)}>{n}D</button>
                ))}
              </div>
            </div>
            <BarChart loading={forecastLoading} bars={forecastBars} barClass="bg-secondary" highlightClass="bg-primary" showSecondary={false} empty="Nothing scheduled yet" />
          </Card>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:gap-5 md:gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card tone="info" className="space-y-3 sm:space-y-4 p-4 sm:p-5 md:p-6">
          <h2 className="text-lg sm:text-xl md:text-2xl">Memory model</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 font-mono text-xs sm:text-sm">
            <div><dt className="text-foreground/70">Target retention</dt><dd className="font-display text-2xl sm:text-3xl text-foreground">{DESIRED_RETENTION * 100}%</dd></div>
            <div><dt className="text-foreground/70">Actual ({rangeLoading ? "…" : rangeLabel})</dt><dd className="font-display text-2xl sm:text-3xl text-foreground">{rangeLoading ? <Skeleton className="mt-1 h-8 w-16" /> : per.accuracy === null ? "—" : `${per.accuracy}%`}</dd></div>
            <div><dt className="text-foreground/70">Avg recall now</dt><dd className="font-display text-2xl sm:text-3xl text-foreground">{avgR}%</dd></div>
            <div><dt className="text-foreground/70">Contrast groups</dt><dd className="font-display text-2xl sm:text-3xl text-foreground">{catalogue.filter((w) => confusablesFrom(w, catalogue)).length}</dd></div>
          </dl>
          <p className="text-sm text-body">Based on your recorded reviews (your account when signed in, otherwise this browser). FSRS tracks stability and difficulty; wrong contrast picks are logged alongside the scheduled recall result.</p>
        </Card>

        <Card className="p-4 sm:p-5 md:p-6">
          <h2 className="text-lg sm:text-xl md:text-2xl">Next up</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Soonest scheduled cards</p>
          <ul className="mt-3 sm:mt-4 divide-y-2 divide-border/20 space-y-2">
            {st.upcoming.slice(0, 7).map((c) => {
              const w = byId.get(c.id);
              if (!w) return null;
              return (
                <li key={c.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-2 sm:py-3">
                  <Link to="/vocab/$id_number" params={{ id_number: String(w.idNumber) }} lang="ja" className="font-jp text-base sm:text-lg font-semibold text-foreground no-underline">{w.word}</Link>
                  <span className="text-xs sm:text-sm text-muted-foreground">{w.meaning}</span>
                  <span className="text-xs font-mono text-muted-foreground sm:ml-auto">R {Math.round(retrievability(c, now) * 100)}%</span>
                  <Tag tone="secondary" className="text-xs">in {intervalLabel(c.due - now)}</Tag>
                </li>
              );
            }).filter(Boolean)}
          </ul>
        </Card>
      </section>

      <section>
        <div className="mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
          <h2 className="text-xl sm:text-2xl md:text-3xl">Difficult &amp; confusing words</h2>
          <Tag tone="accent" className="text-xs">{st.difficult.length}</Tag>
        </div>
        <div className="card-hard overflow-x-auto p-0">
          <table className="w-full min-w-full sm:min-w-[640px] text-left text-xs sm:text-sm">
            <thead className="border-b-2 border-border bg-muted font-mono text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3">Word</th>
                <th className="hidden sm:table-cell px-4 py-3">Meaning</th>
                <th className="hidden md:table-cell px-4 py-3">Confused with</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right">Difficulty</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right">Lapses</th>
                <th className="hidden sm:table-cell px-4 py-3 text-right">Mix-ups</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right">Next</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-border/15">
              {st.difficult.slice(0, 15).map((c) => {
                const w = byId.get(c.id);
                if (!w) return null;
                const conf = confusablesFrom(w, catalogue);
                return (
                  <tr key={c.id} className="hover:bg-muted/60">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <Link to="/vocab/$id_number" params={{ id_number: String(w.idNumber) }} className="no-underline block">
                        <span lang="ja" className="font-jp text-base sm:text-lg font-semibold text-foreground">{w.word}</span>
                        <span lang="ja" className="font-jp text-xs text-muted-foreground">{w.reading}</span>
                      </Link>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-body text-sm">{w.meaning}</td>
                    <td lang="ja" className="hidden md:table-cell px-4 py-3 font-jp text-foreground text-sm">{conf ? conf.words.map((x) => x.word).join("・") : "—"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-mono">{c.difficulty.toFixed(1)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-mono">{c.lapses}</td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right font-mono">{c.confusions}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-mono text-xs sm:text-sm">{c.due <= now ? "now" : intervalLabel(c.due - now)}</td>
                  </tr>
                );
              }).filter(Boolean)}
              {st.difficult.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 sm:py-8 text-center text-xs sm:text-sm text-muted-foreground">No difficult words yet — this will fill from your review results.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Mini({ label, value, sub, loading }: { label: string; value: number | string; sub: string; loading?: boolean }) {
  return (
    <Card className="p-3 sm:p-4">
      <Eyebrow>{label}</Eyebrow>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-9 w-16 sm:h-10" />
          <Skeleton className="mt-2 h-3.5 w-24" />
        </>
      ) : (
        <>
          <p className="mt-1 font-display text-3xl text-foreground sm:text-4xl">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{sub}</p>
        </>
      )}
    </Card>
  );
}

function Big({ label, value, sub, tone, tooltip }: { label: string; value: number; sub: string; tone: "mint" | "secondary" | "accent" | "info"; tooltip?: string }) {
  return (
    <Card tone={tone} className="p-4 sm:p-5 md:p-6">
      <div className="flex items-center gap-2">
        <Eyebrow className="text-foreground/70">{label}</Eyebrow>
        {tooltip && (
          <span title={tooltip} className="flex cursor-help">
            <HelpCircle className="size-4 text-foreground/50" />
          </span>
        )}
      </div>
      <p className="mt-1 font-display text-5xl text-foreground">{value}</p>
      <p className="mt-1 text-sm text-body">{sub}</p>
    </Card>
  );
}
