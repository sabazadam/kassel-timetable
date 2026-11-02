import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTree, parseCourseDetail, parseCourseContents, isCompleteCoursePage, parseExamDetail, parseModuleCredits, parseDate, parseGermanNumber } from '../scraper/parse.js';
import { buildCatalog, mergeModules, moduleCategories, matchesOption } from '../scraper/catalog.js';
import { CATEGORIES, CATEGORY_ALIASES, translateTitle, translateType } from '../scraper/translations.js';
import { normalizeLanguage, textLanguage, courseLanguage } from '../scraper/languages.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parseDate and parseGermanNumber', () => {
  assert.equal(parseDate('19.10.2026'), '2026-10-19');
  assert.equal(parseDate('nope'), null);
  assert.equal(parseGermanNumber('6,0'), 6);
  assert.equal(parseGermanNumber(''), null);
});

test('parseCourseDetail reads basic data and appointment series', () => {
  const c = parseCourseDetail(fixture('course-single-group.html'));
  assert.equal(c.number, 'Inform-3260-S1');
  assert.equal(c.type, 'Übung');
  assert.equal(c.groups.length, 1);
  assert.equal(c.groups[0].series.length, 7);
  assert.deepEqual(c.groups[0].series[0], {
    rhythm: 'wöchentlich',
    day: 1,
    start: '14:00',
    end: '16:00',
    startDate: '2026-10-19',
    endDate: '2027-02-08',
    cancelled: ['2026-12-21', '2026-12-28', '2027-01-04'],
    note: 'Hörsaalübung',
    instructors: ['Wiss. Mitarbeitende'],
    room: 'Raum 1603 (WA-Neubau (Emilien))',
  });
  const single = c.groups[0].series[4];
  assert.equal(single.rhythm, 'Einzeltermin');
  assert.equal(single.startDate, '2026-11-20');
  assert.equal(single.endDate, '2026-11-20');
});

test('parseCourseDetail separates parallel groups', () => {
  const c = parseCourseDetail(fixture('course-two-groups.html'));
  assert.deepEqual(c.groups.map((g) => g.name), ['1. Parallelgruppe', '2. Parallelgruppe']);
  assert.equal(c.groups[1].series[0].day, 2);
  assert.equal(c.groups[1].series[0].rhythm, '14-täglich');
  assert.equal(c.responsible, 'Prof. Dr. Elfriede Friedmann, Andrew Rinnert');
});

test('parseModuleCredits takes the Bonus column', () => {
  assert.equal(parseModuleCredits(fixture('module-credits.html'), 'Master Informatik (2018)'), 6);
});

test('parseTree and buildCatalog group courses under their module', () => {
  const nodes = parseTree(fixture('tree-subset.html'));
  assert.equal(nodes.length, 7);
  const root = nodes.find((n) => n.kind === 'Prüfungsordnung');
  const modules = buildCatalog(nodes, root.num);
  assert.deepEqual(modules, [
    {
      id: 'm17006',
      unitId: '17006',
      title: 'Berechenbarkeit und Komplexität',
      firstArea: 'Zulassung zum Master für Bewerber anderer wissenschaftlicher Hochschulen',
      areas: ['Zulassung zum Master für Bewerber anderer wissenschaftlicher Hochschulen'],
      courseIds: ['70514', '70515'],
    },
  ]);
});

test('mergeModules unions areas and courses', () => {
  const a = { id: 'm1', unitId: '1', title: 'X', areas: ['A'], courseIds: ['1'] };
  const b = { id: 'm1', unitId: '1', title: 'X', areas: ['B', 'A'], courseIds: ['2', '1'] };
  assert.deepEqual(mergeModules([a], [b]), [{ id: 'm1', unitId: '1', title: 'X', areas: ['A', 'B'], courseIds: ['1', '2'] }]);
});

