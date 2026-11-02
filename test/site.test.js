import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectedEntries,
  findConflicts,
  seriesConflict,
  totalEcts,
  moduleComplete,
  layoutDay,
  filterModules,
  emptyState,
  categoryStatus,
  courseOptions,
  moduleVariants,
  pickCount,
  courseConfig,
  fittingVariants,
  suggestPrograms,
  weekShape,
  roomOf,
  courseNotes,
  noteDate,
  noteTime,
  mergeSingleDates,
  campusOf,
  semesterShape,
  scheduleWarnings,
  courseLanguages,
  moduleLanguages,
} from '../site/js/schedule.js';
import { buildIcs, foldLine, escapeText } from '../site/js/ics.js';

const series = (day, start, end, extra = {}) => ({
  rhythm: 'wöchentlich',
  day,
  start,
  end,
  startDate: '2026-10-19',
  endDate: '2027-02-08',
  cancelled: [],
  note: '',
  instructors: [],
  room: 'Raum 1',
  ...extra,
});

const data = {
  categories: [
    { id: 'PI', name: 'Practical Computer Science', short: 'Practical CS' },
    { id: 'TI', name: 'Theoretical Computer Science', short: 'Theoretical CS' },
    { id: 'TE', name: 'Technical Computer Science', short: 'Technical CS' },
  ],
  modules: [
    { id: 'A', title: 'Deep Learning', ects: 6, areas: ['Praktische Informatik'], categories: ['PI'], courseIds: ['a1', 'a2'] },
    { id: 'B', title: 'Kryptographie', titleEn: 'Cryptography', ects: 4, categories: ['TI'], areas: ['Theoretische Informatik'], courseIds: ['b1'] },
    { id: 'C', title: 'Projekt', ects: null, areas: ['Allgemein'], courseIds: ['a1'] },
  ],
  courses: [
    { id: 'a1', title: 'Deep Learning', type: 'Vorlesung', number: 'Inform-1840-V1', groups: [{ name: 'g', series: [series(1, '10:00', '12:00')] }] },
    {
      id: 'a2',
      title: 'Deep Learning',
      type: 'Übung',
      number: 'Inform-1840-S1',
      groups: [
        { name: '1. Parallelgruppe', series: [series(2, '08:00', '10:00'), series(3, '08:00', '10:00')] },
        { name: '2. Parallelgruppe', series: [series(4, '14:00', '16:00')] },
      ],
    },
    { id: 'b1', title: 'Kryptographie', type: 'Vorlesung', number: 'X', groups: [{ name: 'g', series: [series(1, '11:00', '13:00')] }] },
  ],
};

test('selectedEntries respects group choice and disabled series, dedupes shared courses', () => {
  const state = {
    ...emptyState(),
    modules: { A: { courses: { a2: { on: true, group: 0, off: [1] } } }, C: { courses: {} } },
  };
  const keys = selectedEntries(data, state).map((e) => e.key);
  assert.deepEqual(keys, ['a1:0:0', 'a2:0:0']);

  state.modules.A.courses.a2 = { on: true, group: 1, off: [] };
  assert.deepEqual(selectedEntries(data, state).map((e) => e.key), ['a1:0:0', 'a2:1:0']);

  state.modules.A.courses.a2.on = false;
  assert.deepEqual(selectedEntries(data, state).map((e) => e.key), ['a1:0:0']);
});

test('conflicts: overlapping times on the same day clash, touching times do not', () => {
  assert.equal(seriesConflict(series(1, '10:00', '12:00'), series(1, '11:00', '13:00')), true);
  assert.equal(seriesConflict(series(1, '10:00', '12:00'), series(1, '12:00', '14:00')), false);
  assert.equal(seriesConflict(series(1, '10:00', '12:00'), series(2, '10:00', '12:00')), false);
  const later = series(1, '10:00', '12:00', { startDate: '2027-03-01', endDate: '2027-04-01' });
  assert.equal(seriesConflict(series(1, '10:00', '12:00'), later), false);
  const byArrangement = { ...series(1, null, null), rhythm: 'nach Vereinbarung', day: null };
  assert.equal(seriesConflict(series(1, '10:00', '12:00'), byArrangement), false);

  const state = { ...emptyState(), modules: { A: { courses: {} }, B: { courses: {} } } };
  const conflicts = findConflicts(selectedEntries(data, state));
  assert.deepEqual([...conflicts].sort(), ['a1:0:0', 'b1:0:0']);
});

test('totalEcts counts modules and reports unknown credits', () => {
  const state = { ...emptyState(), modules: { A: { courses: {} }, B: { courses: {} }, C: { courses: {} } } };
  assert.deepEqual(totalEcts(data, state), { sum: 10, unknown: 1, pending: 0 });
});

test('pick-one modules add credits and cover requirements only after a course is chosen', () => {
  const P = { id: 'P', title: 'Projekt', ects: 12, areas: [], categories: ['proj'], pickOne: true, courseIds: ['a1', 'b1'] };
  const d = { ...data, categories: [{ id: 'proj' }], modules: [...data.modules, P] };
  const state = { ...emptyState(), modules: { P: { courses: {} } } };
  assert.deepEqual(totalEcts(d, state), { sum: 0, unknown: 0, pending: 1 });
  assert.equal(categoryStatus(d, state)[0].covered, false);
  state.modules.P.courses.b1 = { on: true, group: 0, off: [] };
  assert.deepEqual(totalEcts(d, state), { sum: 12, unknown: 0, pending: 0 });
  assert.equal(categoryStatus(d, state)[0].covered, true);
  // pick.count 2: one choice is not enough; fixed courses alone never are.
  const two = { ...P, pick: { count: 2, fixed: ['a1'] }, courseIds: ['a1', 'b1', 'c1'] };
  const d2 = { ...d, modules: [...data.modules, two], courses: [...data.courses, { ...data.courses.find((c) => c.id === 'b1'), id: 'c1', title: 'Andere' }] };
  const s2 = { ...emptyState(), modules: { P: { courses: { b1: { on: true, group: 0, off: [] } } } } };
  assert.equal(moduleComplete(d2, s2, two), false);
  s2.modules.P.courses.c1 = { on: true, group: 0, off: [] };
  assert.equal(moduleComplete(d2, s2, two), true);
});

