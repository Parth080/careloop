import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  appointmentProblem,
  cleanAppointment,
  clockOf,
  doseMoment,
  formatClock,
  formatDay,
  localDate,
  parseDay,
  type AppointmentInput,
} from '../model';
import { colors, ui } from '../theme';
import { Button, Chip, Notice } from './controls';
import { PickerButton } from './pickers';

type Props = {
  initial: AppointmentInput;
  heard?: string | null; // the spoken words a suggestion came from, so people can check it
  busy: boolean;
  onSave: (appointment: AppointmentInput) => void;
  onCancel: () => void;
};

export default function AppointmentForm({ initial, heard, busy, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState('');
  const today = localDate();
  const set = (change: Partial<AppointmentInput>) => setValue((current) => ({ ...current, ...change }));

  function save() {
    const problem = appointmentProblem(value);
    if (problem) return setMessage(problem);
    onSave(cleanAppointment(value));
  }

  return (
    <View style={styles.form}>
      {!!heard && (
        <Text style={styles.heard}>
          You said: "{heard}". The day and time below are a suggestion; please check them.
        </Text>
      )}
      <Text style={ui.label}>What is it?</Text>
      <TextInput
        accessibilityLabel="What the appointment is"
        maxLength={120}
        placeholder="For example: Check-up with Dr. Mehta"
        placeholderTextColor={colors.placeholder}
        style={ui.input}
        value={value.title}
        onChangeText={(title) => set({ title })}
      />
      <Text style={ui.label}>Day: {formatDay(value.day, today)}</Text>
      <PickerButton
        label="Change the day"
        mode="date"
        initial={parseDay(value.day)}
        confirmLabel={(day) => `Use ${formatDay(localDate(day), today)}`}
        onPick={(day) => set({ day: localDate(day) })}
      />
      <Text style={ui.label}>Time: {value.time ? formatClock(value.time) : 'not set yet'}</Text>
      <View style={ui.row}>
        <Chip label="Not set yet" selected={value.time === null} onPress={() => set({ time: null })} />
        <PickerButton
          label={value.time ? 'Change the time' : 'Set a time'}
          mode="time"
          initial={value.time ? doseMoment(today, value.time) : doseMoment(today, '10:00')}
          confirmLabel={(time) => `Use ${formatClock(clockOf(time))}`}
          onPick={(time) => set({ time: clockOf(time) })}
        />
      </View>
      <Text style={ui.label}>With (optional)</Text>
      <TextInput
        accessibilityLabel="Doctor or person"
        maxLength={120}
        placeholder="For example: Dr. Mehta"
        placeholderTextColor={colors.placeholder}
        style={ui.input}
        value={value.with_whom ?? ''}
        onChangeText={(with_whom) => set({ with_whom })}
      />
      <Text style={ui.label}>Where (optional)</Text>
      <TextInput
        accessibilityLabel="Place"
        maxLength={200}
        placeholder="For example: Ruby Hall Clinic"
        placeholderTextColor={colors.placeholder}
        style={ui.input}
        value={value.place ?? ''}
        onChangeText={(place) => set({ place })}
      />
      <Text style={ui.label}>Notes (optional)</Text>
      <TextInput
        accessibilityLabel="Notes"
        maxLength={500}
        multiline
        placeholder="For example: bring the sugar report"
        placeholderTextColor={colors.placeholder}
        style={[ui.input, ui.largeInput]}
        value={value.notes ?? ''}
        onChangeText={(notes) => set({ notes })}
      />
      <Notice message={message} />
      <Button label="Save appointment" disabled={busy} onPress={save} />
      <Button label="Cancel" variant="text" disabled={busy} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 8 },
  heard: { color: '#7A4B00', backgroundColor: '#FFF3D6', borderRadius: 10, padding: 12, fontSize: 16, lineHeight: 22 },
});
