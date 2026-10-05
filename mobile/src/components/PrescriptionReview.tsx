import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { CareApi } from '../api';
import {
  errorMessage,
  formFromDraft,
  localDate,
  medicineProblem,
  modelLabel,
  toMedicineInput,
  type MedicineForm,
  type PrescriptionReading,
} from '../model';
import type { Photo } from '../photos';
import { colors, ui } from '../theme';
import { Button, Checkbox, Notice } from './controls';
import MedicineEditor from './MedicineEditor';

type Item = { form: MedicineForm; keep: boolean; checked: boolean };
type Props = {
  photo: Photo;
  reading: PrescriptionReading;
  api: CareApi;
  onSaved: () => void; // something was saved; refresh the list
  onDone: (savedCount: number) => void;
  onCancel: () => void;
};

export default function PrescriptionReview({ photo, reading, api, onSaved, onDone, onCancel }: Props) {
  const [items, setItems] = useState<Item[]>(() =>
    reading.medicines.map((medicine) => ({ form: formFromDraft(medicine, localDate()), keep: true, checked: false })),
  );
  const [enlarged, setEnlarged] = useState(false);
  const [showReading, setShowReading] = useState(false);
  const [adviceSaved, setAdviceSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { height } = useWindowDimensions();
  const kept = items.filter((item) => item.keep);

  function update(index: number, change: Partial<Item>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...change } : item)));
  }

  async function save() {
    if (kept.length === 0) return setMessage('Tick at least one medicine to add, or tap Cancel.');
    const unchecked = kept.find((item) => !item.checked);
    if (unchecked) return setMessage(`Compare ${unchecked.form.name || 'each medicine'} with the photo, then tick "I checked this".`);
    const problem = kept.map((item) => medicineProblem(item.form)).find(Boolean);
    if (problem) return setMessage(problem);
    setBusy(true);
    const unsaved: Item[] = [];
    for (const item of kept) {
      try {
        await api.addMedicine(toMedicineInput(item.form));
      } catch (error) {
        unsaved.push(item);
        setMessage(`Not saved: ${errorMessage(error)}`);
      }
    }
    setBusy(false);
    onSaved();
    if (unsaved.length > 0) return setItems(unsaved);
    onDone(kept.length);
  }

  async function saveAdvice() {
    try {
      await api.createNote({
        category: 'general',
        title: "Doctor's advice",
        details: reading.other_instructions.join('\n').slice(0, 1000),
        event_time_text: null,
        private: false,
        source_text: reading.readings[0].text.slice(0, 4000),
        model: reading.organizing_model,
      });
      setAdviceSaved(true);
      onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  return (
    <View style={styles.review}>
      <Text style={ui.sectionTitle}>Check the medicines</Text>
      <Text style={ui.helper}>
        Two AI readers read the photo separately. Anything they disagree on, or couldn't read clearly, is marked ⚠. If a name looks
        wrong, read it from the medicine strip instead.
      </Text>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Prescription photo. Tap to enlarge." onPress={() => setEnlarged(true)}>
        <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="contain" />
        <Text style={[ui.small, styles.center]}>Tap the photo to enlarge it</Text>
      </Pressable>

      {items.length === 0 && (
        <Text style={ui.helper}>No medicines were found in this photo. You can add them yourself instead.</Text>
      )}
      {items.map((item, index) => (
        <View key={index} style={[ui.divider, styles.item]}>
          <Checkbox
            label={`Add ${item.form.name || `medicine ${index + 1}`}`}
            checked={item.keep}
            onChange={(keep) => update(index, { keep })}
          />
          {item.keep && (
            <>
              <MedicineEditor value={item.form} api={api} onChange={(form) => update(index, { form })} />
              <Checkbox label="I checked this against the photo" checked={item.checked} onChange={(checked) => update(index, { checked })} />
            </>
          )}
        </View>
      ))}

      {reading.other_instructions.length > 0 && (
        <View style={[ui.divider, styles.item]}>
          <Text style={ui.label}>Also on the prescription</Text>
          {reading.other_instructions.map((line, index) => (
            <Text key={index} style={ui.helper}>
              • {line}
            </Text>
          ))}
          <Button label={adviceSaved ? 'Saved as a note ✓' : 'Save as a note'} variant="outline" disabled={adviceSaved} onPress={saveAdvice} />
        </View>
      )}

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showReading }} onPress={() => setShowReading(!showReading)}>
        <Text style={styles.link}>{showReading ? '▾ What CareLoop read' : '▸ What CareLoop read'}</Text>
      </Pressable>
      {showReading &&
        reading.readings.map((one, index) => (
          <View key={index} style={styles.item}>
            <Text style={ui.label}>{modelLabel(one.model)} read:</Text>
            <Text style={styles.reading}>{one.text}</Text>
          </View>
        ))}
      <Text style={ui.small}>
        Read by {reading.readings.map((one) => modelLabel(one.model)).join(' and ')} and organized by {modelLabel(reading.organizing_model)} on
        Nebius. The photo is not stored.
      </Text>

      <Notice message={message} />
      <Button label={kept.length > 1 ? `Save ${kept.length} medicines` : 'Save medicine'} disabled={busy || kept.length === 0} onPress={save} />
      <Button label="Cancel" variant="text" disabled={busy} onPress={onCancel} />

      <Modal visible={enlarged} animationType="fade" onRequestClose={() => setEnlarged(false)}>
        <View style={styles.modal}>
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={styles.zoom}>
            <Image source={{ uri: photo.uri }} style={{ width: '100%', height: height * 0.78 }} resizeMode="contain" />
          </ScrollView>
          <Button label="Close" onPress={() => setEnlarged(false)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  review: { gap: 12 },
  photo: { width: '100%', height: 260, borderRadius: 12, backgroundColor: '#EEF1EA' },
  center: { textAlign: 'center', marginTop: 4 },
  item: { gap: 10 },
  link: { color: colors.link, fontSize: 16, fontWeight: '700', paddingVertical: 6 },
  reading: { color: colors.muted, fontSize: 15, lineHeight: 22, backgroundColor: '#F3F5EF', padding: 12, borderRadius: 10 },
  modal: { flex: 1, backgroundColor: '#111', paddingTop: 56, paddingBottom: 32, paddingHorizontal: 16, gap: 12 },
  zoom: { flexGrow: 1, justifyContent: 'center' },
});