test('layoutDay puts overlapping blocks side by side', () => {
  const e = (key, start, end) => ({ key, series: series(1, start, end) });
  const layout = layoutDay([e('x', '10:00', '12:00'), e('y', '11:00', '13:00'), e('z', '14:00', '15:00')]);
  assert.deepEqual(layout.get('x'), { col: 0, cols: 2 });
  assert.deepEqual(layout.get('y'), { col: 1, cols: 2 });
  assert.deepEqual(layout.get('z'), { col: 0, cols: 1 });
});

test('filterModules by text, area, type and day', () => {
  const ids = (f) => filterModules(data, f).map((m) => m.id);
  assert.deepEqual(ids({ query: 'deep' }), ['A', 'C']);
  assert.deepEqual(ids({ query: 'inform-1840 übung' }), ['A']);
  assert.deepEqual(ids({ area: 'Theoretische Informatik' }), ['B']);
  assert.deepEqual(ids({ type: 'Übung' }), ['A']);
  assert.deepEqual(ids({ day: 4 }), ['A']);
  assert.deepEqual(ids({ day: 5 }), []);
});

test('buildIcs writes recurring events with exdates in Berlin time', () => {
  const entry = {
    key: 'a1:0:0',
    module: data.modules[0],
    course: { ...data.courses[0], url: 'https://example.org/x' },
    series: series(1, '10:00', '12:00', { cancelled: ['2026-12-21'], rhythm: '14-täglich' }),
  };
  const ics = buildIcs([entry], new Date('2026-10-14T12:00:00Z'));
  const lines = ics.split('\r\n');
  assert.ok(lines.includes('DTSTART;TZID=Europe/Berlin:20261019T100000'));
  assert.ok(lines.includes('DTEND;TZID=Europe/Berlin:20261019T120000'));
  assert.ok(lines.includes('RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20270208T235959Z'));
  assert.ok(lines.includes('EXDATE;TZID=Europe/Berlin:20261221T100000'));
  assert.ok(lines.includes('DTSTAMP:20261014T120000Z'));
  assert.ok(lines.includes('SUMMARY:Deep Learning (Vorlesung)'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('ics helpers escape and fold', () => {
  assert.equal(escapeText('a,b;c\nd'), 'a\\,b\\;c\\nd');
  const long = 'DESCRIPTION:' + 'ü'.repeat(60);
  const folded = foldLine(long);
  for (const part of folded.split('\r\n')) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.split('\r\n ').join(''), long);
});

test('filterModules searches English titles and filters by category', () => {
  const ids = (f) => filterModules(data, f).map((m) => m.id);
  assert.deepEqual(ids({ query: 'cryptography' }), ['B']);
  assert.deepEqual(ids({ category: 'TI' }), ['B']);
  assert.deepEqual(ids({ category: 'TE' }), []);
});

test('categoryStatus counts selected modules and manually passed categories', () => {
  const state = { ...emptyState(), modules: { A: { courses: {} } }, doneCategories: ['TE'] };
  const status = categoryStatus(data, state);
  assert.deepEqual(
    status.map((c) => [c.id, c.covered, c.done, c.modules.map((m) => m.id)]),
    [
      ['PI', true, false, ['A']],
      ['TI', false, false, []],
      ['TE', true, true, []],
    ],
  );
});

test('pick-one modules start with no course selected', () => {
  const pick = { ...data, modules: [...data.modules, { id: 'P', title: 'Projekt', ects: 12, areas: [], pickOne: true, courseIds: ['a1', 'b1'] }] };
  const state = { ...emptyState(), modules: { P: { courses: {} } } };
  assert.deepEqual(selectedEntries(pick, state), []);
  state.modules.P.courses.b1 = { on: true, group: 0, off: [] };
  assert.deepEqual(selectedEntries(pick, state).map((e) => e.key), ['b1:0:0']);
});

test('courseOptions bundles each exercise with its lecture in pick-one modules', () => {
  const c = (id, title) => ({ id, title });
  const courses = [
    c('1', 'Grundlagen der Algebra'),
    c('2', 'Übungen zu Grundlagen der Algebra und Computeralgebra'),
    c('3', 'Numerik I'),
    c('4', 'Übungen zu Numerik I'),
    c('5', 'Diskrete Mathematik I'),
    c('6', 'Übung zu Diskrete Mathematik I (Graphentheorie) (Teil A und B)'),
    c('7', 'Computeralgebra I (nur Teil B)'),
    c('8', 'Übungen zu Computeralgebra I (Teil B)'),
    c('9', 'Übungen zu Numerik II'),
  ];
  const module = { id: 'm', pickOne: true, courseIds: ['2', '1', '3', '4', '5', '6', '7', '8', '9'] };
  assert.deepEqual(
    courseOptions(module, courses).map((o) => o.courseIds),
    [['1', '2'], ['3', '4'], ['5', '6'], ['7', '8'], ['9']],
  );
});

test('courseOptions bundles an exercise that carries the lecture title', () => {
  const courses = [
    { id: 'v2', title: 'Präsentationstechniken für MINT', type: 'Übung' },
    { id: 'v1', title: 'Präsentationstechniken für MINT', type: 'Vorlesung' },
    { id: 'x', title: 'Wissensmanagement', type: 'Seminar' },
    { id: 'u', title: 'Lonely exercise', type: 'Übung' },
  ];
  const module = { id: 'm', pickOne: true, courseIds: ['v2', 'v1', 'x', 'u'] };
  assert.deepEqual(courseOptions(module, courses).map((o) => o.courseIds), [['v1', 'v2'], ['x'], ['u']]);
});

test('moduleVariants enumerates parallel groups; fittingVariants drops variants on free days', () => {
  const A = data.modules[0];
  const variants = moduleVariants(A, data.courses);
  assert.deepEqual(variants.map((v) => v.courses.a2.group), [0, 1]);
  // Group 1 of the exercise meets Tuesday and Wednesday, group 2 Thursday.
  assert.deepEqual(fittingVariants(A, data.courses, [2]).map((v) => v.courses.a2.group), [1]);
  assert.deepEqual(fittingVariants(A, data.courses, [1]), []);
});

test('weekShape counts free weekdays and idle minutes between classes', () => {
  const shape = weekShape([series(1, '08:00', '10:00'), series(1, '12:00', '14:00'), series(3, '10:00', '12:00')]);
  assert.deepEqual(shape.freeWeekdays, [2, 4, 5]);
  assert.equal(shape.gapMinutes, 120);
});

test('suggestPrograms returns conflict-free programs that respect free days and kept modules', () => {
  const big = {
    categories: [
      { id: 'X', group: 'area' },
      { id: 'Y', group: 'area' },
    ],
    modules: [
      { id: 'k', ects: 6, categories: ['X'], courseIds: ['k1'], areas: [] },
      { id: 'p', ects: 6, categories: ['Y'], courseIds: ['p1'], areas: [] },
      { id: 'q', ects: 6, categories: ['Y'], courseIds: ['q1'], areas: [] },
      { id: 'r', ects: 6, categories: [], courseIds: ['r1'], areas: [] },
      { id: 's', ects: 6, categories: [], courseIds: ['s1'], areas: [] },
      { id: 'z', ects: 6, section: 'admission', categories: [], courseIds: ['z1'], areas: [] },
    ],
    courses: [
      { id: 'k1', title: 'K', groups: [{ name: 'g', series: [series(1, '10:00', '12:00')] }] },
      { id: 'p1', title: 'P', groups: [{ name: 'g', series: [series(1, '11:00', '13:00')] }] },
      { id: 'q1', title: 'Q', groups: [{ name: 'g', series: [series(2, '10:00', '12:00')] }] },
      { id: 'r1', title: 'R', groups: [{ name: 'g', series: [series(3, '10:00', '12:00')] }] },
      { id: 's1', title: 'S', groups: [{ name: 'g', series: [series(5, '10:00', '12:00')] }] },
      { id: 'z1', title: 'Z', groups: [{ name: 'g', series: [series(4, '10:00', '12:00')] }] },
    ],
  };
  const keep = { k: { courses: {} } };
  const programs = suggestPrograms(big, { keep, target: 18, freeDays: [5], seed: 7 });
  assert.ok(programs.length > 0);
  for (const p of programs) {
    assert.ok(p.modules.k, 'kept module stays');
    assert.ok(!p.modules.p, 'p clashes with kept k on Monday');
    assert.ok(!p.modules.s, 's meets on the free Friday');
    assert.ok(!p.modules.z, 'admission modules are skipped');
    assert.equal(findConflicts(selectedEntries(big, { modules: p.modules })).size, 0);
  }
  // Best program covers the open area Y (via q) and reaches the target exactly.
  assert.deepEqual(programs[0].added, ['q', 'r']);
  assert.equal(programs[0].ects, 18);
  assert.deepEqual(suggestPrograms(big, { keep, target: 18, freeDays: [5], seed: 7 }), programs);
});

test('suggestPrograms favors interest modules and the compact goal maximizes free weekdays', () => {
  const s = (day) => ({ name: 'g', series: [series(day, '10:00', '12:00')] });
  const mk = (id, day) => ({ id, ects: 6, categories: [], courseIds: [`${id}1`], areas: [] });
  const big = {
    categories: [],
    modules: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => mk(id)),
    courses: [
      { id: 'a1', title: 'A', groups: [s(1)] },
      { id: 'b1', title: 'B', groups: [s(1)] },
      { id: 'c1', title: 'C', groups: [s(2)] },
      { id: 'd1', title: 'D', groups: [s(3)] },
      { id: 'e1', title: 'E', groups: [s(4)] },
      { id: 'f1', title: 'F', groups: [{ name: 'g', series: [series(1, '14:00', '16:00')] }] },
    ],
  };
  const [themed] = suggestPrograms(big, { target: 12, favor: ['d', 'e'], seed: 3 });
  assert.deepEqual(themed.added, ['d', 'e']);
  // Compact: all three Monday modules fit together, so the best week has four free weekdays.
  const [compact] = suggestPrograms(big, { target: 12, goal: 'compact', seed: 3 });
  assert.deepEqual(compact.freeWeekdays, [2, 3, 4, 5]);
});

test('themes pick modules by focus area and leave out admission requirements', async () => {
  const { THEMES, themeModules } = await import('../site/js/themes.js');
  const theme = (id) => THEMES.find((t) => t.id === id);
  const d = {
    modules: [
      { id: 'dl', title: 'Deep Learning', areas: ['Schwerpunkt > CIDA Advanced Courses'] },
      { id: 'pr', title: 'Mustererkennung', titleEn: 'Pattern Recognition', areas: ['Schwerpunkt > EI Wahlpflicht Informatik'] },
      { id: 'sg', title: 'Smart Power Grids', areas: ['Schwerpunkt > EI Wahlpflicht Energietechnik/Energiewirtschaft'] },
      { id: 'll', title: 'Linear Algebra', section: 'admission', areas: ['Zulassung'] },
    ],
  };
  assert.deepEqual(themeModules(d, theme('ai')), ['dl']);
  assert.deepEqual(themeModules(d, theme('energy')), ['sg']);
  assert.deepEqual(themeModules(d, theme('compact')), []);
});

test('detectLang picks the first supported browser language, English otherwise', async () => {
  const { detectLang, translator } = await import('../site/js/i18n.js');
  assert.equal(detectLang(['de-DE', 'en']), 'de');
  assert.equal(detectLang(['fr-FR', 'tr']), 'tr');
  assert.equal(detectLang(['fr-FR']), 'en');
  assert.equal(translator('tr')('modulesSelected', { n: 3 }), '3 modül seçili');
  assert.equal(translator('xx')('add'), 'Add');
});

test('the footer says in every language that this is a free student project', async () => {
  const { translator } = await import('../site/js/i18n.js');
  for (const [lang, word] of [['tr', 'öğrenci projesi'], ['en', 'student project'], ['de', 'studentisches Projekt']]) {
    assert.ok(translator(lang)('studentProject').includes(word), lang);
  }
  const html = await (await import('node:fs/promises')).readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.match(html, /<footer class="site-foot">[\s\S]*data-i18n="studentProject"[\s\S]*href="\/impressum\/"/);
});

test('pages load no fonts or other files from Google and link the privacy page', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['../site/index.html', '../deploy/build.js', '../site/styles.css']) {
    assert.doesNotMatch(await readFile(new URL(file, import.meta.url), 'utf8'), /fonts\.(googleapis|gstatic)\.com/, file);
  }
  assert.match(await readFile(new URL('../site/index.html', import.meta.url), 'utf8'), /href="\/datenschutz\/"/);
});

