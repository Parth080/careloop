import * as SQLite from 'expo-sqlite';

export type Category = 'symptom' | 'appointment' | 'medication' | 'doctor' | 'general';
export type ProposedNote = { category: Category; title: string; details: string; event_time_text: string | null };
export type SavedNote = ProposedNote & { id: number; created_at: string };
export type ContactRole = 'emergency' | 'doctor';
export type TrustedContact = { role: ContactRole; name: string; phone: string };

const database = SQLite.openDatabaseAsync('careloop.db');

export async function initializeNotes(): Promise<void> {
  const db = await database;
  await db.execAsync(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    event_time_text TEXT,
    created_at TEXT NOT NULL
  );`);
  await db.execAsync(`CREATE TABLE IF NOT EXISTS trusted_contacts (
    role TEXT PRIMARY KEY CHECK(role IN ('emergency', 'doctor')),
    name TEXT NOT NULL,
    phone TEXT NOT NULL
  );`);
}

export async function listNotes(): Promise<SavedNote[]> {
  const db = await database;
  return db.getAllAsync<SavedNote>('SELECT * FROM notes ORDER BY id DESC');
}

export async function saveNote(note: ProposedNote): Promise<void> {
  const db = await database;
  await db.runAsync(
    'INSERT INTO notes (category, title, details, event_time_text, created_at) VALUES (?, ?, ?, ?, ?)',
    note.category, note.title.trim(), note.details.trim(), note.event_time_text?.trim() || null, new Date().toISOString(),
  );
}

export async function deleteNote(id: number): Promise<void> {
  const db = await database;
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
}

export async function listTrustedContacts(): Promise<TrustedContact[]> {
  const db = await database;
  return db.getAllAsync<TrustedContact>('SELECT role, name, phone FROM trusted_contacts');
}

export async function saveTrustedContact(contact: TrustedContact): Promise<void> {
  const db = await database;
  await db.runAsync(
    'INSERT INTO trusted_contacts (role, name, phone) VALUES (?, ?, ?) ON CONFLICT(role) DO UPDATE SET name = excluded.name, phone = excluded.phone',
    contact.role, contact.name.trim(), contact.phone.trim(),
  );
}

export async function deleteTrustedContact(role: ContactRole): Promise<void> {
  const db = await database;
  await db.runAsync('DELETE FROM trusted_contacts WHERE role = ?', role);
}
