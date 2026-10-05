// Shared types and plain helpers. Keep React Native out of this file so Node can test it directly.

export const categories = ['symptom', 'appointment', 'medication', 'doctor', 'general'] as const;
export type Category = (typeof categories)[number];
export const categoryLabels: Record<Category, string> = {
  symptom: 'Symptom',
  appointment: 'Appointment',
  medication: 'Medicine',
  doctor: 'Doctor',
  general: 'Other',
};

export type Role = 'care_recipient' | 'caregiver';
export type ContactRole = 'emergency' | 'doctor';

export type Member = {
  id: number;
  name: string;
  role: Role;
  is_creator: boolean;
  is_me: boolean;
  can_remove: boolean;
  joined_at: string;
};
export type Circle = { me: Member; profile: { id: number; person_name: string }; members: Member[]; can_manage: boolean };
export type Session = Circle & { token: string };
export type Invite = { code: string; role: Role; expires_at: string };

export type NoteFields = { category: Category; title: string; details: string; event_time_text: string | null };
export type NoteInput = NoteFields & { private: boolean };
export type NewNote = NoteInput & { source_text: string | null; model: string | null };
export type Note = NewNote & {
  id: number;
  created_at: string;
  created_by_id: number | null;
  created_by_name: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};
export type Proposal = { notes: NoteFields[]; model: string };
export type Contact = { role: ContactRole; name: string; phone: string; updated_at: string; updated_by_name: string | null };

export function roleLabel(role: Role): string {
  return role === 'care_recipient' ? 'Receives care' : 'Caregiver';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNoteFields(value: unknown): value is NoteFields {
  return isRecord(value) && categories.some((category) => category === value.category) &&
    typeof value.title === 'string' && typeof value.details === 'string' &&
    (value.event_time_text === null || value.event_time_text === undefined || typeof value.event_time_text === 'string');
}

/** Check the assistant's reply before showing it, so a bad response can't break the review screen. */
export function parseProposal(value: unknown): Proposal {
  if (!isRecord(value) || typeof value.model !== 'string' || !Array.isArray(value.notes) || !value.notes.every(isNoteFields)) {
    throw new Error("Couldn't read the assistant's draft. Please try again.");
  }
  return {
    model: value.model,
    notes: value.notes.map((note) => ({ ...note, event_time_text: note.event_time_text ?? null })),
  };
}

/** A message for the person if the note can't be saved as it is, otherwise null. */
export function noteProblem(note: NoteFields): string | null {
  const title = note.title.trim();
  const details = note.details.trim();
  if (!title) return 'Add a short title.';
  if (title.length > 120) return 'Make the title shorter (120 letters at most).';
  if (!details) return 'Add a few words of detail.';
  if (details.length > 1000) return 'Make the details shorter (1,000 letters at most).';
  if ((note.event_time_text ?? '').trim().length > 200) return 'Make the "when" shorter.';
  return null;
}

/** Just the fields a person can edit; the server rejects anything else. */
export function editableFields(note: Note): NoteInput {
  return { category: note.category, title: note.title, details: note.details, event_time_text: note.event_time_text, private: note.private };
}

export function cleanNote<T extends NoteFields>(note: T): T {
  return { ...note, title: note.title.trim(), details: note.details.trim(), event_time_text: note.event_time_text?.trim() || null };
}

export function filterNotes(notes: Note[], query: string): Note[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return notes;
  return notes.filter((note) => {
    const text = [
      note.title, note.details, categoryLabels[note.category], note.event_time_text, note.source_text, note.created_by_name,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

/** Digits with an optional leading +, or null if this can't be dialled. Same rule as the server. */
export function dialableNumber(value: string): string | null {
  const number = value.trim().replace(/[ ().-]/g, '');
  return /^\+?[0-9]{3,15}$/.test(number) ? number : null;
}

/**
 * Where the API lives. An explicit EXPO_PUBLIC_API_URL wins. In development the API runs on the same
 * computer as the Expo dev server, so reuse that host with the API's port.
 */
export function resolveApiUrl(configured: string | undefined, hostUri: string | null | undefined, isDev: boolean): string | null {
  const explicit = configured?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  if (!isDev || !hostUri) return null;
  const host = hostUri.split('/')[0].replace(/:\d+$/, '');
  if (!host || host.endsWith('.exp.direct')) return null; // tunnels expose only the Expo port
  return `http://${host}:8000`;
}

/** Read Devanagari text with a Hindi voice; everything else with Indian English. */
export function speechLanguage(text: string): string {
  return /[ऀ-ॿ]/.test(text) ? 'hi-IN' : 'en-IN';
}

export function describeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayStart = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const daysAgo = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  if (daysAgo === 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  if (daysAgo === -1) return `Tomorrow, ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${day}, ${time}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.';
}
