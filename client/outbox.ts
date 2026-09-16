import { useSyncExternalStore } from 'react';
import type { CreateInspection } from '../shared/schema';
import { api, ApiError } from './api';

export interface PendingInspection extends CreateInspection {
  clientRef: string;
  queuedAt: string;
  error?: string;
}

// Inspections the supervisor saved while the server was unreachable. This module is
// the only thing that touches localStorage.
const STORAGE_KEY = 'inspection-outbox';
const listeners = new Set<() => void>();
let items: PendingInspection[] = load();

function load(): PendingInspection[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(next: PendingInspection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function commit(next: PendingInspection[]) {
  items = next;
  for (const listener of listeners) listener();
}

export const readOutbox = () => items;

// Returns false if the browser refuses to store it (private mode, quota), so the form
// can keep the input on screen instead of pretending it was saved.
export function enqueue(input: CreateInspection & { clientRef: string }) {
  const next = [...items, { ...input, queuedAt: new Date().toISOString() }];
  try {
    persist(next);
  } catch {
    return false;
  }
  commit(next);
  return true;
}

function update(next: PendingInspection[]) {
  commit(next);
  try {
    persist(next);
  } catch {
    // Nothing useful to do; the in-memory copy is already updated.
  }
}

export function discard(clientRef: string) {
  update(items.filter((item) => item.clientRef !== clientRef));
}

let inflight: Promise<number> | undefined;

// Sends queued inspections oldest first and resolves with how many got through. Stops
// at the first sign the server can't be reached or we're signed out; whatever is left
// waits for the next attempt. Only one replay runs at a time.
export function replay() {
  inflight ??= run().finally(() => {
    inflight = undefined;
  });
  return inflight;
}

async function run() {
  let synced = 0;
  for (const item of items) {
    if (item.error) continue;
    const { queuedAt: _queuedAt, error: _error, ...payload } = item;
    try {
      await api('/inspections', { method: 'POST', body: JSON.stringify(payload) });
      discard(item.clientRef);
      synced++;
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      // The server understood the request and rejected it; retrying won't help.
      if (status >= 400 && status < 500 && status !== 401) {
        const message = (error as Error).message;
        update(items.map((i) => (i.clientRef === item.clientRef ? { ...i, error: message } : i)));
        continue;
      }
      break;
    }
  }
  return synced;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const useOutbox = () => useSyncExternalStore(subscribe, readOutbox);

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine);
