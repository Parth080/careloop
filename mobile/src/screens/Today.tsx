import { useState } from 'react';
import { View } from 'react-native';

import type { CareApi } from '../api';
import type { Snapshot } from '../cache';
import { Badge, Button, Card, DateTile, Divider, HeaderPill, Icon, IconButton, Notice, PressCard, Segments, Txt, type BadgeKind } from '../components/kit';
import TabPage from '../components/TabPage';
import {
  clockTime,
  dateTile,
  dayMarks,
  describeAppointmentTime,
  describeTime,
  doseDetail,
  doseMoment,
  doseNames,
  doseState,
  dosesOn,
  errorMessage,
  formatClock,
  greeting,
  isFinished,
  localDate,
  logFor,
  longDate,
  partOfDay,
  todayPlan,
  unmarkedCount,
  type Appointment,
  type DoseLog,
  type DoseState,
  type DoseStatus,
  type DoseTime,
} from '../model';
import type { Overlay, Tab } from '../navigation';
import { callNumber } from '../phone';
import { allowReminders, cancelRemindAgain, remindAgain } from '../reminders';
import { useTheme } from '../theme';

export type TodayProps = {
  data: Snapshot;
  api: CareApi;
  now: Date;
  reminders: { on: boolean; allowed: boolean };
  onSetReminders: (on: boolean) => Promise<boolean>;
  onChanged: () => void;
  open: (overlay: Overlay) => void;
  goTo: (tab: Tab) => void;
  refreshing: boolean;
  onRefresh: () => void;
  offline: boolean;
};

const BLOCKED = "Notifications are turned off for CareLoop. You can turn them on in your phone's Settings.";
const DUE_WINDOW_MS = 2 * 60 * 60 * 1000; // as in the model: a dose is "due" for two hours
const badges: Record<DoseState, [string, BadgeKind]> = {
  later: ['Later', 'later'],
  due: ['Due now', 'due'],
  missed: ['Not marked', 'notMarked'],
  partly: ['Partly done', 'skipped'],
  taken: ['Taken', 'taken'],
  skipped: ['Skipped', 'skipped'],
};

/** Marking doses taken or skipped, undoing that, and "remind me again", for everyone in the circle to see. */
function useDoseActions(api: CareApi, logs: DoseLog[], onChanged: () => void, personName: string, forSelf: boolean) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function mark(dose: DoseTime, status: DoseStatus) {
    // Only the medicines nobody has marked: a second tap must never overwrite what someone already recorded.
    const unmarked = dose.medicines.filter((medicine) => !logFor(logs, medicine.id, dose.day, dose.time));
    if (unmarked.length === 0) return;
    setBusy(true);
    setMessage('');
    try {
      await Promise.all(unmarked.map((medicine) => api.recordDose({ medication_id: medicine.id, day: dose.day, time: dose.time, status })));
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

  return { busy, message, setMessage, mark, undo, remindLater };
}

/** Who marked a dose and when: "Marked by Priya · 11:44 am". */
function markedBy(dose: DoseTime, logs: DoseLog[], myName: string): string {
  const marks = dose.medicines.flatMap((medicine) => logFor(logs, medicine.id, dose.day, dose.time) ?? []);
  const latest = marks.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).at(-1);
  if (!latest) return '';
  const who = latest.recorded_by_name === myName ? 'you' : latest.recorded_by_name;
  return `Marked${who ? ` by ${who}` : ''} · ${clockTime(latest.recorded_at)}`;
}

/** "all 3 taken", "skipped", or "2 taken, 1 skipped" for a dose whose medicines are all marked. */
function doneSummary(dose: DoseTime, logs: DoseLog[]): string {
  const statuses = dose.medicines.map((medicine) => logFor(logs, medicine.id, dose.day, dose.time)?.status);
  const taken = statuses.filter((status) => status === 'taken').length;
  const skipped = statuses.length - taken;
  if (skipped === 0) return statuses.length > 1 ? `all ${statuses.length} taken` : 'taken';
  if (taken === 0) return statuses.length > 1 ? `all ${statuses.length} skipped` : 'skipped';
  return `${taken} taken, ${skipped} skipped`;
}

