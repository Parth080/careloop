import Storage from 'expo-sqlite/kv-store';

import type { Circle, Contact, Note } from './model';

// The last data loaded from the server, so CareLoop (and its call buttons) still work without internet.
export type Snapshot = { circle: Circle; notes: Note[]; contacts: Contact[] };

const SNAPSHOT_KEY = 'careloop.snapshot';

export async function readSnapshot(): Promise<Snapshot | null> {
  try {
    const saved = await Storage.getItem(SNAPSHOT_KEY);
    return saved ? (JSON.parse(saved) as Snapshot) : null;
  } catch {
    return null;
  }
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  try {
    await Storage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Only an offline convenience; the server copy is the real record.
  }
}

export async function clearSnapshot(): Promise<void> {
  try {
    await Storage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Already gone.
  }
}
