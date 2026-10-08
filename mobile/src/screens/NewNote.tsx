import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { CareApi } from '../api';
import { Badge, Button, Checkbox, Field, Icon, ModalScreen, Notice, PrivacyLine, ScreenHeader, Txt } from '../components/kit';
import NoteFields from '../components/NoteFields';
import UrgentHelp from '../components/UrgentHelp';
import { categoryLabels, cleanNote, errorMessage, noteProblem, soundsUrgent, type Contact, type NoteInput } from '../model';
import { readAloud } from '../readAloud';
import { useTheme } from '../theme';
import { useVoiceInput } from '../voice';

type Draft = NoteInput & { keep: boolean };
type Props = { api: CareApi; personName: string; forSelf: boolean; contacts: Contact[]; onClose: () => void; onSaved: () => void };

/** Speak or type an update; the assistant drafts notes, and nothing is saved until the person checks them. */
export default function NewNote({ api, personName, forSelf, contacts, onClose, onSaved }: Props) {
  const { c, s } = useTheme();
  const [words, setWords] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [open, setOpen] = useState(0);
  const [draftedFrom, setDraftedFrom] = useState({ words: '', model: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const wordsBeforeListening = useRef('');
  const voice = useVoiceInput(
    (heard) => setWords(wordsBeforeListening.current ? `${wordsBeforeListening.current} ${heard}` : heard),
    setMessage,
  );
  const urgent = soundsUrgent(words);
  const chosen = (drafts ?? []).filter((draft) => draft.keep);

  async function listen() {
    if (voice.listening) return voice.stop();
    wordsBeforeListening.current = words.trim();
    setMessage('');
    await voice.start();
  }

  async function organize() {
    const text = words.trim();
    if (text.length < 2) return setMessage('Speak or type a few words first.');
    setBusy(true);
    setMessage('');
    try {
      const proposal = await api.proposeNotes(text);
      if (proposal.notes.length === 0) {
        setMessage("I didn't find anything to save. Try saying how you feel, or something about a medicine, doctor or visit.");
        return;
      }
      setDraftedFrom({ words: text, model: proposal.model });
      setDrafts(proposal.notes.map((note) => ({ ...note, private: false, keep: true })));
      setOpen(0);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function update(index: number, change: Partial<Draft>) {
    setDrafts((current) => current && current.map((draft, i) => (i === index ? { ...draft, ...change } : draft)));
  }

  function back() {
    setDrafts(null);
    setMessage('');
  }

  async function save() {
    if (chosen.length === 0) return setMessage('Tick at least one note to save, or tap Cancel.');
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
    if (unsaved.length > 0) {
      setDrafts(unsaved);
      setOpen(0);
      return;
    }
    onClose();
  }

  const composeFooter = (
    <>
      <Button
        label={busy ? 'Organizing…' : 'Organize my note'}
        icon="sparkle"
        variant={urgent ? 'secondary' : 'primary'}
        disabled={busy || voice.listening}
        onPress={organize}
      />
      <PrivacyLine text="Your words go to CareLoop's assistant (NVIDIA Nemotron on Nebius). Nothing is saved until you check it." />
    </>
  );
  const reviewFooter = (
    <Button label={busy ? 'Saving…' : chosen.length > 1 ? `Save ${chosen.length} notes` : 'Save note'} disabled={busy || chosen.length === 0} onPress={save} />
  );

  // One screen for both steps, so moving between them doesn't replay the slide-in.
  return (
    <ModalScreen
      onClose={drafts ? back : onClose}
      title="New note"
      header={
        drafts ? (
          <ScreenHeader
            title={drafts.length === 1 ? 'Check this note' : `Check ${drafts.length} notes`}
            right={<Button label="Cancel" variant="quiet" onPress={back} />}
          />
        ) : undefined
      }
      footer={drafts ? reviewFooter : composeFooter}
    >
      {drafts ? (
        <>
          {soundsUrgent(draftedFrom.words) && <UrgentHelp contacts={contacts} />}
          <Txt v="body" tone="textSecondary">
            The assistant can make mistakes. Fix anything wrong before saving.
          </Txt>
          <Button
            label={chosen.length === 2 ? 'Read both aloud' : chosen.length > 2 ? 'Read them aloud' : 'Read aloud'}
            icon="speaker"
            variant="secondary"
            disabled={chosen.length === 0}
            onPress={() =>
              readAloud(
                chosen
                  .map((draft, i) =>
                    [
                      chosen.length > 1 ? `Note ${i + 1}.` : '',
                      `${categoryLabels[draft.category]}. ${draft.title}. ${draft.details}.`,
                      draft.event_time_text ? `When: ${draft.event_time_text}.` : '',
                    ].join(' '),
                  )
                  .join(' '),
              )
            }
          />
          {drafts.map((draft, index) =>
            open === index ? (
              <View key={index} style={[s.card, s.cardFocus, { gap: 16 }]}>
                <Checkbox label={`Save note ${index + 1}`} checked={draft.keep} bold onChange={(keep) => update(index, { keep })} />
                {draft.keep && <NoteFields value={draft} canChangePrivacy onChange={(value) => update(index, value)} />}
              </View>
            ) : (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={`Open note ${index + 1}: ${draft.title}`}
                onPress={() => setOpen(index)}
                style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt v="label" tone="textSecondary">
                    Note {index + 1} · {categoryLabels[draft.category]}
                  </Txt>
                  <Txt v="headline">{draft.title}</Txt>
                  {!!draft.event_time_text && (
                    <Txt v="body" tone="textSecondary">
                      {draft.event_time_text}
                    </Txt>
                  )}
                </View>
                {!draft.keep && <Badge label="Not saving" kind="later" />}
                <Icon name="down" color={c.textSecondary} />
              </Pressable>
            ),
          )}
        </>
      ) : (
        <>
          <Txt v="title3">
            {forSelf
              ? 'How are you feeling? Any news about a medicine, doctor or visit?'
              : `What's new with ${personName}? Any news about a medicine, doctor or visit?`}
          </Txt>
          <Field
            label="Your words"
            multiline
            maxLength={4000}
            // Locked while the assistant works or the phone listens, so drafts always match these words.
            editable={!busy && !voice.listening}
            placeholder="For example: My knee hurt after the walk this morning."
            value={words}
            onChangeText={setWords}
            style={{ minHeight: 180 }}
          />
          {urgent && <UrgentHelp contacts={contacts} />}
          {voice.available ? (
            <Button
              label={voice.listening ? 'Stop listening' : 'Speak instead'}
              icon="mic"
              variant={voice.listening ? 'danger' : 'secondary'}
              disabled={busy}
              onPress={listen}
            />
          ) : (
            <View style={[s.cardSoft, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="mic" color={c.onPrimary} />
              </View>
              <Txt v="body" tone="onPrimarySoft" style={{ flex: 1 }}>
                To speak instead, tap the microphone on your keyboard.
              </Txt>
            </View>
          )}
          {voice.listening && (
            <Txt v="body" tone="primary">
              Listening… speak now, then tap Stop.
            </Txt>
          )}
        </>
      )}
      <Notice message={message} tone="warning" />
    </ModalScreen>
  );
}