/** Each medicine due at one time, on its own line with how to take it, and a mark once someone has marked it. */
function MedicineLines({ dose, logs, large = false }: { dose: DoseTime; logs: DoseLog[]; large?: boolean }) {
  return (
    <View style={{ gap: large ? 10 : 6 }}>
      {dose.medicines.map((medicine) => {
        const status = logFor(logs, medicine.id, dose.day, dose.time)?.status;
        const mark = status === 'taken' ? '✓ ' : status === 'skipped' ? '– ' : '';
        const detail = doseDetail(medicine);
        return (
          <View key={medicine.id} accessible accessibilityLabel={`${medicine.name}${detail ? `, ${detail}` : ''}${status ? `, ${status}` : ''}`}>
            <Txt v={large ? 'title3' : 'headline'}>
              {mark}
              {medicine.name}
            </Txt>
            {!!detail && (
              <Txt v={large ? 'bodyLarge' : 'body'} tone="textSecondary">
                {detail}
              </Txt>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function Today(props: TodayProps) {
  return props.data.circle.me.role === 'care_recipient' ? <OlderAdultToday {...props} /> : <CaregiverToday {...props} />;
}

function OlderAdultToday({ data, api, now, reminders, onSetReminders, onChanged, open, goTo, refreshing, onRefresh, offline }: TodayProps) {
  const { c, s } = useTheme();
  const { circle, medicines, doses, appointments } = data;
  const actions = useDoseActions(api, doses, onChanged, circle.profile.person_name, true);
  const today = localDate(now);
  const plan = todayPlan(medicines, doses, now);
  const nextVisit = appointments.find((appointment) => appointment.day >= today);
  const scheduled = medicines.some((medicine) => !medicine.as_needed && !isFinished(medicine, today));
  const dueToday = dosesOn(medicines, today).length > 0;
  const reminderRow = <ReminderRow reminders={reminders} onSetReminders={onSetReminders} onBlocked={() => actions.setMessage(BLOCKED)} />;

  return (
    <TabPage
      refreshing={refreshing}
      onRefresh={onRefresh}
      offline={offline}
      actions={
        <>
          <Button label="New note" icon="mic" variant="outlineDark" grow onPress={() => open({ kind: 'note' })} />
          <Button label="Ask" icon="ask" variant="outlineDark" grow onPress={() => open({ kind: 'ask' })} />
        </>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="bodySmall" tone="textSecondary">
            {longDate(now)}
          </Txt>
          <Txt v="title1" accessibilityRole="header">
            {greeting(now)}, {circle.me.name}
          </Txt>
        </View>
        <IconButton icon="people" label="Care circle" onPress={() => open({ kind: 'circle' })} />
        <HeaderPill label="Help" icon="phone" tone="danger" onPress={() => open({ kind: 'help' })} />
      </View>

      {!scheduled ? (
        <Card>
          <Txt v="title3">{medicines.length ? 'No medicines on a schedule' : 'No medicines yet'}</Txt>
          <Txt v="body" tone="textSecondary">
            Photograph a prescription and CareLoop will remind you at each medicine time.
          </Txt>
          <Button label={medicines.length ? 'See medicines' : 'Add medicines'} icon="pill" onPress={() => goTo('medicines')} />
        </Card>
      ) : plan.next ? (
        <Card focus={plan.next.state === 'due' || plan.next.state === 'partly'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt v="label" tone="primary" style={{ flex: 1 }}>
              {plan.next.state === 'due' ? 'Medicine due now' : plan.next.state === 'partly' ? 'Finish these' : `Next medicine · ${partOfDay(plan.next.dose.time)}`}
            </Txt>
            <Badge label={badges[plan.next.state][0]} kind={badges[plan.next.state][1]} />
          </View>
          <Txt v="display">{formatClock(plan.next.dose.time)}</Txt>
          <MedicineLines dose={plan.next.dose} logs={doses} large />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button label="Taken" icon="check" grow disabled={actions.busy} onPress={() => actions.mark(plan.next!.dose, 'taken')} />
            <Button label="Skipped" variant="secondary" grow disabled={actions.busy} onPress={() => actions.mark(plan.next!.dose, 'skipped')} />
          </View>
          {plan.next.state !== 'later' && <Button label="Remind me in 15 minutes" variant="quiet" onPress={() => actions.remindLater(plan.next!.dose)} />}
          <Divider />
          {reminderRow}
        </Card>
      ) : (
        <Card>
          <Txt v="label" tone="primary">
            {!dueToday ? 'Nothing is due today' : plan.unmarked.length > 0 ? 'No more medicines due today' : "All of today's medicines are marked"}
          </Txt>
          {plan.tomorrow && (
            <>
              <Txt v="title3">Next: tomorrow, {formatClock(plan.tomorrow.time)}</Txt>
              <Txt v="body" tone="textSecondary">
                {doseNames(plan.tomorrow)}
              </Txt>
            </>
          )}
          <Divider />
          {reminderRow}
        </Card>
      )}
      <Notice message={actions.message} />

      {plan.unmarked.map((dose) => (
        <UnmarkedDose key={dose.time} dose={dose} logs={doses} busy={actions.busy} onMark={actions.mark} onRemind={actions.remindLater} />
      ))}

      {plan.done.map((dose) => {
        const allSkipped = dose.medicines.every((medicine) => logFor(doses, medicine.id, dose.day, dose.time)?.status === 'skipped');
        return (
          <View key={dose.time} style={[s.cardSoft, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: allSkipped ? c.warningSoft : c.primary,
              }}
            >
              <Icon name={allSkipped ? 'skip' : 'check'} color={allSkipped ? c.onWarning : c.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="headline">
                {formatClock(dose.time)} · {doneSummary(dose, doses)}
              </Txt>
              <Txt v="bodySmall" tone="textSecondary">
                {markedBy(dose, doses, circle.me.name)}
              </Txt>
            </View>
            <Button
              label="Undo"
              variant="quiet"
              disabled={actions.busy}
              onPress={() => actions.undo(dose)}
              accessibilityLabel={`Undo ${formatClock(dose.time)}`}
              style={{ paddingHorizontal: 4 }}
            />
          </View>
        );
      })}

      {nextVisit && <VisitCard appointment={nextVisit} today={today} onPress={() => goTo('visits')} />}
    </TabPage>
  );
}

function ReminderRow({ reminders, onSetReminders, onBlocked }: { reminders: { on: boolean; allowed: boolean }; onSetReminders: (on: boolean) => Promise<boolean>; onBlocked: () => void }) {
  const { c } = useTheme();
  const working = reminders.on && reminders.allowed;
  async function change(on: boolean) {
    if (!(await onSetReminders(on))) onBlocked();
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name={working ? 'bell' : 'bellOff'} color={c.textSecondary} />
      <Txt v="body" tone="textSecondary" style={{ flex: 1 }} numberOfLines={2}>
        {working ? 'Reminder on' : reminders.on ? 'Reminders need permission' : 'Reminders are off'}
      </Txt>
      <Button
        label={working ? 'Turn off reminders' : reminders.on ? 'Allow' : 'Turn on'}
        variant="quiet"
        onPress={() => change(!working)}
        style={{ paddingHorizontal: 4 }}
      />
    </View>
  );
}

type UnmarkedProps = {
  dose: DoseTime;
  logs: DoseLog[];
  busy: boolean;
  onMark: (dose: DoseTime, status: DoseStatus) => void;
  onRemind: (dose: DoseTime) => void;
};

function UnmarkedDose({ dose, logs, busy, onMark, onRemind }: UnmarkedProps) {
  const { c, s } = useTheme();
  const partly = unmarkedCount(dose, logs) < dose.medicines.length;
  return (
    <View style={[s.card, { borderWidth: 2, borderStyle: 'dashed', borderColor: c.textMuted }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt v="title3" style={{ flex: 1 }}>
          {formatClock(dose.time)}
        </Txt>
        <Badge label={partly ? 'Partly marked' : 'Not marked'} kind="notMarked" />
      </View>
      <MedicineLines dose={dose} logs={logs} />
      <Txt v="bodySmall" tone="textSecondary">
        Nobody has marked {partly ? 'the rest' : 'these'} yet, so it isn't known whether they were taken.
      </Txt>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button label="Mark taken" grow disabled={busy} onPress={() => onMark(dose, 'taken')} />
        <Button label="Skipped" variant="secondary" grow disabled={busy} onPress={() => onMark(dose, 'skipped')} />
      </View>
      <Button label="Remind me in 15 minutes" variant="quiet" onPress={() => onRemind(dose)} />
    </View>
  );
}

function VisitCard({ appointment, today, onPress }: { appointment: Appointment; today: string; onPress: () => void }) {
  const tile = dateTile(appointment.day);
  const who = appointment.with_whom ?? appointment.title;
  const extra = [appointment.place, appointment.notes ? appointment.notes.charAt(0).toLowerCase() + appointment.notes.slice(1) : null].filter(Boolean).join(' · ');
  return (
    <PressCard label={`Next visit: ${appointment.title}, ${describeAppointmentTime(appointment, today)}. ${extra}`} onPress={onPress} style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <DateTile weekday={tile.weekday} day={tile.day} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="headline">
            {who} · {appointment.time ? formatClock(appointment.time) : 'time not set'}
          </Txt>
          {!!extra && (
            <Txt v="body" tone="textSecondary">
              {extra}
            </Txt>
          )}
        </View>
      </View>
    </PressCard>
  );
}

function CaregiverToday({ data, api, now, reminders, onSetReminders, onChanged, open, goTo, refreshing, onRefresh, offline }: TodayProps) {
  const { c } = useTheme();
  const { circle, medicines, doses, appointments, notes, contacts } = data;
  const person = circle.profile.person_name;
  const actions = useDoseActions(api, doses, onChanged, person, false);
  const today = localDate(now);
  const todays = dosesOn(medicines, today);
  const marks = dayMarks(medicines, doses, today);
  const taken = marks.filter((mark) => mark === 'taken').length;
  const anyMarked = marks.some((mark) => mark !== 'none');
  const personPhone = contacts.find((contact) => contact.role === 'person');
  const nextVisit = appointments.find((appointment) => appointment.day >= today);
  const recipient = circle.members.find((member) => member.role === 'care_recipient');
  const latest = recipient ? notes.find((note) => note.created_by_id === recipient.id) : notes[0];
  const remindersWorking = reminders.on && reminders.allowed;

  async function callPerson() {
    if (!personPhone) return open({ kind: 'help', editing: 'person' });
    const problem = await callNumber(personPhone.phone);
    if (problem) actions.setMessage(problem);
  }

  async function setReminders(on: boolean) {
    if (!(await onSetReminders(on))) actions.setMessage(BLOCKED);
  }

  return (
    <TabPage
      refreshing={refreshing}
      onRefresh={onRefresh}
      offline={offline}
      actions={
        <>
          <Button label="New note" icon="mic" variant="outlineDark" grow onPress={() => open({ kind: 'note' })} />
          <Button label="Ask" icon="ask" variant="outlineDark" grow onPress={() => open({ kind: 'ask' })} />
        </>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="label" tone="primary">
            Caring for {person}
          </Txt>
          <Txt v="title1" accessibilityRole="header">
            Hi {circle.me.name}
          </Txt>
        </View>
        <HeaderPill label={`Call ${person}`} icon="phone" tone="outline" onPress={callPerson} />
      </View>

      {todays.length > 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt v="title3" style={{ flex: 1 }}>
              Today's medicines
            </Txt>
            <Txt v="label" tone="primary">
              {anyMarked ? `${taken} of ${marks.length} taken` : `0 of ${marks.length} marked`}
            </Txt>
          </View>
          <Segments marks={marks} />
          {todays.map((dose, index) => {
            const state = doseState(dose, doses, now);
            const allMarked = unmarkedCount(dose, doses) === 0;
            const [label, kind]: [string, BadgeKind] = allMarked && state === 'partly' ? ['Partly taken', 'skipped'] : badges[state];
            const overdue = now.getTime() - doseMoment(dose.day, dose.time).getTime() > DUE_WINDOW_MS;
            const needsMarking = !allMarked && overdue;
            const content = (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt v="headline" style={{ flex: 1 }}>
                    {formatClock(dose.time)}
                  </Txt>
                  <Badge label={label} kind={kind} />
                </View>
                <MedicineLines dose={dose} logs={doses} />
                {needsMarking && (
                  <Txt v="bodySmall" tone="textSecondary">
                    Nobody has marked {state === 'missed' ? 'these' : 'the rest'} yet, so it isn't known whether they were taken.
                  </Txt>
                )}
                {allMarked ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Txt v="bodySmall" tone="textMuted" style={{ flex: 1 }}>
                      {markedBy(dose, doses, circle.me.name)}
                    </Txt>
                    <Button
                      label="Undo"
                      variant="quiet"
                      disabled={actions.busy}
                      onPress={() => actions.undo(dose)}
                      accessibilityLabel={`Undo ${formatClock(dose.time)}`}
                      style={{ paddingHorizontal: 4 }}
                    />
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Button label="Mark taken" grow disabled={actions.busy} onPress={() => actions.mark(dose, 'taken')} />
                      <Button label="Skipped" variant="secondary" grow disabled={actions.busy} onPress={() => actions.mark(dose, 'skipped')} />
                    </View>
                    {state !== 'later' && <Button label="Remind me in 15 minutes" variant="quiet" onPress={() => actions.remindLater(dose)} />}
                  </>
                )}
              </>
            );
            return (
              <View key={dose.time} style={{ gap: 8 }}>
                {index > 0 && !needsMarking && <Divider />}
                {needsMarking ? (
                  <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: c.textMuted, borderRadius: 20, padding: 16, gap: 8 }}>{content}</View>
                ) : (
                  content
                )}
              </View>
            );
          })}
          {remindersWorking && (
            <>
              <Divider />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="bell" color={c.textSecondary} />
                <Txt v="body" tone="textSecondary" style={{ flex: 1 }}>
                  This phone reminds you
                </Txt>
                <Button label="Turn off" variant="quiet" onPress={() => setReminders(false)} style={{ paddingHorizontal: 4 }} />
              </View>
            </>
          )}
        </Card>
      ) : (
        <Card>
          <Txt v="title3">{medicines.length ? 'Nothing is due today' : 'No medicines yet'}</Txt>
          <Button label={medicines.length ? 'See medicines' : 'Add medicines'} icon="pill" variant="secondary" onPress={() => goTo('medicines')} />
        </Card>
      )}
      <Notice message={actions.message} />

      {todays.length > 0 && !remindersWorking && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.warningSoft, borderRadius: 20, padding: 16 }}>
          <Icon name="bellOff" color={c.onWarning} />
          <Txt v="body" tone="onWarning" style={{ flex: 1 }}>
            {reminders.on ? 'Reminders need permission on this phone' : 'Reminders are off on this phone'}
          </Txt>
          <Button label="Turn on" variant="warnOutline" onPress={() => setReminders(true)} style={{ paddingHorizontal: 16 }} />
        </View>
      )}

      {latest ? (
        <PressCard
          label={`${recipient ? `Latest from ${person}` : 'Latest note'}: ${latest.title}. ${latest.details}. ${describeTime(latest.created_at, now)}. Opens all notes.`}
          onPress={() => goTo('notes')}
          style={{ alignItems: 'flex-start' }}
        >
          <Txt v="label" tone="textSecondary">
            {recipient ? `Latest from ${person}` : 'Latest note'}
          </Txt>
          <Txt v="title3">{latest.title}</Txt>
          <Txt v="body" numberOfLines={3}>
            {latest.details}
          </Txt>
          <Txt v="bodySmall" tone="textMuted">
            {describeTime(latest.created_at, now)}
          </Txt>
        </PressCard>
      ) : (
        <Card>
          <Txt v="label" tone="textSecondary">
            Latest from {person}
          </Txt>
          <Txt v="title3">No notes yet</Txt>
        </Card>
      )}

      {nextVisit && <VisitCard appointment={nextVisit} today={today} onPress={() => goTo('visits')} />}

      <PressCard label="Call for help: emergency contact and doctor" onPress={() => open({ kind: 'help' })}>
        <Txt v="headline">Call for help</Txt>
        <Txt v="body" tone="textSecondary">
          Emergency contact and doctor
        </Txt>
      </PressCard>
      <PressCard label="Care circle: invite family and see who's here" onPress={() => open({ kind: 'circle' })}>
        <Txt v="headline">Care circle</Txt>
        <Txt v="body" tone="textSecondary">
          Invite family and see who's here
        </Txt>
      </PressCard>
    </TabPage>
  );
}
