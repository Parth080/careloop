import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appointmentReminders, cleanAppointment, describeAppointmentTime, suggestDayAndTime } from '../src/model.ts';

// 5 October 2026 is a Monday.
const MONDAY = '2026-10-05';

test('suggestDayAndTime understands plain day words', () => {
  assert.deepEqual(suggestDayAndTime('Dr. Mehta wants to see me tomorrow at 4 pm', MONDAY), { day: '2026-10-06', time: '16:00' });
  assert.deepEqual(suggestDayAndTime('blood test day after tomorrow, 9:30 am', MONDAY), { day: '2026-10-07', time: '09:30' });
  assert.deepEqual(suggestDayAndTime('physio today at 17:15', MONDAY), { day: MONDAY, time: '17:15' });
  assert.deepEqual(suggestDayAndTime('dentist on Thursday', MONDAY), { day: '2026-10-08', time: null });
});

test('weekday names point forward, and "next" means the week after', () => {
  assert.equal(suggestDayAndTime('Tuesday', MONDAY).day, '2026-10-06');
  assert.equal(suggestDayAndTime('next Tuesday at 4 pm', MONDAY).day, '2026-10-13');
  assert.equal(suggestDayAndTime('Monday', MONDAY).day, '2026-10-12'); // never today
  assert.equal(suggestDayAndTime('next Monday', MONDAY).day, '2026-10-12');
});

test('times: 12-hour, 24-hour and noon/midnight edges; nothing is guessed', () => {
  assert.equal(suggestDayAndTime('at 12 pm', MONDAY).time, '12:00');
  assert.equal(suggestDayAndTime('at 12:30 a.m.', MONDAY).time, '00:30');
  assert.equal(suggestDayAndTime('at 7.45 pm', MONDAY).time, '19:45');
  assert.deepEqual(suggestDayAndTime('soon, maybe in the morning', MONDAY), { day: null, time: null });
  assert.deepEqual(suggestDayAndTime('kal subah 10 baje', MONDAY), { day: null, time: null });
});

test('appointment text and tidying', () => {
  assert.equal(describeAppointmentTime({ day: '2026-10-06', time: '16:00' }, MONDAY), 'Tomorrow, 4:00 PM');
  assert.equal(describeAppointmentTime({ day: '2026-10-06', time: null }, MONDAY), 'Tomorrow, time not set');
  assert.deepEqual(cleanAppointment({ title: ' Check-up ', day: MONDAY, time: null, place: ' ', with_whom: 'Dr. Mehta ', notes: null }), {
    title: 'Check-up', day: MONDAY, time: null, place: null, with_whom: 'Dr. Mehta', notes: null,
  });
});

test('appointment reminders: the evening before and two hours before, future only', () => {
  const visit = { id: 7, title: 'Check-up', day: '2026-10-13', time: '16:00', place: 'Ruby Hall', with_whom: 'Dr. Mehta', notes: null, created_at: 'x', created_by_name: null, updated_at: null, updated_by_name: null };
  const reminders = appointmentReminders([visit], new Date(2026, 9, 5, 9, 0), 'Asha', true);
  assert.deepEqual(reminders.map((r) => [r.id, r.at.getTime(), r.title]), [
    ['appt:7:evening-before', new Date(2026, 9, 12, 18, 0).getTime(), 'Appointment tomorrow'],
    ['appt:7:soon', new Date(2026, 9, 13, 14, 0).getTime(), 'Appointment in 2 hours'],
  ]);
  assert.equal(reminders[0].body, 'Check-up at 4:00 PM · Dr. Mehta, Ruby Hall');
  assert.equal(appointmentReminders([visit], new Date(2026, 9, 5, 9, 0), 'Asha', false)[0].title, "Asha's appointment tomorrow");
  assert.deepEqual(appointmentReminders([{ ...visit, time: null }], new Date(2026, 9, 13, 7, 0), 'Asha', true).map((r) => r.id), ['appt:7:morning']);
  assert.deepEqual(appointmentReminders([visit], new Date(2026, 9, 13, 15, 0), 'Asha', true), []); // all in the past
});
