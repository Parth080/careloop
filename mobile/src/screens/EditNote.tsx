import { useState } from 'react';

import type { CareApi } from '../api';
import { Button, ModalScreen, Notice } from '../components/kit';
import NoteFields from '../components/NoteFields';
import { cleanNote, editableFields, errorMessage, noteProblem, type Note } from '../model';

type Props = { api: CareApi; note: Note; myId: number; onClose: () => void; onSaved: () => void };

/** Changing a saved note. Only its author can change who sees it. */
export default function EditNote({ api, note, myId, onClose, onSaved }: Props) {
  const [value, setValue] = useState(() => editableFields(note));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    const problem = noteProblem(value);
    if (problem) return setMessage(problem);
    setBusy(true);
    try {
      await api.updateNote(note.id, cleanNote(value));
      onSaved();
      onClose();
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <ModalScreen
      onClose={onClose}
      title="Change note"
      footer={
        <>
          <Notice message={message} tone="warning" />
          <Button label={busy ? 'Saving…' : 'Save changes'} disabled={busy} onPress={save} />
        </>
      }
    >
      <NoteFields value={value} canChangePrivacy={note.created_by_id === myId} onChange={setValue} />
    </ModalScreen>
  );
}
