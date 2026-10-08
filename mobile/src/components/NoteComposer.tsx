import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { CareApi } from '../api';
import { categoryLabels, cleanNote, errorMessage, noteProblem, soundsUrgent, type Contact, type NoteInput } from '../model';
import { readAloud } from '../readAloud';
import { colors, ui } from '../theme';
import { useVoiceInput } from '../voice';
import { Button, Checkbox, Notice } from './controls';
import NoteEditor from './NoteEditor';
import UrgentHelp from './UrgentHelp';

type Draft = NoteInput & { keep: boolean };
type Props = { api: CareApi; personName: string; forSelf: boolean; contacts: Contact[]; onSaved: () => void };

export default function NoteComposer({ api, personName, forSelf, contacts, onSaved }: Props) {
  const [words, setWords] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [draftedFrom, setDraftedFrom] = useState({ words: '', model: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const wordsBeforeListening = useRef('');

  const voice = useVoiceInput(
    (heard) => setWords(wordsBeforeListening.current ? `${wordsBeforeListening.current} ${heard}` : heard),
    setMessage,
  );

  function changeWords(value: string) {
    setWords(value);
    setDrafts(null); // drafts must match the words they came from
  }

  async function listen() {
    if (voice.listening) return voice.stop();
    wordsBeforeListening.current = words.trim();
    setDrafts(null);
    setMessage('');
    await voice.start();
  }

  async function organize() {
    const text = words.trim();
    if (text.length < 2) return setMessage('Speak or type a note first.');
    setBusy(true);
    setMessage('');
    try {
      const proposal = await api.proposeNotes(text);
      if (proposal.notes.length === 0) {
        setMessage("I didn't find anything to save. Try saying how you feel, or something about a medicine, doctor or appointment.");
        return;
      }
      setDraftedFrom({ words: text, model: proposal.model });
      setDrafts(proposal.notes.map((note) => ({ ...note, private: false, keep: true })));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(index: number, change: Partial<Draft>) {
    setDrafts((current) => current && current.map((draft, i) => (i === index ? { ...draft, ...change } : draft)));
  }

  function readDrafts(chosen: Draft[]) {
    readAloud(chosen.map((draft, i) => [
      chosen.length > 1 ? `Note ${i + 1}.` : '',
      `${categoryLabels[draft.category]}. ${draft.title}. ${draft.details}.`,
      draft.event_time_text ? `When: ${draft.event_time_text}.` : '',
    ].join(' ')).join(' '));
  }

  async function saveDrafts() {
    const chosen = (drafts ?? []).filter((draft) => draft.keep);
    if (chosen.length === 0) return setMessage('Tick at least one note to save, or tap Discard.');
    const problem = chosen.map(noteProblem).find(Boolean);
    if (problem) return setMessage(problem);
    setBusy(true);
    const unsaved: Draft[] = [];
    for (const draft of chosen) {
      const { keep: _keep, ...note } = cleanNote(draft);
      try {
        await api.createNote({ ...note, source_text: draftedFrom.words, model: draftedFrom.model });
      } catch (error) {
        unsaved.push(draft);
        setMessage(`Not saved: ${errorMessage(error)}`);
      }
    }
    setBusy(false);
    onSaved();
    if (unsaved.length > 0) return setDrafts(unsaved);
    setDrafts(null);
    setWords('');
    setMessage(chosen.length === 1 ? 'Saved.' : `Saved ${chosen.length} notes.`);
  }

  const chosen = (drafts ?? []).filter((draft) => draft.keep);

  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>New note</Text>
      <Text style={ui.helper}>
        {forSelf ? 'How are you feeling? Any news about a medicine, doctor or appointment?' : `What's new with ${personName}?`}
      </Text>
      {voice.available ? (
        <Button
          label={voice.listening ? '■  Stop listening' : '🎙  Speak'}
          variant={voice.listening ? 'stop' : 'primary'}
          disabled={busy}
          onPress={listen}
        />
      ) : (
        <Text style={ui.small}>To speak instead of typing, tap the microphone on your keyboard.</Text>
      )}
      {voice.listening && <Text style={ui.helper}>Listening… speak now, then tap Stop.</Text>}
      <TextInput
        accessibilityLabel="Your note"
        // Locked while the assistant works or the phone listens, so drafts always match these words.
        editable={!busy && !voice.listening}
        multiline
        maxLength={4000}
        placeholder="Or type here…"
        placeholderTextColor={colors.placeholder}
        style={[ui.input, ui.largeInput]}
        value={words}
        onChangeText={changeWords}
      />
      {soundsUrgent(words) && <UrgentHelp contacts={contacts} />}
      <Text style={ui.small}>
        Organize sends these words to CareLoop's assistant (NVIDIA Nemotron on Nebius). Nothing is saved until you approve it.
      </Text>
      <Button label={busy && !drafts ? 'Organizing…' : 'Organize'} disabled={busy || voice.listening} onPress={organize} />
      <Notice message={message} />

      {drafts && (
        <View style={[ui.divider, styles.review]}>
          <Text style={ui.sectionTitle}>{drafts.length === 1 ? 'Check this note' : `Check these ${drafts.length} notes`}</Text>
          <Text style={ui.helper}>The assistant can make mistakes. Fix anything wrong before saving.</Text>
          <Button label="🔊  Read aloud" variant="outline" disabled={chosen.length === 0} onPress={() => readDrafts(chosen)} />
          {drafts.map((draft, index) => (
            <View key={index} style={[ui.divider, styles.review]}>
              {drafts.length > 1 && (
                <Checkbox label={`Save note ${index + 1}`} checked={draft.keep} onChange={(keep) => updateDraft(index, { keep })} />
              )}
              {draft.keep && <NoteEditor value={draft} canChangePrivacy onChange={(value) => updateDraft(index, value)} />}
            </View>
          ))}
          <Button label={chosen.length > 1 ? `Save ${chosen.length} notes` : 'Save'} disabled={busy} onPress={saveDrafts} />
          <Button label="Discard" variant="text" disabled={busy} onPress={() => setDrafts(null)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ review: { gap: 12 } });
