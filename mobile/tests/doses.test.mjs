import assert from 'node:assert/strict';
import { test } from 'node:test';

import { doseMoment, doseState, dosesOn, reminderText, upcomingReminders } from '../src/model.ts';

function medicine(id, overrides = {}) {
  return {
    id,
    name: `Medicine ${id}`,
    strength: null,
    form: null,
    dose: '1 tablet',
    times: ['08:00', '21:00'],
    food: null,
    as_needed: false,
    instructions: null,
    source_text: null,
    start_date: '2026-10-05',
    end_date: null,
    created_at: '2026-10-05T00:00:00Z',
    created_by_name: 'Priya',
    updated_at: null,
    updated_by_name: null,
    ...overrides,
  };
}

const telma = medicine(1, { name: 'Telma 40', times: ['08:00'] });
const glycomet = medicine(2, { name: 'Glycomet 500', food: 'after_food' });
const panD = medicine(3, { name: 'Pan-D', times: ['08:00'], end_date: '2026-10-06' });
const dolo = medicine(4, { name: 'Dolo 650', times: [], as_needed: true });
const later = medicine(5, { name: 'Starts later', start_date: '2026-10-10' });
const all = [telma, glycomet, panD, dolo, later];
const log = (medication_id, day, time, status = 'taken') => ({ medication_id, day, time, status, recorded_by_name: 'Asha', recorded_at: 'x' });

test('dosesOn groups active medicines by time and leaves out "as needed" ones', () => {
  const day = dosesOn(all, '2026-10-06');
  assert.deepEqual(day.map((dose) => [dose.time, dose.medicines.map((m) => m.name)]), [
    ['08:00', ['Telma 40', 'Glycomet 500', 'Pan-D']],
    ['21:00', ['Glycomet 500']],
  ]);
  assert.deepEqual(dosesOn(all, '2026-10-07')[0].medicines.map((m) => m.name), ['Telma 40', 'Glycomet 500']); // Pan-D ended
  assert.deepEqual(dosesOn(all, '2026-10-04'), []); // nothing started yet
});

test('doseState follows the clock and the marks', () => {
  const [morning] = dosesOn([telma, glycomet], '2026-10-06');
  const at = (hours, minutes = 0) => new Date(2026, 9, 6, hours, minutes);
  assert.equal(doseState(morning, [], at(7, 30)), 'later');
  assert.equal(doseState(morning, [], at(9, 59)), 'due');
  assert.equal(doseState(morning, [], at(10, 1)), 'missed');
  assert.equal(doseState(morning, [log(1, '2026-10-06', '08:00'), log(2, '2026-10-06', '08:00')], at(12)), 'taken');
  assert.equal(doseState(morning, [log(1, '2026-10-06', '08:00', 'skipped'), log(2, '2026-10-06', '08:00', 'skipped')], at(12)), 'skipped');
  assert.equal(doseState(morning, [log(1, '2026-10-06', '08:00')], at(12)), 'partly');
  assert.equal(doseState(morning, [log(1, '2026-10-05', '08:00'), log(2, '2026-10-05', '08:00')], at(12)), 'missed'); // yesterday's marks don't count
});

test('upcomingReminders schedules only future, unmarked doses', () => {
  const now = new Date(2026, 9, 6, 9, 0);
  const reminders = upcomingReminders([telma, glycomet], [log(2, '2026-10-06', '21:00')], now, 2);
  assert.deepEqual(reminders.map((dose) => `${dose.day} ${dose.time} ${dose.medicines.map((m) => m.id).join('+')}`), [
    // 6 Oct 08:00 has passed; Glycomet's 21:00 dose is already marked as taken
    '2026-10-07 08:00 1+2',
    '2026-10-07 21:00 2',
  ]);
  assert.equal(doseMoment('2026-10-07', '21:00').getTime(), new Date(2026, 9, 7, 21, 0).getTime());
});

test('reminder text names the medicines and who they are for', () => {
  const [morning] = dosesOn([telma, glycomet], '2026-10-06');
  assert.deepEqual(reminderText(morning, 'Asha', true), {
    title: 'Medicine time · 8:00 AM',
    body: 'Telma 40 – 1 tablet\nGlycomet 500 – 1 tablet (after food)',
  });
  assert.equal(reminderText(morning, 'Asha', false).title, "Asha's medicine · 8:00 AM");
});
