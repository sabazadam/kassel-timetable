import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseOfferingList, parseModulePage, offeringCycle, teachingLanguages, buildOfferings } from '../scraper/offerings.js';
import {
  semesterIndex,
  semesterKey,
  semesterLabel,
  periodKey,
  semesterRange,
  offeredIn,
  nextOfferings,
  primaryArea,
  mainSubjects,
  filterOfferings,
  takenBefore,
} from '../site/js/offerings.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parseOfferingList reads the numbered area tree and its modules', () => {
  const areas = parseOfferingList(fixture('mdb-list-120-en.html'));
  assert.equal(areas.length, 31);
  assert.deepEqual(areas[0].id, '1');
  assert.equal(areas[0].name, 'Elective Course Practical Computer Science');
  assert.equal(areas[0].parent, null);
  assert.equal(areas[0].modules[1], 'showModule.php?id=3458');
  const lab = areas.find((a) => a.id === '8.1.3');
  assert.equal(lab.parent, '8.1');
  assert.equal(lab.name, 'Lab Courses');
  assert.equal(new Set(areas.flatMap((a) => a.modules)).size, 80);
});

test('parseModulePage reads the th/td rows', () => {
  const row = parseModulePage(fixture('mdb-module-3458.html'));
  assert.equal(row['Module number / code'], 'PI-02');
  assert.equal(row['Unique module number'], 'Inf-1821-M');
  assert.equal(row['Frequency of module offer'], 'annually in summer semester');
  assert.equal(row['Credit points (ECTS)'], '6 cp');
  assert.equal(row['Course types'], 'VLmP (2 SWS), Ü (2 SWS)');
});

test('offeringCycle understands the handbook phrasings', () => {
  assert.deepEqual(offeringCycle('annually in summer semester'), { term: 'summer', every: 2 });
  assert.deepEqual(offeringCycle('annually in winter semester'), { term: 'winter', every: 2 });
  assert.deepEqual(offeringCycle('Summer und winter semester'), { term: 'both', every: 1 });
  assert.deepEqual(offeringCycle('Alle 4 Semester ab Sommersemester 2026'), { term: 'summer', every: 4, from: 'S2026' });
  assert.deepEqual(offeringCycle('Alle vier Semester ab Wintersemester 2027/28'), { term: 'winter', every: 4, from: 'W2027' });
  assert.deepEqual(offeringCycle('Alle drei Semester, ab Sommersemester 2027'), { term: 'cycle', every: 3, from: 'S2027' });
  assert.deepEqual(offeringCycle('Alle 4 Semester'), { term: 'unknown' });
  assert.deepEqual(offeringCycle('Siehe Vorlesungsverzeichnis'), { term: 'unknown' });
  assert.deepEqual(offeringCycle(null), { term: 'unknown' });
});

test('teachingLanguages', () => {
  assert.deepEqual(teachingLanguages('Englisch/Deutsch'), ['en', 'de']);
  assert.deepEqual(teachingLanguages('English'), ['en']);
  assert.deepEqual(teachingLanguages('Deutsch'), ['de']);
  assert.deepEqual(teachingLanguages(null), []);
});

test('semester keys, labels and ranges', () => {
  assert.equal(semesterIndex('S2027'), 4054);
  assert.equal(semesterIndex('W2026'), 4053);
  assert.equal(semesterKey(4054), 'S2027');
  assert.equal(semesterKey(4053), 'W2026');
  assert.equal(semesterLabel('W2026'), 'WiSe 2026/27');
  assert.equal(semesterLabel('S2027'), 'SoSe 2027');
  assert.equal(semesterLabel('W2099'), 'WiSe 2099/00');
  assert.equal(periodKey('WiSe 2026/27'), 'W2026');
  assert.equal(periodKey('SoSe 2027'), 'S2027');
  assert.equal(periodKey('Wintersemester 2026/27'), 'W2026');
  assert.equal(periodKey('Sommersemester 2027'), 'S2027');
  assert.equal(periodKey('garbage'), null);
  assert.deepEqual(semesterRange('W2026', 4), ['W2026', 'S2027', 'W2027', 'S2028']);
});

test('offeredIn follows yearly, every-semester and longer cycles', () => {
  const summer = { term: 'summer', every: 2 };
  const winter = { term: 'winter', every: 2 };
  assert.equal(offeredIn(summer, 'S2027'), true);
  assert.equal(offeredIn(summer, 'W2026'), false);
  assert.equal(offeredIn(winter, 'W2026'), true);
  assert.equal(offeredIn(winter, 'S2027'), false);
  assert.equal(offeredIn({ term: 'both', every: 1 }, 'S2027'), true);
  assert.equal(offeredIn({ term: 'unknown' }, 'S2027'), null);
  // Every 4 semesters from SoSe 2026: not in SoSe 2027, again in SoSe 2028.
  const four = { term: 'summer', every: 4, from: 'S2026' };
  assert.equal(offeredIn(four, 'S2026'), true);
  assert.equal(offeredIn(four, 'S2027'), false);
  assert.equal(offeredIn(four, 'S2028'), true);
  // A cycle that starts later is not offered before its start.
  const later = { term: 'winter', every: 4, from: 'W2027' };
  assert.equal(offeredIn(later, 'W2026'), false);
  assert.equal(offeredIn(later, 'W2027'), true);
  const three = { term: 'cycle', every: 3, from: 'S2027' };
  assert.deepEqual(nextOfferings(three, 'W2026', 6), ['S2027', 'W2028']);
  assert.deepEqual(nextOfferings(four, 'W2026', 4), ['S2028']);
});

