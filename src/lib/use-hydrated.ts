import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * true, sobald React im Browser aktiv ist (nach der "Hydration").
 * Vorher sichtbare Bedienelemente würden Eingaben verlieren, z. B. eine gewählte Datei.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
