import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { CareApi } from '../api';
import {
  describeTime,
  doseState,
  dosesOn,
  errorMessage,
  foodLabels,
  formatClock,
  isFinished,
  localDate,
  logFor,
  type DoseLog,
  type DoseState,
  type DoseStatus,
  type DoseTime,
  type Medicine,
} from '../model';
import { allowReminders, cancelRemindAgain, remindAgain } from '../reminders';
import { colors, ui } from '../theme';
import { Button, Notice } from './controls';

type Props = {
  medicines: Medicine[];
  logs: DoseLog[]; // today's
  api: CareApi;
  personName: string;
  forSelf: boolean;
  reminders: { on: boolean; allowed: boolean };
  onSetReminders: (on: boolean) => Promise<boolean>;
  onChanged: () => void;
};

const stateLabels: Record<DoseState, string> = {
  later: 'Later',
  due: 'Due now',
  missed: 'Not marked',
  partly: 'Partly done',
  taken: '✓ Taken',
  skipped: 'Skipped',
};

const BLOCKED = "Notifications are turned off for CareLoop. You can turn them on in your phone's Settings.";

export default function TodayDoses({ medicines, logs, api, personName, forSelf, reminders, onSetReminders, onChanged }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000); // "later" becomes "due now" without a refresh
    return () => clearInterval(timer);
  }, []);

  const today = localDate(now);
  if (!medicines.some((medicine) => !medicine.as_needed && !isFinished(medicine, today))) return null;
  const doses = dosesOn(medicines, today);

  async function mark(dose: DoseTime, status: DoseStatus) {
    const unmarked = dose.medicines.filter((medicine) => !logFor(logs, medicine.id, dose.day, dose.time));
    setBusy(true);
    setMessage('');
    try {
      await Promise.all(
        (unmarked.length > 0 ? unmarked : dose.medicines).map((medicine) =>
          api.recordDose({ medication_id: medicine.id, day: dose.day, time: dose.time, status }),
        ),
      );
      await cancelRemindAgain(dose.day, dose.time); // a snoozed reminder must not prompt a second dose
      onChanged();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function undo(dose: DoseTime) {
    setBusy(true);
    setMessage('');
    try {
      await Promise.all(
        dose.medicines
          .filter((medicine) => logFor(logs, medicine.id, dose.day, dose.time))
          .map((medicine) => api.undoDose({ medication_id: medicine.id, day: dose.day, time: dose.time })),
      );
      onChanged();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remindLater(dose: DoseTime) {
    try {
      if (!(await allowReminders())) return setMessage(BLOCKED);
      const at = await remindAgain(dose, 15, personName, forSelf);
      setMessage(`CareLoop will remind ${forSelf ? 'you' : 'you about it'} again at ${at}.`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function switchReminders(on: boolean) {
    setMessage('');
    if (!(await onSetReminders(on))) setMessage(BLOCKED);
  }

  return (
    <View style={ui.card}>
      <Text style={ui.sectionTitle}>{forSelf ? "Today's medicines" : `${personName}'s medicines today`}</Text>
      {doses.length === 0 && <Text style={ui.helper}>Nothing is due today.</Text>}
      {doses.map((dose) => {
        const state = doseState(dose, logs, now);
        const marks = dose.medicines.flatMap((medicine) => logFor(logs, medicine.id, dose.day, dose.time) ?? []);
        const latest = marks.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).at(-1);
        return (
          <View key={dose.time} style={[ui.divider, styles.dose]}>
            <View style={styles.header}>
              <Text style={styles.time}>{formatClock(dose.time)}</Text>
              <Text style={[styles.badge, badgeStyles[state]]}>{stateLabels[state]}</Text>
            </View>
            {dose.medicines.map((medicine) => {
              const mark = logFor(logs, medicine.id, dose.day, dose.time)?.status;
              return (
                <Text key={medicine.id} style={styles.medicine}>
                  {mark === 'taken' ? '✓ ' : mark === 'skipped' ? '– ' : '• '}
                  {medicine.name}
                  {medicine.dose ? ` – ${medicine.dose}` : ''}
                  {medicine.food ? ` (${foodLabels[medicine.food].toLowerCase()})` : ''}
                </Text>
              );
            })}
            {latest && (
              <Text style={ui.small}>
                Marked {latest.status}
                {latest.recorded_by_name ? ` by ${latest.recorded_by_name}` : ''} · {describeTime(latest.recorded_at, now)}
              </Text>
            )}
            {state === 'taken' || state === 'skipped' ? (
              <Button label="Undo" variant="text" disabled={busy} onPress={() => undo(dose)} />
            ) : (
              <View style={styles.actions}>
                <Button label="✓  Taken" disabled={busy} onPress={() => mark(dose, 'taken')} />
                <Button label="Skipped" variant="outline" disabled={busy} onPress={() => mark(dose, 'skipped')} />
                {(state === 'due' || state === 'missed') && (
                  <Button label="Remind me in 15 min" variant="text" onPress={() => remindLater(dose)} />
                )}
              </View>
            )}
          </View>
        );
      })}
      <Notice message={message} />
      <View style={[ui.divider, styles.reminders]}>
        {reminders.on && reminders.allowed ? (
          <>
            <Text style={ui.helper}>🔔 This phone reminds {forSelf ? 'you' : `you about ${personName}'s medicines`} at each time.</Text>
            <Button label="Turn off reminders" variant="text" onPress={() => switchReminders(false)} />
          </>
        ) : (
          <>
            <Text style={ui.helper}>
              {reminders.on ? '🔔 Let CareLoop remind' : '🔕 Reminders are off. Turn them on to remind'}{' '}
              {forSelf ? 'you' : `you about ${personName}'s medicines`} at each medicine time.
            </Text>
            <Button label={reminders.on ? 'Allow reminders' : 'Turn on reminders'} variant="outline" onPress={() => switchReminders(true)} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dose: { gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  time: { color: colors.heading, fontSize: 22, fontWeight: '800' },
  badge: { fontSize: 14, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  medicine: { color: colors.text, fontSize: 18, lineHeight: 26 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  reminders: { gap: 6 },
});

const badgeStyles = StyleSheet.create({
  later: { color: colors.muted, backgroundColor: '#EEF1EA' },
  due: { color: '#7A4B00', backgroundColor: '#FFE9B8' },
  missed: { color: '#8A2E22', backgroundColor: '#FBE1DC' },
  partly: { color: '#7A4B00', backgroundColor: '#FFF3D6' },
  taken: { color: colors.onPrimary, backgroundColor: colors.primary },
  skipped: { color: colors.muted, backgroundColor: '#E6E9E2' },
});
