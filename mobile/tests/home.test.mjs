import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dateTile,
  dayMarks,
  daysAway,
  doseDetail,
  doseRecordStatus,
  greeting,
  medicineCountLabel,
  medicineLine,
  medicineMeta,
  partOfDay,
  splitAnswer,
  todayPlan,
} from '../src/model.ts';

function medicine(id, overrides = {}) {
  return {
    id, name: `Medicine ${id}`, strength: null, form: null, dose: '1 tablet', times: ['08:00', '21:00'], food: null, as_needed: false,
    instructions: null, source_text: null, start_date: '2026-10-01', end_date: null, created_at: 'x', created_by_name: 'Priya',
    updated_at: null, updated_by_name: null, ...overrides,
  };
}
const telma = medicine(1, { name: 'Telma 40', times: ['08:00'] });
const glycomet = medicine(2, { name: 'Glycomet 500', food: 'after_food' });
const log = (medication_id, time, status = 'taken') => ({ medication_id, day: '2026-10-08', time, status, recorded_by_name: 'Priya', recorded_at: 'x' });
const at = (hours, minutes = 0) => new Date(2026, 9, 8, hours, minutes);

test('greeting and part of day follow the clock', () => {
  assert.deepEqual([greeting(at(9)), greeting(at(13)), greeting(at(19))], ['Good morning', 'Good afternoon', 'Good evening']);
  assert.deepEqual([partOfDay('08:00'), partOfDay('14:00'), partOfDay('21:00')], ['this morning', 'this afternoon', 'tonight']);
});

test('the home shows the dose to act on next, earlier unmarked ones and the marked ones', () => {
  const morningTaken = [log(1, '08:00'), log(2, '08:00')];
  const afternoon = todayPlan([telma, glycomet], morningTaken, at(14));
  assert.equal(afternoon.next.dose.time, '21:00');
  assert.equal(afternoon.next.state, 'later');
  assert.deepEqual(afternoon.done.map((dose) => dose.time), ['08:00']);
  assert.deepEqual(afternoon.unmarked, []);

  const nobodyMarked = todayPlan([telma, glycomet], [], at(14));
  assert.deepEqual(nobodyMarked.unmarked.map((dose) => dose.time), ['08:00']); // past its two hours, not marked
  assert.equal(nobodyMarked.next.dose.time, '21:00');

  const due = todayPlan([telma, glycomet], [log(1, '08:00')], at(8, 30));
  assert.deepEqual([due.next.dose.time, due.next.state], ['08:00', 'partly']); // one of two marked: still to finish

  const allDone = todayPlan([telma, glycomet], [...morningTaken, log(2, '21:00', 'skipped')], at(22));
  assert.equal(allDone.next, null);
  assert.equal(allDone.tomorrow.time, '08:00');

  // One taken and one skipped is done, not stuck at the top for the rest of the day.
  const mixed = todayPlan([telma, glycomet], [log(1, '08:00'), log(2, '08:00', 'skipped')], at(14));
  assert.deepEqual([mixed.done.map((dose) => dose.time), mixed.next.dose.time], [['08:00'], '21:00']);
  // Half-marked and past its two hours, it waits below; the next dose comes first.
  const stale = todayPlan([telma, glycomet], [log(1, '08:00')], at(14));
  assert.deepEqual([stale.next.dose.time, stale.unmarked.map((dose) => dose.time)], ['21:00', ['08:00']]);
});

test('the caregiver bar has one mark per medicine dose', () => {
  assert.deepEqual(dayMarks([telma, glycomet], [log(1, '08:00'), log(2, '08:00', 'skipped')], '2026-10-08'), ['taken', 'skipped', 'none']);
});

test('medicine and dose lines read plainly', () => {
  assert.equal(medicineLine({ ...glycomet, dose: '1 tablet' }), '1 tablet · 8:00 AM, 9:00 PM · after food');
  assert.equal(medicineLine({ ...telma, as_needed: true, times: [], instructions: 'For pain, at most 3 a day' }), '1 tablet · For pain, at most 3 a day');
  assert.equal(medicineMeta({ ...telma, end_date: '2026-10-24' }, '2026-10-08').endsWith('· added by Priya'), true);
  assert.equal(doseDetail(glycomet), '1 tablet, after food');
  assert.equal(doseDetail({ ...telma, dose: null }), '');
  assert.equal(medicineCountLabel({ due: 41, taken: 26, skipped: 2, not_marked: 13 }), '26 of 41 taken · 2 skipped · 13 not marked');
  assert.equal(medicineCountLabel(null), 'only when needed');
});

test('visit tiles and distances', () => {
  assert.deepEqual(dateTile('2026-10-13'), { weekday: 'TUE', day: '13', month: 'OCT' });
  assert.deepEqual([daysAway('2026-10-08', '2026-10-08'), daysAway('2026-10-09', '2026-10-08'), daysAway('2026-10-13', '2026-10-08')], ['today', 'tomorrow', 'in 5 days']);
});

test('dose records get a badge from their own words, and answers lead with their first sentence', () => {
  assert.equal(doseRecordStatus('Dose due Thu 8 Oct 2026 (today), 8:00 AM: Pan-D (1 capsule), taken (marked by Priya Thu 8 Oct 2026 (today), 11:44 AM).'), 'taken');
  assert.equal(doseRecordStatus('Dose due ..., 9:00 PM: Glycomet 500 (1 tablet), not due yet.'), 'not_due');
  assert.equal(doseRecordStatus('Dose due ..., 9:00 PM: Glycomet 500 (1 tablet), not marked.'), 'not_marked');
  assert.equal(doseRecordStatus('Medicine Telma 40'), null);
  assert.deepEqual(splitAnswer('It is on Tue 13 Oct at 4:00 PM. Bring the sugar report.'), { lead: 'It is on Tue 13 Oct at 4:00 PM.', rest: 'Bring the sugar report.' });
  assert.deepEqual(splitAnswer('Dr. Mehta at 9876543210'), { lead: 'Dr. Mehta at 9876543210', rest: '' });
  assert.equal(splitAnswer('Take it at 8 a.m. every day. With food.').lead, 'Take it at 8 a.m. every day.');
  assert.equal(splitAnswer('You take 2 medicines:\n1. Telma at 8 AM.\n2. Glycomet.').lead, 'You take 2 medicines:\n1. Telma at 8 AM.');
});

test('short clocks and phone numbers read the way people say them', async () => {
  const { shortClock, formatPhone } = await import('../src/model.ts');
  assert.deepEqual([shortClock('08:00'), shortClock('21:30')], ['8 AM', '9:30 PM']);
  assert.deepEqual([formatPhone('+919812345678'), formatPhone('9876543210'), formatPhone('02223456789')], ['+91 98123 45678', '98765 43210', '02223456789']);
});
