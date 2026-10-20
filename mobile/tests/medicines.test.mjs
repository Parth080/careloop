import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDays,
  clockOf,
  daysBetween,
  describeSchedule,
  formatClock,
  formatDay,
  formFromDraft,
  formFromMedicine,
  isFinished,
  lineArea,
  localDate,
  medicineProblem,
  applyPackage,
  orList,
  parsePackageReading,
  parsePrescriptionReading,
  toMedicineInput,
} from '../src/model.ts';

const draft = {
  name: 'Glycomet 500',
  strength: '500 mg',
  form: 'tablet',
  dose: '1 tablet',
  times: ['08:00', '21:00'],
  food: 'after_food',
  as_needed: false,
  instructions: null,
  source_text: 'Tab Glycomet 500 BD after food x 1 month',
  duration_days: 30,
  unclear: ['strength'],
  alternatives: ['Glycomel 500'],
};

test('calendar arithmetic stays on local days, across months and years', () => {
  assert.equal(localDate(new Date(2026, 9, 5, 23, 59)), '2026-10-05');
  assert.equal(addDays('2026-10-05', 29), '2026-11-03');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-05', '2026-11-03'), 29);
  assert.equal(daysBetween('2026-10-05', '2026-10-05'), 0);
});

test('clock times read the way people say them', () => {
  assert.equal(formatClock('08:00'), '8:00 AM');
  assert.equal(formatClock('21:30'), '9:30 PM');
  assert.equal(formatClock('00:15'), '12:15 AM');
  assert.equal(formatClock('12:00'), '12:00 PM');
  assert.equal(clockOf(new Date(2026, 0, 1, 7, 5)), '07:05');
});

test('formatDay names nearby days', () => {
  assert.equal(formatDay('2026-10-05', '2026-10-05'), 'Today');
  assert.equal(formatDay('2026-10-06', '2026-10-05'), 'Tomorrow');
  assert.equal(formatDay('2026-10-04', '2026-10-05'), 'Yesterday');
  assert.doesNotMatch(formatDay('2026-11-03', '2026-10-05'), /Today|Tomorrow|Yesterday/);
});

test('a draft becomes exactly the fields the server accepts', () => {
  const form = formFromDraft({ ...draft, times: ['21:00', '08:00', '21:00'], dose: '  1 tablet ', instructions: ' ' }, '2026-10-05');
  assert.deepEqual(toMedicineInput(form), {
    name: 'Glycomet 500',
    strength: '500 mg',
    form: 'tablet',
    dose: '1 tablet',
    times: ['08:00', '21:00'],
    food: 'after_food',
    as_needed: false,
    instructions: null,
    source_text: 'Tab Glycomet 500 BD after food x 1 month',
    start_date: '2026-10-05',
    end_date: '2026-11-03', // 30 days, counting today
  });
  assert.equal(toMedicineInput({ ...form, duration_days: null }).end_date, null);
  assert.deepEqual(toMedicineInput({ ...form, as_needed: true }).times, []);
});

test('a saved medicine turns back into the same form', () => {
  const saved = { ...toMedicineInput(formFromDraft(draft, '2026-10-05')), id: 3, created_at: 'x', created_by_name: 'Priya', updated_at: null, updated_by_name: null };
  const form = formFromMedicine(saved);
  assert.equal(form.duration_days, 30);
  assert.deepEqual(form.unclear, []);
  assert.deepEqual(toMedicineInput(form), toMedicineInput(formFromDraft(draft, '2026-10-05')));
});

test('medicineProblem explains what is missing', () => {
  const form = formFromDraft(draft, '2026-10-05');
  assert.equal(medicineProblem(form), null);
  assert.match(medicineProblem({ ...form, name: ' ' }), /name/);
  assert.match(medicineProblem({ ...form, times: [] }), /time/);
  assert.equal(medicineProblem({ ...form, times: [], as_needed: true }), null);
  assert.match(medicineProblem({ ...form, duration_days: 0 }), /days/);
  assert.match(medicineProblem({ ...form, duration_days: 2.5 }), /days/);
});

