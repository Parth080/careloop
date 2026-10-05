import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';

import {
  appointmentReminders,
  clockOf,
  doseMoment,
  dosesOn,
  formatClock,
  logFor,
  reminderText,
  upcomingReminders,
  type Appointment,
  type DoseLog,
  type DoseTime,
  type Medicine,
} from './model';

const CHANNEL = 'medicine-reminders';
const SETTING_KEY = 'careloop.reminders';
const DAYS_AHEAD = 7; // rescheduled whenever the app opens or the schedule changes
const MOST_ALERTS = 60; // iOS keeps at most 64 scheduled alerts per app
const MOST_APPOINTMENT_ALERTS = 12;
const KEEP_GOING = 'keep-going';

export type ReminderSetting = 'on' | 'off';

// Show reminders even while CareLoop is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Syncs run one at a time, and a newer request (or signing out) makes an older one stop early. Otherwise
// a sync still adding alerts could put back ones that a later sync, or signing out, had just removed.
let latest = 0;
let queue: Promise<void> = Promise.resolve();
let stopped = false; // signed out: nothing may be scheduled until someone signs in again

function inTurn(task: (outdated: () => boolean) => Promise<void>): Promise<void> {
  const ticket = ++latest;
  const run = queue.then(() => task(() => ticket !== latest || stopped));
  queue = run.catch(() => undefined);
  return run;
}

async function schedule(request: Notifications.NotificationRequestInput): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync(request);
  } catch {
    // One bad alert shouldn't cost all the others.
  }
}

export async function readReminderSetting(): Promise<ReminderSetting | null> {
  try {
    const saved = await Storage.getItem(SETTING_KEY);
    return saved === 'on' || saved === 'off' ? saved : null;
  } catch {
    return null;
  }
}

export async function saveReminderSetting(setting: ReminderSetting): Promise<void> {
  try {
    await Storage.setItem(SETTING_KEY, setting);
  } catch {
    // Falls back to the default next time.
  }
}

export async function remindersAllowed(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Ask the phone for permission to show reminders. False if the person said no (now or before). */
export async function allowReminders(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Medicine reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 400, 200, 400],
  });
}

/** "day:time" for every dose where each medicine has been marked taken or skipped. */
function finishedDoses(medicines: Medicine[], logs: DoseLog[]): Set<string> {
  const finished = new Set<string>();
  for (const day of new Set(logs.map((log) => log.day))) {
    for (const dose of dosesOn(medicines, day)) {
      if (dose.medicines.every((medicine) => logFor(logs, medicine.id, day, dose.time))) finished.add(`${day}:${dose.time}`);
    }
  }
  return finished;
}

type SyncOptions = {
  enabled: boolean;
  medicines: Medicine[];
  logs: DoseLog[];
  appointments: Appointment[];
  personName: string;
  forSelf: boolean;
};

/** Replace this phone's medicine and appointment reminders with ones that match the latest data. */
export function syncReminders({ enabled, medicines, logs, appointments, personName, forSelf }: SyncOptions): Promise<void> {
  return inTurn(async (outdated) => {
    if (outdated()) return;
    const finished = finishedDoses(medicines, logs);
    const replaced = (await Notifications.getAllScheduledNotificationsAsync())
      .map((request) => request.identifier)
      .filter((id) => id.startsWith('dose:') || id.startsWith('appt:') || id === KEEP_GOING || (id.startsWith('again:') && finished.has(id.slice(6))));
    await Promise.all(replaced.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
    if (!enabled || outdated() || !(await remindersAllowed())) return;
    await ensureChannel();

    const now = new Date();
    const visits = appointmentReminders(appointments, now, personName, forSelf).slice(0, MOST_APPOINTMENT_ALERTS);
    const doses = upcomingReminders(medicines, logs, now, DAYS_AHEAD).slice(0, MOST_ALERTS - visits.length - 1);
    for (const visit of visits) {
      if (outdated()) return;
      await schedule({
        identifier: visit.id,
        content: { title: visit.title, body: visit.body, sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: visit.at, channelId: CHANNEL },
      });
    }
    for (const dose of doses) {
      if (outdated()) return;
      await schedule({
        identifier: `dose:${dose.day}:${dose.time}`, // the same id replaces, so a repeated sync can't double up
        content: { ...reminderText(dose, personName, forSelf), sound: 'default', data: { day: dose.day, time: dose.time } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: doseMoment(dose.day, dose.time), channelId: CHANNEL },
      });
    }
    const last = doses.at(-1);
    if (last && !outdated()) {
      // Alerts are only scheduled a week ahead, so ask for the app to be opened before they run out.
      await schedule({
        identifier: KEEP_GOING,
        content: {
          title: 'Open CareLoop to keep reminders coming',
          body: 'Medicine reminders are set a week at a time. Opening the app sets the next ones.',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(doseMoment(last.day, last.time).getTime() + 30 * 60_000),
          channelId: CHANNEL,
        },
      });
    }
  });
}

/** One extra reminder for a dose, a few minutes from now. Returns when it will ring, e.g. "3:45 PM". */
export async function remindAgain(dose: DoseTime, minutes: number, personName: string, forSelf: boolean): Promise<string> {
  await ensureChannel();
  const { title, body } = reminderText(dose, personName, forSelf);
  await Notifications.scheduleNotificationAsync({
    identifier: `again:${dose.day}:${dose.time}`,
    content: { title: `Reminder · ${title}`, body, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60, channelId: CHANNEL },
  });
  return formatClock(clockOf(new Date(Date.now() + minutes * 60_000)));
}

/** Someone marked this dose, so an extra reminder for it must not ring (it could prompt a second dose). */
export async function cancelRemindAgain(day: string, time: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`again:${day}:${time}`).catch(() => undefined);
}

/** On sign-out: remove every alert and schedule nothing more, even if an update is already under way. */
export function stopReminders(): Promise<void> {
  stopped = true;
  return inTurn(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
    await Storage.removeItem(SETTING_KEY).catch(() => undefined);
  });
}

/** On sign-in: reminders may be scheduled again. */
export function startReminders(): void {
  stopped = false;
}
