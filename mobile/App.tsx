import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { proposeNote } from './src/api';
import TrustedContacts from './src/TrustedContacts';
import { deleteNote, initializeNotes, listNotes, saveNote, type Category, type ProposedNote, type SavedNote } from './src/notes';

const categories: Category[] = ['symptom', 'appointment', 'medication', 'doctor', 'general'];

export default function App() {
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState<ProposedNote | null>(null);
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');

  useSpeechRecognitionEvent('result', (event) => {
    const spoken = event.results[0]?.transcript;
    if (spoken) setTranscript(spoken);
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    setMessage(event.message || 'Voice input did not work. You can type instead.');
  });

  useEffect(() => {
    initializeNotes().then(listNotes).then(setNotes).catch(() => setMessage('Could not open notes on this phone.'));
  }, []);

  async function toggleListening() {
    if (listening) return ExpoSpeechRecognitionModule.stop();
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setMessage('Microphone and speech permission are needed for voice notes. You can type instead.');
        return;
      }
      setDraft(null);
      setMessage('Listening. Speak naturally, then tap Stop.');
      setListening(true);
      ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: false });
    } catch {
      setListening(false);
      setMessage('Voice input did not start. You can type instead.');
    }
  }

  async function organize() {
    if (transcript.trim().length < 2) return setMessage('Speak or type a note first.');
    setBusy(true);
    setMessage('Organizing your note…');
    try {
      setDraft(await proposeNote(transcript.trim()));
      setMessage('Review and edit this draft before saving.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not organize the note.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDraft() {
    if (!draft?.title.trim() || !draft.details.trim()) return setMessage('Add a title and details before saving.');
    try {
      await saveNote(draft);
      setNotes(await listNotes());
      setTranscript('');
      setDraft(null);
      setMessage('Saved on this phone.');
    } catch {
      setMessage('The note could not be saved. Please try again.');
    }
  }

  function confirmDelete(note: SavedNote) {
    Alert.alert('Delete note?', note.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteNote(note.id); setNotes(await listNotes()); }
        catch { setMessage('Could not delete the note.'); }
      } },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>PERSONAL AI · FIRST PROTOTYPE</Text>
        <Text style={styles.heading}>CareLoop</Text>
        <Text style={styles.intro}>Tell your story in your own words. Review every note before it is saved.</Text>
        <TrustedContacts />
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>New note</Text>
          <Text style={styles.helper}>Talk about a symptom, appointment, medicine, or doctor.</Text>
          <Pressable accessibilityRole="button" onPress={toggleListening} style={[styles.button, listening && styles.stopButton]}>
            <Text style={styles.buttonText}>{listening ? '■  Stop listening' : '🎙  Speak a note'}</Text>
          </Pressable>
          <Text style={styles.label}>Check the words before sending</Text>
          <TextInput accessibilityLabel="Your note" multiline placeholder="Or type your note here…" placeholderTextColor="#667569" style={[styles.input, styles.largeInput]} textAlignVertical="top" value={transcript} onChangeText={(value) => { setTranscript(value); setDraft(null); }} />
          <Text style={styles.privacy}>Voice input may use your phone's speech service. When you tap Organize, the text is sent to Nebius AI. A note is saved on this phone only after you approve it.</Text>
          <Pressable accessibilityRole="button" disabled={busy || listening} onPress={organize} style={[styles.button, (busy || listening) && styles.disabled]}>
            <Text style={styles.buttonText}>{busy ? 'Working…' : 'Organize note'}</Text>
          </Pressable>
        </View>
        {!!message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
        {draft && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Review before saving</Text>
            <Text style={styles.helper}>AI may make mistakes. Correct anything that is wrong or missing.</Text>
            <Text style={styles.label}>Type</Text>
            <View style={styles.chips}>{categories.map((category) => (
              <Pressable key={category} accessibilityRole="button" onPress={() => setDraft({ ...draft, category })} style={[styles.chip, draft.category === category && styles.selectedChip]}>
                <Text style={draft.category === category ? styles.selectedChipText : styles.chipText}>{category}</Text>
              </Pressable>
            ))}</View>
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} />
            <Text style={styles.label}>Details</Text>
            <TextInput multiline style={[styles.input, styles.largeInput]} textAlignVertical="top" value={draft.details} onChangeText={(details) => setDraft({ ...draft, details })} />
            <Text style={styles.label}>Date or time mentioned (optional)</Text>
            <TextInput style={styles.input} value={draft.event_time_text ?? ''} onChangeText={(event_time_text) => setDraft({ ...draft, event_time_text })} placeholder="Only if you said one" placeholderTextColor="#667569" />
            <Pressable accessibilityRole="button" onPress={confirmDraft} style={styles.button}><Text style={styles.buttonText}>Save this note</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Discard draft</Text></Pressable>
          </View>
        )}
        <Text style={styles.sectionTitle}>Saved notes</Text>
        {notes.length === 0 && <Text style={styles.helper}>Your approved notes will appear here.</Text>}
        {notes.map((note) => (
          <View key={note.id} style={styles.card}>
            <Text style={styles.noteType}>{note.category.toUpperCase()}</Text>
            <Text style={styles.noteTitle}>{note.title}</Text>
            <Text style={styles.noteDetails}>{note.details}</Text>
            {!!note.event_time_text && <Text style={styles.noteDate}>Mentioned: {note.event_time_text}</Text>}
            <Pressable accessibilityRole="button" onPress={() => confirmDelete(note)} style={styles.deleteButton}><Text style={styles.deleteText}>Delete note</Text></Pressable>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7F0' },
  page: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 48, gap: 16, maxWidth: 700, width: '100%', alignSelf: 'center' },
  eyebrow: { color: '#36614B', fontWeight: '800', fontSize: 12, letterSpacing: 1.5 },
  heading: { color: '#163E2B', fontSize: 38, fontWeight: '800', marginTop: -10 },
  intro: { color: '#344B3B', fontSize: 18, lineHeight: 27 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, gap: 12, borderWidth: 1, borderColor: '#DCE5D9' },
  sectionTitle: { color: '#183B2A', fontSize: 24, fontWeight: '800' },
  helper: { color: '#4B5F51', fontSize: 16, lineHeight: 24 },
  label: { color: '#284A35', fontSize: 16, fontWeight: '700', marginTop: 6 },
  input: { borderWidth: 1.5, borderColor: '#A9BBAC', borderRadius: 12, padding: 14, color: '#18291E', fontSize: 18, minHeight: 54, backgroundColor: '#FFFFFF' },
  largeInput: { minHeight: 118 },
  button: { minHeight: 56, borderRadius: 12, backgroundColor: '#176A46', alignItems: 'center', justifyContent: 'center', padding: 12 },
  stopButton: { backgroundColor: '#9D412F' }, disabled: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#28563B', fontSize: 17, fontWeight: '700' },
  privacy: { color: '#56695B', fontSize: 14, lineHeight: 20 },
  message: { color: '#1D4932', fontSize: 16, backgroundColor: '#E4F0E6', padding: 14, borderRadius: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#B6C4B8', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  selectedChip: { backgroundColor: '#176A46', borderColor: '#176A46' },
  chipText: { color: '#315440', fontSize: 15, textTransform: 'capitalize' },
  selectedChipText: { color: '#FFFFFF', fontSize: 15, textTransform: 'capitalize' },
  noteType: { color: '#397653', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  noteTitle: { color: '#183B2A', fontSize: 21, fontWeight: '800' },
  noteDetails: { color: '#304436', fontSize: 17, lineHeight: 25 },
  noteDate: { color: '#486552', fontSize: 15 },
  deleteButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  deleteText: { color: '#A33829', fontSize: 16, fontWeight: '700' },
});
