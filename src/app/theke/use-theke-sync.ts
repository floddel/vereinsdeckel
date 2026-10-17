"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buildThekeView, type OpResult, type PendingOp, type ThekeOp, type ThekeSnapshot } from "@/domain/theke";
import { loadOps, loadSnapshot, removeOps, saveOps, saveSnapshot } from "@/lib/offline-store";
import { uuid } from "@/lib/uuid";

export type SyncStatus = "ok" | "sending" | "offline";

const DEVICE_KEY = "vd_device_id";
let deviceId: string | null = null;

/** Kennung dieses Tablets (nur für das Protokoll „welches Gerät hat gebucht“). */
function getDeviceId(): string {
  if (deviceId) return deviceId;
  try {
    deviceId = localStorage.getItem(DEVICE_KEY);
    if (!deviceId) localStorage.setItem(DEVICE_KEY, (deviceId = uuid()));
  } catch {
    deviceId ??= uuid();
  }
  return deviceId;
}

const REFRESH_MS = 30_000;
const MAX_RETRY_MS = 30_000;

/** Anmeldung abgelaufen: Seite komplett neu laden (kein alter Zustand der Theke bleibt im Speicher). */
function goToLogin() {
  window.location.replace("/login?next=/theke");
}

/**
 * Postausgang der Theke – auf dem Gerät gespeichert (IndexedDB), übersteht Neuladen und Neustart.
 * - Vorgänge werden sofort angezeigt (buildThekeView) und der Reihe nach an /api/sync geschickt.
 * - Bei Netzproblemen: automatisch erneut versuchen (2 s, 4 s, … bis 30 s).
 * - Bestätigte Vorgänge bleiben in der Liste, bis ein neuer Stand vom Server da ist – so springt
 *   der offene Betrag nicht kurz zurück.
 */