test('data read from login-only pages is marked, so --public-only can leave it out', async () => {
  const { readFile } = await import('node:fs/promises');
  const corrections = JSON.parse(await readFile(new URL('../scraper/corrections.json', import.meta.url), 'utf8')).courses;
  for (const [id, e] of Object.entries(corrections)) {
    if (/Moodle/.test(e.source)) assert.equal(e.login, 'moodle', id);
  }
  const unlisted = JSON.parse(await readFile(new URL('../scraper/unlisted.json', import.meta.url), 'utf8')).programs;
  for (const e of Object.values(unlisted).flat()) {
    if (/Studienplaner/.test(e.evidence ?? '')) assert.equal(e.login, 'studienplaner', e.course);
  }
});

test('suggestPrograms reports modules without fixed times and the compact goal does not count them as free time', () => {
  const byArrangement = { ...series(1, null, null), rhythm: 'nach Vereinbarung', day: null };
  const big = {
    categories: [],
    modules: [
      { id: 'proj', ects: 6, categories: [], courseIds: ['p1'], areas: [] },
      { id: 'mon', ects: 6, categories: [], courseIds: ['m1'], areas: [] },
      { id: 'mon2', ects: 6, categories: [], courseIds: ['m2'], areas: [] },
    ],
    courses: [
      { id: 'p1', title: 'P', groups: [{ name: 'g', series: [byArrangement] }] },
      { id: 'm1', title: 'M', groups: [{ name: 'g', series: [series(1, '08:00', '10:00')] }] },
      { id: 'm2', title: 'N', groups: [{ name: 'g', series: [series(1, '10:00', '12:00')] }] },
    ],
  };
  const [best] = suggestPrograms(big, { target: 12, goal: 'compact', seed: 2 });
  assert.deepEqual(best.added, ['mon', 'mon2']);
  assert.deepEqual(best.unscheduled, []);
  const withProject = suggestPrograms(big, { target: 12, goal: 'compact', seed: 2 }).find((p) => p.added.includes('proj'));
  assert.deepEqual(withProject.unscheduled, ['proj']);
});

