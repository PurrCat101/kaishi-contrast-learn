import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type Bar = { key: string; label: string; value: number; secondary?: number; tooltip: string; highlight?: boolean };

/** Smallest "nice" axis top (1/2/5 × 10^k steps) that fits `max` in at most four steps. */
export function niceScale(max: number) {
  if (max <= 0) return { top: 4, step: 1 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].map((m) => m * pow).find((candidate) => candidate >= raw) ?? raw);
  return { top: Math.ceil(max / step) * step, step };
}

const SKELETON_HEIGHTS = [35, 55, 25, 70, 45, 85, 40, 60, 30, 75, 50, 65, 20, 55];

/** Bar chart whose axis is scaled to the data so low counts stay readable. `secondary` is drawn as a red share of the bar. */
export function BarChart({ bars, barClass, highlightClass, showSecondary = true, empty, loading = false }: { bars: Bar[]; barClass: string; highlightClass?: string; showSecondary?: boolean; empty: string; loading?: boolean }) {
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  const { top, step } = niceScale(max);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
  const labelEvery = Math.max(1, Math.ceil(bars.length / 7));
  const valueLabels = bars.length <= 16;

  return (
    <div className="mt-4 sm:mt-6">
      <div className="flex gap-2">
        <div className="relative h-44 w-7 shrink-0 font-mono text-[10px] text-muted-foreground sm:h-52">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2 leading-none" style={{ bottom: `${(tick / top) * 100}%` }}>{tick}</span>
          ))}
        </div>
        <div className="relative h-44 flex-1 sm:h-52">
          {ticks.map((tick) => (
            <div key={tick} className={cn("absolute inset-x-0 border-t", tick === 0 ? "border-t-2 border-border" : "border-dashed border-border/25")} style={{ bottom: `${(tick / top) * 100}%` }} />
          ))}
          {loading && (
            <div className="absolute inset-0 z-10 flex items-end gap-[3px] bg-card sm:gap-1">
              {SKELETON_HEIGHTS.map((h, index) => <Skeleton key={index} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />)}
            </div>
          )}
          {!loading && max === 0 && <p className="absolute inset-0 flex items-center justify-center font-mono text-xs text-muted-foreground">{empty}</p>}
          <div className="absolute inset-0 flex items-end gap-[3px] sm:gap-1">
            {bars.map((bar) => (
              <div key={bar.key} title={bar.tooltip} className="relative h-full flex-1">
                <div
                  className={cn("absolute inset-x-0 bottom-0 flex flex-col justify-end overflow-hidden rounded-t-sm border-2 border-b-0 border-border", bar.highlight && highlightClass ? highlightClass : barClass)}
                  style={{ height: `${(bar.value / top) * 100}%`, minHeight: bar.value ? 4 : 0 }}
                >
                  {showSecondary && !!bar.secondary && <div className="w-full bg-destructive" style={{ height: `${(bar.secondary / bar.value) * 100}%` }} />}
                </div>
                {valueLabels && bar.value > 0 && (
                  <span className="absolute inset-x-0 text-center font-mono text-[10px] leading-none text-foreground" style={{ bottom: `calc(${(bar.value / top) * 100}% + 3px)` }}>{bar.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-9 mt-1.5 flex gap-[3px] font-mono text-[9px] text-muted-foreground sm:gap-1 sm:text-[10px]">
        {bars.map((bar, index) => (
          <span key={bar.key} className={cn("flex min-w-0 flex-1 justify-center whitespace-nowrap", index % labelEvery !== 0 && "invisible")}>{bar.label}</span>
        ))}
      </div>
    </div>
  );
}