export function useThekeSync(initial: ThekeSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  // Neuerer Stand vom Server (z. B. nach dem Zurückwechseln aus der Verwaltung) wird übernommen.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    if (initial.generatedAt > snapshot.generatedAt) setSnapshot(initial);
  }
  const [pending, setPendingState] = useState<PendingOp[]>([]);
  const [status, setStatus] = useState<SyncStatus>("ok");
  const pendingRef = useRef<PendingOp[]>([]);
  const busy = useRef(false);
  const retryMs = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  /** false, wenn das Gerät nichts speichern kann (dann beim Schließen warnen) */
  const persisted = useRef(true);

  const setPending = useCallback((fn: (list: PendingOp[]) => PendingOp[]) => {
    pendingRef.current = fn(pendingRef.current);
    setPendingState(pendingRef.current);
  }, []);

  const refresh = useCallback(async () => {
    const ackedBefore = new Set(pendingRef.current.filter((p) => p.acked).map((p) => p.op.id));
    const res = await fetch("/api/theke/stand", { cache: "no-store" });
    if (res.status === 401) return goToLogin();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fresh = (await res.json()) as ThekeSnapshot;
    setSnapshot(fresh);
    void saveSnapshot(fresh);
    if (ackedBefore.size) setPending((list) => list.filter((p) => !ackedBefore.has(p.op.id)));
  }, [setPending]);

  const flush = useCallback(async () => {
    if (busy.current) return;
    const batch = pendingRef.current.filter((p) => !p.acked).slice(0, 100);
    if (batch.length === 0) return;
    busy.current = true;
    clearTimeout(retryTimer.current);
    setStatus("sending");
    try {
      const body = JSON.stringify({ deviceId: getDeviceId(), ops: batch.map((p) => p.op) });
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        // keepalive: Der Browser schickt die Anfrage auch dann zu Ende, wenn die Seite gerade
        // geschlossen oder neu geladen wird (nur für kleine Anfragen erlaubt).
        keepalive: body.length < 60_000,
      });
      if (res.status === 401) return goToLogin();
      let results: OpResult[];
      if (res.status === 400) {
        // Sollte nie passieren (das Tablet prüft selbst) – nicht endlos wiederholen.
        results = batch.map((p) => ({ id: p.op.id, status: "rejected", message: "Ungültiger Vorgang" }));
      } else if (res.ok) {
        results = ((await res.json()) as { results: OpResult[] }).results;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }

      const rejected = new Map(results.filter((r) => r.status === "rejected").map((r) => [r.id, r.message]));
      const done = new Set(results.filter((r) => r.status !== "rejected").map((r) => r.id));
      setPending((list) =>
        list.filter((p) => !rejected.has(p.op.id)).map((p) => (done.has(p.op.id) ? { ...p, acked: true } : p)),
      );
      for (const message of rejected.values()) toast.error(`Nicht gespeichert: ${message ?? "Fehler"}`);
      void removeOps([...done, ...rejected.keys()]);
      retryMs.current = 0;
      setStatus("ok");
      busy.current = false;
      await refresh().catch(() => {});
      if (pendingRef.current.some((p) => !p.acked)) void flushRef.current();
    } catch {
      busy.current = false;
      setStatus("offline");
      retryMs.current = Math.min(retryMs.current ? retryMs.current * 2 : 2000, MAX_RETRY_MS);
      retryTimer.current = setTimeout(() => void flushRef.current(), retryMs.current);
    }
  }, [refresh, setPending]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const enqueue = useCallback(
    (ops: ThekeOp[]) => {
      setPending((list) => [...list, ...ops.map((op) => ({ op }))]);
      // Gleichzeitig auf dem Gerät vormerken und senden: Wird die Seite sofort geschlossen,
      // ist der Vorgang entweder schon unterwegs (keepalive) oder beim nächsten Start noch da.
      void saveOps(ops).then((ok) => {
        if (!ok) persisted.current = false;
      });
      void flushRef.current();
    },
    [setPending],
  );

  // Next.js versteckt die Theke beim Wechsel in die Verwaltung nur (React <Activity>) und zeigt sie
  // beim Zurückwechseln mit altem Zustand wieder an. Effekte laufen dabei neu → sofort aktualisieren.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      // Erster Start: ungesendete Vorgänge und den letzten Stand vom Gerät holen
      // (wichtig nach Neustart oder wenn die Seite ohne Internet aus dem Zwischenspeicher kam).
      void Promise.all([loadOps(), loadSnapshot()]).then(([ops, stored]) => {
        setSnapshot((current) => {
          if (stored && stored.generatedAt > current.generatedAt) return stored;
          void saveSnapshot(current);
          return current;
        });
        const known = new Set(pendingRef.current.map((p) => p.op.id));
        const missing = ops.filter((op) => !known.has(op.id));
        if (missing.length) {
          setPending((list) => [...missing.map((op) => ({ op })), ...list]);
          void flushRef.current();
        }
      });
      return;
    }
    if (pendingRef.current.some((p) => !p.acked)) void flushRef.current();
    else refresh().catch(() => setStatus("offline"));
  }, [refresh, setPending]);

  // Regelmäßig neuen Stand holen (andere Geräte, später Handy-Bestellungen) – nur bei sichtbarer Seite.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible" || busy.current) return;
      if (pendingRef.current.some((p) => !p.acked)) void flushRef.current();
      else refresh().catch(() => setStatus("offline"));
    };
    const timer = setInterval(tick, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    const onOnline = () => void flushRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      clearTimeout(retryTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  // Nur wenn das Gerät nichts speichern kann: nicht versehentlich mit ungesendeten Buchungen schließen.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!persisted.current && pendingRef.current.some((p) => !p.acked)) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const view = useMemo(() => buildThekeView(snapshot, pending), [snapshot, pending]);
  const unsent = pending.filter((p) => !p.acked).length;
  return { snapshot, view, enqueue, status, unsent };
}
