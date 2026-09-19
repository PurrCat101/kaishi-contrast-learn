import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, Eyebrow, Tag, WordChip } from "@/components/ui-kit";
import { useLibrary } from "@/lib/library";
import { getWord, type Word } from "@/lib/vocab";

export const Route = createFileRoute("/my-words")({
  head: () => ({
    meta: [
      { title: "My Words — Hashi" },
      { name: "description", content: "Your saved Japanese vocabulary and personal notes." },
    ],
  }),
  component: MyWords,
});

function MyWords() {
  const library = useLibrary();
  const [query, setQuery] = useState("");
  const saved = useMemo(() => {
    const term = query.trim().toLowerCase();
    return Object.entries(library)
      .map(([id, personal]) => ({ word: getWord(Number(id)), personal }))
      .filter((entry): entry is { word: Word; personal: (typeof library)[number] } => Boolean(entry.word))
      .filter(({ word }) => !term || word.word.includes(term) || word.reading.includes(term) || word.meaning.toLowerCase().includes(term))
      .sort((a, b) => b.personal.addedAt - a.personal.addedAt);
  }, [library, query]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Personal collection</Eyebrow>
          <h1 className="mt-2 text-4xl">My Words</h1>
          <p className="mt-2 max-w-xl text-body">Keep the words you want to revisit, with notes that belong to you.</p>
        </div>
        <Tag tone="secondary">{saved.length} saved</Tag>
      </div>

      {saved.length > 0 && (
        <label className="card-hard-sm flex min-h-12 items-center gap-2 px-3 shadow-none focus-within:shadow-hard-sm">
          <Search className="size-5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your words..."
            className="w-full bg-transparent font-jp text-lg outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}

      {saved.length === 0 && !query ? (
        <Card tone="secondary" className="py-16 text-center">
          <Bookmark className="mx-auto size-10" />
          <h2 className="mt-4 text-2xl">Your collection is empty</h2>
          <p className="mx-auto mt-2 max-w-md text-body">Save a word from its detail page and it will appear here with your personal notes.</p>
          <Link to="/vocab" className="mt-6 inline-flex font-bold text-foreground underline underline-offset-4">Browse words</Link>
        </Card>
      ) : saved.length === 0 ? (
        <p className="text-body">No matching words.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {saved.map(({ word, personal }) => (
            <div key={word.id} className="space-y-2">
              <WordChip w={word} />
              {personal.note && <p className="px-2 text-sm text-body">{personal.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}