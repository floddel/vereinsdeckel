"use client";

import { Input } from "@/components/ui/input";
import { QUICK_REASONS } from "@/domain/reversal";
import { cn } from "@/lib/utils";

/** Schnell-Begründungen (ein Tipp) – „Sonstiges“ mit kurzem Text. Liefert den Text oder null. */
export function ReasonPicker({
  reason,
  otherText,
  onReason,
  onOtherText,
  hint,
  reasons = QUICK_REASONS,
}: {
  reason: string | null;
  otherText: string;
  onReason: (r: string) => void;
  onOtherText: (t: string) => void;
  hint?: React.ReactNode;
  /** eigene Schnell-Begründungen („Sonstiges“ am Ende öffnet das Textfeld) */
  reasons?: readonly string[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">Warum?</legend>
      <div className="flex flex-wrap gap-2">
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            onClick={() => onReason(r)}
            className={cn(
              "h-11 rounded-full border px-4 font-medium",
              reason === r ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      {reason === "Sonstiges" && (
        <Input
          aria-label="Begründung"
          placeholder="Kurz begründen …"
          value={otherText}
          maxLength={200}
          onChange={(e) => onOtherText(e.target.value)}
          className="h-11 text-base"
          autoFocus
        />
      )}
      {hint}
    </fieldset>
  );
}

export const reasonText = (reason: string | null, otherText: string) =>
  reason === "Sonstiges" ? otherText.trim() || null : reason;
