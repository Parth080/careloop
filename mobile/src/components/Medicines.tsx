import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CareApi } from '../api';
import {
  describeSchedule,
  emptyMedicineForm,
  errorMessage,
  formatDay,
  formFromMedicine,
  isFinished,
  localDate,
  medicineProblem,
  spokenMedicine,
  toMedicineInput,
  type Medicine,
  type MedicineForm,
  type PrescriptionReading,
} from '../model';
import { getPhoto, type Photo } from '../photos';
import { readAloud } from '../readAloud';
import { colors, ui } from '../theme';
import { Button, Notice } from './controls';
import MedicineEditor from './MedicineEditor';
import PrescriptionReview from './PrescriptionReview';

type Props = { medicines: Medicine[]; api: CareApi; onChanged: () => void };
type Mode =
  | { kind: 'list' }
  | { kind: 'form'; editingId: number | null; form: MedicineForm }
  | { kind: 'reading'; photo: Photo }
  | { kind: 'review'; photo: Photo; reading: PrescriptionReading };

export default function Medicines({ medicines, api, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [showFinished, setShowFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const today = localDate();
  const current = medicines.filter((medicine) => !isFinished(medicine, today));
  const finished = medicines.filter((medicine) => isFinished(medicine, today));

  function chooseSource() {
    Alert.alert('Read a prescription', 'Photograph the whole page in good light, or choose a photo you already have.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose a photo', onPress: () => void readPrescription('library') },
      { text: 'Take a photo', onPress: () => void readPrescription('camera') },
    ]);
  }

  async function readPrescription(source: 'camera' | 'library') {
    setMessage('');
    let photo: Photo | null;
    try {
      photo = await getPhoto(source);
    } catch (error) {
      return setMessage(errorMessage(error));
    }
    if (!photo) return;
    setMode({ kind: 'reading', photo });
    try {
      setMode({ kind: 'review', photo, reading: await api.readPrescription(photo.base64, 'image/jpeg') });
    } catch (error) {
      setMode({ kind: 'list' });
      setMessage(errorMessage(error));
    }
  }

  async function saveForm(editingId: number | null, form: MedicineForm) {
    const problem = medicineProblem(form);
    if (problem) return setMessage(problem);
    setBusy(true);
    try {
      if (editingId === null) await api.addMedicine(toMedicineInput(form));
      else await api.updateMedicine(editingId, toMedicineInput(form));
      setMode({ kind: 'list' });
      setMessage('Saved.');
      onChanged();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(medicine: Medicine) {
    Alert.alert(`Remove ${medicine.name}?`, 'It will be removed for everyone in the care circle.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteMedicine(medicine.id);
            onChanged();
          } catch (error) {
            setMessage(errorMessage(error));
          }
        },
      },
    ]);
  }

  function edit(medicine: Medicine) {
    setMessage('');
    setMode({ kind: 'form', editingId: medicine.id, form: formFromMedicine(medicine) });
  }

  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>Medicines</Text>

      {mode.kind === 'reading' && (
        <View style={styles.reading}>
          <Image source={{ uri: mode.photo.uri }} style={styles.thumbnail} resizeMode="contain" />
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={ui.helper}>Reading the prescription… this can take up to 20 seconds.</Text>
        </View>
      )}

      {mode.kind === 'review' && (
        <PrescriptionReview
          photo={mode.photo}
          reading={mode.reading}
          api={api}
          onSaved={onChanged}
          onDone={(count) => {
            setMode({ kind: 'list' });
            setMessage(count === 1 ? 'Medicine saved.' : `${count} medicines saved.`);
          }}
          onCancel={() => setMode({ kind: 'list' })}
        />
      )}

      {mode.kind === 'form' && (
        <>
          <MedicineEditor value={mode.form} api={api} onChange={(form) => setMode({ ...mode, form })} />
          <Button label="Save" disabled={busy} onPress={() => saveForm(mode.editingId, mode.form)} />
          <Button label="Cancel" variant="text" disabled={busy} onPress={() => setMode({ kind: 'list' })} />
        </>
      )}

      {mode.kind === 'list' && (
        <>
          {current.length === 0 && (
            <Text style={ui.helper}>No medicines yet. Photograph a prescription and CareLoop will read it for you.</Text>
          )}
          {current.map((medicine) => (
            <MedicineCard key={medicine.id} medicine={medicine} today={today} onEdit={edit} onRemove={confirmRemove} />
          ))}
          <Button label="📷  Read a prescription" onPress={chooseSource} />
          <Button
            label="+ Add a medicine yourself"
            variant="outline"
            onPress={() => {
              setMessage('');
              setMode({ kind: 'form', editingId: null, form: emptyMedicineForm(today) });
            }}
          />
          {finished.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFinished }} onPress={() => setShowFinished(!showFinished)}>
              <Text style={styles.link}>
                {showFinished ? '▾' : '▸'} Finished medicines ({finished.length})
              </Text>
            </Pressable>
          )}
          {showFinished &&
            finished.map((medicine) => (
              <MedicineCard key={medicine.id} medicine={medicine} today={today} onEdit={edit} onRemove={confirmRemove} />
            ))}
        </>
      )}
      <Notice message={message} />
    </View>
  );
}

type CardProps = { medicine: Medicine; today: string; onEdit: (medicine: Medicine) => void; onRemove: (medicine: Medicine) => void };

function MedicineCard({ medicine, today, onEdit, onRemove }: CardProps) {
  const period = isFinished(medicine, today)
    ? `Finished ${formatDay(medicine.end_date!, today)}`
    : medicine.start_date > today
      ? `Starts ${formatDay(medicine.start_date, today)}`
      : medicine.end_date
        ? `Until ${formatDay(medicine.end_date, today)}`
        : 'Ongoing';
  return (
    <View style={[ui.divider, styles.medicine]}>
      <Text style={styles.name}>
        {medicine.name}
        {medicine.strength ? ` · ${medicine.strength}` : ''}
      </Text>
      {!!medicine.dose && <Text style={styles.detail}>{medicine.dose} each time</Text>}
      <Text style={styles.detail}>{describeSchedule(medicine)}</Text>
      {!!medicine.instructions && <Text style={styles.detail}>{medicine.instructions}</Text>}
      <Text style={ui.small}>
        {period}
        {medicine.created_by_name ? ` · added by ${medicine.created_by_name}` : ''}
      </Text>
      <View style={styles.actions}>
        <Button label="🔊 Read" variant="text" accessibilityLabel={`Read aloud: ${medicine.name}`} onPress={() => readAloud(spokenMedicine(medicine))} />
        <Button label="Edit" variant="text" accessibilityLabel={`Edit ${medicine.name}`} onPress={() => onEdit(medicine)} />
        <Button label="Remove" variant="danger" accessibilityLabel={`Remove ${medicine.name}`} onPress={() => onRemove(medicine)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reading: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  thumbnail: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#EEF1EA' },
  medicine: { gap: 4 },
  name: { color: colors.heading, fontSize: 20, fontWeight: '800' },
  detail: { color: colors.text, fontSize: 17, lineHeight: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  link: { color: colors.link, fontSize: 16, fontWeight: '700', paddingVertical: 6 },
});
