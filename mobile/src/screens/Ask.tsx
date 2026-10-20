import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import type { CareApi } from '../api';
import { Badge, Button, Card, Icon, ModalScreen, Notice, Txt, type BadgeKind } from '../components/kit';
import UrgentHelp from '../components/UrgentHelp';
import {
  doseRecordStatus,
  errorMessage,
  soundsUrgent,
  splitAnswer,
  type AskResult,
  type AskSource,
  type Contact,
  type RecordKind,
  type RecordStatus,
} from '../model';
import { callNumber } from '../phone';
import { readAloud } from '../readAloud';
import { radius, size, type, useTheme } from '../theme';
import { useVoiceInput } from '../voice';

type Props = { api: CareApi; contacts: Contact[]; personName: string; forSelf: boolean; onClose: () => void; onSaved: () => void };

const kindLabels: Record<RecordKind, string> = { note: 'Note', medicine: 'Medicine', dose: 'Dose', appointment: 'Visit', contact: 'Contact' };
const statusBadges: Record<RecordStatus, [string, BadgeKind]> = {
  taken: ['Taken', 'taken'],
  skipped: ['Skipped', 'skipped'],
  not_marked: ['Not marked', 'notMarked'],
  not_due: ['Not due yet', 'later'],
};

/** Questions about the care records, answered only from those records and shown with them. */
export default function Ask({ api, contacts, personName, forSelf, onClose, onSaved }: Props) {
  const { c, s } = useTheme();
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const voice = useVoiceInput(setQuestion, setMessage);
  const doctor = contacts.find((contact) => contact.role === 'doctor');
  const examples = forSelf
    ? ['When is my next appointment?', 'Did I take my medicines today?', 'What did the doctor say last time?']
    : [`When is ${personName}'s next appointment?`, `Did ${personName} take the medicines today?`, 'What did the doctor say last time?'];

  async function ask(text = question) {
    const words = text.trim();
    if (words.length < 2) return setMessage('Type or say a question first.');
    setBusy(true);
    setMessage('');
    setResult(null);
    setSaved(false);
    setAsked(words);
    setQuestion('');
    try {
      setResult(await api.ask(words));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveForDoctor() {
    if (saving) return;
    setSaving(true);
    try {
      await api.createNote({ category: 'general', title: 'Question for the doctor', details: asked.slice(0, 1000), event_time_text: null, private: false, source_text: asked, model: null });
      setSaved(true);
      onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function callDoctor() {
    if (!doctor) return;
    const problem = await callNumber(doctor.phone);
    if (problem) setMessage(problem);
  }

  const footer = (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
      <TextInput
        accessibilityLabel="Your question"
        editable={!busy && !voice.listening}
        multiline
        maxLength={500}
        placeholder={asked ? 'Ask another question' : 'Type a question'}
        placeholderTextColor={c.textMuted}
        maxFontSizeMultiplier={1.4}
        style={[s.input, { flex: 1, maxHeight: 140 }]}
        value={question}
        onChangeText={setQuestion}
      />
      {voice.available && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={voice.listening ? 'Stop listening' : 'Speak your question'}
          onPress={() => (voice.listening ? voice.stop() : void voice.start())}
          style={{ width: size.touchMin, height: size.touchMin, borderRadius: radius.md, borderWidth: 2, borderColor: c.primary, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="mic" color={voice.listening ? c.danger : c.primary} />
        </Pressable>
      )}
      <Button label="Ask" disabled={busy || voice.listening} onPress={() => ask()} style={{ minHeight: size.touchMin, paddingHorizontal: 22 }} />
    </View>
  );

  const urgent = soundsUrgent(question) || soundsUrgent(asked) || !!result?.urgent;

  return (
    <ModalScreen onClose={onClose} title="Ask CareLoop" footer={footer}>
      {!asked && (
        <>
          <Txt v="title3">Ask about notes, medicines, doses or visits.</Txt>
          <Txt v="body" tone="textSecondary">
            CareLoop answers only from what this family has saved, and shows you where the answer came from.
          </Txt>
          <View style={{ gap: 10 }}>
            {examples.map((example) => (
              <Pressable
                key={example}
                accessibilityRole="button"
                onPress={() => ask(example)}
                style={({ pressed }) => [s.card, { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed && { backgroundColor: c.surfaceSunken }]}
              >
                <Icon name="ask" color={c.primary} />
                <Txt v="body" style={{ flex: 1 }}>
                  {example}
                </Txt>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {!!asked && (
        <View style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: c.text, borderRadius: radius.lg, borderBottomRightRadius: 6, paddingHorizontal: 18, paddingVertical: 14 }}>
          <Txt v="bodyLarge" style={{ color: c.bg }}>
            {asked}
          </Txt>
        </View>
      )}
      {urgent && <UrgentHelp contacts={contacts} />}
      {busy && (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
          <ActivityIndicator size="large" color={c.primary} />
          <Txt v="body" tone="textSecondary">
            Looking through the records…
          </Txt>
        </View>
      )}
      <Notice message={message} tone="warning" />

      {result?.kind === 'answer' && result.answer && (
        <>
          <Card style={{ gap: 14 }}>
            <Txt v="title3">{splitAnswer(result.answer).lead}</Txt>
            {!!splitAnswer(result.answer).rest && <Txt v="bodyLarge">{splitAnswer(result.answer).rest}</Txt>}
            <Button label="Read aloud" icon="speaker" variant="secondary" onPress={() => readAloud(result.answer!)} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="checked" color={c.primary} />
              <Txt v="label" tone="primary">
                Checked against {result.sources.length === 1 ? '1 record' : `${result.sources.length} records`}
              </Txt>
            </View>
          </Card>
          <Records title={result.sources.length === 1 ? 'From this record' : 'From these records'} sources={result.sources} />
        </>
      )}

      {result?.kind === 'dose_records' && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt v="title3">Dose records</Txt>
              <Txt v="bodySmall" tone="textMuted">
                Shown exactly as saved
              </Txt>
            </View>
            <Button label="Read" icon="speaker" variant="secondary" onPress={() => readAloud(result.sources.map((source) => source.text).join(' '))} />
          </View>
          <Records sources={result.sources} />
        </>
      )}

      {result?.kind === 'ask_doctor' && (
        <>
          <View style={s.doctorBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.info, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="doctor" size={28} color={c.onPrimary} />
              </View>
              <Txt v="title3" tone="onInfoSoft" style={{ flex: 1 }}>
                Please ask your doctor
              </Txt>
            </View>
            <Txt v="bodyLarge" tone="onInfoSoft">
              This needs a doctor's advice, so CareLoop won't answer it.
            </Txt>
            {!result.urgent && (
              <>
                <Button label={saved ? 'Saved for the next visit' : 'Save question for the doctor'} icon={saved ? 'check' : undefined} variant="info" disabled={saved || saving} onPress={saveForDoctor} />
                <Txt v="bodySmall" tone="onInfoSoft">
                  It's saved as a note the care circle can see, so it appears in the summary for the doctor.
                </Txt>
              </>
            )}
            {doctor && <Button label={`Call ${doctor.name}`} icon="phone" variant="quiet" onPress={callDoctor} />}
          </View>
          {result.sources.length > 0 && <Records title="What the records say" sources={result.sources} />}
        </>
      )}

      {result?.kind === 'records' && (
        <>
          <Notice tone="neutral" message="Here's what I found. I couldn't check a full answer against these records, so please read them yourself." />
          <Records sources={result.sources} />
        </>
      )}

      {result?.kind === 'not_found' && (
        <Card>
          <Txt v="title3">I couldn't find that in CareLoop.</Txt>
          <Txt v="body" tone="textSecondary">
            CareLoop only knows the notes, medicines, doses, visits and contacts saved here.
          </Txt>
        </Card>
      )}

      {!!result && (
        <Txt v="bodySmall" tone="textMuted">
          Answers come only from this family's records. A separate check compares each answer with the records shown.
        </Txt>
      )}
    </ModalScreen>
  );
}

function Records({ title, sources }: { title?: string; sources: AskSource[] }) {
  const { c, s } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {title && (
        <View>
          <Txt v="headline" tone="textSecondary">
            {title}
          </Txt>
          <Txt v="bodySmall" tone="textMuted">
            Shown exactly as saved
          </Txt>
        </View>
      )}
      {sources.map((source, index) => {
        const status = source.kind === 'dose' ? doseRecordStatus(source.text) : null;
        return (
          <View
            key={index}
            style={[s.card, { padding: 16, gap: 10 }, status === 'not_due' && { borderWidth: 2, borderStyle: 'dashed', borderColor: c.textMuted }]}
          >
            {status ? <Badge label={statusBadges[status][0]} kind={statusBadges[status][1]} /> : <Txt v="label" tone="primary">{kindLabels[source.kind] ?? 'Record'}</Txt>}
            <Txt v="body" style={type.body}>
              {source.text}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}