test('roomOf falls back to the room written in the remark', () => {
  const s = (room, note) => ({ room, note });
  assert.equal(roomOf(s('Hörsaal 1332', 'Raum 9')), 'Hörsaal 1332');
  assert.equal(roomOf(s('', 'Vorlesung, Raum 0445E im Fachgebiet')), 'Raum 0445E im Fachgebiet');
  assert.equal(roomOf(s('', 'Raum 0303c im Fachgebiet. Die Studierenden müssen sich eintragen.')), 'Raum 0303c im Fachgebiet');
  assert.equal(roomOf(s('', 'Die Veranstaltung findet im Fachgebietsraum -1523 im Gebäude 4500 statt.')), 'Fachgebietsraum -1523 im Gebäude 4500');
  assert.equal(roomOf(s('', 'Raum im Fachgebiet')), 'Raum im Fachgebiet');
  assert.equal(roomOf(s('', 'Die Anmeldung ist erforderlich')), '');
  assert.equal(roomOf(s('', 'Der erste Termin findet in Hörsaal -1319 statt, ab 27.10.2026 Raum 0303c im Fachgebiet.')), 'Raum 0303c im Fachgebiet');
  assert.equal(roomOf(s('', 'Raum 1147 im Fachgebiet Leistungselektronik von Prof. Friebe')), 'Raum 1147');
  assert.equal(roomOf(s('', 'Vorbesprechung am 22.10.2026 um 14.00 Uhr, Raum 0328.')), '');
});

