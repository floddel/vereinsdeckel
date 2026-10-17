"use client";

import type { ThekeOp, ThekeSnapshot } from "@/domain/theke";

/**
 * Speicher auf dem Gerät (IndexedDB) für die Theke:
 * - „outbox“: Vorgänge, die der Server noch nicht bestätigt hat (überstehen Neuladen und Neustart)
 * - „kv“:     zuletzt geladener Stand der Theke (für den Start ohne Internet)
 * Alle Funktionen schlucken Fehler (z. B. privater Modus): Die Theke läuft dann eben nur im Speicher weiter.
 */
const DB_NAME = "vereinsdeckel-theke";
const DB_VERSION = 1;
const SNAPSHOT_KEY = "snapshot";

type OutboxRecord = { id: string; seq: number; op: ThekeOp };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run<T>(store: "outbox" | "kv", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

// Reihenfolge der Vorgänge ist wichtig (erst der Bon, dann sein Storno).
let seqCounter = 0;
const nextSeq = () => Date.now() * 1000 + (seqCounter++ % 1000);

/** Vorgänge dauerhaft vormerken (in der gegebenen Reihenfolge). false = nur im Speicher (z. B. privater Modus). */
export async function saveOps(ops: readonly ThekeOp[]): Promise<boolean> {
  try {
    await run("outbox", "readwrite", (s) => {
      for (const op of ops) s.put({ id: op.id, seq: nextSeq(), op } satisfies OutboxRecord);
    });
    return true;
  } catch {
    return false;
  }
}

/** Vom Server bestätigte (oder abgelehnte) Vorgänge entfernen. */
export async function removeOps(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await run("outbox", "readwrite", (s) => {
      for (const id of ids) s.delete(id);
    });
  } catch {}
}

/** Alle noch nicht bestätigten Vorgänge, älteste zuerst. */
export async function loadOps(): Promise<ThekeOp[]> {
  try {
    const rows = (await run<OutboxRecord[]>("outbox", "readonly", (s) => s.getAll() as IDBRequest<OutboxRecord[]>)) ?? [];
    return rows.sort((a, b) => a.seq - b.seq).map((r) => r.op);
  } catch {
    return [];
  }
}

export async function saveSnapshot(snapshot: ThekeSnapshot): Promise<void> {
  try {
    await run("kv", "readwrite", (s) => s.put(snapshot, SNAPSHOT_KEY));
  } catch {}
}

export async function loadSnapshot(): Promise<ThekeSnapshot | null> {
  try {
    return ((await run<ThekeSnapshot>("kv", "readonly", (s) => s.get(SNAPSHOT_KEY))) as ThekeSnapshot | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Beim Abmelden: gespeicherten Stand (Namen, Beträge) löschen. Ungesendete Vorgänge bleiben! */
export async function clearSnapshot(): Promise<void> {
  try {
    await run("kv", "readwrite", (s) => s.delete(SNAPSHOT_KEY));
  } catch {}
}
