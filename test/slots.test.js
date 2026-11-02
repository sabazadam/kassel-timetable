import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseSlots, attendedSeries, selectedEntries, moduleVariants } from '../site/js/schedule.js';

const weekly = (day, start, end, room, extra = {}) => ({ rhythm: 'wöchentlich', day, start, end, room, startDate: '2026-10-19', endDate: '2027-02-12', ...extra });
const single = (day, start, end, room) => ({ rhythm: 'Einzeltermin', day, start, end, room, startDate: '2026-11-13', endDate: '2026-11-13' });

// Shaped like Einführung in die Informatik, Übung 70084: tutorial times as series of one group, two rooms at
// Fri 10:15, and a one-off room change on 13.11 for the Fri 12:30 tutorial.
const tutorial = {
  id: 'u',
  type: 'Übung',
  groups: [
    {
      name: '1. Parallelgruppe',
      series: [
        weekly(4, '14:15', '15:45', 'A'),
        weekly(4, '16:15', '17:45', 'B'),
        weekly(5, '10:15', '11:45', 'B'),
        weekly(5, '10:15', '11:45', 'C'),
        weekly(5, '12:30', '14:00', 'D'),
        single(5, '12:30', '14:00', 'E'),
      ],
    },
  ],
};

test('exerciseSlots finds tutorial alternatives and keeps a split slot together', () => {
  const split = { ...tutorial, groups: [{ series: [weekly(1, '10:00', '12:00', 'A', { endDate: '2026-12-18' }), weekly(1, '10:00', '12:00', 'A', { startDate: '2027-01-11' }), weekly(2, '10:00', '12:00', 'A'), weekly(3, '10:00', '12:00', 'A')] }] };
  assert.deepEqual(exerciseSlots(split, split.groups[0]).map((s) => s.indices), [[0, 1], [2], [3]]);
  assert.equal(exerciseSlots(tutorial, tutorial.groups[0]).length, 5);
});

test('exerciseSlots leaves lectures, mixed and unclear exercises alone', () => {
  const g = tutorial.groups[0];
  assert.equal(exerciseSlots({ ...tutorial, type: 'Vorlesung' }, g), null);
  assert.equal(exerciseSlots({ ...tutorial, type: 'Vorlesung/Übung' }, g), null);
  // Two meetings on different days may both be compulsory.
  assert.equal(exerciseSlots(tutorial, { series: [weekly(1, '10:00', '12:00', 'A'), weekly(4, '10:00', '12:00', 'A')] }), null);
  // Same time, different rooms: alternatives.
  assert.equal(exerciseSlots(tutorial, { series: [weekly(1, '10:00', '12:00', 'A'), weekly(1, '10:00', '12:00', 'B')] }).length, 2);
  // A series marked as lecture means the group mixes lecture and exercise.
  assert.equal(exerciseSlots(tutorial, { series: [weekly(1, '10:00', '12:00', 'A', { note: 'Vorlesung' }), weekly(2, '10:00', '12:00', 'A'), weekly(3, '10:00', '12:00', 'A')] }), null);
});

test('a whole-class exercise stays fixed next to the tutorial slots (like BuK 70515)', () => {
  const buk = { ...tutorial, groups: [{ series: [weekly(1, '14:00', '16:00', 'H', { note: 'Hörsaalübung' }), weekly(2, '10:00', '12:00', 'A', { note: 'Tutorium' }), weekly(2, '10:00', '12:00', 'B', { note: 'Tutorium' }), weekly(4, '12:30', '14:00', 'C', { note: 'Tutorium' })] }] };
  const g = buk.groups[0];
  assert.equal(exerciseSlots(buk, g).length, 3);
  assert.deepEqual(attendedSeries(buk, g, 2), [0, 3]);
});

test('attendedSeries keeps the chosen slot and only its one-off dates', () => {
  const g = tutorial.groups[0];
  assert.deepEqual(attendedSeries(tutorial, g), [0]);
  assert.deepEqual(attendedSeries(tutorial, g, 4), [4, 5]);
  assert.deepEqual(attendedSeries(tutorial, g, 99), [4, 5], 'an out-of-range slot falls back to the last');
  const lecture = { ...tutorial, type: 'Vorlesung' };
  assert.deepEqual(attendedSeries(lecture, g), [0, 1, 2, 3, 4, 5]);
});

test('selectedEntries puts one tutorial on the week, the chosen one', () => {
  const data = { courses: [tutorial], modules: [{ id: 'm', courseIds: ['u'] }] };
  const keys = (state) => selectedEntries(data, state).map((e) => e.seriesIndex);
  assert.deepEqual(keys({ modules: { m: { courses: {} } } }), [0]);
  assert.deepEqual(keys({ modules: { m: { courses: { u: { on: true, group: 0, off: [], slot: 2 } } } } }), [2]);
});

