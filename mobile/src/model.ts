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
export type ContactRole = 'emergency' | 'doctor' | 'person'; // 'person': the older adult's own phone

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
  const directions = medicine.instructions ? ` ${medicine.instructions.replace(/\.?$/, '.')}` : '';
  return `${medicine.name}${medicine.strength ? `, ${medicine.strength}` : ''}. ${amount}${when}${food}.${directions}`;
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

export function describeSchedule(medicine: Pick<MedicineFields, 'as_needed' | 'times' | 'food'>): string {
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

/** The phone's time zone as minutes ahead of UTC (India: 330), so the server counts days from local midnight. */
export function utcOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset() || 0; // never -0
}

/** "2 Oct" (or "Oct 2", in the phone's language), with the year only when it isn't this year. */
export function shortDate(isoDate: string, today: string = localDate()): string {
  const sameYear = isoDate.slice(0, 4) === today.slice(0, 4);
  return parseDay(isoDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export type DoseCounts = { due: number; taken: number; skipped: number; not_marked: number };
export type SummaryMedicine = Pick<MedicineFields, 'name' | 'strength' | 'dose' | 'times' | 'food' | 'as_needed'> & {
  id: number;
  start_date: string;
  end_date: string | null;
  doses: DoseCounts | null; // null for medicines taken only when needed
};
export const summarySections = ['symptoms', 'medicines', 'other', 'questions'] as const;
export type SummarySection = (typeof summarySections)[number];
/** One point of a doctor-visit summary, with the notes it came from. */
export type SummaryPoint = { section: SummarySection; text: string; note_ids: number[] };
export type VisitSummary = {
  person_name: string;
  from_day: string;
  to_day: string;
  appointment: Appointment | null;
  medicines: SummaryMedicine[];
  points: SummaryPoint[];
  notes: Note[]; // the shared notes from the period, oldest first
  notes_left_out: number;
  model: string | null; // null when the assistant wasn't needed or failed
  checked_by: string | null; // the model that checked each point against its notes
  problem: string | null;
};
export type SummaryPeriod = { key: string; label: string; from: string; to: string };

/** Periods a summary can cover, all ending today: since the last visit, if there was one in the past three months. */
export function summaryPeriods(appointments: Pick<Appointment, 'day'>[], today: string = localDate()): SummaryPeriod[] {
  const lastVisit = appointments
    .map((appointment) => appointment.day)
    .filter((day) => day < today && daysBetween(day, today) <= 90)
    .sort()
    .at(-1);
  const last = (days: number) => addDays(today, -(days - 1));
  return [
    ...(lastVisit ? [{ key: 'visit', label: `Since the last visit (${shortDate(lastVisit, today)})`, from: lastVisit, to: today }] : []),
    { key: '2w', label: 'Last 2 weeks', from: last(14), to: today },
    { key: '1m', label: 'Last month', from: last(30), to: today },
    { key: '3m', label: 'Last 3 months', from: last(90), to: today },
  ];
}

export function describeDoseCounts(counts: DoseCounts | null): string {
  if (!counts) return 'Taken only when needed';
  if (counts.due === 0) return 'No doses were due yet';
  const others = [counts.skipped ? `${counts.skipped} skipped` : '', counts.not_marked ? `${counts.not_marked} not marked` : ''].filter(Boolean);
  return `Taken ${counts.taken} of ${counts.due} doses${others.length ? ` · ${others.join(' · ')}` : ''}`;
}

export function summarySectionTitle(section: SummarySection, personName: string): string {
  const titles: Record<SummarySection, string> = {
    symptoms: `How ${personName} has been`,
    medicines: 'About the medicines',
    other: 'Other news',
    questions: 'Questions for the doctor',
  };
  return titles[section];
}

/** The days the notes behind a point were written, such as "2 Oct, 5 Oct". */
export function pointDates(point: SummaryPoint, notes: Note[], today: string = localDate()): string {
  const days = point.note_ids
    .map((id) => notes.find((note) => note.id === id))
    .filter((note): note is Note => note !== undefined)
    .map((note) => localDate(new Date(note.created_at)));
  return [...new Set(days)].sort().map((day) => shortDate(day, today)).join(', ');
}

export const NOT_MARKED_MEANING = '"Not marked" means nobody marked the dose in CareLoop, so it isn\'t known whether it was taken.';

/** " (started 4 Oct)" or " (last day 1 Oct)" for a medicine that began or ended during the summary's period. */
export function summaryMedicinePeriod(medicine: SummaryMedicine, summary: Pick<VisitSummary, 'from_day' | 'to_day'>, today: string = localDate()): string {
  const parts = [
    medicine.start_date > summary.from_day ? `started ${shortDate(medicine.start_date, today)}` : '',
    medicine.end_date && medicine.end_date < summary.to_day ? `last day ${shortDate(medicine.end_date, today)}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function summaryMedicineLine(medicine: SummaryMedicine, summary: VisitSummary, today: string): string {
  const name = `${medicine.name}${medicine.strength ? ` (${medicine.strength})` : ''}${summaryMedicinePeriod(medicine, summary, today)}`;
  return `${name} – ${medicine.dose ? `${medicine.dose}, ` : ''}${describeSchedule(medicine)}`;
}

/** The summary as plain text, to send to the doctor or family. */
export function summaryText(summary: VisitSummary, today: string = localDate()): string {
  const lines = [`Health summary: ${summary.person_name}`, `${shortDate(summary.from_day, today)} to ${shortDate(summary.to_day, today)}`];
  if (summary.appointment) {
    const { title, day, time } = summary.appointment;
    lines.push(`For: ${title}, ${shortDate(day, today)}${time ? `, ${formatClock(time)}` : ''}`);
  }
  if (summary.medicines.length > 0) {
    lines.push('', 'MEDICINES');
    for (const medicine of summary.medicines) {
      lines.push(`• ${summaryMedicineLine(medicine, summary, today)}. ${describeDoseCounts(medicine.doses)}.`);
    }
    if (summary.medicines.some((medicine) => (medicine.doses?.not_marked ?? 0) > 0)) lines.push(NOT_MARKED_MEANING);
  }
  for (const section of summarySections) {
    const points = summary.points.filter((point) => point.section === section);
    if (points.length === 0) continue;
    lines.push('', summarySectionTitle(section, summary.person_name).toUpperCase());
    for (const point of points) lines.push(`• ${point.text} (${pointDates(point, summary.notes, today)})`);
  }
  if (summary.notes.length > 0) {
    lines.push('', `ALL NOTES (${summary.notes.length})`);
    for (const note of summary.notes) {
      lines.push(`• ${shortDate(localDate(new Date(note.created_at)), today)} · ${note.title}: ${note.details}`);
    }
    if (summary.notes_left_out > 0) lines.push(`${summary.notes_left_out} older notes aren't included.`);
  }
  lines.push('', "Put together by CareLoop from the family's records. It is not a diagnosis.");
  return lines.join('\n');
}

/** The summary as sentences to read aloud, without the full notes. */
export function summarySpeech(summary: VisitSummary, today: string = localDate()): string {
  const parts = [`Health summary for ${summary.person_name}, from ${shortDate(summary.from_day, today)} to ${shortDate(summary.to_day, today)}.`];
  for (const medicine of summary.medicines) parts.push(`${medicine.name}: ${describeDoseCounts(medicine.doses).split(' · ').join(', ')}.`);
  for (const section of summarySections) {
    const points = summary.points.filter((point) => point.section === section);
    if (points.length > 0) parts.push(`${summarySectionTitle(section, summary.person_name)}: ${points.map((point) => point.text).join(' ')}`);
  }
  return parts.join(' ');
}

export function parseVisitSummary(value: unknown): VisitSummary {
  const looksRight = isRecord(value) && typeof value.person_name === 'string' && typeof value.from_day === 'string' &&
    typeof value.to_day === 'string' && Array.isArray(value.medicines) && Array.isArray(value.points) && Array.isArray(value.notes) &&
    value.medicines.every((medicine) => isRecord(medicine) && typeof medicine.name === 'string' && Array.isArray(medicine.times)) &&
    value.points.every((point) => isRecord(point) && summarySections.some((section) => section === point.section) &&
      typeof point.text === 'string' && Array.isArray(point.note_ids));
  if (!looksRight) throw new Error("Couldn't read the summary. Please try again.");
  return value as VisitSummary;
}

export type AskKind = 'answer' | 'records' | 'dose_records' | 'not_found' | 'ask_doctor';
export type RecordKind = 'note' | 'medicine' | 'dose' | 'appointment' | 'contact';
export type AskSource = { kind: RecordKind; text: string };
/**
 * "records": the assistant's answer didn't pass the checks, so only the records it named are shown.
 * "dose_records": whether doses were taken is shown exactly as recorded, never retold.
 * "ask_doctor": it needs a doctor; `sources` then holds what the records say about it.
 */
export type AskResult = {
  kind: AskKind;
  answer: string | null;
  sources: AskSource[];
  urgent: boolean;
  model: string;
  checked_by: string | null; // the model that confirmed the answer against its records
};
const askKinds: AskKind[] = ['answer', 'records', 'dose_records', 'not_found', 'ask_doctor'];

export function parseAskResult(value: unknown): AskResult {
  const looksRight = isRecord(value) && askKinds.some((kind) => kind === value.kind) &&
    (value.answer === null || typeof value.answer === 'string') && typeof value.urgent === 'boolean' && typeof value.model === 'string' &&
    Array.isArray(value.sources) && value.sources.every((source) => isRecord(source) && typeof source.text === 'string' && typeof source.kind === 'string');
  if (!looksRight) throw new Error("Couldn't read the answer. Please try again.");
  return value as AskResult;
}

const urgentWords = new RegExp(
  [
    'chest (pain|hurts|is hurting|pressure|tightness)', 'pain in (the |her |his |my )?chest', 'heart attack', 'stroke',
    "can'?t breath", 'cannot breath', 'not breathing', '(trouble|difficulty|problem) (in )?breathing', 'short(ness)? of breath', 'gasping',
    'unconscious', 'unresponsive', 'not responding', "won'?t wake", 'not waking up', 'fainted', 'passed out', 'collapsed',
    'seizure', 'choking', '(fell|fallen) (down|over|in|on|off|from|and)', "can'?t get up", 'hit (her|his|my) head',
    'bleeding (a lot|heavily|badly)', 'heavy bleeding', 'overdose', 'double dose', 'too many (pills|tablets|medicines)',
    '(took|swallowed|taken|had) (\\d{2,}|several|all (the|her|his|my))[^.?!]*(pills|tablets|capsules|medicine|doses)',
    'suicid', 'kill (my|him|her)self', 'face (is )?drooping', 'slurred speech',
    'सीने में दर्द', 'छाती में दर्द', 'सांस नहीं', 'साँस नहीं', 'बेहोश', 'गिर (गई|गया|गए|पड़ी|पड़ा|पड़े)',
    'seene me(in)? dard', 'chhati me(in)? dard', 'saans nahi', 'behosh',
  ].join('|'),
  'i',
);

/** Words that may mean someone needs help right now. Checked on the phone, so the call buttons appear even offline. */
export function soundsUrgent(text: string): boolean {
  return urgentWords.test(text.replace(/[\u2018\u2019`]/g, "'")); // iPhones type curly apostrophes: can’t
}

/** "Good morning", "Good afternoon" or "Good evening". */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** "Thursday, 8 October", in the phone's language. */
export function longDate(now: Date = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "this morning", "this afternoon" or "tonight" for a time today. */
export function partOfDay(time: string): string {
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? 'this morning' : hour < 17 ? 'this afternoon' : 'tonight';
}

export type TodayPlan = {
  next: { dose: DoseTime; state: DoseState } | null; // the dose to act on now, or the next one coming
  unmarked: DoseTime[]; // earlier doses nobody marked
  done: DoseTime[]; // marked taken or skipped
  tomorrow: DoseTime | null; // the first dose tomorrow, once today is done
};

/** How many of a dose's medicines nobody has marked yet. */
export function unmarkedCount(dose: DoseTime, logs: DoseLog[]): number {
  return dose.medicines.filter((medicine) => !logFor(logs, medicine.id, dose.day, dose.time)).length;
}

/**
 * What the older adult's home shows: one dose to act on, earlier ones not fully marked, and those marked. A dose is
 * done once every medicine in it is marked, even if some were taken and others skipped, and one still being
 * finished takes the top spot only while it is due, so a later dose never gets stuck behind it.
 */
export function todayPlan(medicines: Medicine[], logs: DoseLog[], now: Date = new Date()): TodayPlan {
  const today = localDate(now);
  const doses = dosesOn(medicines, today);
  const sinceDue = (dose: DoseTime) => now.getTime() - doseMoment(dose.day, dose.time).getTime();
  const waiting = doses.filter((dose) => unmarkedCount(dose, logs) > 0);
  const nextDose =
    waiting.find((dose) => sinceDue(dose) >= 0 && sinceDue(dose) <= DUE_WINDOW_MS) ?? waiting.find((dose) => sinceDue(dose) < 0) ?? null;
  return {
    next: nextDose && { dose: nextDose, state: doseState(nextDose, logs, now) },
    unmarked: waiting.filter((dose) => dose !== nextDose && sinceDue(dose) > DUE_WINDOW_MS),
    done: doses.filter((dose) => unmarkedCount(dose, logs) === 0),
    tomorrow: nextDose ? null : (dosesOn(medicines, addDays(today, 1))[0] ?? null),
  };
}

export type DoseMark = 'taken' | 'skipped' | 'none';

/** One mark per medicine dose due on a day, in time order: the segments of the caregiver's progress bar. */
export function dayMarks(medicines: Medicine[], logs: DoseLog[], day: string): DoseMark[] {
  return dosesOn(medicines, day).flatMap((dose) =>
    dose.medicines.map((medicine) => logFor(logs, medicine.id, dose.day, dose.time)?.status ?? 'none'),
  );
}

export function doseNames(dose: DoseTime): string {
  return dose.medicines.map((medicine) => medicine.name).join(', ');
}

/** How to take a medicine at its time: "1 tablet, after food". Empty when neither is known. */
export function doseDetail(medicine: MedicineFields): string {
  return [medicine.dose, medicine.food ? foodLabels[medicine.food].toLowerCase() : null].filter(Boolean).join(', ');
}

/** "1 capsule · 8:00 AM · before food", or for "only when needed": "1 tablet · For pain, at most 3 a day". */
export function medicineLine(medicine: MedicineFields): string {
  if (medicine.as_needed) return [medicine.dose, medicine.instructions].filter(Boolean).join(' · ');
  const food = medicine.food ? foodLabels[medicine.food].toLowerCase() : null;
  return [medicine.dose, medicine.times.map(formatClock).join(', '), food].filter(Boolean).join(' · ');
}

/** "Until Sat, 24 Oct · added by Priya". */
export function medicineMeta(medicine: Medicine, today: string = localDate()): string {
  const period = isFinished(medicine, today)
    ? `Finished ${formatDay(medicine.end_date!, today)}`
    : medicine.start_date > today
      ? `Starts ${formatDay(medicine.start_date, today)}`
      : medicine.end_date
        ? `Until ${formatDay(medicine.end_date, today)}`
        : 'Ongoing';
  return medicine.created_by_name ? `${period} · added by ${medicine.created_by_name}` : period;
}

const tileDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const tileMonths = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The calendar tile for a day: { weekday: 'TUE', day: '13', month: 'OCT' }. */
export function dateTile(isoDate: string): { weekday: string; day: string; month: string } {
  const day = parseDay(isoDate);
  return { weekday: tileDays[day.getDay()], day: String(day.getDate()), month: tileMonths[day.getMonth()] };
}

/** "today", "tomorrow" or "in 5 days". */
export function daysAway(isoDate: string, today: string = localDate()): string {
  const days = daysBetween(today, isoDate);
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

export type RecordStatus = 'taken' | 'skipped' | 'not_marked' | 'not_due';

/** The status a dose record states, for its badge. The record's own words are always shown too. */
export function doseRecordStatus(text: string): RecordStatus | null {
  if (/, taken \(marked/.test(text)) return 'taken';
  if (/, skipped \(marked/.test(text)) return 'skipped';
  if (/, not marked\.$/.test(text)) return 'not_marked';
  if (/, not due yet\.$/.test(text)) return 'not_due';
  return null;
}

/** An answer's first sentence, shown large, and the rest. */
export function splitAnswer(answer: string): { lead: string; rest: string } {
  for (const end of answer.matchAll(/[.!?।]\s+/g)) {
    const lead = answer.slice(0, end.index + 1);
    // "Dr. Mehta", "8 a.m. tomorrow" and a numbered list's "1." don't end a sentence.
    if (/\b(Dr|Mr|Mrs|Ms|St|No|Tab|Cap)\.$|\b[ap]\.m\.$|(^|\n)\s*\d+\.$/i.test(lead)) continue;
    return { lead, rest: answer.slice(end.index + end[0].length) };
  }
  return { lead: answer, rest: '' };
}

export function medicineCountLabel(counts: DoseCounts | null): string {
  if (!counts) return 'only when needed';
  if (counts.due === 0) return 'no doses due yet';
  const parts = [`${counts.taken} of ${counts.due} taken`];
  if (counts.skipped) parts.push(`${counts.skipped} skipped`);
  if (counts.not_marked) parts.push(`${counts.not_marked} not marked`);
  return parts.join(' · ');
}

/** A day for the middle of a sentence: "today", "tomorrow", or "Fri, 6 Nov". */
export function dayInSentence(isoDate: string, today: string = localDate()): string {
  const words = formatDay(isoDate, today);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(words) ? words.toLowerCase() : words;
}

/** "11:44 am": the time of day, in the phone's style. */
export function clockTime(iso: string): string {
  const moment = new Date(iso);
  return Number.isNaN(moment.getTime()) ? '' : moment.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "8 AM", or "8:30 AM": the short form for tight rows. */
export function shortClock(time: string): string {
  return formatClock(time).replace(':00 ', ' ');
}

/** Indian numbers in the groups people read them in: "+91 98123 45678", "98765 43210". Others as saved. */
export function formatPhone(phone: string): string {
  const india = phone.match(/^\+91(\d{5})(\d{5})$/);
  if (india) return `+91 ${india[1]} ${india[2]}`;
  const local = phone.match(/^(\d{5})(\d{5})$/);
  return local ? `${local[1]} ${local[2]}` : phone;
}
