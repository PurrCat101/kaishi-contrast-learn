import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Eyebrow, Tag, WordChip } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { useSrs } from "@/lib/srs";
import { searchVocabulary } from "@/lib/vocab-search";
import { confusablesFrom } from "@/lib/vocab";
import { isSupabaseConfigured } from "@/lib/supabase";
import { bundledCatalog, useVocabularyCatalog, useVocabularyCatalogPage } from "@/lib/vocabulary-catalog";

export const Route = createFileRoute("/vocab/")({
  head: () => ({
    meta: [
      { title: "Word List — Hashi" },
      { name: "description", content: "Browse all 1,500 Kaishi vocabulary words with homophone and look-alike markers." },
      { property: "og:title", content: "Word List — Hashi" },
      { property: "og:description", content: "Browse the Kaishi 1.5k vocabulary with confusion markers." },
    ],
  }),
  component: WordList,
});

function WordList() {
  const [q, setQ] = useState("");
  const [onlyConfusing, setOnlyConfusing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(48);
  const srs = useSrs();
  // Plain browsing only needs the visible page; search/filters need every word.
  const browsing = isSupabaseConfigured && !q.trim() && !onlyConfusing;
  const pageQuery = useVocabularyCatalogPage(page, pageSize, browsing);
  const catalogQuery = useVocabularyCatalog(!browsing);
  const { isFetching, isError } = browsing ? pageQuery : catalogQuery;
  const words = catalogQuery.data ?? bundledCatalog;
  const filtered = useMemo(() => {
    if (browsing) return [];
    return searchVocabulary(words, q, srs)
      .filter((w) => !onlyConfusing || confusablesFrom(w, words));
  }, [browsing, q, onlyConfusing, srs, words]);
  const total = browsing ? (pageQuery.data?.total ?? 0) : filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const list = browsing
    ? (pageQuery.data?.words ?? [])
    : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resetResults = (nextQuery?: string, nextConfusing?: boolean) => {
    if (nextQuery !== undefined) setQ(nextQuery);
    if (nextConfusing !== undefined) setOnlyConfusing(nextConfusing);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Kaishi 1.5k</Eyebrow>
        <h1 className="mt-2 text-4xl">Words</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="card-hard-sm flex min-h-10 sm:min-h-12 flex-1 items-center gap-2 px-3 shadow-none focus-within:shadow-hard-sm min-w-0">
          <Search className="size-4 sm:size-5 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => resetResults(e.target.value)}
            placeholder="Search or filter"
            className="min-w-0 w-full bg-transparent font-jp text-sm sm:text-lg outline-none placeholder:text-muted-foreground"
          />
        </label>
        <button
          type="button"
          onClick={() => resetResults(undefined, !onlyConfusing)}
          className="cursor-pointer rounded-full shrink-0"
          aria-pressed={onlyConfusing}
        >
          <Tag tone={onlyConfusing ? "accent" : "muted"} className="min-h-10 px-3 sm:px-4 text-xs sm:text-sm normal-case tracking-normal">
            Confusable
          </Tag>
        </button>
      </div>
      <p className="font-mono text-[10px] sm:text-xs text-muted-foreground break-words">Try: <code>studied:today</code> · <code>studied:week</code> · <code>introduced:week</code> · <code>difficulty:hard</code> · <code>difficulty:&gt;=7</code> · <code>state:review</code> · <code>is:confusing</code></p>
      {isFetching && <p className="font-mono text-xs text-muted-foreground">Loading the imported vocabulary catalogue…</p>}
      {isError && <p className="font-mono text-xs text-muted-foreground">Could not reach the catalogue; showing the bundled offline deck.</p>}
      {!isFetching && (
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
          <p>{total.toLocaleString()} matching words · page {currentPage} of {pageCount}</p>
          <label className="flex items-center gap-2">Page size
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded border border-border bg-card px-2 py-1 text-foreground">
              {[24, 48, 96].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {isFetching ? (
          Array.from({ length: pageSize }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))
        ) : (
          list.map((w) => <WordChip key={w.id} w={w} />)
        )}
      </div>
      {total > 0 && <div className="flex items-center justify-center gap-3">
        <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-md border-2 border-border bg-card px-4 py-2 font-bold shadow-hard-sm disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <span className="font-mono text-sm">{currentPage} / {pageCount}</span>
        <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="rounded-md border-2 border-border bg-card px-4 py-2 font-bold shadow-hard-sm disabled:cursor-not-allowed disabled:opacity-40">Next</button>
      </div>}
    </div>
  );
}