const sample = {
  areas: [
    { id: '1', name: 'Practical' },
    { id: '2', name: 'Technical' },
    { id: '5', name: 'Any elective' },
    { id: '8.1', name: 'Main Subject CIDA (CIDA)' },
    { id: '8.1.1', name: 'Foundational', parent: '8.1' },
  ],
  modules: [
    { name: 'Deep Learning', nameDe: 'Deep Learning', code: 'PI-26', areas: ['1', '5', '8.1.1'], term: 'winter', every: 2 },
    { name: 'Web Engineering', code: 'PI-17', areas: ['1', '5'], term: 'unknown' },
    { name: 'Reconfigurable Structures', nameDe: 'Rekonfigurierbare Strukturen', code: 'TeI-12', areas: ['5', '2'], term: 'summer', every: 2 },
    // Area "5" lists more than half of all modules, so it is a catch-all.
    { name: 'Database Theory', code: 'TI-02', areas: ['5'], term: 'both', every: 1 },
    { name: 'Cryptography', code: 'M/E-06', areas: ['2'], term: 'winter', every: 4, from: 'W2027' },
  ],
};

test('primaryArea skips catch-all areas; mainSubjects finds the root of nested areas', () => {
  assert.equal(primaryArea(sample.modules[2], sample), '2');
  assert.equal(primaryArea(sample.modules[0], sample), '1');
  // Only catch-all areas: the first one is used.
  assert.equal(primaryArea(sample.modules[3], sample), '5');
  assert.deepEqual(mainSubjects(sample.modules[0], sample), ['8.1']);
  assert.deepEqual(mainSubjects(sample.modules[1], sample), []);
});

test('filterOfferings by semester, area and search; unknown terms stay listed', () => {
  const names = (list) => list.map((m) => m.code);
  assert.deepEqual(names(filterOfferings(sample, { key: 'S2027' })), ['PI-17', 'TeI-12', 'TI-02']);
  assert.deepEqual(names(filterOfferings(sample, { key: 'W2026' })), ['PI-26', 'PI-17', 'TI-02']);
  assert.deepEqual(names(filterOfferings(sample, { area: '8.1' })), ['PI-26']);
  assert.deepEqual(names(filterOfferings(sample, { query: 'rekonfig' })), ['TeI-12']);
  assert.deepEqual(names(filterOfferings(sample, { query: 'pi-1' })), ['PI-17']);
});

test('buildOfferings joins areas and pages, one entry per module with all its areas', () => {
  const areas = [
    { id: '1', name: 'Practical', parent: null, modules: ['showModule.php?id=1'] },
    { id: '5', name: 'Any', parent: null, modules: ['showModule.php?id=1', 'showModule.php?id=2'] },
  ];
  const pagesEn = new Map([
    ['showModule.php?id=1', { 'Module number / code': 'PI-02', 'Unique module number': 'Inf-1821-M', 'Module name': 'Experimentation', 'Frequency of module offer': 'annually in summer semester', 'Credit points (ECTS)': '6 cp' }],
    ['showModule.php?id=2', { 'Module number / code': 'TI-01', 'Module name': 'Automata', 'Frequency of module offer': 'Alle 4 Semester', 'Credit points (ECTS)': '12 cp' }],
  ]);
  const o = buildOfferings({ areas, areasDe: [{ id: '1', name: 'Praktische' }], pagesEn, namesDe: new Map([['showModule.php?id=1', 'Experimentieren']]), listId: 120 });
  assert.equal(o.modules.length, 2);
  assert.deepEqual(o.modules[0].areas, ['1', '5']);
  assert.equal(o.modules[0].nameDe, 'Experimentieren');
  assert.equal(o.modules[0].term, 'summer');
  assert.equal(o.modules[0].every, 2);
  assert.equal(o.modules[0].ects, 6);
  assert.equal(o.modules[1].term, 'unknown');
  assert.equal(o.modules[1].ects, 12);
  assert.equal(o.areas[0].nameDe, 'Praktische');
  assert.equal(o.areas[1].nameDe, undefined);
});

test('takenBefore finds the earliest earlier semester a module is planned or chosen in', () => {
  const plan = { S2027: ['A'], W2027: ['B'], S2028: ['A'] };
  assert.equal(takenBefore('A', 'W2027', { plan }), 'S2027');
  assert.equal(takenBefore('A', 'S2027', { plan }), null);
  assert.equal(takenBefore('A', 'S2028', { plan }), 'S2027');
  assert.equal(takenBefore('B', 'S2028', { plan }), 'W2027');
  assert.equal(takenBefore('C', 'S2028', { plan }), null);
  // Chosen in the week view of the current semester: taken for every later one, not for the current one.
  assert.equal(takenBefore('C', 'S2027', { plan, current: 'W2026', nowChosen: true }), 'W2026');
  assert.equal(takenBefore('C', 'W2026', { plan, current: 'W2026', nowChosen: true }), null);
  assert.equal(takenBefore('A', 'W2027', { plan, current: 'W2026', nowChosen: true }), 'W2026');
  assert.equal(takenBefore('A', null, { plan }), null);
});
