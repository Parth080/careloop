import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  describeDoseCounts,
  parseAskResult,
  parseVisitSummary,
  pointDates,
  soundsUrgent,
  summaryPeriods,
  summarySpeech,
  summaryText,
  utcOffsetMinutes,
} from '../src/model.ts';

const note = (id, created_at, title, details) => ({
  id, created_at, title, details, category: 'symptom', event_time_text: null, private: false, source_text: null, model: null,
  created_by_id: 1, created_by_name: 'Asha', updated_at: null, updated_by_name: null,
});

const summary = {
  person_name: 'Asha',
  from_day: '2026-09-16',
  to_day: '2026-10-06',
  appointment: { id: 2, title: 'Follow-up with Dr. Mehta', day: '2026-10-13', time: '16:00', place: null, with_whom: null, notes: null },
  medicines: [
    { id: 1, name: 'Glycomet 500', strength: '500 mg', dose: '1 tablet', times: ['08:00', '21:00'], food: 'after_food', as_needed: false,
      start_date: '2026-08-27', end_date: null, doses: { due: 41, taken: 26, skipped: 2, not_marked: 13 } },
    { id: 2, name: 'Dolo 650', strength: null, dose: null, times: [], food: null, as_needed: true, start_date: '2026-08-27', end_date: null, doses: null },
    { id: 3, name: 'Cough syrup', strength: null, dose: '10 ml', times: ['21:00'], food: null, as_needed: false, start_date: '2026-09-20',
      end_date: '2026-09-26', doses: { due: 7, taken: 7, skipped: 0, not_marked: 0 } },
  ],
  points: [
    { section: 'questions', text: 'Can I keep walking every evening?', note_ids: [12] },
    { section: 'symptoms', text: 'Knee hurts on the stairs', note_ids: [11, 10, 11] },
  ],
  notes: [note(10, '2026-09-18T04:00:00Z', 'Knee pain', 'Hurts on the stairs'), note(11, '2026-09-26T04:00:00Z', 'Knee again', 'Worse after walking'),
    note(12, '2026-10-02T04:00:00Z', 'Question', 'Can I keep walking?')],
  notes_left_out: 4,
  model: 'nvidia/Nemotron-3-Ultra-550b-a55b',
  checked_by: 'nvidia/Nemotron-3-Ultra-550b-a55b',
  problem: null,
};

test('summary periods end today and include the last visit when it was recent', () => {
  const periods = summaryPeriods([{ day: '2026-09-16' }, { day: '2026-10-13' }, { day: '2026-05-01' }], '2026-10-06');
  assert.deepEqual(periods.map(({ key, from, to }) => [key, from, to]), [
    ['visit', '2026-09-16', '2026-10-06'],
    ['2w', '2026-09-23', '2026-10-06'],
    ['1m', '2026-09-07', '2026-10-06'],
    ['3m', '2026-07-09', '2026-10-06'], // 90 days, within the server's limit
  ]);
  assert.equal(summaryPeriods([{ day: '2026-05-01' }, { day: '2026-10-06' }], '2026-10-06')[0].key, '2w'); // too old, or today
});

test('dose counts read plainly', () => {
  assert.equal(describeDoseCounts({ due: 41, taken: 26, skipped: 2, not_marked: 13 }), 'Taken 26 of 41 doses · 2 skipped · 13 not marked');
  assert.equal(describeDoseCounts({ due: 3, taken: 3, skipped: 0, not_marked: 0 }), 'Taken 3 of 3 doses');
  assert.equal(describeDoseCounts({ due: 0, taken: 0, skipped: 0, not_marked: 0 }), 'No doses were due yet');
  assert.equal(describeDoseCounts(null), 'Taken only when needed');
});

test('each point shows the days its notes were written, once each and in order', () => {
  const dates = pointDates(summary.points[1], summary.notes, '2026-10-06');
  assert.equal(dates.split(', ').length, 2);
  assert.match(dates, /18.*26/);
});

test('the shared text has medicines, points in a fixed order, and every note', () => {
  const text = summaryText(summary, '2026-10-06');
  assert.match(text, /^Health summary: Asha\n/);
  assert.match(text, /Glycomet 500 \(500 mg\) – 1 tablet, 8:00 AM, 9:00 PM · after food\. Taken 26 of 41 doses · 2 skipped · 13 not marked\./);
  assert.match(text, /Dolo 650 – Only when needed\. Taken only when needed\./);
  assert.match(text, /Cough syrup \(started .+, last day .+\) – 10 ml, 9:00 PM\. Taken 7 of 7 doses\./); // began and ended in the period
  assert.match(text, /"Not marked" means nobody marked the dose/);
  assert.match(text, /4 older notes aren't included\./);
  assert.ok(text.indexOf('HOW ASHA HAS BEEN') < text.indexOf('QUESTIONS FOR THE DOCTOR'));
  assert.match(text, /ALL NOTES \(3\)/);
  assert.match(text, /It is not a diagnosis\.$/);
  const spoken = summarySpeech(summary, '2026-10-06');
  assert.doesNotMatch(spoken, /•|Worse after walking/); // no bullets, and not the full notes
  assert.match(spoken, /Glycomet 500: Taken 26 of 41 doses, 2 skipped, 13 not marked\./);
});

test('answers and summaries are checked before they are shown', () => {
  assert.equal(parseVisitSummary(summary).points.length, 2);
  assert.throws(() => parseVisitSummary({ ...summary, points: [{ section: 'diagnosis', text: 'x', note_ids: [] }] }), /summary/);
  const answer = {
    kind: 'answer', answer: 'On 13 Oct', sources: [{ kind: 'appointment', text: 'Appointment on Tue 13 Oct' }], urgent: false, model: 'm', checked_by: 'm',
  };
  assert.equal(parseAskResult(answer).kind, 'answer');
  assert.equal(parseAskResult({ ...answer, kind: 'dose_records', answer: null, checked_by: null }).kind, 'dose_records');
  for (const bad of [null, { ...answer, kind: 'guess' }, { ...answer, urgent: 'no' }, { ...answer, sources: [{ kind: 'note' }] }]) {
    assert.throws(() => parseAskResult(bad), /answer/);
  }
});

test('urgent words are spotted on the phone, in English and Hindi', () => {
  for (const words of [
    'Her chest hurts and she is sweating', 'He fainted in the bathroom', 'I think she took too many tablets', 'माँ बेहोश हो गई',
    'She can’t breathe', 'he won’t wake up', 'Mum fell and can’t get up', "can't breath properly", 'difficulty in breathing',
    'pain in chest', 'she fell in the bathroom', 'took 10 sleeping pills', 'gave a double dose by mistake', 'he is unresponsive',
    'साँस नहीं आ रही', 'छाती में दर्द है', 'पापा गिर गए',
  ]) {
    assert.ok(soundsUrgent(words), words);
  }
  for (const words of ['When is the next appointment?', 'Knee pain after the walk', 'She fell asleep early', 'She had 12 hours of sleep', 'Took 2 tablets of Dolo']) {
    assert.ok(!soundsUrgent(words), words);
  }
});

test('the time zone is sent as minutes ahead of UTC', () => {
  assert.equal(utcOffsetMinutes({ getTimezoneOffset: () => -330 }), 330); // India
  assert.equal(utcOffsetMinutes({ getTimezoneOffset: () => 0 }), 0);
  assert.ok(!Object.is(utcOffsetMinutes({ getTimezoneOffset: () => 0 }), -0));
});
