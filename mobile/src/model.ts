// Shared types and plain helpers. Keep React Native out of this file so Node can test it directly.

export const categories = ['symptom', 'appointment', 'medication', 'doctor', 'general'] as const;
export type Category = (typeof categories)[number];
export const categoryLabels: Record<Category, string> = {
  symptom: 'Symptom',
  appointment: 'Appointment',
  medication: 'Medicine',
  doctor: 'Doctor',
  general: 'Other',
};

export type Role = 'care_recipient' | 'caregiver';
export type ContactRole = 'emergency' | 'doctor';

export type Member = {
  id: number;
  name: string;
  role: Role;
  is_creator: boolean;
  is_me: boolean;
  can_remove: boolean;
  joined_at: string;
};
export type Circle = { me: Member; profile: { id: number; person_name: string }; members: Member[]; can_manage: boolean };
export type Session = Circle & { token: string };
export type Invite = { code: string; role: Role; expires_at: string };

export type NoteFields = { category: Category; title: string; details: string; event_time_text: string | null };
export type NoteInput = NoteFields & { private: boolean };
export type NewNote = NoteInput & { source_text: string | null; model: string | null };
export type Note = NewNote & {
  id: number;
  created_at: string;
  created_by_id: number | null;
  created_by_name: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};
export type Proposal = { notes: NoteFields[]; model: string };
export type Contact = { role: ContactRole; name: string; phone: string; updated_at: string; updated_by_name: string | null };

export type FoodTiming = 'before_food' | 'after_food' | 'with_food';
export const foodLabels: Record<FoodTiming, string> = { before_food: 'Before food', after_food: 'After food', with_food: 'With food' };
export type MedicineField = 'name' | 'strength' | 'form' | 'dose' | 'times' | 'food' | 'duration' | 'instructions' | 'other';

export type MedicineFields = {
  name: string;
  strength: string | null;
  form: string | null;
  dose: string | null;
  times: string[]; // local "HH:MM"
  food: FoodTiming | null;
  as_needed: boolean;
  instructions: string | null;
  source_text: string | null;
};
/** `alternatives`: other spellings of the name that the two readers saw. */
export type MedicineDraft = MedicineFields & { duration_days: number | null; unclear: MedicineField[]; alternatives: string[] };
export type Reading = { model: string; text: string };
export type PrescriptionReading = {
  medicines: MedicineDraft[];
  other_instructions: string[];
  readings: Reading[]; // usually two independent readings of the photo
  organizing_model: string;
};
/** What's printed on a medicine strip or box. */
export type PackageReading = {
  name: string | null;
  strength: string | null;
  form: string | null;
  contains: string | null;
  reading: Reading;
  organizing_model: string;
};
export type MedicineInput = MedicineFields & { start_date: string; end_date: string | null }; // dates as "YYYY-MM-DD"
export type Medicine = MedicineInput & {
  id: number;
  created_at: string;
  created_by_name: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};
/** What the medicine form edits: a number of days is easier to think about than an end date. */
export type MedicineForm = MedicineFields & {
  start_date: string;
  duration_days: number | null;
  unclear: MedicineField[];
  alternatives: string[];
};

export const timeSlots = [
  { label: 'Morning', time: '08:00' },
  { label: 'Afternoon', time: '14:00' },
  { label: 'Night', time: '21:00' },
  { label: 'Bedtime', time: '22:00' },
] as const;

const pad = (value: number) => String(value).padStart(2, '0');