test('translateTitle uses the table, patterns and English passthrough', () => {
  assert.equal(translateTitle('Berechenbarkeit und Komplexität'), 'Computability and Complexity');
  assert.equal(translateTitle('Masterseminar im Fachgebiet Kommunikationstechnik'), 'Master Seminar: Communication Technology');
  assert.equal(translateTitle('Masterprojekt im Fachgebiet Verteilte Systeme'), 'Master Project: Distributed Systems');
  assert.equal(translateTitle('Deep Learning'), 'Deep Learning');
  assert.equal(translateTitle('Unbekanntes Modul'), null);
  assert.equal(translateType('Übung'), 'Exercise');
});

test('moduleCategories maps top-level areas and aliases to the four categories', () => {
  assert.deepEqual(
    moduleCategories({ title: 'X', areas: ['Schwerpunkt > Freier Schwerpunkt', 'Theoretische Informatik'] }, CATEGORIES, CATEGORY_ALIASES),
    ['Theoretische Informatik'],
  );
  assert.deepEqual(
    moduleCategories({ title: 'X', areas: ['Ergänzungen > Wahlpflichtbereich Praktische Informatik'] }, CATEGORIES, CATEGORY_ALIASES),
    ['Praktische Informatik'],
  );
  assert.deepEqual(moduleCategories({ title: 'X', areas: ['Schwerpunkt > SE Pflicht'] }, CATEGORIES, CATEGORY_ALIASES), []);
  assert.deepEqual(moduleCategories({ title: 'Seminar', areas: ['Allgemein'] }, CATEGORIES, CATEGORY_ALIASES), ['Seminar']);
  // A module titled like an area category is not matched by title.
  assert.deepEqual(moduleCategories({ title: 'Theoretische Informatik', areas: ['Allgemein'] }, CATEGORIES, CATEGORY_ALIASES), []);
});

test('parseHandbook and mergeHandbooks read codes with English and German names', async () => {
  const { parseHandbook, mergeHandbooks, matchHandbook } = await import('../scraper/handbook.js');
  const entries = mergeHandbooks(parseHandbook(fixture('handbook-en.html')), parseHandbook(fixture('handbook-de.html')));
  assert.equal(entries.length, 80);
  assert.deepEqual(entries.find((e) => e.code === 'PI-03'), {
    code: 'PI-03',
    nameEn: 'Conceptual Data Analysis',
    nameDe: 'Begriffliche Datenanalyse',
  });
  const match = (title, titleEn, aliases) => matchHandbook({ title, titleEn }, entries, aliases)?.code ?? null;
  assert.equal(match('Begriffliche Datenanalyse', 'x'), 'PI-03');
  assert.equal(match('Paralelle Programmierung', 'Parallel Programming'), 'PI-10');
  assert.equal(match('Java Code-Camp Context Awareness 2', 'x', { 'Java Code-Camp Context Awareness 2': 'TeI-03' }), 'TeI-03');
  assert.equal(match('Schaltkreiskomplexität', 'Circuit Complexity'), null);
});

test('moduleSection picks the first category section, then area prefix, then the last section', async () => {
  const { moduleSection } = await import('../scraper/catalog.js');
  const { SECTIONS } = await import('../scraper/translations.js');
  assert.equal(moduleSection({ areas: ['Technische Informatik'], categories: ['Technische Informatik'] }, SECTIONS), 'Technische Informatik');
  assert.equal(moduleSection({ areas: ['Schwerpunkt > Freier Schwerpunkt'], categories: [] }, SECTIONS), 'main-subjects');
  assert.equal(moduleSection({ areas: ['Zulassung zum Master für Bewerber anderer wissenschaftlicher Hochschulen'], categories: [] }, SECTIONS), 'admission');
  assert.equal(moduleSection({ areas: ['Allgemein'], categories: [] }, SECTIONS), 'other');
});

