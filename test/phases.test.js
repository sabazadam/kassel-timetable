import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  seriesWeeks,
  computePhases,
  groupPhases,
  selectionPhases,
  phaseIndexAt,
  phaseEntries,
  phaseChanges,
  activeInPhase,
  findConflicts,
  selectedEntries,
  weekShape,
  suggestPrograms,
  mergeSingleDates,
  partialInPhase,
} from '../site/js/schedule.js';
import { buildIcs } from '../site/js/ics.js';

// Real eCampus data (msc-ece, WiSe 2026/27): 59865 Introduction to Digital Communications changes its weekly
// meetings on 18.01.2027; 71815 has two single dates at its weekly slot before the series starts.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/phases-msc-ece.json', import.meta.url)));
const shape = { ...fixture.semester, breaks: new Set(fixture.semester.breaks) };
const course = (id) => fixture.courses.find((c) => c.id === id);
const idc = course('59865');

const weekly = (day, start, end, startDate, endDate, extra = {}) => ({
  rhythm: 'wöchentlich', day, start, end, startDate, endDate, cancelled: [], note: '', instructors: [], room: 'Raum 1', ...extra,
});
const items = (list) => list.map((s, i) => ({ key: String(i), series: s, weeks: seriesWeeks(s, { series: list }, shape) }));
const ranges = (phases) => phases.map((p) => `${p.first}..${p.last}`);

test('seriesWeeks: starts and ends within a week of the lecture period count as the whole period', () => {
  assert.equal(shape.start, '2026-10-20');
  // Starts in the introduction week (15.10) or a week late (27.10): the period's first week, 19.10.
  assert.equal(seriesWeeks(weekly(4, '10:00', '12:00', '2026-10-15', '2027-02-11'), null, shape).from, '2026-10-19');
  assert.equal(seriesWeeks(weekly(2, '10:00', '12:00', '2026-10-27', '2027-02-09'), null, shape).from, '2026-10-19');
  // Two weeks late (06.11) is a change.
  assert.equal(seriesWeeks(weekly(5, '13:00', '15:00', '2026-11-06', '2027-01-15'), null, shape).from, '2026-11-02');
  assert.equal(seriesWeeks(weekly(5, '13:00', '15:00', '2026-11-06', '2027-01-15'), null, shape).to, '2027-01-11');
  // Ends a week early: still the last week.
  assert.equal(seriesWeeks(weekly(5, '13:00', '15:00', '2026-10-23', '2027-02-05'), null, shape).to, '2027-02-08');
  // A weekly series with one meeting is a single date.
  assert.equal(seriesWeeks(weekly(5, '13:00', '15:00', '2027-01-29', '2027-01-29'), null, shape), null);
});

test('seriesWeeks: single dates at the weekly slot right before the series are part of it (71815)', () => {
  const g = course('71815').groups[0];
  const w = seriesWeeks(g.series[2], g, shape);
  assert.equal(g.series[2].startDate, '2026-11-02');
  assert.equal(w.from, '2026-10-19');
  assert.equal(groupPhases(g, shape).phases.length, 1);
});

test('59865 splits into two phases: until 15.01 and from 18.01; the late Friday bootcamps say from when', () => {
  const g = idc.groups[0];
  const { phases, dated } = groupPhases(g, shape);
  assert.deepEqual(ranges(phases), ['2026-10-20..2027-01-15', '2027-01-18..2027-02-12']);
  const slots = (p) => [...p.keys].map((k) => `${g.series[k].day} ${g.series[k].start}`).sort();
  assert.deepEqual(slots(phases[0]), ['2 16:30', '3 12:00', '4 16:00', '5 13:00']);
  assert.deepEqual(slots(phases[1]), ['1 10:00', '3 08:00', '3 12:00', '5 12:00']);
  // Every weekly series gets its dates in the course detail.
  assert.deepEqual([...dated].sort(), [0, 1, 2, 3, 4, 5, 6]);
  // Phases cover the weeks without gaps; Christmas lies inside the first.
  assert.equal(phases[0].to, '2027-01-17');
  assert.equal(phases[1].from, '2027-01-18');
  // The Friday series (06.11) starts more than a week after the phase; the others need no note.
  const friday = g.series.find((x) => x.day === 5 && x.start === '13:00');
  assert.deepEqual(partialInPhase(friday, phases[0]), { from: '2026-11-06' });
  assert.equal(partialInPhase(g.series.find((x) => x.day === 2), phases[0]), null);
});

test('a short phase in the middle of the semester stays a phase of its own', () => {
  const list = [weekly(2, '09:00', '11:00', '2026-10-20', '2027-02-09'), weekly(4, '09:00', '11:00', '2026-11-26', '2026-12-10')];
  assert.equal(computePhases(items(list), shape).length, 3);
});