/** A calendar day in the phone's own time zone, as "YYYY-MM-DD". */
export function localDate(day: Date = new Date()): string {
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** "YYYY-MM-DD" → midnight that day, local time. */
export function parseDay(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function emptyMedicineForm(today: string = localDate()): MedicineForm {
  return {
    name: '',
    strength: null,
    form: null,
    dose: null,
    times: [],
    food: null,
    as_needed: false,
    instructions: null,
    source_text: null,
    start_date: today,
    duration_days: null,
    unclear: [],
    alternatives: [],
  };
}

const modelLabels: Record<string, string> = {
  'google/gemma-3-27b-it': 'Gemma 3',
  'Qwen/Qwen3.8-27B': 'Qwen 3.8',
  'MiniMaxAI/MiniMax-M3': 'MiniMax M3',
  'openbmb/MiniCPM-V-4_5': 'MiniCPM-V 4.5',
  'nvidia/Nemotron-3-Ultra-550b-a55b': 'NVIDIA Nemotron 3 Ultra',
  'nvidia/nemotron-3-super-120b-a12b': 'NVIDIA Nemotron 3 Super',
  'nvidia/Nemotron-3_5-Lightning': 'NVIDIA Nemotron 3.5 Lightning',
};

export function modelLabel(id: string): string {
  return modelLabels[id] ?? id.split('/').pop() ?? id;
}

/** A sentence to read aloud, e.g. "Telma, 40 mg. 1 tablet each time, at 8:00 AM, after food." */
export function spokenMedicine(medicine: MedicineFields): string {
  const amount = medicine.dose ? `${medicine.dose} each time, ` : '';
  const when = medicine.as_needed ? 'only when needed' : `at ${medicine.times.map(formatClock).join(' and ')}`;
  const food = medicine.food ? `, ${foodLabels[medicine.food].toLowerCase()}` : '';
  return `${medicine.name}${medicine.strength ? `, ${medicine.strength}` : ''}. ${amount}${when}${food}.`;
}

export function addDays(isoDate: string, days: number): string {
  const day = parseDay(isoDate);
  day.setDate(day.getDate() + days);
  return localDate(day);
}

export function daysBetween(from: string, to: string): number {
  const utc = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export function clockOf(time: Date): string {
  return `${pad(time.getHours())}:${pad(time.getMinutes())}`;
}

/** "21:00" → "9:00 PM" */
export function formatClock(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${pad(minutes)} ${hours < 12 ? 'AM' : 'PM'}`;
}

export function formatDay(isoDate: string, today: string = localDate()): string {
  const offset = daysBetween(today, isoDate);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  const day = parseDay(isoDate);
  const sameYear = isoDate.slice(0, 4) === today.slice(0, 4);
  return day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function describeSchedule(medicine: MedicineFields): string {
  const when = medicine.as_needed ? 'Only when needed' : medicine.times.map(formatClock).join(', ');
  return medicine.food ? `${when} · ${foodLabels[medicine.food].toLowerCase()}` : when;
}

/** Finished medicines have a last day before today. */
export function isFinished(medicine: Pick<MedicineInput, 'end_date'>, today: string = localDate()): boolean {
  return medicine.end_date !== null && medicine.end_date < today;
}

export function formFromDraft(draft: MedicineDraft, today: string = localDate()): MedicineForm {
  return { ...draft, start_date: today };
}

export function formFromMedicine(medicine: Medicine): MedicineForm {
  const { id: _id, created_at: _c, created_by_name: _cb, updated_at: _u, updated_by_name: _ub, end_date, ...fields } = medicine;
  return { ...fields, duration_days: end_date ? daysBetween(medicine.start_date, end_date) + 1 : null, unclear: [], alternatives: [] };
}

export function medicineProblem(form: MedicineForm): string | null {
  if (!form.name.trim()) return "Add the medicine's name.";
  if (!form.as_needed && form.times.length === 0) return 'Choose at least one time, or tick "Only when needed".';
  const days = form.duration_days;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) return 'Enter how many days, from 1 to 3650.';
  return null;
}

/** Exactly the fields the server accepts, tidied. */
export function toMedicineInput(form: MedicineForm): MedicineInput {
  const text = (value: string | null) => value?.trim() || null;
  return {
    name: form.name.trim(),
    strength: text(form.strength),
    form: text(form.form),
    dose: text(form.dose),
    times: form.as_needed ? [] : [...new Set(form.times)].sort(),
    food: form.food,
    as_needed: form.as_needed,
    instructions: text(form.instructions),
    source_text: text(form.source_text),
    start_date: form.start_date,
    end_date: form.duration_days ? addDays(form.start_date, form.duration_days - 1) : null,
  };
}

function isReading(value: unknown): value is Reading {
  return isRecord(value) && typeof value.model === 'string' && typeof value.text === 'string';
}

export function parsePrescriptionReading(value: unknown): PrescriptionReading {
  const looksRight = isRecord(value) && Array.isArray(value.medicines) && Array.isArray(value.other_instructions) &&
    Array.isArray(value.readings) && value.readings.length > 0 && value.readings.every(isReading) &&
    typeof value.organizing_model === 'string' &&
    value.medicines.every((medicine) => isRecord(medicine) && typeof medicine.name === 'string' && Array.isArray(medicine.times) &&
      Array.isArray(medicine.unclear) && Array.isArray(medicine.alternatives) && typeof medicine.as_needed === 'boolean');
  if (!looksRight) throw new Error("Couldn't read the assistant's answer. Please try again.");
  return value as PrescriptionReading;
}

export function parsePackageReading(value: unknown): PackageReading {
  const text = (field: unknown) => field === null || typeof field === 'string';
  const looksRight = isRecord(value) && text(value.name) && text(value.strength) && text(value.form) && text(value.contains) &&
    isReading(value.reading) && typeof value.organizing_model === 'string';
  if (!looksRight) throw new Error("Couldn't read the assistant's answer. Please try again.");
  return value as PackageReading;
}

/** Fill a medicine from its package: printed text beats handwriting, so those warnings are cleared. */
export function applyPackage(form: MedicineForm, found: PackageReading): MedicineForm {
  const replaced: MedicineField[] = ['name', ...(found.strength ? (['strength'] as const) : []), ...(found.form ? (['form'] as const) : [])];
  return {
    ...form,
    name: found.name ?? form.name,
    strength: found.strength ?? form.strength,
    form: found.form ?? form.form,
    unclear: form.unclear.filter((field) => !(found.name && replaced.includes(field))),
    alternatives: found.name ? [] : form.alternatives,
  };
}

export type DoseStatus = 'taken' | 'skipped';
export type DoseLog = {
  medication_id: number;
  day: string;
  time: string;
  status: DoseStatus;
  recorded_by_name: string | null;
  recorded_at: string;
};
/** Everything due at one time on one day: reminders and the Today list group medicines this way. */
export type DoseTime = { day: string; time: string; medicines: Medicine[] };
export type DoseState = 'taken' | 'skipped' | 'partly' | 'due' | 'missed' | 'later';

const DUE_WINDOW_MS = 2 * 60 * 60 * 1000; // a dose counts as "due" for two hours, then as not marked

export function doseMoment(day: string, time: string): Date {
  const moment = parseDay(day);
  const [hours, minutes] = time.split(':').map(Number);
  moment.setHours(hours, minutes, 0, 0);
  return moment;
}

export function dosesOn(medicines: Medicine[], day: string): DoseTime[] {
  const byTime = new Map<string, Medicine[]>();
  for (const medicine of medicines) {
    const active = !medicine.as_needed && medicine.start_date <= day && (medicine.end_date === null || medicine.end_date >= day);
    if (!active) continue;
    for (const time of medicine.times) byTime.set(time, [...(byTime.get(time) ?? []), medicine]);
  }
  return [...byTime.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, due]) => ({ day, time, medicines: due }));
}

export function logFor(logs: DoseLog[], medicationId: number, day: string, time: string): DoseLog | undefined {
  return logs.find((log) => log.medication_id === medicationId && log.day === day && log.time === time);
}

export function doseState(dose: DoseTime, logs: DoseLog[], now: Date = new Date()): DoseState {
  const marks = dose.medicines.map((medicine) => logFor(logs, medicine.id, dose.day, dose.time)?.status);
  if (marks.every((mark) => mark === 'taken')) return 'taken';
  if (marks.every((mark) => mark === 'skipped')) return 'skipped';
  if (marks.some(Boolean)) return 'partly';
  const sinceDue = now.getTime() - doseMoment(dose.day, dose.time).getTime();
  if (sinceDue < 0) return 'later';
  return sinceDue <= DUE_WINDOW_MS ? 'due' : 'missed';
}

/** Alerts to schedule from now on, one per dose time, leaving out medicines already marked. */
export function upcomingReminders(medicines: Medicine[], logs: DoseLog[], now: Date, days: number): DoseTime[] {
  const today = localDate(now);
  const reminders: DoseTime[] = [];
  for (let offset = 0; offset < days; offset++) {
    for (const dose of dosesOn(medicines, addDays(today, offset))) {
      if (doseMoment(dose.day, dose.time) <= now) continue;
      const unmarked = dose.medicines.filter((medicine) => !logFor(logs, medicine.id, dose.day, dose.time));
      if (unmarked.length > 0) reminders.push({ ...dose, medicines: unmarked });
    }
  }
  return reminders;
}

export function reminderText(dose: DoseTime, personName: string, forSelf: boolean): { title: string; body: string } {
  const when = formatClock(dose.time);
  return {
    title: forSelf ? `Medicine time · ${when}` : `${personName}'s medicine · ${when}`,
    body: dose.medicines
      .map((medicine) => `${medicine.name}${medicine.dose ? ` – ${medicine.dose}` : ''}${medicine.food ? ` (${foodLabels[medicine.food].toLowerCase()})` : ''}`)
      .join('\n'),
  };
}

export function roleLabel(role: Role): string {
  return role === 'care_recipient' ? 'Receives care' : 'Caregiver';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNoteFields(value: unknown): value is NoteFields {
  return isRecord(value) && categories.some((category) => category === value.category) &&
    typeof value.title === 'string' && typeof value.details === 'string' &&
    (value.event_time_text === null || value.event_time_text === undefined || typeof value.event_time_text === 'string');
}

/** Check the assistant's reply before showing it, so a bad response can't break the review screen. */
export function parseProposal(value: unknown): Proposal {
  if (!isRecord(value) || typeof value.model !== 'string' || !Array.isArray(value.notes) || !value.notes.every(isNoteFields)) {
    throw new Error("Couldn't read the assistant's draft. Please try again.");
  }
  return {
    model: value.model,
    notes: value.notes.map((note) => ({ ...note, event_time_text: note.event_time_text ?? null })),
  };
}

/** A message for the person if the note can't be saved as it is, otherwise null. */
export function noteProblem(note: NoteFields): string | null {
  const title = note.title.trim();
  const details = note.details.trim();
  if (!title) return 'Add a short title.';
  if (title.length > 120) return 'Make the title shorter (120 letters at most).';
  if (!details) return 'Add a few words of detail.';
  if (details.length > 1000) return 'Make the details shorter (1,000 letters at most).';
  if ((note.event_time_text ?? '').trim().length > 200) return 'Make the "when" shorter.';
  return null;
}

/** Just the fields a person can edit; the server rejects anything else. */
export function editableFields(note: Note): NoteInput {
  return { category: note.category, title: note.title, details: note.details, event_time_text: note.event_time_text, private: note.private };
}

export function cleanNote<T extends NoteFields>(note: T): T {
  return { ...note, title: note.title.trim(), details: note.details.trim(), event_time_text: note.event_time_text?.trim() || null };
}

export function filterNotes(notes: Note[], query: string): Note[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return notes;
  return notes.filter((note) => {
    const text = [
      note.title, note.details, categoryLabels[note.category], note.event_time_text, note.source_text, note.created_by_name,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

/** Digits with an optional leading +, or null if this can't be dialled. Same rule as the server. */
export function dialableNumber(value: string): string | null {
  const number = value.trim().replace(/[ ().-]/g, '');
  return /^\+?[0-9]{3,15}$/.test(number) ? number : null;
}

/**
 * Where the API lives. An explicit EXPO_PUBLIC_API_URL wins. In development the API runs on the same
 * computer as the Expo dev server, so reuse that host with the API's port.
 */
export function resolveApiUrl(configured: string | undefined, hostUri: string | null | undefined, isDev: boolean): string | null {
  const explicit = configured?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  if (!isDev || !hostUri) return null;
  const host = hostUri.split('/')[0].replace(/:\d+$/, '');
  if (!host || host.endsWith('.exp.direct')) return null; // tunnels expose only the Expo port
  return `http://${host}:8000`;
}

/** Read Devanagari text with a Hindi voice; everything else with Indian English. */
export function speechLanguage(text: string): string {
  return /[ऀ-ॿ]/.test(text) ? 'hi-IN' : 'en-IN';
}

export function describeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayStart = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const daysAgo = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  if (daysAgo === 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  if (daysAgo === -1) return `Tomorrow, ${time}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${day}, ${time}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.';
}

export type AppointmentInput = {
  title: string;
  day: string; // "YYYY-MM-DD", local
  time: string | null; // "HH:MM", local; null until someone knows it
  place: string | null;
  with_whom: string | null;
  notes: string | null;
};
export type Appointment = AppointmentInput & {
  id: number;
  created_at: string;
  created_by_name: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
};

export function describeAppointmentTime(appointment: Pick<AppointmentInput, 'day' | 'time'>, today: string = localDate()): string {
  return `${formatDay(appointment.day, today)}, ${appointment.time ? formatClock(appointment.time) : 'time not set'}`;
}

export function cleanAppointment(appointment: AppointmentInput): AppointmentInput {
  const text = (value: string | null) => value?.trim() || null;
  return {
    title: appointment.title.trim(),
    day: appointment.day,
    time: appointment.time,
    place: text(appointment.place),
    with_whom: text(appointment.with_whom),
    notes: text(appointment.notes),
  };
}

export function appointmentProblem(appointment: AppointmentInput): string | null {
  return appointment.title.trim() ? null : 'Add what the appointment is for, for example "Check-up with Dr. Mehta".';
}

export function appointmentInput(appointment: Appointment): AppointmentInput {
  const { title, day, time, place, with_whom, notes } = appointment;
  return { title, day, time, place, with_whom, notes };
}

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Suggest a day and time from words like "next Tuesday at 4 pm". Only a suggestion for a person to
 * confirm: it understands a few plain English patterns and returns nulls for anything else.
 */
export function suggestDayAndTime(words: string, today: string = localDate()): { day: string | null; time: string | null } {
  const text = words.toLowerCase();
  let day: string | null = null;
  if (/\bday after tomorrow\b/.test(text)) day = addDays(today, 2);
  else if (/\btomorrow\b/.test(text)) day = addDays(today, 1);
  else if (/\btoday\b|\btonight\b|\bthis (morning|afternoon|evening)\b/.test(text)) day = today;
  else {
    const named = text.match(/\b(next |this |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (named) {
      const ahead = ((weekdays.indexOf(named[2]) - parseDay(today).getDay() + 7) % 7) || 7; // the coming one, never today
      day = addDays(today, named[1] === 'next ' && ahead < 7 ? ahead + 7 : ahead); // "next Tuesday" means the week after
    }
  }
  let time: string | null = null;
  const twelveHour = text.match(/\b(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)/);
  const twentyFourHour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twelveHour) {
    const hour = (Number(twelveHour[1]) % 12) + (twelveHour[3].startsWith('p') ? 12 : 0);
    time = `${pad(hour)}:${twelveHour[2] ?? '00'}`;
  } else if (twentyFourHour) {
    time = `${pad(Number(twentyFourHour[1]))}:${twentyFourHour[2]}`;
  }
  return { day, time };
}

/** Reminders for coming appointments: the evening before, and two hours before (or that morning if no time is set). */
export function appointmentReminders(
  appointments: Appointment[],
  now: Date,
  personName: string,
  forSelf: boolean,
): { id: string; at: Date; title: string; body: string }[] {
  const whose = forSelf ? '' : `${personName}'s `;
  const reminders: { id: string; at: Date; title: string; body: string }[] = [];
  for (const appointment of appointments) {
    const where = [appointment.with_whom, appointment.place].filter(Boolean).join(', ');
    const body = `${appointment.title}${appointment.time ? ` at ${formatClock(appointment.time)}` : ''}${where ? ` · ${where}` : ''}`;
    const options = [
      { kind: 'evening-before', at: doseMoment(addDays(appointment.day, -1), '18:00'), title: `${whose}appointment tomorrow`.replace(/^a/, 'A') },
      appointment.time
        ? { kind: 'soon', at: new Date(doseMoment(appointment.day, appointment.time).getTime() - 2 * 3600_000), title: `${whose}appointment in 2 hours`.replace(/^a/, 'A') }
        : { kind: 'morning', at: doseMoment(appointment.day, '08:00'), title: `${whose}appointment today`.replace(/^a/, 'A') },
    ];
    for (const option of options) {
      if (option.at > now) reminders.push({ id: `appt:${appointment.id}:${option.kind}`, at: option.at, title: option.title, body });
    }
  }
  return reminders.sort((a, b) => a.at.getTime() - b.at.getTime());
}
