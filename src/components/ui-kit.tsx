import { cva, type VariantProps } from "class-variance-authority";
import { Link } from "@tanstack/react-router";
import { Volume2 } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { parseFurigana, speak, type Word } from "@/lib/vocab";

export const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border-2 border-border px-4 py-2 font-sans text-base font-bold shadow-hard-sm pressable-sm disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground",
        surface: "bg-card text-foreground",
        ghost: "border-transparent shadow-none bg-transparent text-foreground hover:bg-muted hover:shadow-none hover:translate-0",
        again: "bg-destructive text-destructive-foreground",
        hard: "bg-secondary text-secondary-foreground",
        good: "bg-mint text-mint-foreground",
        easy: "bg-info text-info-foreground",
      },
      size: {
        md: "",
        lg: "min-h-14 px-8 text-lg rounded-lg shadow-hard",
        sm: "min-h-8 px-3 text-sm",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;
export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, tone, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: "secondary" | "accent" | "info" | "mint" }) {
  return (
    <div
      className={cn(
        "card-hard p-6",
        tone === "secondary" && "bg-secondary",
        tone === "accent" && "bg-accent",
        tone === "info" && "bg-info",
        tone === "mint" && "bg-mint",
        className,
      )}
      {...props}
    />
  );
}

export function Tag({ className, tone = "muted", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "muted" | "primary" | "secondary" | "accent" | "info" | "mint" | "destructive" }) {
  const tones = {
    muted: "bg-muted text-foreground",
    primary: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    accent: "bg-accent text-accent-foreground",
    info: "bg-info text-info-foreground",
    mint: "bg-mint text-mint-foreground",
    destructive: "bg-destructive text-destructive-foreground",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border-2 border-border px-3 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide", tones[tone], className)} {...props} />
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground", className)}>{children}</p>;
}

export function ProgressBar({ value, max, className, tone = "primary" }: { value: number; max: number; className?: string; tone?: "primary" | "mint" | "info" }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const fill = { primary: "bg-primary", mint: "bg-mint", info: "bg-info" }[tone];
  return (
    <div className={cn("h-4 w-full overflow-hidden rounded-full border-2 border-border bg-card", className)} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cn("h-full border-r-2 border-border transition-[width] duration-500", fill, pct === 0 && "border-r-0")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Furigana({ text, className }: { text: string; className?: string }) {
  return (
    <span lang="ja" className={cn("font-jp", className)}>
      {parseFurigana(text).map((seg, i) =>
        seg.rt ? (
          <ruby key={i}>
            {seg.text}
            <rt>{seg.rt}</rt>
          </ruby>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

export function AudioButton({ text, size = "icon", label = "Play audio" }: { text: string; size?: "icon" | "md"; label?: string }) {
  return (
    <Button variant="surface" size={size} aria-label={label} onClick={() => speak(text)}>
      <Volume2 className="size-5" />
      {size === "md" && <span>Listen</span>}
    </Button>
  );
}

export function WordChip({ w, highlight }: { w: Word; highlight?: boolean }) {
  return (
    <Link
      to="/vocab/$id"
      params={{ id: String(w.id) }}
      className={cn("card-hard-sm pressable-sm flex items-baseline gap-3 px-4 py-2 no-underline", highlight && "bg-secondary")}
    >
      <span lang="ja" className="font-jp text-xl font-semibold text-foreground">{w.word}</span>
      <span lang="ja" className="font-jp text-sm text-muted-foreground">{w.reading}</span>
      <span className="ml-auto truncate text-sm text-body">{w.meaning}</span>
    </Link>
  );
}

export function Illustration({ w, className }: { w: Word; className?: string }) {
  return (
    <div className={cn("flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-border bg-background grid-paper", className)}>
      {w.image ? (
        <img src={w.image} alt={w.imageAlt} width={816} height={816} loading="lazy" className="h-full w-full object-contain p-4" />
      ) : (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <span lang="ja" className="text-jp-display text-5xl opacity-30">{w.word.slice(0, 1)}</span>
          <span lang="ja" className="max-w-40 text-xs leading-snug text-muted-foreground">{w.imageAlt || "Kaishi illustration"}</span>
        </div>
      )}
    </div>
  );
}