test('noteDate and noteTime read German remarks', () => {
  assert.equal(noteDate('Vorbesprechung am Donnerstag, 22.10.2026 um 14.00 Uhr', 2026), '2026-10-22');
  assert.equal(noteDate('Dienstag, 20.10. um 12:00-13:00 Uhr', 2026), '2026-10-20');
  assert.equal(noteDate('Block, Vorbesprechung am 26. Oktober, 10:00 - 10:30 Uhr', 2026), '2026-10-26');
  assert.equal(noteTime('22.10.2026 um 14.00 Uhr, Raum 0328'), '14:00');
  assert.equal(noteTime('20.10. um 12:00-13:00 Uhr'), '12:00-13:00');
  assert.equal(noteTime('am 02.11.2026 von 14:45 bis 16 Uhr'), '14:45-16:00');
  assert.equal(courseNotes({ groups: [{ name: 'g', series: [{ rhythm: 'nach Vereinbarung', note: 'Die Vorbesprechung findet am 02.11.2026 von 14:45 bis 16 Uhr im Multifunktionsraum 1624 (WA) statt.' }] }] })[0].room, 'Raum 1624');
  assert.equal(noteTime('Kick-Off Meeting am 15.10.2026, 16.00 - 17.30 Uhr in Raum 1411a'), '16:00-17:30');
});

test('courseNotes finds first sessions, kick-offs and deadlines, and skips room-only remarks', () => {
  const s = (extra) => ({ rhythm: 'wöchentlich', day: 2, start: '08:15', end: '09:45', startDate: '2026-10-27', endDate: '2027-02-09', cancelled: [], note: '', instructors: [], room: '', ...extra });
  const dl = {
    groups: [
      {
        name: 'g',
        series: [
          s({ rhythm: 'Einzeltermin', startDate: '2026-10-20', endDate: '2026-10-20', end: '10:00', room: 'Hörsaal -1319' }),
          s({ note: 'Der erste Termin findet in Hörsaal -1319 statt, ab 27.10.2026 Raum 0303c im Fachgebiet.' }),
        ],
      },
    ],
  };
  assert.deepEqual(courseNotes(dl), [{ kind: 'first', date: '2026-10-20', time: '08:15-10:00', room: 'Hörsaal -1319' }]);
  const seminar = { groups: [{ name: 'g', series: [s({ rhythm: 'nach Vereinbarung', day: null, start: null, end: null, startDate: null, note: 'Vorbesprechung am Donnerstag, 22.10.2026 um 14.00 Uhr, Raum 0328. Info in Moodle' })] }] };
  const [kick] = courseNotes(seminar);
  assert.equal(kick.kind, 'kickoff');
  assert.deepEqual([kick.date, kick.time, kick.room], [`${new Date().getFullYear()}-10-22`.replace(/^\d+/, '2026'), '14:00', 'Raum 0328']);
  const opt = { groups: [{ name: 'g', series: [s({ note: 'Die Anmeldung zur Lehrveranstaltung im eCampus ist erforderlich bis zum 12.10.2026.' }), s({ note: 'Raum 0445E im Fachgebiet' })] }] };
  assert.deepEqual(courseNotes(opt).map((n) => [n.kind, n.date]), [['registration', '2026-10-12']]);
});

test('translateRoom translates room words and keeps numbers and street names', async () => {
  const { translateRoom } = await import('../site/js/i18n.js');
  assert.equal(translateRoom('Hörsaal 1332 (WA-altes Gebäude (WA 73))', 'en'), 'Lecture hall 1332 (WA old building (WA 73))');
  assert.equal(translateRoom('Raum 0303c im Fachgebiet', 'en'), 'Room 0303c (department)');
  assert.equal(translateRoom('Raum -1606 (WA-Neubau (Emilien))', 'tr'), 'Oda -1606 (WA yeni bina (Emilien))');
  assert.equal(translateRoom('Raum 1403 (Heinr.-Plett-Str.)', 'de'), 'Raum 1403 (Heinr.-Plett-Str.)');
});

test('roomOf prefers a numbered room in the remark over a bare lab mention', () => {
  assert.equal(roomOf({ room: '', note: 'Raum 2107, Labor im Fachgebiet Rechnerarchitektur und Systemprogrammierung' }), 'Raum 2107');
  assert.equal(roomOf({ room: '', note: 'Raum im Fachgebiet' }), 'Raum im Fachgebiet');
});