test('computePhases: one slot split around Christmas, and a class a week late, are no change', () => {
  const split = [weekly(4, '10:00', '14:00', '2026-10-22', '2026-12-17'), weekly(4, '10:00', '14:00', '2027-01-14', '2027-02-11')];
  assert.equal(computePhases(items(split).map((x) => ({ ...x, sig: 'same' })), shape).length, 1);
  // A course of its own that starts 10.11, its exercise a week later: one phase.
  const late = [weekly(2, '16:00', '18:00', '2026-11-10', '2027-02-09'), weekly(1, '08:00', '09:30', '2026-11-16', '2027-02-08')];
  assert.deepEqual(ranges(computePhases(items(late), shape)), ['2026-11-10..2027-02-09']);
  // Without any weekly series there are no phases.
  assert.deepEqual(computePhases([], shape), []);
});

test('phaseIndexAt opens the phase of today, the first before the semester and the last after it', () => {
  const { phases } = groupPhases(idc.groups[0], shape);
  assert.equal(phaseIndexAt(phases, '2026-09-01'), 0);
  assert.equal(phaseIndexAt(phases, '2026-10-20'), 0);
  assert.equal(phaseIndexAt(phases, '2026-12-24'), 0);
  assert.equal(phaseIndexAt(phases, '2027-01-16'), 0);
  assert.equal(phaseIndexAt(phases, '2027-01-18'), 1);
  assert.equal(phaseIndexAt(phases, '2027-06-01'), 1);
  assert.equal(phaseIndexAt([], '2027-06-01'), -1);
});

// A selection: 59865 plus a full-semester Monday 10-12 lecture and an October-December Monday 10-12 seminar.
const data = {
  modules: [
    { id: 'M1', title: 'Digital Communications', ects: 6, areas: ['A'], courseIds: ['59865'] },
    { id: 'M2', title: 'Full semester', ects: 6, areas: ['A'], courseIds: ['full'] },
    { id: 'M3', title: 'Until December', ects: 6, areas: ['A'], courseIds: ['autumn'] },
  ],
  courses: [
    idc,
    { id: 'full', title: 'Full', type: 'Vorlesung', groups: [{ name: 'g', series: [weekly(1, '10:00', '12:00', '2026-10-19', '2027-02-08')] }] },
    { id: 'autumn', title: 'Autumn', type: 'Seminar', groups: [{ name: 'g', series: [weekly(1, '10:00', '12:00', '2026-10-19', '2026-12-14')] }] },
  ],
};
const pick = (...ids) => ({ modules: Object.fromEntries(ids.map((id) => [id, { courses: {} }])) });

test('clashes count only where both classes run: per phase and over the semester', () => {
  // 59865 meets Mondays 10-12 only from 18.01; the seminar ends 14.12: no clash at all.
  assert.equal(findConflicts(selectedEntries(data, pick('M1', 'M3'))).size, 0);
  // The full-semester lecture clashes with 59865 on Mondays, but only in the last phase.
  const entries = selectedEntries(data, pick('M1', 'M2'));
  assert.deepEqual([...findConflicts(entries)].sort(), ['59865:0:4', 'full:0:0']);
  const phases = selectionPhases(entries, shape);
  assert.equal(phases.length, 2);
  assert.equal(findConflicts(entries, phases[0]).size, 0);
  assert.deepEqual([...findConflicts(entries, phases[1])].sort(), ['59865:0:4', 'full:0:0']);
});

test('phaseEntries shows what runs in a phase; phaseChanges names the courses that change', () => {
  const entries = selectedEntries(data, pick('M1', 'M2', 'M3'));
  const phases = selectionPhases(entries, shape);
  // The seminar ends 14.12; without it only one lecture week is left before 18.01, so that is no phase of its own.
  // The Friday bootcamps start 06.11, early in the semester: a late start, no phase either.
  assert.deepEqual(ranges(phases), ['2026-10-19..2027-01-15', '2027-01-18..2027-02-12']);
  const shown = (i) => phaseEntries(entries, phases[i], shape).map((e) => e.key).sort();
  assert.deepEqual(shown(0), ['59865:0:0', '59865:0:1', '59865:0:2', '59865:0:3', 'autumn:0:0', 'full:0:0']);
  assert.deepEqual(shown(1), ['59865:0:1', '59865:0:4', '59865:0:5', '59865:0:6', 'full:0:0']);
  const changes = phaseChanges(phases, entries);
  assert.deepEqual(changes.map((c) => c.date), ['2027-01-18']);
  assert.deepEqual(changes[0].courseIds.sort(), ['59865', 'autumn']);
});

test('phaseEntries shows a slot entered as two series once, with both keys', () => {
  const c = { id: 'x', title: 'X', groups: [{ series: [weekly(4, '10:00', '14:00', '2026-10-22', '2026-12-17'), weekly(4, '10:00', '14:00', '2027-01-14', '2027-02-11')] }] };
  const entries = c.groups[0].series.map((s, i) => ({ key: `x:0:${i}`, course: c, groupIndex: 0, series: s, module: { id: 'm' }, grid: true }));
  const phases = selectionPhases(entries, shape);
  assert.equal(phases.length, 1);
  const shown = phaseEntries(entries, phases[0], shape);
  assert.equal(shown.length, 1);
  assert.deepEqual(shown[0].keys, ['x:0:0', 'x:0:1']);
});

