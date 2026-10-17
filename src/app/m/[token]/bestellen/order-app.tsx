"use client";

import { Check, ChefHat, Loader2, Minus, Plus, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ArticleIcon } from "@/components/article-icon";
import {
  isOpenStatus,
  MAX_NOTE_LENGTH,
  MAX_OPEN_ORDERS,
  MAX_ORDER_ITEMS,
  MAX_ORDER_LINE_QTY,
  memberStatusText,
  statusStep,
} from "@/domain/food-order";
import { formatTimeBerlin } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MemberOrder, MemberOrders } from "@/server/food-orders";
import { InvalidLink } from "../invalid-link";
import { useLivePoll } from "../use-live-poll";

type Reply = Partial<MemberOrders> & { error?: string };

export function OrderApp({ token, initial }: { token: string; initial: MemberOrders }) {
  const base = `/api/m/${encodeURIComponent(token)}/bestellungen`;
  const { data, invalid, setInvalid, replace } = useLivePoll(base, initial);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const open = data.orders.filter((o) => isOpenStatus(o.status));
  const done = data.orders.filter((o) => !isOpenStatus(o.status));
  const items = Object.values(cart).reduce((s, n) => s + n, 0);
  const total = data.menu.reduce((s, a) => s + (cart[a.id] ?? 0) * a.priceCents, 0);
  const full = open.length >= MAX_OPEN_ORDERS;

  // Fertig gemeldet → kurz vibrieren (wo das Handy es kann)
  useReadyVibration(data.orders);

  async function send(method: "POST" | "DELETE", url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 404 && url === base) {
        setInvalid(true);
        return false;
      }
      const reply = (await res.json().catch(() => ({}))) as Reply;
      if (reply.version) replace(reply as MemberOrders);
      if (!res.ok) {
        setMessage({ kind: "error", text: reply.error ?? "Das hat nicht geklappt. Bitte noch einmal." });
        return false;
      }
      return true;
    } catch {
      setMessage({ kind: "error", text: "Keine Verbindung. Bitte gleich noch einmal versuchen oder vorne bestellen." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function order() {
    const lines = Object.entries(cart)
      .filter(([, n]) => n > 0)
      .map(([articleId, quantity]) => ({ articleId, quantity }));
    if (lines.length === 0) return;
    if (await send("POST", base, { lines, note })) {
      setCart({});
      setNote("");
      setMessage({ kind: "ok", text: "Bestellung ist raus!" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (invalid) return <InvalidLink />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl font-bold">Essen bestellen</h1>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={cn(
            "rounded-2xl px-4 py-3 font-medium",
            message.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          {message.text}
        </p>
      )}

      {open.length > 0 && (
        <section aria-label="Deine Bestellungen" className="flex flex-col gap-3">
          {open.map((o) => (
            <OrderCard key={o.id} order={o} busy={busy} onCancel={() => send("DELETE", `${base}/${o.id}`)} />
          ))}
        </section>
      )}

      {data.kitchenOpen ? (
        <section aria-labelledby="karte" className="flex flex-col gap-4">
          <h2 id="karte" className="font-heading text-xl font-bold">
            Was darf’s sein?
          </h2>
          <ul className="flex flex-col gap-2">
            {data.menu.map((a) => {
              const n = cart[a.id] ?? 0;
              const set = (v: number) => setCart((c) => ({ ...c, [a.id]: v }));
              const soldOut = a.left === 0;
              return (
                <li
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft dark:ring-1 dark:ring-white/5",
                    n > 0 && "ring-2 ring-primary",
                    soldOut && "opacity-60",
                  )}
                >
                  <ArticleIcon icon={a.icon} className="size-11 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {formatCents(a.priceCents)}
                      {soldOut ? (
                        <span className="font-semibold text-destructive"> · leider aus</span>
                      ) : (
                        a.left !== null && a.left <= 5 && <span className="font-semibold text-highlight"> · noch {a.left}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`${a.name} weniger`}
                      disabled={n === 0}
                      onClick={() => set(n - 1)}
                      className="grid size-11 place-items-center rounded-full bg-muted disabled:opacity-40"
                    >
                      <Minus className="size-5" />
                    </button>
                    <span className="w-7 text-center text-lg font-bold tabular-nums" aria-label={`${a.name}: ${n}`}>
                      {n}
                    </span>
                    <button
                      type="button"
                      aria-label={`${a.name} mehr`}
                      disabled={n >= MAX_ORDER_LINE_QTY || items >= MAX_ORDER_ITEMS || (a.left !== null && n >= a.left)}
                      onClick={() => set(n + 1)}
                      className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                    >
                      <Plus className="size-5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Wunsch (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_NOTE_LENGTH}
              rows={2}
              placeholder="z. B. mit Senf, ohne Zwiebeln"
              className="rounded-2xl bg-card px-4 py-3 text-base shadow-soft ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={order}
              disabled={busy || items === 0 || full}
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground shadow-soft disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : <ChefHat className="size-5" />}
              {items > 0 ? `Bestellen · ${formatCents(total)}` : "Bestellen"}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              {full
                ? `Du hast schon ${MAX_OPEN_ORDERS} offene Bestellungen – bitte erst abholen.`
                : "Kommt beim Abholen auf deinen Bierdeckel."}
            </p>
          </div>
        </section>
      ) : (
        <section className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-8 text-center shadow-soft dark:ring-1 dark:ring-white/5">
          <ChefHat className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="font-heading text-xl font-bold">Die Küche ist gerade zu</h2>
          <p className="text-muted-foreground">Sobald es Essen gibt, kannst du hier bestellen.</p>
        </section>
      )}

      {done.length > 0 && (
        <section aria-labelledby="erledigt" className="flex flex-col gap-2">
          <h2 id="erledigt" className="text-lg font-bold">
            Heute erledigt
          </h2>
          {done.map((o) => {
            const t = memberStatusText(o);
            return (
              <div key={o.id} className="flex items-start justify-between gap-3 rounded-2xl bg-card/60 px-4 py-3 text-sm ring-1 ring-foreground/5">
                <div className="min-w-0">
                  <p className="font-medium">{o.lines.map((l) => `${l.quantity}× ${l.articleName}`).join(", ")}</p>
                  <p className="text-muted-foreground">
                    {t.title}
                    {o.status === "rejected" && `: ${t.detail}`}
                  </p>
                </div>
                <span className="shrink-0 text-muted-foreground tabular-nums">{formatTimeBerlin(o.createdAt)}</span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

const STEPS = ["Eingegangen", "Wird zubereitet", "Fertig"];

function OrderCard({ order: o, busy, onCancel }: { order: MemberOrder; busy: boolean; onCancel: () => void }) {
  const t = memberStatusText(o);
  const step = statusStep(o.status);
  const ready = o.status === "ready";
  return (
    <article
      data-testid="bestellung"
      data-status={o.status}
      className={cn(
        "flex flex-col gap-3 rounded-2xl p-4 shadow-soft ring-1",
        ready ? "bg-highlight text-highlight-foreground ring-highlight" : "bg-card ring-foreground/5",
      )}
    >
      <div role="status" aria-live="polite">
        <p className="font-heading text-xl font-bold">{t.title}</p>
        <p className={cn("text-sm", ready ? "opacity-90" : "text-muted-foreground")}>{t.detail}</p>
      </div>
      <ol className="flex gap-1.5" aria-hidden>
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1">
            <span
              className={cn(
                "h-1.5 rounded-full",
                i <= step ? (ready ? "bg-highlight-foreground" : "bg-primary") : ready ? "bg-highlight-foreground/30" : "bg-muted",
                i === 0 && step === 0 && !o.seen && "animate-pulse",
              )}
            />
            <span className={cn("text-xs", i === step ? "font-semibold" : "opacity-70")}>{label}</span>
          </li>
        ))}
      </ol>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{o.lines.map((l) => `${l.quantity}× ${l.articleName}`).join(", ")}</p>
          {o.note && <p className={cn("text-sm", ready ? "opacity-90" : "text-muted-foreground")}>„{o.note}“</p>}
        </div>
        <span className="shrink-0 font-semibold tabular-nums">{formatCents(o.totalCents)}</span>
      </div>
      {o.status === "new" && (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex h-11 items-center justify-center gap-2 self-start rounded-full bg-muted px-4 text-sm font-semibold disabled:opacity-50"
        >
          <Undo2 className="size-4" /> Zurückziehen
        </button>
      )}
      {ready && (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Check className="size-4" /> Wird beim Abholen angeschrieben
        </p>
      )}
    </article>
  );
}

/** Vibriert einmal, wenn eine Bestellung neu „fertig“ ist (nicht beim ersten Laden). */
function useReadyVibration(orders: MemberOrder[]) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ready = orders.filter((o) => o.status === "ready").map((o) => o.id);
    if (seen.current && ready.some((id) => !seen.current!.has(id))) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
    }
    seen.current = new Set(ready);
  }, [orders]);
}
