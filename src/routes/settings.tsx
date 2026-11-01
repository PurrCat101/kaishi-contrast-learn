import { createFileRoute } from "@tanstack/react-router";
import { BookPlus, ListOrdered, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Eyebrow } from "@/components/ui-kit";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { updateReviewSettings, useSrs } from "@/lib/srs";
import { saveReviewSettings } from "@/lib/user-settings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hashi" },
      { name: "description", content: "Adjust your daily Japanese vocabulary learning and review limits." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const srs = useSrs();
  const { session, loading: authLoading, configured } = useAuth();
  const [newLimit, setNewLimit] = useState(String(srs.newPerDay));
  const [reviewLimit, setReviewLimit] = useState(String(srs.dailyReviewLimit));
  const [sessionSize, setSessionSize] = useState(String(srs.sessionSize));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => setNewLimit(String(srs.newPerDay)), [srs.newPerDay]);
  useEffect(() => setReviewLimit(String(srs.dailyReviewLimit)), [srs.dailyReviewLimit]);
  useEffect(() => setSessionSize(String(srs.sessionSize)), [srs.sessionSize]);

  // Account values are loaded into the SRS store at sign-in (see src/lib/srs.ts).

  const saveLimits = async (nextNewLimit = newLimit, nextReviewLimit = reviewLimit, nextSessionSize = sessionSize) => {
    const nextNew = Math.min(150, Math.max(0, Number.parseInt(nextNewLimit, 10) || 0));
    const nextReview = Math.min(500, Math.max(0, Number.parseInt(nextReviewLimit, 10) || 0));
    const nextSession = Math.min(100, Math.max(1, Number.parseInt(nextSessionSize, 10) || 1));
    setNewLimit(String(nextNew));
    setReviewLimit(String(nextReview));
    setSessionSize(String(nextSession));
    updateReviewSettings(nextNew, nextReview, nextSession);

    if (!session?.user.id) return;

    setSaveState("saving");
    try {
      await saveReviewSettings(session.user.id, {
        dailyNewLimit: nextNew,
        dailyReviewLimit: nextReview,
        sessionSize: nextSession,
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const persistenceMessage = !configured
    ? "Supabase is not configured; changes are saved only in this browser."
    : authLoading
      ? "Checking your account…"
      : !session
        ? "Sign in to save preferences to your account. Guest changes are saved only in this browser."
        : saveState === "saving"
          ? "Saving to your account…"
          : saveState === "saved"
            ? "Saved to your account."
            : saveState === "error"
              ? "Could not save to your account. Your browser copy is still available."
              : "Changes are saved to your account automatically.";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <Eyebrow>Preferences</Eyebrow>
        <h1 className="text-4xl md:text-5xl">Settings</h1>
        <p className="text-body">Set a daily pace that works for you.</p>
      </header>

      <section className="space-y-4" aria-labelledby="review-settings-heading">
        <div>
          <h2 id="review-settings-heading" className="text-2xl">Daily limits</h2>
          <p className="mt-1 text-sm text-muted-foreground" role={saveState === "error" ? "alert" : "status"}>{persistenceMessage}</p>
        </div>

        <Card className="space-y-6">
          <LimitField
            icon={<BookPlus className="size-5" />}
            id="new-words-limit"
            label="New words per day"
            description="The maximum number of words introduced each day."
            value={newLimit}
            min={0}
            max={150}
            onChange={setNewLimit}
            onBlur={() => void saveLimits(newLimit, reviewLimit, sessionSize)}
          />
          <div className="border-t-2 border-dashed border-border/50" />
          <LimitField
            icon={<RotateCcw className="size-5" />}
            id="daily-reviews-limit"
            label="Reviews per day"
            description="The maximum number of due words included in your daily queue."
            value={reviewLimit}
            min={0}
            max={500}
            onChange={setReviewLimit}
            onBlur={() => void saveLimits(newLimit, reviewLimit, sessionSize)}
          />
          <div className="border-t-2 border-dashed border-border/50" />
          <LimitField
            icon={<ListOrdered className="size-5" />}
            id="review-session-size"
            label="Cards per review session"
            description="The maximum number of new and due cards to start in one session. Retry cards are added after an incorrect answer."
            value={sessionSize}
            min={1}
            max={100}
            onChange={setSessionSize}
            onBlur={() => void saveLimits(newLimit, reviewLimit, sessionSize)}
          />
        </Card>
      </section>
    </div>
  );
}

function LimitField({
  icon,
  id,
  label,
  description,
  value,
  min,
  max,
  onChange,
  onBlur,
}: {
  icon: React.ReactNode;
  id: string;
  label: string;
  description: string;
  value: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border-2 border-border bg-secondary">
          {icon}
        </span>
        <div>
          <label htmlFor={id} className="font-bold text-foreground">{label}</label>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="h-12 w-full border-2 border-border bg-background text-center font-mono text-lg font-semibold sm:w-28"
      />
    </div>
  );
}
