import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cleanNote,
  describeTime,
  dialableNumber,
  editableFields,
  filterNotes,
  noteProblem,
  parseProposal,
  resolveApiUrl,
  speechLanguage,
} from '../src/model.ts';

const draft = { category: 'symptom', title: 'Nausea', details: 'Felt sick after breakfast', event_time_text: 'this morning' };

function note(overrides = {}) {
  return {
    ...draft,
    id: 1,
    private: false,
    source_text: 'I felt sick after breakfast',
    model: 'nvidia/Nemotron-3_5-Lightning',
    created_at: '2026-10-05T03:30:00Z',
    created_by_id: 7,
    created_by_name: 'Asha',
    updated_at: null,
    updated_by_name: null,
    ...overrides,
  };
}

test('parseProposal accepts the server reply, including an empty list', () => {
  const proposal = parseProposal({ model: 'm', notes: [draft, { ...draft, event_time_text: undefined }] });
  assert.equal(proposal.notes.length, 2);
  assert.equal(proposal.notes[1].event_time_text, null);
  assert.deepEqual(parseProposal({ model: 'm', notes: [] }).notes, []);
});

test('parseProposal rejects malformed replies', () => {
  for (const bad of [null, [], { notes: [draft] }, { model: 'm', notes: [{ ...draft, category: 'diagnosis' }] }, { model: 'm', notes: [{ title: 'x' }] }]) {
    assert.throws(() => parseProposal(bad), /draft/);
  }
});

test('noteProblem explains what to fix, and cleanNote trims', () => {
  assert.equal(noteProblem(draft), null);
  assert.match(noteProblem({ ...draft, title: '   ' }), /title/);
  assert.match(noteProblem({ ...draft, details: 'x'.repeat(1001) }), /shorter/);
  assert.deepEqual(cleanNote({ ...draft, title: ' Nausea ', event_time_text: '  ' }), { ...draft, event_time_text: null });
});

test('editableFields drops server-only fields', () => {
  assert.deepEqual(Object.keys(editableFields(note())).sort(), ['category', 'details', 'event_time_text', 'private', 'title']);
});

test('filterNotes matches every word across fields, ignoring case', () => {
  const notes = [note(), note({ id: 2, category: 'medication', title: 'Metformin', details: 'Missed the evening dose', source_text: null, created_by_name: 'Priya' })];
  assert.deepEqual(filterNotes(notes, '').map((n) => n.id), [1, 2]);
  assert.deepEqual(filterNotes(notes, 'MEDICINE evening').map((n) => n.id), [2]); // category label and details
  assert.deepEqual(filterNotes(notes, 'breakfast asha').map((n) => n.id), [1]); // spoken words and author
  assert.deepEqual(filterNotes(notes, 'fever'), []);
});

test('dialableNumber keeps digits and a leading +', () => {
  assert.equal(dialableNumber('+91 98765-43210'), '+919876543210');
  assert.equal(dialableNumber('(022) 2345 6789'), '02223456789');
  for (const bad of ['12', 'tel:999', '98765 43210 ext 5', '9'.repeat(16)]) assert.equal(dialableNumber(bad), null);
});

test('resolveApiUrl prefers the configured URL, else the Expo host on port 8000 in development', () => {
  assert.equal(resolveApiUrl(' https://api.example.com/ ', '192.168.1.5:8081', true), 'https://api.example.com');
  assert.equal(resolveApiUrl(undefined, '192.168.1.5:8081', true), 'http://192.168.1.5:8000');
  assert.equal(resolveApiUrl('', '[fe80::1]:8081', true), 'http://[fe80::1]:8000');
  assert.equal(resolveApiUrl(undefined, '192.168.1.5:8081', false), null);
  assert.equal(resolveApiUrl(undefined, 'abc-anonymous-8081.exp.direct', true), null);
  assert.equal(resolveApiUrl(undefined, undefined, true), null);
});

test('speechLanguage picks a Hindi voice for Devanagari', () => {
  assert.equal(speechLanguage('आज सुबह से मेरे पेट में दर्द है'), 'hi-IN');
  assert.equal(speechLanguage('aaj subah se sir mein dard hai'), 'en-IN');
});

test('describeTime says Today and Yesterday', () => {
  const now = new Date(2026, 9, 5, 18, 0);
  assert.match(describeTime(new Date(2026, 9, 5, 9, 15).toISOString(), now), /^Today, /);
  assert.match(describeTime(new Date(2026, 9, 4, 22, 0).toISOString(), now), /^Yesterday, /);
  assert.doesNotMatch(describeTime(new Date(2026, 8, 1, 9, 0).toISOString(), now), /^(Today|Yesterday)/);
  assert.equal(describeTime('not a date', now), '');
});