test('roomOf reads the room phrases lecturers write in remarks', () => {
  const room = (note) => roomOf({ room: '', note });
  assert.equal(room('Für Elektrotechniker , R. 0644 / 0645; Beginn: nach Ankündigung'), 'R. 0644 / 0645');
  assert.equal(room('R2335/R2348 im Fachgebiet'), 'R2335/R2348 im Fachgebiet');
  assert.equal(room('Findet in Mö7, R. 4223 statt'), 'Mö7, R. 4223');
  assert.equal(room('Findet in der WA71 R. 0117 statt'), 'WA71 R. 0117');
  assert.equal(room('Das Seminar findet im Seminarraum 3001, Mosenthalstr. 8 statt.'), 'Seminarraum 3001, Mosenthalstr. 8');
  assert.equal(room('Übung Seminarraum 0505 im Fachgebiet.Die Vorlesung wird als Video-Vorlesung durchgeführt'), 'Seminarraum 0505 im Fachgebiet');
  assert.equal(room('Die Veranstaltung findet im KIS-Seminarraum [Kassel Institut 3231] statt.'), 'KIS-Seminarraum [Kassel Institut 3231]');
  assert.equal(room('Hörsaal 6 (Raum 0504) (Arnold-Bode 12)'), 'Hörsaal 6 (Raum 0504) (Arnold-Bode 12)');
  assert.equal(room('Raum Incon (Moritzstr. 2)'), 'Raum Incon (Moritzstr. 2)');
  assert.equal(room('Seminarraum Soziologie'), 'Seminarraum Soziologie');
  // A course number is not a room, even next to the word "Raumbuchung".
  assert.equal(room('Raumbuchung in Soz-1700-SE'), '');
  assert.equal(room('Raum und Zeit nach Vereinbarung'), '');
  assert.equal(room('Raum 0225 (Arnold-Bode 10)'), 'Raum 0225 (Arnold-Bode 10)');
  assert.equal(room('Raum Fachgebiet'), 'Raum im Fachgebiet');
  assert.equal(room('Place: ComLab'), 'ComLab');
  assert.equal(room('1. Veranstaltung am HoPla Raum 0504, Diagonale 5, Hörsaal 3'), 'HoPla Raum 0504, Diagonale 5, Hörsaal 3');
  assert.equal(room('Der erste Termin findet in Hörsaal -1319 statt, ab 27.10.2026 Raum 0303c im Fachgebiet.'), 'Raum 0303c im Fachgebiet');
  // The class room before a kick-off clause counts; the kick-off room does not.
  assert.equal(room('R. 2315 ComLab, Kick-off meeting is on 01.02.2027 at 09.00 am'), 'R. 2315');
  assert.equal(room('Raum WA 2315 im Fachgebiet ComLab, Kick-off meeting is on 09.11.2026 at 10.00 ComLab'), 'Raum WA 2315 im Fachgebiet ComLab');
  assert.equal(room('Vorbesprechung am 22.10.2026, 14.00 Uhr, Raum 0328'), '');
  // Dates, times and course numbers are not rooms.
  assert.equal(room('Beginn am 22.10.2026 um 14:00, Inform-3310-V1'), '');
});

test('categoryStatus needs count modules for a "pick N" rule', () => {
  const d = {
    categories: [{ id: 'WP', group: 'area', count: 2 }, { id: 'Sem', group: 'module' }],
    modules: [
      { id: 'a', categories: ['WP'] },
      { id: 'b', categories: ['WP'] },
      { id: 's', categories: ['Sem'] },
    ],
  };
  const one = categoryStatus(d, { modules: { a: {}, s: {} } });
  assert.deepEqual(one.map((c) => [c.id, c.need, c.modules.length, c.covered]), [['WP', 2, 1, false], ['Sem', 1, 1, true]]);
  assert.equal(categoryStatus(d, { modules: { a: {}, b: {} } })[0].covered, true);
});

test('categoryStatus: oneOf needs all modules from one option, anyOf from any', () => {
  const cats = [
    { id: 'spec', group: 'oneOf', count: 2, options: [{ type: 'area', id: 'S > A' }, { type: 'area', id: 'S > B' }] },
    { id: 'any', group: 'anyOf', count: 2, options: [{ type: 'area', id: 'S > A' }, { type: 'module', id: 'Lab' }] },
  ];
  const d = {
    categories: cats,
    modules: [
      { id: 'a1', title: 'A1', areas: ['S > A'], categories: ['spec', 'any'] },
      { id: 'a2', title: 'A2', areas: ['S > A'], categories: ['spec', 'any'] },
      { id: 'b1', title: 'B1', areas: ['S > B'], categories: ['spec'] },
      { id: 'lab', title: 'Lab', areas: ['X'], categories: ['any'] },
    ],
  };
  const st = (sel) => categoryStatus(d, { modules: Object.fromEntries(sel.map((id) => [id, {}])) }).map((c) => c.covered);
  assert.deepEqual(st(['a1', 'b1']), [false, false]);
  assert.deepEqual(st(['a1', 'a2']), [true, true]);
  assert.deepEqual(st(['a1', 'lab']), [false, true]);
});

test('single dates: grid only for date-by-date courses, merged per weekday and time, clash by date', () => {
  const one = (date, day = 1) => ({ ...series(day, '18:00', '19:30'), rhythm: 'Einzeltermin', startDate: date, endDate: date });
  const d = {
    modules: [
      { id: 'L', courseIds: ['l1'] },
      { id: 'W', courseIds: ['w1'] },
      { id: 'X', courseIds: ['x1'] },
    ],
    courses: [
      // Lecture entered date by date (like FB 07 Wertpapiermanagement).
      { id: 'l1', groups: [{ series: [one('2026-10-19'), one('2026-11-09'), one('2026-12-05', 6)] }] },
      // Weekly Monday course in the same slot.
      { id: 'w1', groups: [{ series: [series(1, '18:00', '20:00')] }] },
      // Weekly course with an extra single date: the single date stays out of the grid.
      { id: 'x1', groups: [{ series: [series(3, '10:00', '12:00'), one('2026-11-20', 5)] }] },
    ],
  };
  const state = { ...emptyState(), modules: { L: { courses: {} }, W: { courses: {} }, X: { courses: {} } } };
  const entries = selectedEntries(d, state);
  assert.deepEqual(entries.filter((e) => e.grid).map((e) => e.key), ['l1:0:0', 'l1:0:1', 'l1:0:2', 'w1:0:0', 'x1:0:0']);
  const merged = mergeSingleDates(entries.filter((e) => e.grid));
  const lecture = merged.filter((e) => e.course.id === 'l1');
  assert.deepEqual(lecture.map((e) => e.dates), [['2026-10-19', '2026-11-09'], ['2026-12-05']]);
  assert.deepEqual([...findConflicts(entries)].sort(), ['l1:0:0', 'l1:0:1', 'w1:0:0']);
});

