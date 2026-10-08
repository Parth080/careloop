import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import type { CareApi } from '../api';
import {
  addDays,
  applyPackage,
  clockOf,
  dayInSentence,
  errorMessage,
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
import { radius, useTheme } from '../theme';
import { Button, Checkbox, Chip, ChipTile, Field, Notice, Txt } from './kit';
import { PickerButton } from './pickers';

type Props = { value: MedicineForm; onChange: (value: MedicineForm) => void; api?: CareApi };

const foods: { value: FoodTiming | null; label: string }[] = [
  { value: 'before_food', label: 'Before' },
  { value: 'after_food', label: 'After' },
  { value: 'with_food', label: 'With' },
  { value: null, label: 'Not stated' },
];

/** Every part of a medicine, for adding one by hand or checking one read from a prescription. Fields the readers
 * weren't sure about are marked ⚠ until someone changes them. */
export default function MedicineFields({ value, onChange, api }: Props) {
  const { c } = useTheme();
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
  // Once someone changes a field the readers were unsure about, stop warning about it.
  const fix = (field: MedicineField, change: Partial<MedicineForm>) =>
    onChange({ ...value, ...change, unclear: value.unclear.filter((item) => item !== field) });
  const toggleTime = (time: string) =>
    fix('times', { times: value.times.includes(time) ? value.times.filter((item) => item !== time) : [...value.times, time].sort() });
  const otherTimes = value.times.filter((time) => !timeSlots.some((slot) => slot.time === time));
  const heading = (text: string, field?: MedicineField) => (
    <Txt v="headline" tone={field && unsure(field) ? 'onWarning' : 'text'}>
      {field && unsure(field) ? `⚠ ${text} — check against the photo` : text}
    </Txt>
  );

  return (
    <View style={{ gap: 20 }}>
      {unsure('other') && <Notice tone="warning" icon="alert" message="The readers were unsure about part of this medicine. Check every field against the photo." />}

      <View style={{ gap: 12 }}>
        <Field
          label="Medicine name"
          warn={unsure('name')}
          maxLength={120}
          placeholder="Couldn't read it. Check the photo or the strip."
          value={value.name}
          onChangeText={(name) => fix('name', { name })}
          style={{ fontSize: 21 }}
        />
        {value.alternatives.length > 0 && (
          <>
            <Txt v="bodySmall" tone="onWarning">
              The two readers saw different spellings. Tap one to use it, if it matches the photo:
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {value.alternatives.map((spelling) => (
                <Chip key={spelling} label={spelling} selected={value.name === spelling} onPress={() => fix('name', { name: spelling })} />
              ))}
            </View>
          </>
        )}
        {api && (
          <Button label={scanning ? 'Reading the package…' : 'Read the name from the strip'} icon="camera" variant="secondary" disabled={scanning} onPress={chooseSource} />
        )}
        {!!fromPackage && <Notice tone="success" icon="check" message={`From the package: ${fromPackage}`} />}
        <Notice tone="warning" message={scanMessage} />
      </View>

      <Field
        label="Strength"
        warn={unsure('strength')}
        maxLength={60}
        placeholder="For example: 5 mg"
        value={value.strength ?? ''}
        onChangeText={(strength) => fix('strength', { strength })}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Type" warn={unsure('form')} maxLength={40} placeholder="tablet" value={value.form ?? ''} onChangeText={(form) => fix('form', { form })} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Each time" warn={unsure('dose')} maxLength={60} placeholder="1 tablet" value={value.dose ?? ''} onChangeText={(dose) => fix('dose', { dose })} />
        </View>
      </View>

      <View style={{ gap: 12 }}>
        {heading('When to take it', 'times')}
        {!value.as_needed && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {timeSlots.map((slot) => (
                <View key={slot.time} style={{ width: '48%', flexGrow: 1 }}>
                  <ChipTile label={slot.label} detail={formatClock(slot.time)} selected={value.times.includes(slot.time)} onPress={() => toggleTime(slot.time)} />
                </View>
              ))}
            </View>
            {otherTimes.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {otherTimes.map((time) => (
                  <Chip key={time} label={`${formatClock(time)}  ✕`} selected onPress={() => toggleTime(time)} />
                ))}
              </View>
            )}
            <PickerButton
              label="+ Another time"
              variant="quiet"
              mode="time"
              initial={new Date(2026, 0, 1, 7, 0)}
              confirmLabel={(time) => `Add ${formatClock(clockOf(time))}`}
              onPick={(time) => {
                if (!value.times.includes(clockOf(time))) toggleTime(clockOf(time));
              }}
            />
          </>
        )}
        <Checkbox label="Only when needed (SOS), no fixed times" checked={value.as_needed} onChange={(as_needed) => fix('times', { as_needed })} />
      </View>

      <View style={{ gap: 12 }}>
        {heading('Food', 'food')}
        <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
          {foods.map((food) => (
            <ChipTile key={food.label} label={food.label} selected={value.food === food.value} onPress={() => fix('food', { food: food.value })} />
          ))}
        </View>
      </View>

      <View style={{ gap: 12 }}>
        {heading('How long', 'duration')}
        <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="radiogroup">
          <ChipTile label="Ongoing" selected={value.duration_days === null} onPress={() => fix('duration', { duration_days: null })} />
          <ChipTile label="Number of days" selected={value.duration_days !== null} onPress={() => fix('duration', { duration_days: value.duration_days ?? 30 })} />
        </View>
        {value.duration_days !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 110 }}>
              <Field
                label="Days"
                keyboardType="number-pad"
                maxLength={4}
                warn={false}
                value={value.duration_days ? String(value.duration_days) : ''}
                onChangeText={(text) => fix('duration', { duration_days: Number(text.replace(/\D/g, '')) || 0 })}
              />
            </View>
            <View style={{ flex: 1, paddingTop: 28 }}>
              <Txt v="body">days, from {dayInSentence(value.start_date, today)}</Txt>
              {value.duration_days > 0 && (
                <Txt v="bodySmall" tone="textMuted">
                  Last day: {formatDay(addDays(value.start_date, value.duration_days - 1), today)}
                </Txt>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', backgroundColor: c.surface, borderRadius: radius.md, paddingLeft: 16, borderWidth: 1, borderColor: c.border }}>
        <Txt v="body" style={{ flex: 1 }}>
          Starts {dayInSentence(value.start_date, today)}
        </Txt>
        <PickerButton
          label="Change"
          variant="quiet"
          mode="date"
          initial={parseDay(value.start_date)}
          confirmLabel={(day) => `Start ${formatDay(localDate(day), today)}`}
          onPick={(day) => onChange({ ...value, start_date: localDate(day) })}
        />
      </View>

      <Field
        label="Other directions (optional)"
        warn={unsure('instructions')}
        maxLength={300}
        placeholder="For example: dissolve in water"
        value={value.instructions ?? ''}
        onChangeText={(instructions) => fix('instructions', { instructions })}
      />
    </View>
  );
}