test('schedules and finished medicines', () => {
  assert.equal(describeSchedule(draft), '8:00 AM, 9:00 PM · after food');
  assert.equal(describeSchedule({ ...draft, as_needed: true, times: [], food: null }), 'Only when needed');
  assert.equal(isFinished({ end_date: '2026-10-04' }, '2026-10-05'), true);
  assert.equal(isFinished({ end_date: '2026-10-05' }, '2026-10-05'), false); // the last day still counts
  assert.equal(isFinished({ end_date: null }, '2026-10-05'), false);
});

test('parsePrescriptionReading rejects malformed answers', () => {
  const reading = { medicines: [draft], other_instructions: [], readings: [{ model: 'q', text: 'Rx' }, { model: 'g', text: 'Rx' }], organizing_model: 'n' };
  assert.equal(parsePrescriptionReading(reading).medicines.length, 1);
  for (const bad of [null, { ...reading, medicines: 'x' }, { ...reading, medicines: [{ name: 'x' }] }, { ...reading, readings: [] }, { ...reading, readings: [{ model: 'q' }] }]) {
    assert.throws(() => parsePrescriptionReading(bad), /answer/);
  }
});

test("each medicine keeps where its line is on the photo, if the server found it", () => {
  const reading = { medicines: [draft], other_instructions: [], readings: [{ model: 'q', text: 'Rx' }], organizing_model: 'n' };
  const found = { ...draft, box: [50, 420, 860, 580], usual_strengths: ['500 mg', 850, '1000 mg'] };
  const [medicine] = parsePrescriptionReading({ ...reading, medicines: [found] }).medicines;
  assert.deepEqual(medicine.box, [50, 420, 860, 580]);
  assert.deepEqual(medicine.usual_strengths, ['500 mg', '1000 mg']);
  for (const box of [undefined, null, [1, 2, 3], [0, 0, 2000, 10], [500, 10, 100, 20]]) {
    assert.equal(parsePrescriptionReading({ ...reading, medicines: [{ ...draft, box }] }).medicines[0].box, null);
  }
  assert.deepEqual(parsePrescriptionReading(reading).medicines[0].usual_strengths, []); // an older server
  assert.equal('box' in formFromDraft(medicine, '2026-10-05'), false);

  const area = lineArea([50, 420, 860, 580]);
  assert.deepEqual(Object.values(area).map((value) => Math.round(value * 1000)), [20, 372, 870, 256]);
  assert.deepEqual(lineArea([0, 0, 1000, 1000]), { left: 0, top: 0, width: 1, height: 1 }); // never off the photo
  assert.equal(orList(['20 mg', '40 mg', '80 mg']), '20 mg, 40 mg or 80 mg');
  assert.equal(orList(['40 mg']), '40 mg');
});

test('a medicine package fills the name and clears the handwriting warnings', () => {
  const found = parsePackageReading({
    name: 'Glycomet 500', strength: '500 mg', form: 'tablet', contains: 'Metformin Hydrochloride 500 mg',
    reading: { model: 'q', text: 'Glycomet 500' }, organizing_model: 'n',
  });
  const form = { ...formFromDraft({ ...draft, name: 'Glycomel 500', unclear: ['name', 'strength', 'food'] }, '2026-10-05') };
  const filled = applyPackage(form, found);
  assert.deepEqual([filled.name, filled.strength, filled.form], ['Glycomet 500', '500 mg', 'tablet']);
  assert.deepEqual(filled.unclear, ['food']); // the package can't tell us about food
  assert.deepEqual(filled.alternatives, []);
  const nameless = applyPackage(form, { ...found, name: null, strength: null, form: null });
  assert.deepEqual(nameless.unclear, form.unclear); // nothing read, nothing cleared
  assert.throws(() => parsePackageReading({ name: 1, reading: {} }), /answer/);
});