test('categoryStatus: credit goals, capped at what the semester offers', () => {
  const mk = (id, ects, areas = ['WP']) => ({ id, title: id, ects, areas, categories: ['wp'], courseIds: [] });
  const d = { modules: [mk('a', 10), mk('b', 10), mk('c', 3), mk('d', 5)], courses: [], categories: [{ id: 'wp', group: 'area', ects: 23 }] };
  const st = (...ids) => categoryStatus(d, { ...emptyState(), modules: Object.fromEntries(ids.map((i) => [i, { courses: {} }])) })[0];
  assert.equal(st('a', 'b').covered, false);
  assert.equal(st('a', 'b').ectsHave, 20);
  assert.equal(st('a', 'b', 'c').covered, true);
  // Only 8 ECTS offered: the goal drops to 8.
  const small = { ...d, modules: [mk('c', 3), mk('d', 5)] };
  assert.equal(categoryStatus(small, { ...emptyState(), modules: { c: { courses: {} }, d: { courses: {} } } })[0].covered, true);
});

test('campusOf reads the building in the room name', () => {
  assert.equal(campusOf('Raum 0213 (Nora-Platiel 6)'), 'hopla');
  assert.equal(campusOf('Hörsaal 0446 (WA-altes Gebäude (WA 73))'), 'wa');
  assert.equal(campusOf('Raum -1607 (WA-Neubau (Emilien))'), 'wa');
  assert.equal(campusOf('Raum 0282 (Heinr.-Plett-Str.)'), 'oberzwehren');
  assert.equal(campusOf('Raum 1 (WIZ, ehem. Kloster)'), 'witzenhausen');
  assert.equal(campusOf('Online (Virtuelles Gebäude)'), 'online');
  assert.equal(campusOf('Raum im Fachgebiet'), null);
  assert.equal(campusOf(''), null);
});

test('scheduleWarnings: campus changes, cancelled dates outside breaks, short periods, missing rooms, online', () => {
  const holiday = '2026-12-21';
  const courses = [
    { id: 'a', groups: [{ series: [series(1, '10:00', '12:00', { room: 'Raum 1 (Kurt-Wolters 5)', cancelled: [holiday, '2026-11-02'] })] }] },
    { id: 'b', groups: [{ series: [series(1, '12:15', '13:45', { room: 'Raum 2 (WA-Neubau (Emilien))' })] }] },
    { id: 'c', groups: [{ series: [series(1, '14:00', '16:00', { room: 'Raum 3 (WA-Neubau (Emilien))', startDate: '2026-11-16' })] }] },
    { id: 'd', groups: [{ series: [series(2, '10:00', '12:00', { room: '' })] }] },
    { id: 'e', groups: [{ series: [series(3, '10:00', '12:00', { room: 'Online (Virtuelles Gebäude)' })] }] },
    // Many Monday courses skip the holiday, so it is a break day and not reported.
    ...[1, 2, 3].map((i) => ({ id: `h${i}`, groups: [{ series: [series(1, '08:00', '09:00', { room: 'R (Kurt-Wolters 5)', cancelled: [holiday] })] }] })),
  ];
  const shape = semesterShape(courses);
  assert.equal(shape.start, '2026-10-19');
  assert.ok(shape.breaks.has(holiday));
  assert.ok(!shape.breaks.has('2026-11-02'));
  const d = { modules: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, courseIds: [id] })), courses };
  const state = { ...emptyState(), modules: Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((id) => [id, { courses: {} }])) };
  const w = scheduleWarnings(selectedEntries(d, state), shape);
  const kinds = w.map((x) => `${x.kind}:${x.course?.id ?? `${x.from.course.id}>${x.to.course.id}`}`);
  // b (WA) to c (WA) is the same campus; a (Holländischer Platz) to b (WA) has 15 minutes.
  assert.deepEqual(kinds, ['campus:a>b', 'cancelled:a', 'late:c', 'noRoom:d', 'online:e']);
  assert.equal(w[0].gap, 15);
  assert.deepEqual(w[1].dates, ['2026-11-02']);
});

test('roomOf: whole-remark room names, checked overrides, and the two-rooms warning', () => {
  assert.equal(roomOf({ note: 'Raum 1112, Seminarraum 3 (Moritzstr. 18 Campus Center)' }), 'Raum 1112, Seminarraum 3 (Moritzstr. 18 Campus Center)');
  assert.equal(roomOf({ note: 'Einführungstermin ist am 19.10.2026 in Labor 0329, Info über Moodle' }), '');
  assert.equal(roomOf({ note: 'Raum 4048, Kurt-Wolters-Str. 5' }), 'Raum 4048, Kurt-Wolters-Str. 5');
  const s = series(1, '10:00', '12:00', { room: 'Raum 1219 (Nora-Platiel 4)', note: 'Raum 4048, Kurt-Wolters-Str. 5' });
  const w = scheduleWarnings([{ key: 'k', course: { id: 'c' }, series: s, grid: true }], { breaks: new Set() });
  assert.deepEqual(w.map((x) => x.kind), ['roomNote']);
});

test('pick modules: fixed courses are on, the pool is chosen, variants take pick.count options', () => {
  const course = (id, title, type = 'Seminar') => ({ id, title, type, groups: [{ series: [] }] });
  const courses = [course('f', 'Orientierungskurs'), course('a', 'Proseminar A'), course('b', 'Proseminar B'), course('c', 'Proseminar C')];
  const mod = { id: 'm', pickOne: true, pick: { count: 2, fixed: ['f'] }, courseIds: ['f', 'a', 'b', 'c'] };
  const state = { modules: { m: { courses: {} } } };
  assert.equal(courseConfig(state, mod, 'f').on, true);
  assert.equal(courseConfig(state, mod, 'a').on, false);
  assert.equal(pickCount(mod), 2);
  assert.deepEqual(courseOptions(mod, courses).map((o) => o.id), ['a', 'b', 'c']);
  const sets = moduleVariants(mod, courses).map((v) => Object.keys(v.courses).sort().join(''));
  assert.deepEqual(sets, ['abf', 'acf', 'bcf']);
  const one = { id: 'n', pickOne: true, courseIds: ['a', 'b'] };
  assert.equal(pickCount(one), 1);
  assert.deepEqual(moduleVariants(one, courses).map((v) => Object.keys(v.courses).join('')), ['a', 'b']);
});

