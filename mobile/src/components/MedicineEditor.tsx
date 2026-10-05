import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import type { CareApi } from '../api';

import {
  addDays,
  applyPackage,
  clockOf,
  errorMessage,
  foodLabels,
  formatClock,
  formatDay,
  localDate,
  parseDay,
  timeSlots,
  type FoodTiming,
  type MedicineField,
  type MedicineForm,
} from '../model';
import { getPhoto } from '../photos';
import { colors, ui } from '../theme';
import { Button, Checkbox, Chip, Notice } from './controls';
import { PickerButton } from './pickers';

type Props = { value: MedicineForm; onChange: (value: MedicineForm) => void; api?: CareApi };

const foods: (FoodTiming | null)[] = ['before_food', 'after_food', 'with_food', null];

export default function MedicineEditor({ value, onChange, api }: Props) {
  const today = localDate();
  const [scanning, setScanning] = useState(false);
  const [fromPackage, setFromPackage] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const latest = useRef(value); // reading a package takes a few seconds; don't undo edits made meanwhile
  useEffect(() => {
    latest.current = value;
  });

  function chooseSource() {
    Alert.alert('Read the medicine strip', 'Photograph the side of the strip, bottle or box that shows the name.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose a photo', onPress: () => void readPackage('library') },
      { text: 'Take a photo', onPress: () => void readPackage('camera') },
    ]);
  }

  async function readPackage(source: 'camera' | 'library') {
    if (!api) return;
    setScanMessage('');
    try {
      const photo = await getPhoto(source);
      if (!photo) return;
      setScanning(true);
      const found = await api.readPackage(photo.base64);
      if (!found.name) return setScanMessage("Couldn't find a medicine name on that package. Try the side that shows the name.");
      onChange(applyPackage(latest.current, found));
      setFromPackage([found.name, found.strength, found.contains].filter(Boolean).join(' · '));
    } catch (error) {
      setScanMessage(errorMessage(error));
    } finally {
      setScanning(false);
    }
  }
  const unsure = (field: MedicineField) => value.unclear.includes(field);
  // Once someone changes a field the assistant was unsure about, stop warning about it.
  const fix = (field: MedicineField, change: Partial<MedicineForm>) =>
    onChange({ ...value, ...change, unclear: value.unclear.filter((item) => item !== field) });
  const toggleTime = (time: string) =>
    fix('times', { times: value.times.includes(time) ? value.times.filter((item) => item !== time) : [...value.times, time].sort() });
  const otherTimes = value.times.filter((time) => !timeSlots.some((slot) => slot.time === time));

  return (
    <View style={styles.editor}>
      {unsure('other') && (
        <Text style={styles.warning}>⚠ The assistant was unsure about part of this medicine. Check every field against the photo.</Text>
      )}
      <Label text="Medicine name" unsure={unsure('name')} />
      <TextInput
        accessibilityLabel="Medicine name"
        maxLength={120}
        placeholder="Couldn't read it. Check the photo, read the strip, or type it."
        placeholderTextColor={colors.placeholder}
        style={[ui.input, unsure('name') && styles.unsureInput]}
        value={value.name}
        onChangeText={(name) => fix('name', { name })}
      />
      {value.alternatives.length > 0 && (
        <>
          <Text style={styles.alternatives}>The two readers saw different spellings. Tap one to use it, if it matches the photo:</Text>
          <View style={ui.row}>
            {value.alternatives.map((spelling) => (
              <Chip key={spelling} label={spelling} selected={value.name === spelling} onPress={() => fix('name', { name: spelling })} />
            ))}
          </View>
        </>
      )}
      {api && (
        <Button
          label={scanning ? 'Reading the package…' : '📷  Read the name from the medicine strip'}
          variant="outline"
          disabled={scanning}
          onPress={chooseSource}
        />
      )}
      {!!fromPackage && <Text style={styles.fromPackage}>✓ From the package: {fromPackage}</Text>}
      <Notice message={scanMessage} />
      <Label text="Strength (optional)" unsure={unsure('strength')} />
      <TextInput
        accessibilityLabel="Strength"
        maxLength={60}
        placeholder="For example: 5 mg"
        placeholderTextColor={colors.placeholder}
        style={[ui.input, unsure('strength') && styles.unsureInput]}
        value={value.strength ?? ''}
        onChangeText={(strength) => fix('strength', { strength })}
      />
      <Label text="Type (optional)" unsure={unsure('form')} />
      <TextInput
        accessibilityLabel="Type of medicine"
        maxLength={40}
        placeholder="For example: tablet, capsule, syrup"
        placeholderTextColor={colors.placeholder}
        style={[ui.input, unsure('form') && styles.unsureInput]}
        value={value.form ?? ''}
        onChangeText={(form) => fix('form', { form })}
      />
      <Label text="How much each time" unsure={unsure('dose')} />
      <TextInput
        accessibilityLabel="How much each time"
        maxLength={60}
        placeholder="For example: 1 tablet"
        placeholderTextColor={colors.placeholder}
        style={[ui.input, unsure('dose') && styles.unsureInput]}
        value={value.dose ?? ''}
        onChangeText={(dose) => fix('dose', { dose })}
      />

      <Checkbox
        // If the assistant wasn't sure about the times, it may also be wrong about "only when needed".
        label={`Only when needed (SOS), no fixed times${unsure('times') ? '   ⚠ check against the photo' : ''}`}
        checked={value.as_needed}
        onChange={(as_needed) => fix('times', { as_needed })}
      />
      {!value.as_needed && (
        <>
          <Label text="When" unsure={unsure('times')} />
          <View style={ui.row}>
            {timeSlots.map((slot) => (
              <Chip
                key={slot.time}
                label={`${slot.label} ${formatClock(slot.time)}`}
                selected={value.times.includes(slot.time)}
                onPress={() => toggleTime(slot.time)}
              />
            ))}
            {otherTimes.map((time) => (
              <Chip key={time} label={`${formatClock(time)}  ✕`} selected onPress={() => toggleTime(time)} />
            ))}
          </View>
          <PickerButton
            label="+ Another time"
            mode="time"
            initial={new Date(2026, 0, 1, 7, 0)}
            confirmLabel={(time) => `Add ${formatClock(clockOf(time))}`}
            onPick={(time) => {
              if (!value.times.includes(clockOf(time))) toggleTime(clockOf(time));
            }}
          />
        </>
      )}

      <Label text="Food" unsure={unsure('food')} />
      <View accessibilityRole="radiogroup" style={ui.row}>
        {foods.map((food) => (
          <Chip
            key={food ?? 'none'}
            label={food ? foodLabels[food] : 'Not stated'}
            selected={value.food === food}
            onPress={() => fix('food', { food })}
          />
        ))}
      </View>

      <Label text={`Starts: ${formatDay(value.start_date, today)}`} />
      <PickerButton
        label="Change the start day"
        mode="date"
        initial={parseDay(value.start_date)}
        confirmLabel={(day) => `Start ${formatDay(localDate(day), today)}`}
        onPick={(day) => onChange({ ...value, start_date: localDate(day) })}
      />

      <Label text="How long" unsure={unsure('duration')} />
      <View accessibilityRole="radiogroup" style={ui.row}>
        <Chip label="Ongoing" selected={value.duration_days === null} onPress={() => fix('duration', { duration_days: null })} />
        <Chip
          label="A number of days"
          selected={value.duration_days !== null}
          onPress={() => fix('duration', { duration_days: value.duration_days ?? 30 })}
        />
      </View>
      {value.duration_days !== null && (
        <>
          <TextInput
            accessibilityLabel="Number of days"
            keyboardType="number-pad"
            maxLength={4}
            style={[ui.input, unsure('duration') && styles.unsureInput]}
            value={value.duration_days ? String(value.duration_days) : ''}
            onChangeText={(text) => fix('duration', { duration_days: Number(text.replace(/\D/g, '')) || 0 })}
          />
          {value.duration_days > 0 && (
            <Text style={ui.small}>Last day: {formatDay(addDays(value.start_date, value.duration_days - 1), today)}</Text>
          )}
        </>
      )}

      <Label text="Other directions (optional)" unsure={unsure('instructions')} />
      <TextInput
        accessibilityLabel="Other directions"
        maxLength={300}
        multiline
        placeholder="For example: dissolve in water"
        placeholderTextColor={colors.placeholder}
        style={[ui.input, unsure('instructions') && styles.unsureInput]}
        value={value.instructions ?? ''}
        onChangeText={(instructions) => fix('instructions', { instructions })}
      />
      {!!value.source_text && <Text style={styles.source}>On the prescription: "{value.source_text}"</Text>}
    </View>
  );
}

function Label({ text, unsure = false }: { text: string; unsure?: boolean }) {
  return (
    <Text style={[ui.label, unsure && styles.unsureLabel]}>
      {text}
      {unsure ? '   ⚠ check against the photo' : ''}
    </Text>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 8 },
  unsureLabel: { color: '#8A5A00' },
  warning: { color: '#7A4B00', backgroundColor: '#FFF3D6', borderRadius: 10, padding: 12, fontSize: 16, lineHeight: 22 },
  unsureInput: { borderColor: '#D99A00', borderWidth: 2, backgroundColor: '#FFF8E6' },
  source: { color: colors.muted, fontSize: 15, lineHeight: 21, fontStyle: 'italic' },
  alternatives: { color: '#7A4B00', fontSize: 15, lineHeight: 21 },
  fromPackage: { color: colors.primary, fontSize: 15, lineHeight: 21, fontWeight: '700' },
});