test('moduleVariants offers each tutorial slot as its own variant', () => {
  const variants = moduleVariants({ id: 'm', courseIds: ['u'] }, [tutorial]);
  assert.equal(variants.length, 5);
  assert.deepEqual(variants.map((v) => v.series.length), [1, 1, 1, 1, 2]);
  assert.equal(variants[3].courses.u.slot, 3);
  assert.equal(variants[0].courses.u.slot, undefined);
});

test('mergeCourseParts joins a central exercise and its tutorial group (69657)', async () => {
  const { mergeCourseParts } = await import('../scraper/catalog.js');
  const course = {
    id: '69657',
    type: 'Übung',
    groups: [
      { name: '1. Parallelgruppe', kind: 'Übung', series: [weekly(5, '12:00', '14:00', 'Z'), single(5, '12:00', '14:00', 'Y')] },
      { name: '2. Parallelgruppe', kind: 'Tutorium', series: [weekly(1, '08:00', '10:00', 'A'), weekly(2, '14:00', '16:00', 'A')] },
    ],
  };
  const merged = mergeCourseParts(course);
  assert.equal(merged.groups.length, 1);
  const g = merged.groups[0];
  assert.deepEqual(g.parts, ['Übung', 'Tutorium']);
  // Two named tutorial times are already a choice; the central exercise stays in every choice.
  assert.equal(exerciseSlots(merged, g).length, 2);
  assert.deepEqual(attendedSeries(merged, g, 1).map((i) => g.series[i].room), ['Z', 'Y', 'A']);
  assert.equal(attendedSeries(merged, g, 1).map((i) => g.series[i]).filter((s) => s.day === 2).length, 1);
});

test('mergeCourseParts leaves real alternatives alone', async () => {
  const { mergeCourseParts } = await import('../scraper/catalog.js');
  const two = (k1, k2) => ({ id: 'x', groups: [{ name: '1', kind: k1, series: [weekly(1, '08:00', '10:00', 'A')] }, { name: '2', kind: k2, series: [weekly(2, '08:00', '10:00', 'B')] }] });
  for (const [k1, k2] of [['Übung', 'Übung'], ['Vorlesung', 'Vorlesung/Seminar'], ['Kurs A', 'Tutorium'], ['Tutorium', 'Tutorium'], ['Übung', undefined]]) {
    const c = two(k1, k2);
    assert.equal(mergeCourseParts(c), c, `${k1} + ${k2}`);
  }
});

test('a single date on a cancelled day of a weekly series does not clash (56694)', async () => {
  const { seriesConflict } = await import('../site/js/schedule.js');
  const tutorial = weekly(1, '16:00', '18:00', 'T', { cancelled: ['2026-11-23'] });
  const lecture = { ...single(1, '16:00', '18:00', 'L'), startDate: '2026-11-23', endDate: '2026-11-23' };
  assert.equal(seriesConflict(tutorial, lecture), false);
  assert.equal(seriesConflict(lecture, tutorial), false);
  assert.equal(seriesConflict(weekly(1, '16:00', '18:00', 'T'), lecture), true);
});

test('applyGroupParts: a shared lecture goes into each pick group (69164 CAD)', async () => {
  const { applyGroupParts } = await import('../scraper/catalog.js');
  const course = {
    id: '69164',
    type: 'Vorlesung/Übung',
    groups: [
      { name: '1. Parallelgruppe', series: [weekly(5, '08:00', '10:00', 'H'), weekly(2, '12:00', '14:00', 'H')] },
      { name: '2. Parallelgruppe', series: [weekly(3, '14:00', '15:30', 'A'), weekly(3, '14:00', '15:30', 'B')] },
      { name: '3. Parallelgruppe', series: [weekly(2, '10:00', '11:30', 'A')] },
    ],
  };
  assert.equal(applyGroupParts(course, { groups: 2, pick: [1, 2] }), null);
  const out = applyGroupParts(course, { groups: 3, pick: [1, 2] });
  assert.equal(out.groups.length, 2);
  assert.deepEqual(out.groups.map((g) => g.series.map((s) => s.room).join('')), ['HHAB', 'HHA']);
  for (const g of out.groups) {
    assert.equal(g.slots, false);
    assert.equal(exerciseSlots(out, g), null);
    assert.equal(attendedSeries(out, g, 0).length, g.series.length);
  }
});

test('applyGroupParts: no pick group and one slot group (69657 shape)', async () => {
  const { applyGroupParts } = await import('../scraper/catalog.js');
  const course = {
    id: 'x',
    type: 'Vorlesung',
    groups: [
      { name: '1', series: [weekly(5, '12:00', '14:00', 'Z')] },
      { name: '2', series: [weekly(1, '08:00', '10:00', 'A'), weekly(2, '14:00', '16:00', 'A')] },
    ],
  };
  const out = applyGroupParts(course, { groups: 2, pick: [], slots: [1] });
  const g = out.groups[0];
  assert.equal(out.groups.length, 1);
  assert.equal(g.slots, true);
  assert.equal(exerciseSlots(out, g).length, 2);
  assert.deepEqual(attendedSeries(out, g, 1).map((i) => g.series[i].room + g.series[i].day), ['Z5', 'A2']);
});