test('suggestPrograms leaves out modules whose courses have no dates this semester', () => {
  const data = {
    categories: [],
    modules: [
      { id: 'a', ects: 6, categories: [], courseIds: ['a1'], areas: [] },
      { id: 'none', ects: 6, categories: [], courseIds: ['n1'], areas: [] },
    ],
    courses: [
      { id: 'a1', title: 'A', groups: [{ name: 'g', series: [series(1, '10:00', '12:00')] }] },
      { id: 'n1', title: 'N', groups: [] },
    ],
  };
  const programs = suggestPrograms(data, { target: 12, seed: 3 });
  assert.ok(programs.length > 0);
  for (const p of programs) assert.ok(!p.modules.none);
});

test('courseNotes keeps the remark of a first session (e.g. an exam in it)', () => {
  const course = {
    groups: [
      {
        name: 'g',
        series: [
          { ...series(2, '08:15', '10:00'), rhythm: 'Einzeltermin', startDate: '2026-10-20', endDate: '2026-10-20', room: 'Hörsaal 0425', note: 'Erster Termin im Hörsaal 0425, mit Prüfung.' },
          { ...series(2, '08:15', '09:45'), startDate: '2026-10-27', endDate: '2027-02-09' },
        ],
      },
    ],
  };
  const [first] = courseNotes(course);
  assert.equal(first.kind, 'first');
  assert.equal(first.room, 'Hörsaal 0425');
  assert.equal(first.text, 'Erster Termin im Hörsaal 0425, mit Prüfung.');
});

test('language filter keeps modules with a course or group in that language', () => {
  const g = (lang) => ({ name: 'g', lang, series: [] });
  const data = {
    modules: [
      { id: 'a', title: 'A', areas: [], courseIds: ['1'] },
      { id: 'b', title: 'B', areas: [], courseIds: ['2'] },
      { id: 'c', title: 'C', areas: [], courseIds: ['3'] },
    ],
    courses: [
      { id: '1', title: 'x', lang: { code: 'mixed' }, groups: [g('en'), g('de'), g(null)] },
      { id: '2', title: 'y', lang: { code: 'de' }, groups: [g('de')] },
      { id: '3', title: 'z', lang: { code: null }, groups: [g(null)] },
    ],
  };
  const byId = new Map(data.courses.map((c) => [c.id, c]));
  assert.deepEqual(courseLanguages(data.courses[0]), { codes: new Set(['en', 'de']), unknown: true });
  assert.deepEqual(moduleLanguages(data.modules[2], byId), { codes: new Set(), unknown: true });
  assert.equal(courseLanguages({ groups: [] }), null);
  assert.deepEqual(filterModules(data, { language: 'en' }).map((m) => m.id), ['a']);
  assert.deepEqual(filterModules(data, { language: 'de' }).map((m) => m.id), ['a', 'b']);
  assert.equal(filterModules(data).length, 3);
});

test('suggestPrograms leaves out project modules and prefers popular modules', () => {
  const mk = (id) => ({ id, ects: 6, categories: [], courseIds: [`${id}1`], areas: [] });
  const big = {
    categories: [],
    modules: ['a', 'b', 'c', 'proj'].map(mk),
    courses: [
      { id: 'a1', title: 'A', type: 'Vorlesung', groups: [{ name: 'g', series: [series(1, '10:00', '12:00')] }] },
      { id: 'b1', title: 'B', type: 'Vorlesung', groups: [{ name: 'g', series: [series(2, '10:00', '12:00')] }] },
      { id: 'c1', title: 'C', type: 'Vorlesung', groups: [{ name: 'g', series: [series(3, '10:00', '12:00')] }] },
      { id: 'proj1', title: 'P', type: 'Projekt', groups: [{ name: 'g', series: [series(4, '10:00', '12:00')] }] },
    ],
  };
  const programs = suggestPrograms(big, { target: 12, popular: ['c', 'a'], seed: 3 });
  assert.ok(programs.every((p) => !p.added.includes('proj')));
  assert.deepEqual(programs[0].added, ['a', 'c']);
});

test('fixedProgram shows a hand-made plan with its own course settings', async () => {
  const { fixedProgram } = await import('../site/js/schedule.js');
  const d = {
    categories: [{ id: 'X', group: 'area' }],
    modules: [
      { id: 'a', ects: 6, categories: ['X'], courseIds: ['a1'], areas: [] },
      { id: 'b', ects: 6, categories: [], courseIds: ['b1'], areas: [] },
    ],
    courses: [
      { id: 'a1', title: 'A', groups: [{ name: 'g', series: [series(1, '10:00', '12:00'), series(2, '10:00', '12:00')] }] },
      { id: 'b1', title: 'B', groups: [{ name: 'g', series: [series(3, '10:00', '12:00')] }] },
    ],
  };
  const p = fixedProgram(d, { a: { courses: { a1: { on: true, group: 0, off: [1] } } }, b: {}, gone: {} }, { favor: ['a'] });
  assert.deepEqual(p.added, ['a', 'b']);
  assert.equal(p.ects, 12);
  assert.deepEqual(p.newlyCovered, ['X']);
  assert.equal(p.favoredCount, 1);
  assert.deepEqual(p.freeWeekdays, [2, 4, 5]);
});
