/**
 * A conversation kept on the device, and a finished one waiting to be sent.
 *
 * Two keys under one prefix, which `lib/offline/forget.ts` sweeps on sign-out.
 * The run in progress is the state machine's own state, so a reload mid-scene
 * gives the same conversation back at the same turn; the plan is drawn again
 * from the seed on the server, so what is stored is only what happened. A
 * finished run that could not reach the server, on a train or with a bad
 * minute at the host, waits here and `PendingScenes` sends it on the next
 * visit. Nothing here is a mark: the server re-reads every turn.
 */
import { SCENE_KEY_PREFIX } from "@/lib/offline/forget";
import type { RunState } from "@/lib/scenes/run";

const VERSION = 1;

export interface SavedRun {
  v: number;
  sceneId: string;
  seed: string;
  difficulty: number;
  state: RunState;
  savedAt: number;
}

export interface PendingFinish {
  v: number;
  id: string;
  sceneId: string;
  seed: string;
  difficulty: number;
  turns: RunState["turns"];
  helped: string[];
  walkedOut: boolean;
  savedAt: number;
}

const runKey = (sceneId: string, seed: string) => `${SCENE_KEY_PREFIX}run.${sceneId}.${seed}`;
const PENDING = `${SCENE_KEY_PREFIX}pending`;

export function loadRun(sceneId: string, seed: string): SavedRun | null {
  try {
    const raw = window.localStorage.getItem(runKey(sceneId, seed));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedRun;
    if (parsed?.v !== VERSION || parsed.sceneId !== sceneId || parsed.seed !== seed) return null;
    if (!parsed.state || !Array.isArray(parsed.state.turns)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRun(run: Omit<SavedRun, "v" | "savedAt">): void {
  try {
    window.localStorage.setItem(runKey(run.sceneId, run.seed), JSON.stringify({ ...run, v: VERSION, savedAt: Date.now() }));
  } catch {
    // Storage full or blocked: the scene still plays, only the safety net is gone.
  }
}

export function clearRun(sceneId: string, seed: string): void {
  try {
    window.localStorage.removeItem(runKey(sceneId, seed));
  } catch {
    // As above.
  }
}

export function readPending(): PendingFinish[] {
  try {
    const raw = window.localStorage.getItem(PENDING);
    const parsed = raw ? (JSON.parse(raw) as PendingFinish[]) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => p?.v === VERSION && typeof p.id === "string") : [];
  } catch {
    return [];
  }
}

export function addPending(item: Omit<PendingFinish, "v" | "savedAt">): void {
  try {
    const held = readPending().filter((p) => p.id !== item.id);
    window.localStorage.setItem(PENDING, JSON.stringify([...held, { ...item, v: VERSION, savedAt: Date.now() }]));
  } catch {
    // As above.
  }
}

export function dropPending(id: string): void {
  try {
    window.localStorage.setItem(PENDING, JSON.stringify(readPending().filter((p) => p.id !== id)));
  } catch {
    // As above.
  }
}
