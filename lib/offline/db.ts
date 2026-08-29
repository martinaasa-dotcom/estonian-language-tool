"use client";

import { isValidPending, type PendingGrade } from "./outbox";
import type { ReviewCard } from "@/app/(app)/review/ReviewSession";

/**
 * The browser side of offline review: a durable outbox of grades, and the last
 * session's cards so there is something to review when the network is gone.
 *
 * IndexedDB rather than localStorage because the outbox must survive a tab
 * crash mid-session and localStorage writes are synchronous on the main thread —
 * exactly the wrong property for something written after every grade.
 *
 * Every function resolves rather than rejecting. Private browsing, a full disk
 * and a blocked-storage setting all make IndexedDB throw, and none of them is a
 * reason to break a review the learner is in the middle of. Offline support
 * degrades to no offline support, which is where the app was before.
 */

const DB_NAME = "kodukeel";
const DB_VERSION = 1;
const OUTBOX = "outbox";
const SESSION = "session";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SESSION)) db.createObjectStore(SESSION);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  body: (s: IDBObjectStore) => IDBRequest<T>,
  fallback: T,
): Promise<T> {
  return new Promise(async (resolve) => {
    const db = await open();
    if (!db) return resolve(fallback);
    try {
      const tx = db.transaction(store, mode);
      const request = body(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result ?? fallback);
      request.onerror = () => resolve(fallback);
      tx.onabort = () => resolve(fallback);
    } catch {
      resolve(fallback);
    }
  });
}

// ───────────────────────────── the outbox ─────────────────────────────────

export async function enqueueGrade(grade: PendingGrade): Promise<void> {
  await run(OUTBOX, "readwrite", (s) => s.put(grade), undefined as unknown as IDBValidKey);
}

export async function readOutbox(): Promise<PendingGrade[]> {
  const rows = await run<unknown[]>(OUTBOX, "readonly", (s) => s.getAll(), []);
  // A row that fails validation is dropped rather than sent: the server would
  // reject it anyway, and a permanently un-replayable entry would wedge the queue.
  return rows.filter(isValidPending);
}

export async function dropFromOutbox(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(OUTBOX, "readwrite");
      const store = tx.objectStore(OUTBOX);
      for (const id of ids) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function outboxSize(): Promise<number> {
  return run<number>(OUTBOX, "readonly", (s) => s.count(), 0);
}

// ──────────────────────── the stashed session ─────────────────────────────

export interface StashedSession {
  cards: ReviewCard[];
  stashedAt: number;
}

/** A stash older than this is not worth reviewing — the schedule has moved on. */
const STASH_MAX_AGE_MS = 3 * 86_400_000;

/**
 * Keeps the cards the server handed down, so a later visit with no connection
 * has a real session to run rather than an empty state.
 */
export async function stashSession(cards: ReviewCard[]): Promise<void> {
  if (cards.length === 0) return;
  await run(
    SESSION, "readwrite",
    (s) => s.put({ cards, stashedAt: Date.now() } satisfies StashedSession, "latest"),
    undefined as unknown as IDBValidKey,
  );
}

export async function readStashedSession(): Promise<ReviewCard[]> {
  const stash = await run<StashedSession | undefined>(
    SESSION, "readonly", (s) => s.get("latest"), undefined,
  );
  if (!stash || !Array.isArray(stash.cards)) return [];
  if (Date.now() - stash.stashedAt > STASH_MAX_AGE_MS) return [];
  return stash.cards;
}
