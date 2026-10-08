import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { CareApi } from '../api';
import { errorMessage, soundsUrgent, type AskResult, type Contact, type RecordKind } from '../model';
import { callNumber } from '../phone';
import { readAloud } from '../readAloud';
import { colors, ui } from '../theme';
import { useVoiceInput } from '../voice';
import { Button, Notice } from './controls';
import UrgentHelp from './UrgentHelp';

type Props = { api: CareApi; contacts: Contact[]; personName: string; forSelf: boolean; onSaved: () => void };

const icons: Record<RecordKind, string> = { note: '📝', medicine: '💊', dose: '🕗', appointment: '📅', contact: '☎' };
const NOT_FOUND = "I couldn't find that in CareLoop. It only knows the notes, medicines, doses, appointments and contacts saved here.";
const ASK_DOCTOR = "That needs a doctor's advice, so CareLoop won't answer it.";
const UNCHECKED = "Here's what I found. I couldn't check a full answer against these records, so please read them yourself:";
const DOSES = "Here's what the dose records say:";

/** Questions about the care records, answered only from those records. */
export default function AskCareLoop({ api, contacts, personName, forSelf, onSaved }: Props) {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [questionSaved, setQuestionSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const voice = useVoiceInput(setQuestion, setMessage);
  const doctor = contacts.find((contact) => contact.role === 'doctor');

  function changeQuestion(value: string) {
    setQuestion(value);
    setResult(null); // an answer must match the question above it
  }

  async function listen() {
    if (voice.listening) return voice.stop();
    setResult(null);
    setMessage('');
    await voice.start();
  }

  async function ask() {
    const text = question.trim();
    if (text.length < 2) return setMessage('Type or say a question first.');
    setBusy(true);
    setMessage('');
    setResult(null);
    setQuestionSaved(false);
    try {
      setResult(await api.ask(text));
      setAsked(text);
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
      await api.createNote({
        category: 'general',
        title: 'Question for the doctor',
        details: asked.slice(0, 1000),
        event_time_text: null,
        private: false,
        source_text: asked,
        model: null,
      });
      setQuestionSaved(true);
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

  const replies = { answer: result?.answer, dose_records: DOSES, records: UNCHECKED, ask_doctor: ASK_DOCTOR, not_found: NOT_FOUND };
  const reply = result && replies[result.kind];
  const spoken = result?.kind === 'dose_records' ? result.sources.map((source) => source.text).join(' ') : reply;

  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>Ask CareLoop</Text>
      <Text style={ui.helper}>
        {forSelf
          ? 'Ask about your notes, medicines or appointments. For example: When is my next appointment?'
          : `Ask about ${personName}'s notes, medicines or appointments. For example: Did ${personName} take the morning medicines?`}
      </Text>
      {voice.available && (
        <Button
          label={voice.listening ? '■  Stop listening' : '🎙  Speak your question'}
          variant={voice.listening ? 'stop' : 'outline'}
          disabled={busy}
          onPress={listen}
        />
      )}
      <TextInput
        accessibilityLabel="Your question"
        editable={!busy && !voice.listening}
        multiline
        maxLength={500}
        placeholder="Type a question…"
        placeholderTextColor={colors.placeholder}
        style={ui.input}
        value={question}
        onChangeText={changeQuestion}
      />
      {(soundsUrgent(question) || result?.urgent) && <UrgentHelp contacts={contacts} />}
      <Button label={busy ? 'Looking through the records…' : 'Ask'} disabled={busy || voice.listening} onPress={ask} />
      <Notice message={message} />

      {result && !!reply && (
        <View style={[ui.divider, styles.result]}>
          <Text style={result.kind === 'answer' ? styles.answer : styles.reply}>{reply}</Text>
          {(result.kind === 'answer' || result.kind === 'dose_records') && !!spoken && (
            <Button label="🔊  Read aloud" variant="outline" onPress={() => readAloud(spoken)} />
          )}
          {result.sources.length > 0 && (
            <View style={styles.sources}>
              {result.kind !== 'dose_records' && (
                <Text style={ui.label}>{result.kind === 'answer' ? 'From these records' : 'What the records say'}</Text>
              )}
              {result.sources.map((source, index) => (
                <Text key={index} style={styles.source}>
                  {icons[source.kind] ?? '•'} {source.text}
                </Text>
              ))}
            </View>
          )}
          {result.kind === 'ask_doctor' && !result.urgent && (
            <>
              <Button
                label={questionSaved ? 'Saved for the next visit ✓' : 'Save this question for the doctor'}
                variant="outline"
                disabled={questionSaved || saving}
                onPress={saveForDoctor}
              />
              <Text style={ui.small}>It's saved as a note the care circle can see, so it appears in the summary for the doctor.</Text>
              {doctor && <Button label={`☎  Call ${doctor.name}`} variant="text" onPress={callDoctor} />}
            </>
          )}
        </View>
      )}
      <Text style={ui.small}>
        Answers come only from this care circle's records. NVIDIA Nemotron on Nebius writes each answer, a separate check compares it
        with the records it used, and those records are shown with it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  result: { gap: 10 },
  answer: { color: colors.heading, fontSize: 20, lineHeight: 28, fontWeight: '700' },
  reply: { color: colors.text, fontSize: 17, lineHeight: 25 },
  sources: { gap: 6 },
  source: { color: colors.muted, fontSize: 15, lineHeight: 22, backgroundColor: '#F3F5EF', padding: 10, borderRadius: 10 },
});
