import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CareApi } from '../api';
import {
  addDays,
  appointmentInput,
  describeAppointmentTime,
  errorMessage,
  localDate,
  type Appointment,
  type AppointmentInput,
} from '../model';
import { readAloud } from '../readAloud';
import { colors, ui } from '../theme';
import AppointmentForm from './AppointmentForm';
import { Button, Notice } from './controls';
import VisitSummary from './VisitSummary';

type Props = { appointments: Appointment[]; api: CareApi; onChanged: () => void };
type Editing = { id: number | null; initial: AppointmentInput } | null;

export default function Appointments({ appointments, api, onChanged }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [showPast, setShowPast] = useState(false);
  const [summaryFor, setSummaryFor] = useState<{ appointment: Appointment | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const today = localDate();
  const upcoming = appointments.filter((appointment) => appointment.day >= today);
  const past = appointments.filter((appointment) => appointment.day < today).reverse(); // most recent first

  async function save(value: AppointmentInput) {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id === null) await api.addAppointment(value);
      else await api.updateAppointment(editing.id, value);
      setEditing(null);
      setMessage('Appointment saved.');
      onChanged();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(appointment: Appointment) {
    Alert.alert(`Remove "${appointment.title}"?`, 'It will be removed for everyone in the care circle.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAppointment(appointment.id);
            onChanged();
          } catch (error) {
            setMessage(errorMessage(error));
          }
        },
      },
    ]);
  }

  const card = (appointment: Appointment) => (
    <View key={appointment.id} style={[ui.divider, styles.appointment]}>
      <Text style={styles.when}>{describeAppointmentTime(appointment, today)}</Text>
      <Text style={styles.title}>{appointment.title}</Text>
      {(appointment.with_whom || appointment.place) && (
        <Text style={styles.detail}>{[appointment.with_whom, appointment.place].filter(Boolean).join(' · ')}</Text>
      )}
      {!!appointment.notes && <Text style={styles.detail}>{appointment.notes}</Text>}
      {!!appointment.created_by_name && <Text style={ui.small}>Added by {appointment.created_by_name}</Text>}
      <View style={styles.actions}>
        <Button
          label="🔊 Read"
          variant="text"
          accessibilityLabel={`Read aloud: ${appointment.title}`}
          onPress={() =>
            readAloud(
              `${appointment.title}, ${describeAppointmentTime(appointment, today).replace(', time not set', '')}${
                appointment.place ? `, at ${appointment.place}` : ''
              }.`,
            )
          }
        />
        <Button label="Edit" variant="text" onPress={() => setEditing({ id: appointment.id, initial: appointmentInput(appointment) })} />
        <Button label="Remove" variant="danger" onPress={() => confirmRemove(appointment)} />
      </View>
      {appointment.day >= today && (
        <Button label="📋  Prepare for this visit" variant="outline" onPress={() => setSummaryFor({ appointment })} />
      )}
    </View>
  );

  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>Appointments</Text>
      {editing ? (
        <AppointmentForm initial={editing.initial} busy={busy} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <>
          {upcoming.length === 0 && <Text style={ui.helper}>No upcoming appointments.</Text>}
          {upcoming.map(card)}
          <Button
            label="+ Add an appointment"
            variant="outline"
            onPress={() => {
              setMessage('');
              setEditing({
                id: null,
                initial: { title: '', day: addDays(today, 1), time: null, place: null, with_whom: null, notes: null },
              });
            }}
          />
          <Button label="📋  Health summary for a doctor" variant="text" onPress={() => setSummaryFor({ appointment: null })} />
          {past.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPast }} onPress={() => setShowPast(!showPast)}>
              <Text style={styles.link}>
                {showPast ? '▾' : '▸'} Past appointments ({past.length})
              </Text>
            </Pressable>
          )}
          {showPast && past.map(card)}
        </>
      )}
      <Notice message={message} />
      {summaryFor && (
        <VisitSummary api={api} appointments={appointments} appointment={summaryFor.appointment} onClose={() => setSummaryFor(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  appointment: { gap: 4 },
  when: { color: colors.primary, fontSize: 19, fontWeight: '800' },
  title: { color: colors.heading, fontSize: 20, fontWeight: '800' },
  detail: { color: colors.text, fontSize: 17, lineHeight: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  link: { color: colors.link, fontSize: 16, fontWeight: '700', paddingVertical: 6 },
});
