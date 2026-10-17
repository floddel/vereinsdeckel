"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FAST_MS = 3_000;
const SLOW_MS = 15_000;

/**
 * Live-Daten der Mitgliederansicht: fragt nur nach, solange die Seite sichtbar ist.
 * Nach einer Änderung alle 3 s, bei Stillstand immer seltener (bis 15 s).
 * Mit ETag: unverändert → leere 304-Antwort (wenig Last bei 50 Handys).
 * `replace`: neuer Stand aus einer eigenen Aktion (z. B. nach dem Bestellen).
 */
export function useLivePoll<T extends { version: string }>(url: string, initial: T) {
  const [data, setData] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const versionRef = useRef(initial.version);
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    let delay = FAST_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const poll = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(url, { headers: { "If-None-Match": `"${versionRef.current}"` }, cache: "no-store" });
        if (res.status === 404) {
          // Link wurde gesperrt, während die Seite offen war
          setInvalid(true);
          stopped = true;
          return;
        }
        if (res.status === 200) {
          const next = (await res.json()) as T;
          versionRef.current = next.version;
          setData(next);
          delay = FAST_MS;
        } else {
          delay = Math.min(delay * 1.5, SLOW_MS);
        }
      } catch {
        delay = SLOW_MS; // kein Netz: später erneut
      }
      if (!stopped) timer = setTimeout(poll, delay);
    };

    const restart = () => {
      if (document.visibilityState !== "visible" || stopped) return;
      clearTimeout(timer);
      delay = FAST_MS;
      timer = setTimeout(poll, FAST_MS);
    };
    kickRef.current = restart;

    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped) return;
      clearTimeout(timer);
      delay = FAST_MS;
      void poll();
    };

    timer = setTimeout(poll, FAST_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url]);

  const replace = useCallback((next: T) => {
    versionRef.current = next.version;
    setData(next);
    kickRef.current(); // nach eigener Aktion wieder oft nachfragen
  }, []);

  return { data, invalid, setInvalid, replace };
}
