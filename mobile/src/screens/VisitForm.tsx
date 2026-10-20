import { useState } from 'react';
import { View } from 'react-native';

import type { CareApi } from '../api';
import { Button, Chip, Field, ModalScreen, Notice, Txt } from '../components/kit';
import { PickerButton } from '../components/pickers';
import {
  addDays,
  appointmentInput,
  appointmentProblem,
  cleanAppointment,
  clockOf,
  doseMoment,
  errorMessage,
  formatClock,
  formatDay,
  localDate,
  parseDay,
  type Appointment,
  type AppointmentInput,
} from '../model';
import { radius, useTheme } from '../theme';

type Props = {
  api: CareApi;
  appointment: Appointment | null;
  initial?: AppointmentInput;
  heard?: string | null; // the spoken words a suggestion came from, so people can check it
  onClose: () => void;
  onSaved: () => void;
};

/** Adding a doctor visit, test or call, or changing one. */
export default function VisitForm({ api, appointment, initial, heard, onClose, onSaved }: Props) {
  const { c } = useTheme();
  const today = localDate();
  const [value, setValue] = useState<AppointmentInput>(
    () => initial ?? (appointment ? appointmentInput(appointment) : { title: '', day: addDays(today, 1), time: null, place: null, with_whom: null, notes: null }),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const set = (change: Partial<AppointmentInput>) => setValue((current) => ({ ...current, ...change }));

  async function save() {
    const problem = appointmentProblem(value);
    if (problem) return setMessage(problem);
    setBusy(true);
    try {
      if (appointment) await api.updateAppointment(appointment.id, cleanAppointment(value));
      else await api.addAppointment(cleanAppointment(value));
      onSaved();
      onClose();
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingLeft: 16 };

  return (
    <ModalScreen
      onClose={onClose}
      title={appointment ? 'Change visit' : 'Add a visit'}
      footer={
        <>
          <Notice message={message} tone="warning" />
          <Button label={busy ? 'Saving…' : 'Save visit'} disabled={busy} onPress={save} />
        </>
      }
    >
      {!!heard && <Notice tone="warning" message={`You said: "${heard}". The day and time below are a suggestion; please check them.`} />}
      <Field label="What is it?" maxLength={120} placeholder="For example: Check-up with Dr. Mehta" value={value.title} onChangeText={(title) => set({ title })} />
      <View style={{ gap: 8 }}>
        <Txt v="label">Day</Txt>
        <View style={row}>
          <Txt v="bodyLarge" style={{ flex: 1 }}>
            {formatDay(value.day, today)}
          </Txt>
          <PickerButton
            label="Change"
            variant="quiet"
            mode="date"
            initial={parseDay(value.day)}
            confirmLabel={(day) => `Use ${formatDay(localDate(day), today)}`}
            onPick={(day) => set({ day: localDate(day) })}
          />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Txt v="label">Time</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Chip label="Not set yet" selected={value.time === null} onPress={() => set({ time: null })} />
          {value.time && <Chip label={formatClock(value.time)} selected onPress={() => undefined} />}
          <PickerButton
            label={value.time ? 'Change the time' : 'Set a time'}
            variant="quiet"
            mode="time"
            initial={doseMoment(today, value.time ?? '10:00')}
            confirmLabel={(time) => `Use ${formatClock(clockOf(time))}`}
            onPick={(time) => set({ time: clockOf(time) })}
          />
        </View>
      </View>
      <Field label="With (optional)" maxLength={120} placeholder="For example: Dr. Mehta" value={value.with_whom ?? ''} onChangeText={(with_whom) => set({ with_whom })} />
      <Field label="Where (optional)" maxLength={200} placeholder="For example: Ruby Hall Clinic" value={value.place ?? ''} onChangeText={(place) => set({ place })} />
      <Field label="What to remember (optional)" multiline maxLength={500} placeholder="For example: bring the sugar report" value={value.notes ?? ''} onChangeText={(notes) => set({ notes })} />
    </ModalScreen>
  );
}
