import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import type { CareApi } from '../api';
import {
  describeAppointmentTime,
  describeDoseCounts,
  describeSchedule,
  errorMessage,
  localDate,
  modelLabel,
  pointDates,
  NOT_MARKED_MEANING,
  shortDate,
  summaryMedicinePeriod,
  summaryPeriods,
  summarySections,
  summarySectionTitle,
  summarySpeech,
  summaryText,
  type Appointment,
  type VisitSummary as Summary,
} from '../model';
import { readAloud } from '../readAloud';
import { colors, ui } from '../theme';
import { Button, Chip, Notice } from './controls';

type Props = { api: CareApi; appointments: Appointment[]; appointment: Appointment | null; onClose: () => void };

/** A one-page summary for a doctor visit: medicines, how the doses went, and the family's notes. */
export default function VisitSummary({ api, appointments, appointment, onClose }: Props) {
  const today = localDate();
  const periods = useMemo(() => summaryPeriods(appointments, today), [appointments, today]);
  const [periodKey, setPeriodKey] = useState(periods[0].key);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const period = periods.find((choice) => choice.key === periodKey) ?? periods[0];

  async function prepare() {
    setBusy(true);
    setMessage('');
    setSummary(null);
    try {
      setSummary(await api.visitSummary({ from_day: period.from, to_day: period.to, appointment_id: appointment?.id ?? null }));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function share(ready: Summary) {
    try {
      await Share.share({ message: summaryText(ready, today) });
    } catch {
      setMessage("Couldn't open sharing on this phone. You can show this screen to the doctor instead.");
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.modal} contentContainerStyle={ui.page}>
        <Text style={ui.sectionTitle}>Summary for the doctor</Text>
        {appointment && (
          <Text style={styles.for}>
            For {appointment.title}, {describeAppointmentTime(appointment, today)}
          </Text>
        )}
        <Text style={ui.helper}>
          CareLoop gathers the medicines, how the doses went and the family's notes, ready to show or send to the doctor. Private
          notes are left out.
        </Text>
        <Text style={ui.label}>Cover</Text>
        <View accessibilityRole="radiogroup" style={ui.row}>
          {periods.map((choice) => (
            <Chip
              key={choice.key}
              label={choice.label}
              selected={choice.key === period.key}
              onPress={() => {
                if (busy) return; // the summary being prepared is for the period already chosen
                setPeriodKey(choice.key);
                setSummary(null);
              }}
            />
          ))}
        </View>
        <Button label={busy ? 'Preparing…' : summary ? 'Prepare it again' : 'Prepare the summary'} disabled={busy} onPress={prepare} />
        {busy && (
          <View style={styles.waiting}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={ui.helper}>Reading and checking the notes… this usually takes under 30 seconds.</Text>
          </View>
        )}
        <Notice message={message} />
        {summary && <SummaryView summary={summary} today={today} onShare={() => share(summary)} />}
        <Button label="Close" variant="text" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

function SummaryView({ summary, today, onShare }: { summary: Summary; today: string; onShare: () => void }) {
  const [showNotes, setShowNotes] = useState(false);
  const notMarked = summary.medicines.some((medicine) => (medicine.doses?.not_marked ?? 0) > 0);

  return (
    <View style={[ui.card, styles.summary]}>
      <Text style={styles.title}>Health summary: {summary.person_name}</Text>
      <Text style={ui.small}>
        {shortDate(summary.from_day, today)} to {shortDate(summary.to_day, today)}
      </Text>
      <View style={ui.row}>
        <Button label="Share" onPress={onShare} />
        <Button label="🔊  Read aloud" variant="outline" onPress={() => readAloud(summarySpeech(summary, today))} />
      </View>

      <Text style={styles.heading}>Medicines</Text>
      {summary.medicines.length === 0 && <Text style={ui.helper}>No medicines in this period.</Text>}
      {summary.medicines.map((medicine) => (
        <View key={medicine.id} style={styles.item}>
          <Text style={styles.name}>
            {medicine.name}
            {medicine.strength ? ` · ${medicine.strength}` : ''}
            {summaryMedicinePeriod(medicine, summary, today)}
          </Text>
          <Text style={styles.text}>
            {medicine.dose ? `${medicine.dose}, ` : ''}
            {describeSchedule(medicine)}
          </Text>
          <Text style={styles.counts}>{describeDoseCounts(medicine.doses)}</Text>
        </View>
      ))}
      {notMarked && <Text style={ui.small}>{NOT_MARKED_MEANING}</Text>}

      {summarySections.map((section) => {
        const points = summary.points.filter((point) => point.section === section);
        if (points.length === 0) return null;
        return (
          <View key={section} style={styles.section}>
            <Text style={styles.heading}>{summarySectionTitle(section, summary.person_name)}</Text>
            {points.map((point, index) => (
              <View key={index} style={styles.item}>
                <Text style={styles.text}>• {point.text}</Text>
                <Text style={ui.small}>Noted {pointDates(point, summary.notes, today)}</Text>
              </View>
            ))}
          </View>
        );
      })}
      {summary.notes.length === 0 && <Text style={ui.helper}>No shared notes in this period.</Text>}
      <Notice message={summary.problem ?? ''} />

      {summary.notes.length > 0 && (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showNotes }} onPress={() => setShowNotes(!showNotes)}>
            <Text style={styles.link}>
              {showNotes ? '▾' : '▸'} All notes ({summary.notes.length})
            </Text>
          </Pressable>
          {showNotes &&
            summary.notes.map((note) => (
              <View key={note.id} style={styles.item}>
                <Text style={ui.small}>
                  {shortDate(localDate(new Date(note.created_at)), today)}
                  {note.created_by_name ? ` · ${note.created_by_name}` : ''}
                </Text>
                <Text style={styles.text}>
                  <Text style={styles.name}>{note.title}: </Text>
                  {note.details}
                </Text>
              </View>
            ))}
          {summary.notes_left_out > 0 && <Text style={ui.small}>{summary.notes_left_out} older notes aren't included.</Text>}
        </>
      )}
      {summary.model && (
        <Text style={ui.small}>
          Summarized by {modelLabel(summary.model)} on Nebius, then checked point by point against the notes
          {summary.checked_by ? ` by ${modelLabel(summary.checked_by)}` : ''}. Each point shows when its notes were written. This
          is not a diagnosis.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.page },
  for: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  waiting: { alignItems: 'center', gap: 8 },
  summary: { gap: 10 },
  title: { color: colors.heading, fontSize: 22, fontWeight: '800' },
  heading: { color: colors.heading, fontSize: 19, fontWeight: '800', marginTop: 8 },
  section: { gap: 8 },
  item: { gap: 2 },
  name: { color: colors.heading, fontSize: 17, fontWeight: '800' },
  text: { color: colors.text, fontSize: 17, lineHeight: 24 },
  counts: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  link: { color: colors.link, fontSize: 16, fontWeight: '700', paddingVertical: 6 },
});
