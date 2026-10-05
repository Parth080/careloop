import type { ProposedNote } from './notes';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;

export async function proposeNote(transcript: string): Promise<ProposedNote> {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL in mobile/.env.local to your computer’s LAN address.');
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/notes/propose`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript }),
  });
  if (!response.ok) throw new Error(`AI service could not organize the note (${response.status}).`);
  const data = await response.json();
  return data.proposal as ProposedNote;
}
