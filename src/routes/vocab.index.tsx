import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Eyebrow, Tag, WordChip } from "@/components/ui-kit";
import { confusablesOf, words } from "@/lib/vocab";

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
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return words
      .filter((w) => !onlyConfusing || confusablesOf(w))
      .filter((w) => !t || w.word.includes(t) || w.reading.includes(t) || w.meaning.toLowerCase().includes(t))
      .slice(0, 120);
  }, [q, onlyConfusing]);

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Kaishi 1.5k</Eyebrow>
        <h1 className="mt-2 text-4xl">Words</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="card-hard-sm flex min-h-12 flex-1 items-center gap-2 px-3 shadow-none focus-within:shadow-hard-sm">
          <Search className="size-5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search kanji, kana, or meaning…"
            className="w-full bg-transparent font-jp text-lg outline-none placeholder:text-muted-foreground"
          />
        </label>
        <button
          type="button"
          onClick={() => setOnlyConfusing((v) => !v)}
          className="cursor-pointer rounded-full"
          aria-pressed={onlyConfusing}
        >
          <Tag tone={onlyConfusing ? "accent" : "muted"} className="min-h-10 px-4 text-sm normal-case tracking-normal">
            Confusable only
          </Tag>
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((w) => <WordChip key={w.id} w={w} />)}
      </div>
      {list.length === 120 && <p className="font-mono text-xs text-muted-foreground">Showing first 120 — refine your search.</p>}
    </div>
  );
}