test('single dates in the grid show only in the phase of their date', () => {
  const c = { id: 's', title: 'S', groups: [{ series: [] }] };
  const single = (date) => ({ rhythm: 'Einzeltermin', day: 2, start: '08:00', end: '10:00', startDate: date, endDate: date });
  const entries = ['2026-10-27', '2027-01-26'].map((d, i) => ({ key: `s:0:${i}`, course: c, groupIndex: 0, series: single(d), module: { id: 'm' }, grid: true }));
  const { phases } = groupPhases(idc.groups[0], shape);
  assert.deepEqual(mergeSingleDates(entries.filter((e) => activeInPhase(e, phases[0], shape))).map((e) => e.dates), [['2026-10-27']]);
  assert.deepEqual(mergeSingleDates(entries.filter((e) => activeInPhase(e, phases[1], shape))).map((e) => e.dates), [['2027-01-26']]);
});

test('weekShape counts idle time per phase when it knows the semester', () => {
  const g = idc.groups[0].series;
  // Wednesday 08-10 (from 20.01) and 12-13:30 (all semester): a two-hour gap, but only in the last phase.
  assert.equal(weekShape(g).gapMinutes, 120);
  const perPhase = weekShape(g, shape);
  assert.ok(perPhase.gapMinutes > 0 && perPhase.gapMinutes < 120, String(perPhase.gapMinutes));
  assert.deepEqual(perPhase.freeWeekdays, []);
});

test('suggestPrograms combines classes at the same slot when they run in different periods', () => {
  const two = {
    modules: [
      { id: 'P1', title: 'First half', ects: 3, areas: ['A'], courseIds: ['h1'] },
      { id: 'P2', title: 'Second half', ects: 3, areas: ['A'], courseIds: ['h2'] },
    ],
    courses: [
      { id: 'h1', title: 'H1', type: 'Vorlesung', groups: [{ name: 'g', series: [weekly(1, '10:00', '12:00', '2026-10-19', '2026-12-14')] }] },
      { id: 'h2', title: 'H2', type: 'Vorlesung', groups: [{ name: 'g', series: [weekly(1, '10:00', '12:00', '2027-01-11', '2027-02-08')] }] },
    ],
  };
  const [best] = suggestPrograms(two, { target: 6, shape, attempts: 20 });
  assert.deepEqual(best.added, ['P1', 'P2']);
});

test('the .ics export keeps every series of 59865 with its own dates', () => {
  const entries = selectedEntries(data, pick('M1'));
  const ics = buildIcs(entries, new Date('2026-10-20T12:00:00Z'));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 7);
  assert.ok(ics.includes('DTSTART;TZID=Europe/Berlin:20261020T163000'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;UNTIL=20270112T235959Z'));
  assert.ok(ics.includes('DTSTART;TZID=Europe/Berlin:20270118T100000'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;UNTIL=20270208T235959Z'));
});

test('a one-week gap after Christmas that joins the next phase leaves one phase when both sides are the same', () => {
  // msc-literatur-kunst-medienkulturen: a biweekly seminar split around Christmas next to two full-semester classes.
  const list = [
    weekly(2, '16:00', '18:00', '2026-10-20', '2027-02-09'),
    weekly(3, '10:00', '12:00', '2026-10-21', '2027-02-10'),
    weekly(4, '10:00', '14:00', '2026-10-22', '2026-12-17', { rhythm: '14-täglich' }),
    weekly(4, '10:00', '14:00', '2027-01-21', '2027-02-04', { rhythm: '14-täglich' }),
  ];
  const sig = (s) => [s.day, s.start, s.end, s.rhythm].join(':');
  const phases = computePhases(items(list).map((x) => ({ ...x, sig: sig(x.series) })), shape);
  assert.deepEqual(ranges(phases), ['2026-10-20..2027-02-10']);
});

test('phase dates skip cancelled meetings and the off weeks of biweekly series, and keep intro-week meetings', () => {
  const list = [
    weekly(2, '09:00', '11:00', '2026-10-20', '2027-02-09', { cancelled: ['2026-12-22', '2026-12-29', '2027-01-05'] }),
    weekly(3, '09:00', '11:00', '2026-11-04', '2026-12-16'),
    weekly(4, '09:00', '11:00', '2026-10-15', '2027-02-11', { cancelled: ['2026-12-24', '2026-12-31', '2027-01-07'] }),
  ];
  assert.deepEqual(ranges(computePhases(items(list), shape)), ['2026-10-15..2026-12-17', '2027-01-12..2027-02-11']);
  const biweekly = [weekly(5, '12:00', '14:00', '2026-10-16', '2027-02-05', { rhythm: '14-täglich' }), weekly(1, '12:00', '14:00', '2026-11-02', '2027-01-25', { rhythm: '14-täglich' })];
  const phases = computePhases(items(biweekly), shape);
  assert.equal(phases.at(-1).last, '2027-02-05');
  assert.equal(phases[0].first, '2026-10-16');
});
