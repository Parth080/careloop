import { useMemo, useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';

import type { CareApi } from '../api';
import { Button, Card, ChipTile, CloseButton, DateTile, Divider, Expander, Icon, ModalScreen, Notice, ProportionBar, Txt, type IconName } from '../components/kit';
import {
  dateTile,
  describeAppointmentTime,
  errorMessage,
  localDate,
  medicineCountLabel,
  modelLabel,
  NOT_MARKED_MEANING,
  pointDates,
  shortClock,
  shortDate,
  summaryMedicinePeriod,
  summaryPeriods,
  summarySections,
  summarySectionTitle,
  summarySpeech,
  summaryText,
  type Appointment,
  type VisitSummary,
} from '../model';
import { readAloud } from '../readAloud';
import { useTheme } from '../theme';

type Props = { api: CareApi; appointments: Appointment[]; appointment: Appointment | null; personName: string; onClose: () => void };

/** A one-page summary for a doctor visit: medicines, how the doses went, and the family's notes. */
export default function Summary({ api, appointments, appointment, personName, onClose }: Props) {
  const { c } = useTheme();
  const today = localDate();
  const periods = useMemo(() => summaryPeriods(appointments, today), [appointments, today]);
  const [periodKey, setPeriodKey] = useState(periods[0].key);
  const [summary, setSummary] = useState<VisitSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const period = periods.find((choice) => choice.key === periodKey) ?? periods[0];

  async function prepare() {
    setBusy(true);
    setMessage('');
    try {
      setSummary(await api.visitSummary({ from_day: period.from, to_day: period.to, appointment_id: appointment?.id ?? null }));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function share(ready: VisitSummary) {
    try {
      await Share.share({ message: summaryText(ready, today) });
    } catch {
      setMessage("Couldn't open sharing on this phone. You can show this screen to the doctor instead.");
    }
  }

  if (summary) {
    return (
      <ModalScreen
        onClose={onClose}
        header={
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt v="title2" accessibilityRole="header">
                Health summary: {summary.person_name}
              </Txt>
              <Txt v="body" tone="textSecondary">
                {shortDate(summary.from_day, today)} to {shortDate(summary.to_day, today)}
                {summary.appointment?.with_whom ? ` · for ${summary.appointment.with_whom}` : ''}
              </Txt>
            </View>
            <CloseButton onPress={onClose} />
          </View>
        }
      >
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button label="Share" icon="share" grow onPress={() => share(summary)} />
          <Button label="Read aloud" icon="speaker" variant="secondary" grow onPress={() => readAloud(summarySpeech(summary, today))} />
        </View>
        <Notice message={message} tone="warning" />
        <SummaryBody summary={summary} today={today} />
      </ModalScreen>
    );
  }

  const what: [IconName, string][] = [
    ['check', 'Medicines and how the doses went'],
    ['check', "The family's notes"],
    ['check', 'Questions for the doctor'],
    ['hidden', 'Notes marked "Only me" are left out'],
  ];

  return (
    <ModalScreen
      onClose={onClose}
      title="Summary for the doctor"
      footer={
        <>
          <Button label={busy ? 'Preparing…' : 'Prepare the summary'} disabled={busy} onPress={prepare} />
          <Button label="Close" variant="quiet" onPress={onClose} style={{ alignSelf: 'center' }} />
        </>
      }
    >
      {appointment && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <DateTile weekday={dateTile(appointment.day).weekday} day={dateTile(appointment.day).day} strong />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="headline">{appointment.title}</Txt>
            <Txt v="body" tone="textSecondary">
              {describeAppointmentTime(appointment, today)}
            </Txt>
          </View>
        </Card>
      )}
      <Txt v="title3">How far back?</Txt>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {periods.map((choice) => {
          const [label, detail] = choice.key === 'visit' ? ['Since last visit', choice.label.match(/\((.+)\)/)?.[1]] : [choice.label, undefined];
          return (
            <View key={choice.key} style={{ width: '48%', flexGrow: 1 }}>
              <ChipTile
                label={label}
                detail={detail}
                selected={choice.key === period.key}
                onPress={() => {
                  if (!busy) setPeriodKey(choice.key); // the summary being prepared is for the period already chosen
                }}
              />
            </View>
          );
        })}
      </View>
      <Txt v="title3">What goes in</Txt>
      <View style={{ gap: 12 }}>
        {what.map(([icon, text]) => (
          <View key={text} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Icon name={icon} color={icon === 'check' ? c.primary : c.textSecondary} />
            <Txt v="body" style={{ flex: 1 }}>
              {text}
            </Txt>
          </View>
        ))}
      </View>
      {busy && (
        <View style={{ alignItems: 'center', gap: 10 }}>
          <ActivityIndicator size="large" color={c.primary} />
          <Txt v="body" tone="textSecondary">
            Reading and checking {personName}'s notes… this usually takes under 30 seconds.
          </Txt>
        </View>
      )}
      <Notice message={message} tone="warning" />
    </ModalScreen>
  );
}

function SummaryBody({ summary, today }: { summary: VisitSummary; today: string }) {
  const [open, setOpen] = useState<string | null>('symptoms');
  const [showNotes, setShowNotes] = useState(false);
  const notMarked = summary.medicines.some((medicine) => (medicine.doses?.not_marked ?? 0) > 0);
  const sections = summarySections.filter((section) => summary.points.some((point) => point.section === section));

  return (
    <>
      <Card style={{ gap: 16 }}>
        <Txt v="title3">Medicines</Txt>
        {summary.medicines.length === 0 && <Txt v="body" tone="textSecondary">No medicines in this period.</Txt>}
        {summary.medicines.map((medicine) => (
          <View key={medicine.id} style={{ gap: 8 }}>
            <View style={{ gap: 2 }}>
              <Txt v="headline">
                {medicine.name}
                {medicine.strength ? ` · ${medicine.strength}` : ''}
              </Txt>
              <Txt v="bodySmall" tone="textSecondary">
                {medicine.as_needed
                  ? 'Only when needed'
                  : [medicine.dose, medicine.times.map(shortClock).join(', '), medicine.food?.replace('_', ' ')].filter(Boolean).join(' · ') +
                    summaryMedicinePeriod(medicine, summary, today)}
              </Txt>
            </View>
            {medicine.doses && medicine.doses.due > 0 && (
              <ProportionBar taken={medicine.doses.taken} skipped={medicine.doses.skipped} notMarked={medicine.doses.not_marked} />
            )}
            {!medicine.as_needed && <Txt v="bodySmall">{medicineCountLabel(medicine.doses)}</Txt>}
          </View>
        ))}
        {notMarked && (
          <>
            <Divider />
            <Txt v="bodySmall" tone="textSecondary">
              {NOT_MARKED_MEANING}
            </Txt>
          </>
        )}
      </Card>

      {summary.notes.length === 0 ? (
        <Card>
          <Txt v="body" tone="textSecondary">
            No shared notes in this period.
          </Txt>
        </Card>
      ) : (
        sections.length > 0 && (
          <Card style={{ gap: 0, paddingVertical: 8 }}>
            {sections.map((section, index) => {
              const points = summary.points.filter((point) => point.section === section);
              return (
                <View key={section}>
                  {index > 0 && <Divider />}
                  <Expander
                    label={summarySectionTitle(section, summary.person_name)}
                    count={points.length === 1 ? '1 point' : `${points.length} points`}
                    expanded={open === section}
                    onToggle={() => setOpen(open === section ? null : section)}
                  />
                  {open === section && (
                    <View style={{ gap: 12, paddingBottom: 16 }}>
                      {points.map((point, pointIndex) => (
                        <View key={pointIndex} style={{ gap: 2 }}>
                          <Txt v="body">• {point.text}</Txt>
                          <Txt v="bodySmall" tone="textMuted">
                            Noted {pointDates(point, summary.notes, today)}
                          </Txt>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        )
      )}
      <Notice message={summary.problem ?? ''} tone="warning" />

      {summary.notes.length > 0 && (
        <>
          <Expander label="All notes" count={summary.notes.length} expanded={showNotes} onToggle={() => setShowNotes(!showNotes)} />
          {showNotes &&
            summary.notes.map((note) => (
              <Card key={note.id} style={{ gap: 4, padding: 16 }}>
                <Txt v="bodySmall" tone="textMuted">
                  {shortDate(localDate(new Date(note.created_at)), today)}
                  {note.created_by_name ? ` · ${note.created_by_name}` : ''}
                </Txt>
                <Txt v="headline">{note.title}</Txt>
                <Txt v="body">{note.details}</Txt>
              </Card>
            ))}
          {summary.notes_left_out > 0 && (
            <Txt v="bodySmall" tone="textMuted">
              {summary.notes_left_out} older notes aren't included.
            </Txt>
          )}
        </>
      )}
      {summary.model && (
        <Txt v="bodySmall" tone="textMuted">
          Summarized by {modelLabel(summary.model)} on Nebius, then checked point by point against the notes
          {summary.checked_by ? ` by ${modelLabel(summary.checked_by)}` : ''}. Each point shows when its notes were written. This is not a diagnosis.
        </Txt>
      )}
    </>
  );
}