test('categoryFromCode maps handbook code prefixes to requirement categories', async () => {
  const { categoryFromCode } = await import('../scraper/catalog.js');
  const { CODE_CATEGORIES } = await import('../scraper/translations.js');
  assert.equal(categoryFromCode('TeI-01', CODE_CATEGORIES), 'Technische Informatik');
  assert.equal(categoryFromCode('PI-10', CODE_CATEGORIES), 'Praktische Informatik');
  assert.equal(categoryFromCode('M/E-04', CODE_CATEGORIES), 'Vertiefung in Mathematik/Elektrotechnik');
  assert.equal(categoryFromCode('EInf-02', CODE_CATEGORIES), null);
  assert.equal(categoryFromCode(null, CODE_CATEGORIES), null);
});

test('every remark in the current data has a translation or is already English', async () => {
  const { NOTE_TRANSLATIONS, normalizeNote, looksEnglish } = await import('../scraper/notes.js');
  const dir = new URL('../site/data/', import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'programs.json');
  assert.ok(files.length > 0);
  const courses = files.flatMap((f) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')).courses);
  const notes = new Set(courses.flatMap((c) => c.groups.flatMap((g) => g.series.map((s) => s.note))).filter(Boolean));
  const missing = [...notes].filter((n) => !NOTE_TRANSLATIONS[normalizeNote(n)] && !looksEnglish(n));
  assert.deepEqual(missing, []);
  for (const tr of Object.values(NOTE_TRANSLATIONS)) assert.ok(tr.en && tr.tr);
});

test('discoverPrograms keeps the latest PO of each program', async () => {
  const { discoverPrograms } = await import('../scraper/programs.js');
  const po = (name) => ({ kind: 'Prüfungsordnung', name });
  const programs = discoverPrograms([
    po('Master Elektrotechnik (2016)'),
    po('Master Elektrotechnik (2023)'),
    { kind: 'Überschriftenelement', name: 'Master Elektrotechnik Ergänzungen' },
    po('Bachelor Informatik (2020)'),
    po('Bachelor Informatik (2018)'),
    { kind: 'Überschriftenelement', name: 'Bachelor Informatik Ergänzungen Hier finden Sie Module' },
    po('Master Some New Program (2027)'),
    po('Lehramt an Gymnasien Mathematik (2023)'),
    po('Lehramt an Gymnasien Mathematik (2014)'),
    po('Bachelor-Kombinationsprüfung Geschichte (2017) Hauptfach'),
    po('Master Literatur – Kunst – Medienkulturen (PO-2026)'),
    po('33|011|-|-|H|2023'),
    { kind: 'Überschriftenelement', name: 'Master Ökologische Landwirtschaft', path: 'title:354|title:362|title:607' },
  ]);
  assert.deepEqual(
    programs.map((p) => [p.slug, p.po, p.degree, p.supplements]),
    [
      ['msc-elektrotechnik', 'Master Elektrotechnik (2023)', 'master', 'Master Elektrotechnik Ergänzungen'],
      ['bsc-informatik', 'Bachelor Informatik (2020)', 'bachelor', 'Bachelor Informatik Ergänzungen Hier finden Sie Module'],
      ['msc-some-new-program', 'Master Some New Program (2027)', 'master', null],
      ['la-gym-mathematik', 'Lehramt an Gymnasien Mathematik (2023)', 'lehramt', null],
      ['bsc-kombi-geschichte-hauptfach', 'Bachelor-Kombinationsprüfung Geschichte (2017) Hauptfach', 'bachelor', null],
      ['msc-literatur-kunst-medienkulturen', 'Master Literatur – Kunst – Medienkulturen (PO-2026)', 'master', null],
      ['msc-oekologische-landwirtschaft', 'Master Ökologische Landwirtschaft', 'master', null],
    ],
  );
});

test('areaSections makes one section per top-level area in tree order', async () => {
  const { areaSections, moduleSection } = await import('../scraper/catalog.js');
  const modules = [
    { firstArea: 'Pflichtbereich > Grundlagen', areas: ['Pflichtbereich > Grundlagen'] },
    { firstArea: 'Wahlpflichtbereich', areas: ['Pflichtbereich', 'Wahlpflichtbereich'] },
    { firstArea: 'Pflichtbereich', areas: ['Pflichtbereich'] },
  ];
  const sections = areaSections(modules, { Pflichtbereich: 'Compulsory' });
  assert.deepEqual(sections.map((s) => [s.id, s.name, s.nameDe]), [
    ['Pflichtbereich', 'Compulsory', 'Pflichtbereich'],
    ['Wahlpflichtbereich', 'Wahlpflichtbereich', 'Wahlpflichtbereich'],
  ]);
  // "Wahlpflichtbereich" must not match a "Wahlpflicht" prefix by accident: sections match whole segments.
  assert.equal(moduleSection({ areas: ['Wahlpflichtbereich'], categories: [] }, sections), 'Wahlpflichtbereich');
});

test('parseCourseDetail keeps the end time when the time has a c.t./s.t. suffix', () => {
  const html = fixture('course-single-group.html').replace(/(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/, '$1 c.t.');
  const series = parseCourseDetail(html).groups[0].series[0];
  assert.match(series.start, /^\d{2}:\d{2}$/);
  assert.match(series.end, /^\d{2}:\d{2}$/);
});

test('attachListedCourses adds courses listed under headings, not inside modules', async () => {
  const { attachListedCourses } = await import('../scraper/catalog.js');
  const R = 'title:1|title:665';
  const nodes = [
    { kind: 'Überschriftenelement', name: 'Informatik Bachelor', path: `${R}|title:2` },
    { kind: 'Überschriftenelement', name: 'Wirtschaft', path: `${R}|title:2|title:3` },
    { kind: 'Veranstaltung', name: 'BWL', unitId: 'c1', path: `${R}|title:2|title:3|exam:1` },
    { kind: 'Veranstaltung', name: 'Known', unitId: 'c2', path: `${R}|title:2|title:3|exam:2` },
    { kind: 'Überschriftenelement', name: 'Projektmanagement', path: `${R}|title:2|title:4` },
    { kind: 'Veranstaltung', name: 'PM', unitId: 'c3', path: `${R}|title:2|title:4|exam:3` },
    { kind: 'Überschriftenelement', name: 'Modul X', path: `${R}|title:2|title:5` },
    { kind: 'Veranstaltung', name: 'In module', unitId: 'c4', path: `${R}|title:2|title:5|exam:4` },
    { kind: 'Veranstaltung', name: 'Other list', unitId: 'c5', path: `${R}|title:9|exam:5` },
  ];
  const modules = [{ id: 'm1', title: 'Wirtschaft', areas: ['Schlüsselkompetenzen'], courseIds: ['c2'] }];
  const out = attachListedCourses(modules, nodes, `${R}|title:2`, { area: 'Schlüsselkompetenzen', fallbackTitle: 'Schlüsselkompetenzen', pickOne: true });
  assert.deepEqual(out.find((m) => m.id === 'm1').courseIds, ['c2', 'c1']);
  assert.equal(out.find((m) => m.id === 'm1').pickOne, true);
  const pm = out.find((m) => m.title === 'Projektmanagement');
  assert.deepEqual([pm.id, pm.areas, pm.courseIds], ['t:Projektmanagement', ['Schlüsselkompetenzen'], ['c3']]);
  assert.equal(out.length, 2);
  assert.deepEqual(modules[0].courseIds, ['c2'], 'input is not mutated');
  // Without a sub-heading a course joins the fallback module.
  const flat = attachListedCourses([], nodes, `${R}|title:2|title:3`, { area: 'A', fallbackTitle: 'Schlüsselkompetenzen' });
  assert.deepEqual(flat.map((m) => [m.title, m.courseIds]), [['Schlüsselkompetenzen', ['c1', 'c2']]]);
});

test('splitCourseName reads number, title and type from a catalog row', async () => {
  const { splitCourseName } = await import('../scraper/parse.js');
  assert.deepEqual(splitCourseName('Inform-1360-V1 Optimierung und Verifikation von digitalen Schaltungen - Praktikum'), {
    number: 'Inform-1360-V1', title: 'Optimierung und Verifikation von digitalen Schaltungen', type: 'Praktikum',
  });
  assert.deepEqual(splitCourseName('SCM - 005 BWL I b: Leistungsprozesse, Produktion (nach PO3 II b) - Vorlesung mit Tutorium'), {
    number: null, title: 'SCM - 005 BWL I b: Leistungsprozesse, Produktion (nach PO3 II b)', type: 'Vorlesung mit Tutorium',
  });
  assert.deepEqual(splitCourseName(undefined), { number: null, title: null, type: null });
});

test('moduleCategories matches anyOf and oneOf options', async () => {
  const { moduleCategories } = await import('../scraper/catalog.js');
  const cats = [
    { id: 'spec', group: 'oneOf', options: [{ type: 'area', id: 'S > A' }] },
    { id: 'any', group: 'anyOf', options: [{ type: 'module', id: 'Lab' }] },
    { id: 'S > A', group: 'area' },
  ];
  assert.deepEqual(moduleCategories({ title: 'X', areas: ['S > A'] }, cats), ['spec', 'S > A']);
  assert.deepEqual(moduleCategories({ title: 'Lab', areas: ['Z'] }, cats), ['any']);
});

test('moduleCategories: exclude keeps a module out of one category', () => {
  const cats = [
    { id: 'Ergänzung', group: 'area' },
    { id: 'spec', group: 'oneOf', options: [{ type: 'area', id: 'SP Bau' }], exclude: ['Grundlagen Bau II'] },
  ];
  const m = { title: 'Grundlagen Bau II', areas: ['Ergänzung', 'SP Bau'] };
  assert.deepEqual(moduleCategories(m, cats), ['Ergänzung']);
  assert.deepEqual(moduleCategories({ title: 'Steuerung', areas: ['SP Bau'] }, cats), ['spec']);
});

test('matchesOption: an area option covers its sub-areas, not areas that only share a prefix', () => {
  const o = { type: 'area', id: 'Schwerpunkt E-Mobility' };
  assert.equal(matchesOption({ title: 'a', areas: ['Schwerpunkt E-Mobility > Pflichtmodule E-Mobility'] }, o), true);
  assert.equal(matchesOption({ title: 'b', areas: ['Schwerpunkt E-Mobility'] }, o), true);
  assert.equal(matchesOption({ title: 'c', areas: ['Schwerpunkt E-Mobility II'] }, o), false);
});

test('pick-one.json lists module ids, and the seminar pool from the bug report is pick-one', () => {
  const ids = JSON.parse(fs.readFileSync(new URL('../scraper/pick-one.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(ids) && ids.every((id) => typeof id === 'string' && /^(m\d+|t:.+)$/.test(id)));
  const data = JSON.parse(fs.readFileSync(new URL('../site/data/bsc-erziehungswissenschaft-mit-integrierten-nachhaltigkeitsstudien.json', import.meta.url), 'utf8'));
  const pool = data.modules.find((m) => m.title === 'Grundlagen Kulturelle Normen und Werte');
  assert.equal(pool.pickOne, true);
});

test('admission accounts keep their name and become the last section with id "admission"', async () => {
  const { areaSections, moduleSection } = await import('../scraper/catalog.js');
  const nodes = [
    { num: '1', kind: 'Prüfungsordnung', name: 'Master X (PO-2026)' },
    { num: '1.1', kind: 'Konto', name: '88/C53/H/2026 Abschluss' },
    { num: '1.1.1', kind: 'Konto', name: '88/C53/H/2026 Auflagen zur Zulassung zum Master' },
    { num: '1.1.1.1', kind: 'Modul', name: 'Digitale Logik', unitId: '9287' },
    { num: '1.1.1.1.1', kind: 'Veranstaltung', name: 'Inform-1250-V1 Digitale Logik - Vorlesung', unitId: '68914' },
    { num: '1.1.2', kind: 'Konto', name: 'Wahlpflicht' },
    { num: '1.1.2.1', kind: 'Modul', name: 'Deep Learning', unitId: '50935' },
    { num: '1.1.2.1.1', kind: 'Veranstaltung', name: 'Inform-1840-V1 Deep Learning - Vorlesung', unitId: '71817' },
  ];
  const modules = buildCatalog(nodes, '1');
  assert.deepEqual(modules.map((m) => [m.title, m.areas]), [
    ['Digitale Logik', ['Auflagen zur Zulassung zum Master']],
    ['Deep Learning', ['Wahlpflicht']],
  ]);
  const sections = areaSections(modules);
  assert.deepEqual(sections.map((s) => s.id), ['Wahlpflicht', 'admission']);
  assert.equal(moduleSection({ areas: modules[0].areas, categories: [] }, sections), 'admission');
});

test('Master Computer Science lists conditional admission modules outside every requirement', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../site/data/msc-computer-science.json', import.meta.url), 'utf8'));
  const section = data.sections.find((s) => s.id === 'admission');
  assert.ok(section, 'admission section missing');
  for (const lang of ['en', 'tr', 'de']) assert.ok(section.note?.[lang], `note in ${lang} missing`);
  const mods = data.modules.filter((m) => m.section === 'admission');
  assert.ok(mods.length >= 3);
  for (const m of mods) {
    assert.deepEqual(m.categories, []);
    assert.ok(m.courseIds.length > 0);
    assert.doesNotMatch(m.title, /^Seminare /);
  }
});

test('attachUnlisted joins a module of the same title or makes an unlisted one', async () => {
  const { attachUnlisted } = await import('../scraper/catalog.js');
  const modules = [{ id: 'm1', unitId: '1', title: 'Deep Learning', areas: ['WP'], courseIds: ['c1'] }];
  const out = attachUnlisted(modules, [
    { course: 'c2', module: 'Deep Learning', areas: ['Other'] },
    { course: 'c3', module: 'Reinforcement Learning', areas: ['WP', 'Freier Schwerpunkt'], ects: 6 },
    { course: 'c4', module: 'Reinforcement Learning', areas: ['WP', 'Extra'] },
    { course: 'c1', module: 'Something else', areas: ['X'] },
  ]);
  assert.deepEqual(out[0].courseIds, ['c1', 'c2']);
  assert.deepEqual(out[0].areas, ['WP']);
  assert.equal(out[0].unlisted, undefined);
  assert.deepEqual(out[1], { id: 't:Reinforcement Learning', unitId: null, title: 'Reinforcement Learning', firstArea: 'WP', areas: ['WP', 'Freier Schwerpunkt', 'Extra'], courseIds: ['c3', 'c4'], unlisted: true, ectsHint: 6 });
  assert.equal(out.length, 2);
  assert.deepEqual(modules[0].courseIds, ['c1'], 'input is not mutated');
});

test('parseExamDetail reads exam dates, examiners and remark lines', () => {
  const e = parseExamDetail(fixture('exam-retake.html'));
  assert.equal(e.title, 'Quantum Computing');
  assert.equal(e.number, '230003');
  assert.equal(e.kind, 'Prüfungsleistung');
  assert.deepEqual(e.remarks, ['Wiederholungsklausur', 'Labor 0642 im Fachgebiet']);
  assert.deepEqual(e.dates, [
    { day: 5, start: '14:00', end: '16:00', date: '2027-03-12', enrollFrom: null, enrollUntil: '2027-03-05', examiners: ['Prof. Dr. Jiaxin Pan'], room: '' },
  ]);
});

test('parseExamDetail keeps every examiner and an empty time', () => {
  const e = parseExamDetail(fixture('exam-two-examiners.html'));
  assert.equal(e.dates.length, 1);
  assert.deepEqual(e.dates[0].examiners, ['Prof. Dr. Gerrit Hornung', 'Prof. Dr. Dr. Walter Blocher']);
  assert.equal(e.dates[0].enrollFrom, '2026-09-23');
  assert.deepEqual(e.remarks, ['Ort: Hörsaal 5, Campus Center']);
});

test('parseCourseDetail keeps the teaching language of each parallel group', () => {
  const c = parseCourseDetail(fixture('course-group-languages.html'));
  assert.deepEqual(c.groups.map((g) => g.language), ['englisch', 'deutsch', 'deutsch', 'deutsch']);
});

test('parseCourseContents reads the sections of the Inhalte tab', () => {
  const sections = parseCourseContents(fixture('course-contents.html'));
  assert.deepEqual(sections.map((s) => s.heading), ['Inhalte', 'Zu erbringende Prüfungsleistung']);
  assert.match(sections[0].text, /^Ziel dieser Veranstaltung ist es/);
  assert.deepEqual(parseCourseContents(fixture('course-contents-empty.html')), []);
});

test('teaching language: eCampus per group, checked against the description', () => {
  assert.equal(normalizeLanguage('deutsch'), 'de');
  assert.equal(normalizeLanguage('Englisch'), 'en');
  assert.equal(normalizeLanguage('deutsch/englisch'), 'de-en');
  assert.equal(normalizeLanguage(''), null);
  const de = [{ text: 'Ziel dieser Veranstaltung ist es, die Studierenden mit der Geschichte und den Methoden vertraut zu machen.' }];
  const en = [{ text: 'In this course the students will learn how the methods of psychology are used in practice.' }];
  assert.equal(textLanguage(de[0].text), 'de');
  assert.equal(textLanguage(en[0].text), 'en');
  assert.equal(textLanguage('Projektbericht'), null);
  const groups = (...langs) => ({ groups: langs.map((language) => ({ language })) });
  assert.deepEqual(courseLanguage(groups('deutsch', 'deutsch'), de), { code: 'de', source: 'ecampus', groups: ['de', 'de'] });
  assert.deepEqual(courseLanguage(groups('englisch', 'deutsch', undefined), de), { code: 'mixed', source: 'ecampus', groups: ['en', 'de', null] });
  assert.deepEqual(courseLanguage(groups(undefined), de), { code: 'de', source: 'description', groups: ['de'] });
  assert.deepEqual(courseLanguage(groups(undefined), []), { code: null, source: null, groups: [null] });
  assert.deepEqual(courseLanguage(groups('deutsch'), en), { code: null, source: null, conflict: { ecampus: 'de', description: 'en' }, groups: [null] });
  // A course without dates keeps its language on the course itself.
  assert.deepEqual(courseLanguage({ groups: [], language: 'englisch' }, []), { code: 'en', source: 'ecampus', groups: [] });
});

test('isCompleteCoursePage spots collapsed panels so the page is fetched again', () => {
  assert.equal(isCompleteCoursePage(fixture('course-single-group.html')), true);
  // Group 2 ("Course B", English) came with its heading only.
  assert.equal(isCompleteCoursePage(fixture('course-collapsed-group.html')), false);
  assert.equal(parseCourseDetail(fixture('course-collapsed-group.html')).groups.length, 2);
});

test('detachCourses takes a course out of the named module only', async () => {
  const { detachCourses } = await import('../scraper/catalog.js');
  const modules = [
    { id: 'm1', title: 'Einführung', courseIds: ['c1', 'c2'] },
    { id: 'm2', title: 'Lineare Algebra', courseIds: ['c3', 'c2'] },
  ];
  const out = detachCourses(modules, [{ module: 'Einführung', course: 'c2' }]);
  assert.deepEqual(out[0].courseIds, ['c1']);
  assert.deepEqual(out[1].courseIds, ['c3', 'c2']);
  assert.deepEqual(modules[0].courseIds, ['c1', 'c2'], 'input is not mutated');
});

test('parseCourseDetail reads each parallel group kind from its heading', () => {
  // Programmierung und Modellierung 69657: "- Übung (1. Parallelgruppe)" and "- Tutorium (2. Parallelgruppe)".
  assert.deepEqual(parseCourseDetail(fixture('course-parts.html')).groups.map((g) => g.kind), ['Übung', 'Tutorium']);
  assert.deepEqual(parseCourseDetail(fixture('course-two-groups.html')).groups.map((g) => g.kind), [undefined, undefined]);
});
