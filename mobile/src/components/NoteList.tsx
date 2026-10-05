import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { CareApi } from '../api';
import {
  categoryLabels,
  cleanNote,
  describeTime,
  editableFields,
  errorMessage,
  filterNotes,
  noteProblem,
  type Note,
  type NoteInput,
} from '../model';
import { readAloud } from '../readAloud';
import { colors, ui } from '../theme';
import { Button, Notice } from './controls';
import NoteEditor from './NoteEditor';

type Props = { notes: Note[]; myId: number; api: CareApi; onChanged: () => void };

export default function NoteList({ notes, myId, api, onChanged }: Props) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: number; value: NoteInput } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const shown = useMemo(() => filterNotes(notes, query), [notes, query]);

  async function saveEdit() {
    if (!editing) return;
    const problem = noteProblem(editing.value);
    if (problem) return setMessage(problem);
    try {
      await api.updateNote(editing.id, cleanNote(editing.value));
      setEditing(null);
      setMessage('');
      onChanged();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function confirmDelete(note: Note) {
    Alert.alert('Delete this note?', `"${note.title}" will be removed for everyone in the care circle.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteNote(note.id);
            onChanged();
          } catch (error) {
            setMessage(errorMessage(error));
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <Text style={ui.sectionTitle}>Notes</Text>
      {notes.length > 0 && (
        <TextInput
          accessibilityLabel="Search notes"
          placeholder="Search notes, for example: vomiting"
          placeholderTextColor={colors.placeholder}
          style={ui.input}
          value={query}
          onChangeText={setQuery}
        />
      )}
      <Notice message={message} />
      {notes.length === 0 && <Text style={ui.helper}>Saved notes will appear here, newest first.</Text>}
      {notes.length > 0 && shown.length === 0 && <Text style={ui.helper}>No notes match "{query.trim()}".</Text>}
      {shown.map((note) =>
        editing?.id === note.id ? (
          <View key={note.id} style={ui.card}>
            <NoteEditor
              value={editing.value}
              canChangePrivacy={note.created_by_id === myId}
              onChange={(value) => setEditing({ id: note.id, value })}
            />
            <Button label="Save changes" onPress={saveEdit} />
            <Button label="Cancel" variant="text" onPress={() => setEditing(null)} />
          </View>
        ) : (
          <View key={note.id} style={ui.card}>
            <View style={styles.badges}>
              <Text style={styles.category}>{categoryLabels[note.category].toUpperCase()}</Text>
              {note.private && <Text style={styles.private}>ONLY YOU</Text>}
            </View>
            <Text style={styles.title}>{note.title}</Text>
            <Text style={styles.details}>{note.details}</Text>
            {!!note.event_time_text && <Text style={styles.meta}>When: {note.event_time_text}</Text>}
            <Text style={styles.meta}>
              {note.created_by_name ? `Added by ${note.created_by_name}` : 'Added'} · {describeTime(note.created_at)}
              {note.updated_by_name ? ` · edited by ${note.updated_by_name}` : ''}
            </Text>
            {!!note.source_text && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: expanded === note.id }}
                onPress={() => setExpanded(expanded === note.id ? null : note.id)}
              >
                <Text style={styles.link}>{expanded === note.id ? '▾ What was said' : '▸ What was said'}</Text>
              </Pressable>
            )}
            {expanded === note.id && <Text style={styles.quote}>"{note.source_text}"</Text>}
            <View style={styles.actions}>
              <Button
                label="🔊 Read"
                variant="text"
                accessibilityLabel={`Read aloud: ${note.title}`}
                onPress={() => readAloud(`${note.title}. ${note.details}`)}
              />
              <Button
                label="Edit"
                variant="text"
                accessibilityLabel={`Edit: ${note.title}`}
                onPress={() => setEditing({ id: note.id, value: editableFields(note) })}
              />
              <Button label="Delete" variant="danger" accessibilityLabel={`Delete: ${note.title}`} onPress={() => confirmDelete(note)} />
            </View>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  badges: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  category: { color: '#397653', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  private: { color: colors.caution, fontSize: 12, fontWeight: '800', letterSpacing: 1, borderWidth: 1, borderColor: colors.caution, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  title: { color: colors.heading, fontSize: 21, fontWeight: '800' },
  details: { color: colors.text, fontSize: 17, lineHeight: 25 },
  meta: { color: '#486552', fontSize: 15, lineHeight: 21 },
  link: { color: colors.link, fontSize: 16, fontWeight: '700', paddingVertical: 6 },
  quote: { color: colors.muted, fontSize: 16, lineHeight: 23, fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
});
