import { useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import type { CareApi } from '../api';
import { afterTransition, Badge, Button, Card, Expander, Icon, Notice, Sheet, Txt } from '../components/kit';
import TabPage from '../components/TabPage';
import { addDays, categoryLabels, describeTime, errorMessage, filterNotes, localDate, suggestDayAndTime, type Note } from '../model';
import type { Overlay } from '../navigation';
import { readAloud } from '../readAloud';
import { size, useTheme } from '../theme';

type Props = {
  notes: Note[];
  api: CareApi;
  onChanged: () => void;
  open: (overlay: Overlay) => void;
  refreshing: boolean;
  onRefresh: () => void;
  offline: boolean;
};

export default function NotesTab({ notes, api, onChanged, open, refreshing, onRefresh, offline }: Props) {
  const { c, s } = useTheme();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Note | null>(null);
  const [showSaid, setShowSaid] = useState(false);
  const [message, setMessage] = useState('');
  const shown = useMemo(() => filterNotes(notes, query), [notes, query]);

  function confirmDelete(note: Note) {
    Alert.alert('Delete this note?', `"${note.title}" will be removed for everyone in the care circle.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteNote(note.id);
            setChosen(null);
            onChanged();
          } catch (error) {
            setMessage(errorMessage(error));
          }
        },
      },
    ]);
  }

  function planVisit(note: Note) {
    // "Tomorrow" means the day after the note was spoken, not the day after today.
    const today = localDate();
    const suggestion = suggestDayAndTime(note.event_time_text ?? note.details, localDate(new Date(note.created_at)));
    setChosen(null);
    afterTransition(() => open({
      kind: 'visit',
      appointment: null,
      heard: note.event_time_text,
      initial: {
        title: note.title,
        day: suggestion.day && suggestion.day >= today ? suggestion.day : addDays(today, 1),
        time: suggestion.time,
        place: null,
        with_whom: null,
        notes: note.details,
      },
    }));
  }

  return (
    <TabPage refreshing={refreshing} onRefresh={onRefresh} offline={offline}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Txt v="title1" accessibilityRole="header" style={{ flex: 1 }}>
          Notes
        </Txt>
        <Button label="+ New note" variant="secondary" onPress={() => open({ kind: 'note' })} />
      </View>
      {notes.length > 0 && (
        <View style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 0 }]}>
          <Icon name="search" color={c.textMuted} />
          <TextInput
            accessibilityLabel="Search notes"
            placeholder="Search, for example: knee"
            placeholderTextColor={c.textMuted}
            maxFontSizeMultiplier={1.4}
            style={[s.input, { flex: 1, borderWidth: 0, paddingHorizontal: 0, minHeight: size.touchMin - 4 }]}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      )}
      <Notice message={message} tone="warning" />
      {notes.length === 0 && (
        <Card>
          <Txt v="title3">No notes yet</Txt>
          <Txt v="body" tone="textSecondary">
            Say how you feel, or anything about a medicine, doctor or visit. Saved notes appear here, newest first.
          </Txt>
        </Card>
      )}
      {notes.length > 0 && shown.length === 0 && <Txt v="body">No notes match "{query.trim()}".</Txt>}
      {shown.map((note) => (
        <Pressable
          key={note.id}
          accessibilityRole="button"
          accessibilityLabel={`${categoryLabels[note.category]}${note.private ? ', only you can see it' : ''}: ${note.title}. ${note.details}. ${describeTime(note.created_at)}. Opens actions.`}
          onPress={() => {
            setShowSaid(false);
            setChosen(note);
          }}
          style={({ pressed }) => [s.card, pressed && { backgroundColor: c.surfaceSunken }]}
        >
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Badge label={categoryLabels[note.category]} kind="soft" />
            {note.private && <Badge label="Only you" kind="onlyYou" />}
          </View>
          <Txt v="title3">{note.title}</Txt>
          <Txt v="body" numberOfLines={4}>
            {note.details}
          </Txt>
          {!!note.event_time_text && (
            <Txt v="bodySmall" tone="textSecondary">
              When: {note.event_time_text}
            </Txt>
          )}
          <Txt v="bodySmall" tone="textMuted">
            {note.created_by_name ? `${note.created_by_name} · ` : ''}
            {describeTime(note.created_at)}
            {note.updated_by_name ? ` · edited by ${note.updated_by_name}` : ''}
          </Txt>
        </Pressable>
      ))}

      {chosen && (
        <Sheet
          visible
          onClose={() => setChosen(null)}
          title={chosen.title}
          subtitle={
            <>
              <Txt v="body">{chosen.details}</Txt>
              <Txt v="bodySmall" tone="textMuted">
                {chosen.created_by_name ? `${chosen.created_by_name} · ` : ''}
                {describeTime(chosen.created_at)}
              </Txt>
            </>
          }
        >
          {!!chosen.source_text && (
            <>
              <Expander label="What was said" expanded={showSaid} onToggle={() => setShowSaid(!showSaid)} />
              {showSaid && (
                <View style={s.cardRecord}>
                  <Txt v="body">"{chosen.source_text}"</Txt>
                </View>
              )}
            </>
          )}
          <Button label="Read aloud" icon="speaker" variant="secondary" onPress={() => readAloud(`${chosen.title}. ${chosen.details}`)} />
          {chosen.category === 'appointment' && <Button label="Add to visits" icon="calendar" variant="secondary" onPress={() => planVisit(chosen)} />}
          <Button
            label="Edit"
            icon="edit"
            variant="secondary"
            onPress={() => {
              const note = chosen;
              setChosen(null);
              afterTransition(() => open({ kind: 'editNote', note }));
            }}
          />
          <Button label="Delete this note" icon="trash" variant="removal" onPress={() => confirmDelete(chosen)} />
        </Sheet>
      )}
    </TabPage>
  );
}
