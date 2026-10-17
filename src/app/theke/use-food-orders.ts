"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { playDing, unlockDing } from "@/lib/ding";
import type { ThekeOrder, ThekeOrders } from "@/server/food-orders";

const ACTIVE_MS = 5_000; // Küche offen oder Bestellungen da
const IDLE_MS = 30_000;

type Action = { action: "accept" } | { action: "ready" } | { action: "reject"; reason: string };

/**
 * Handy-Bestellungen an der Theke (brauchen Internet – anders als das Buchen).
 * Fragt alle 5 s nach, solange die Seite sichtbar ist. Neue Bestellung → Ton + Hinweis.
 * Abgeholte Bestellungen verschwinden sofort (der Bon geht über den Postausgang).
 */
export function useFoodOrders() {
  const [data, setData] = useState<ThekeOrders | null>(null);
  const [offline, setOffline] = useState(false);
  const [pickedUp, setPickedUp] = useState<ReadonlySet<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const take = useCallback((next: ThekeOrders) => {
    const fresh = next.orders.filter((o) => o.status === "new" && known.current && !known.current.has(o.id));
    if (fresh.length) {
      playDing();
      for (const o of fresh) toast(`Neue Bestellung von ${o.memberName}`, { description: itemsText(o) });
    }
    known.current = new Set(next.orders.map((o) => o.id));
    setData(next);
    setOffline(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/theke/bestellungen", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      take((await res.json()) as ThekeOrders);
    } catch {
      setOffline(true);
    }
  }, [take]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Nachfragen nur bei sichtbarer Seite; Effekte laufen auch nach dem Zurückwechseln aus der Verwaltung neu.
  const busy = !!data && (data.kitchenOpen || data.orders.length > 0);
  useEffect(() => {
    void loadRef.current();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadRef.current();
    }, busy ? ACTIVE_MS : IDLE_MS);
    const onVisible = () => document.visibilityState === "visible" && void loadRef.current();
    document.addEventListener("visibilitychange", onVisible);
    // Töne sind erst nach einer Berührung erlaubt
    window.addEventListener("pointerdown", unlockDing);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", unlockDing);
    };
  }, [busy]);

  const post = useCallback(
    async (body: unknown): Promise<boolean> => {
      try {
        const res = await fetch("/api/theke/bestellungen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const reply = (await res.json().catch(() => null)) as (ThekeOrders & { error?: string }) | null;
        if (reply?.orders) take(reply);
        if (!res.ok) {
          toast.error(reply?.error ?? "Hat nicht geklappt");
          return false;
        }
        return true;
      } catch {
        setOffline(true);
        toast.error("Keine Verbindung – bitte gleich noch einmal");
        return false;
      }
    },
    [take],
  );

  const setKitchenOpen = useCallback(
    async (open: boolean) => {
      setData((d) => (d ? { ...d, kitchenOpen: open } : d));
      if (await post({ kitchenOpen: open })) toast.success(open ? "Küche ist offen – Mitglieder können bestellen" : "Küche ist zu");
      else void loadRef.current();
    },
    [post],
  );

  const act = useCallback(
    async (order: ThekeOrder, action: Action) => {
      // sofort anzeigen, der Server bestätigt
      const status = action.action === "accept" ? "accepted" : action.action === "ready" ? "ready" : null;
      setData((d) =>
        d
          ? {
              ...d,
              orders: status ? d.orders.map((o) => (o.id === order.id ? { ...o, status } : o)) : d.orders.filter((o) => o.id !== order.id),
            }
          : d,
      );
      return post({ orderId: order.id, ...action });
    },
    [post],
  );

  const markPickedUp = useCallback((orderId: string) => setPickedUp((s) => new Set(s).add(orderId)), []);

  const orders = (data?.orders ?? []).filter((o) => !pickedUp.has(o.id));
  return {
    loaded: !!data,
    kitchenOpen: data?.kitchenOpen ?? false,
    orderableCount: data?.orderableCount ?? 0,
    orders,
    offline,
    setKitchenOpen,
    act,
    markPickedUp,
  };
}

export const itemsText = (o: Pick<ThekeOrder, "lines">) => o.lines.map((l) => `${l.quantity}× ${l.articleName}`).join(", ");
