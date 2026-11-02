// Scrapes the Uni Kassel course catalog (HISinOne) for the study programs of FB 16 (latest PO of
// each Bachelor and Master program) and writes site/data/<program>.json plus site/data/programs.json.
//
// Usage: npm run scrape                       (uses cached pages in scraper/.cache when present)
//        npm run scrape -- --fresh            (ignores the cache)
//        npm run scrape -- --only=msc-informatik,bsc-informatik
//        npm run scrape -- --list               (only lists the programs found in the catalog)
//        npm run scrape -- --public-only        (leaves out what was read from login-only pages)
// Moodle course per eCampus course (id and whether an enrolment key is needed): scraper/moodle.json,
// made from the Moodle course search (matched with Grok); eCampus does not link most of them.
// Modules whose courses are alternatives (a pool of seminars, one is taken): scraper/pick-one.json,
// module ids classified with Grok; eCampus lists such pools like modules whose courses are all taken.
// scraper/module-rules.json refines that from the module handbooks: { moduleId: { count, fixed: [courseId] } }
// (count options from the pool next to fixed courses), { all: true } for a module whose courses are all taken,
// or { unverified: true } when the handbook did not settle it (the pool classification stays, with a warning).
// scraper/themes.json: ready-made program themes per program slug, made from the handbooks with Grok.
// scraper/popular.json: module ids per program slug, most popular first, for the ready-made programs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { Session, formFields } from './http.js';
import { parseTree, parentNum, parseCourseDetail, parseCourseContents, isCompleteCoursePage, parseExamDetail, parseModuleCredits, splitCourseName } from './parse.js';
import { buildCatalog, mergeModules, moduleCategories, moduleSection, categoryFromCode, areaSections, attachListedCourses, attachUnlisted, detachCourses, applyCorrections, mergeCourseParts, applyGroupParts } from './catalog.js';
import { parseHandbook, mergeHandbooks, matchHandbook } from './handbook.js';
import { loadOfferings } from './offerings.js';
import { NOTE_TRANSLATIONS, normalizeNote, looksEnglish } from './notes.js';
import { discoverPrograms, FACULTIES_EN } from './programs.js';
import { courseLanguage } from './languages.js';
import { addGermanToFiles, isGermanModule } from './german.js';
import { semesterShape } from '../site/js/schedule.js';
import { CATEGORIES, CATEGORY_ALIASES, CODE_CATEGORIES, PICK_ONE_MODULES, SECTIONS, HANDBOOK_ALIASES, translateTitle, translateArea, translateType } from './translations.js';

const PERIOD = { id: 720, label: 'Wintersemester 2026/27' };
const CATALOG_ROOT = 'title:354'; // Vorlesungsverzeichnis
const FACULTY_PATH = 'title:354|title:365'; // Vorlesungsverzeichnis > FB 16 Elektrotechnik / Informatik
// The faculty's key competency lists ("Schlüsselkompetenzen" heading): many of these courses (FB 07 and
// others) are attached to no PO tree. Sub-heading per program.
const KEY_COMPETENCIES = {
  'bsc-elektrotechnik': 'Elektrotechnik / Nachhaltige elektrotechnische Systeme',
  'bsc-nachhaltige-et-systeme': 'Elektrotechnik / Nachhaltige elektrotechnische Systeme',
  'bsc-informatik': 'Informatik Bachelor',
  'msc-informatik': 'Informatik Master',
};

// Requirement categories, list sections and pick-one modules exist only for Master Informatik (from its
// PO and module handbook). The other programs are grouped by the top-level areas of their eCampus tree.
const PROGRAM_RULES = {
  'msc-informatik': {
    categories: CATEGORIES,
    categoryAliases: CATEGORY_ALIASES,
    codeCategories: CODE_CATEGORIES,
    pickOne: PICK_ONE_MODULES,
    sections: SECTIONS,
    handbookAliases: HANDBOOK_ALIASES,
    themes: true,
    // Sanity floor for an unattended run; WiSe 2026/27 has 42 modules and 90 courses.
    minModules: 20,
    minCourses: 40,
  },
  // Master Computer Science (PO-2026), the successor of Master Informatik: rules from scraper/rules,
  // ready-made programs like Master Informatik. WiSe 2026/27 has 30 modules and 64 courses.
  'msc-computer-science': {
    themes: true,
    // Exam dates (Prüfung / Studienleistung pages of the PO tree), shown in their own panel.
    exams: true,
    minModules: 15,
    minCourses: 30,
  },
};

// Conditional admission (Auflagen): Master Computer Science (PO-2026) section 6 lets the examination board admit
// applicants on condition that they pass qualification modules modelled on Bachelor Informatik modules (up to
// 30 credits) before registering the thesis. The PO-2026 account in eCampus lists no modules yet, so while it is
// empty the list comes from the same account of the predecessor, Master Informatik (2018). The 2018 list also
// holds master seminars, which are regular CS modules, so they are left out.
const CONDITIONAL_ADMISSION = {
  'msc-computer-science': {
    from: { slug: 'msc-informatik', po: 'Master Informatik (2018)' },
    account: 'Zulassung zum Master für Bewerber anderer wissenschaftlicher Hochschulen',
    area: 'Auflagen zur Zulassung zum Master für Bewerber anderer wissenschaftlicher Hochschulen',
    skip: /^Seminare /,
    note: {
      en: 'For students with conditional admission. PO 2026 section 6: the examination board can admit you on condition that you pass qualification modules based on Bachelor Informatik modules (up to 30 credits) before you register your thesis. Your admission letter names your modules. eCampus lists no modules for the 2026 PO yet, so this is the list eCampus shows for Master Informatik (2018). These modules do not count toward the 120 credits.',
      tr: 'Şartlı kabul (conditional admission) alan öğrenciler için. PO 2026 madde 6: sınav kurulu, tez kaydından önce Bachelor Informatik modüllerine dayanan yeterlilik modüllerini (en fazla 30 kredi) geçmen şartıyla kabul verebilir. Hangi modülleri alman gerektiği kabul mektubunda yazar. eCampus 2026 PO için henüz modül listelemiyor; bu liste eCampus\'un Master Informatik (2018) için gösterdiği listedir. Bu modüller 120 krediye sayılmaz.',
      de: 'Für Studierende mit Zulassung unter Auflagen. PO 2026 § 6: Der Prüfungsausschuss kann die Zulassung unter der Auflage aussprechen, dass bis zur Anmeldung der Masterarbeit Qualifikationsmodule nach dem Vorbild des Bachelor Informatik (bis zu 30 Credits) bestanden werden. Welche Module es sind, steht im Zulassungsbescheid. Für die PO 2026 sind in eCampus noch keine Module hinterlegt; dies ist die Liste, die eCampus für den Master Informatik (2018) zeigt. Diese Module zählen nicht zu den 120 Credits.',
    },
  },
};

const here = path.dirname(fileURLToPath(import.meta.url));

// Selection rules of the other programs, taken from their module handbooks and POs (scraper/rules/<slug>.json):
// requirement categories ("pick N modules from this area" or "take this module") and pick-one modules.
// Turkish and German versions of the rule texts: scraper/rules-i18n.json (English text -> { tr, de }).
async function loadRules(slug) {
  try {
    const r = JSON.parse(await fs.readFile(path.join(here, 'rules', `${slug}.json`), 'utf8'));
    const i18n = JSON.parse(await fs.readFile(path.join(here, 'rules-i18n.json'), 'utf8'));
    const categories = (r.categories ?? []).map((c) => ({
      ...c,
      nameTr: i18n[c.name]?.tr ?? null,
      ...(c.note ? { noteTr: i18n[c.note]?.tr ?? null, noteDe: i18n[c.note]?.de ?? null } : {}),
    }));
    const summary = r.summary ? { en: r.summary, tr: i18n[r.summary]?.tr ?? null, de: i18n[r.summary]?.de ?? null } : null;
    return { categories, pickOne: r.pickOne ?? [], summary, sources: r.sources ?? [] };
  } catch {
    return {};
  }
}
const DATA = path.join(here, '..', 'site', 'data');
const CACHE = path.join(here, '.cache');
const fresh = process.argv.includes('--fresh');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
// unlisted.json and corrections.json mark entries read from pages behind a university login ("login": "moodle",
// "studienplaner"); --public-only drops them, so the site shows only what public pages say.
const publicOnly = process.argv.includes('--public-only');
const isPublic = (entry) => !publicOnly || !entry?.login;

const session = new Session({ delayMs: 300 });

// Programs whose courses get a checked teaching language (one more page per course: the "Inhalte" tab).
const LANGUAGE_CHECK = new Set(['bsc-psychologie']);

const catalogUrl = (p) =>
  `/qisserver/pages/startFlow.xhtml?_flowId=showCourseCatalog-flow&periodId=${PERIOD.id}&path=${encodeURIComponent(p)}`;
const detailUrl = (unitId) =>
  `/qisserver/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=${unitId}&periodId=${PERIOD.id}&navigationPosition=courseoverviewShow`;

// Pages fetched in this run: with --fresh each page is downloaded once even when several programs share it.
const fetchedNow = new Set();
async function cached(key, fetcher) {
  const file = path.join(CACHE, `${key}.html`);
  if (!fresh || fetchedNow.has(key)) {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {}
  }
  const html = await fetcher();
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, html);
  fetchedNow.add(key);
  return html;
}

const facultyPage = () => cached(`faculty-${PERIOD.id}`, () => fetchCatalogPage(FACULTY_PATH));

// Opens the faculty node and clicks "expand subtree" on the program, which returns the full subtree.
async function fetchProgramTree(program) {
  return cached(`tree-${PERIOD.id}-${program.slug}`, async () => {
    // eCampus now and then answers with a page without the catalog; try again before giving up.
    for (let attempt = 1; ; attempt++) {
      // The parent page lists the PO; a few POs are missing there but have their own permalink page.
      const where = attempt === 1 || !program.path ? program.parentPath ?? FACULTY_PATH : program.path;
      const { html } = await session.get(catalogUrl(where));
      const $ = load(html);
      // PO rows have an "expand subtree" button, and so do program headings (FB 11).
      const button = $('button[id$="expandAllPoElement_button"], button[id$="expandAllTitle_button"]')
        // Titles sometimes carry double spaces ("Wirtschaft  (2023)"); row names are already collapsed.
        .filter((i, b) => ($(b).attr('title') ?? '').replace(/\s+/g, ' ').includes(`'${program.po}'`))
        .first();
      if (button.length) {
        const { action, fields } = formFields($, 'hierarchy');
        fields.push([button.attr('name'), '']);
        return (await session.post(action, fields)).html;
      }
      if (attempt === 3) throw new Error(`Program "${program.po}" not found in the catalog`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  });
}

// A program listed as a heading (FB 11, some FB 02/05 masters): expanding the heading opens one level
// only, so each account (Konto) and module below it is expanded with its own button. The pages are
// cached together, separated by PAGE_BREAK.
const PAGE_BREAK = '\n<!-- next page -->\n';
async function fetchHeadingTree(program) {
  const html = await cached(`tree-${PERIOD.id}-${program.slug}`, async () => {
    const page = await fetchCatalogPage(program.path);
    const pages = [page];
    const names = load(page)('button[id$="expandAllPoElement_button"]').map((i, b) => load(page)(b).attr('title')).get();
    for (const title of names) {
      const { html } = await session.get(catalogUrl(program.path));
      const $ = load(html);
      const button = $('button[id$="expandAllPoElement_button"]').filter((i, b) => $(b).attr('title') === title).first();
      if (!button.length) continue;
      const { action, fields } = formFields($, 'hierarchy');
      fields.push([button.attr('name'), '']);
      pages.push((await session.post(action, fields)).html);
    }
    return pages.join(PAGE_BREAK);
  });
  // Same row in several pages: keep the first; rows are numbered by position in the tree, so they agree.
  const rows = new Map();
  for (const part of html.split(PAGE_BREAK)) for (const n of parseTree(part)) if (!rows.has(n.num)) rows.set(n.num, n);
  return [...rows.values()];
}

// A catalog page without tree rows is an eCampus hiccup (it happens under load); such a page is never cached,
// otherwise every program below it would silently drop out of the site.
async function fetchCatalogPage(p) {
  for (let attempt = 1; ; attempt++) {
    const { html } = await session.get(catalogUrl(p));
    if (parseTree(html).length) return html;
    if (attempt === 4) throw new Error(`Catalog page ${p} has no tree rows after ${attempt} attempts`);
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
}

// Nodes without an "expand subtree" button (plain headings) are crawled through their permalinks.
// headingsOnly: descend through headings only (not into POs, modules or courses).
async function crawlPermalinks(startPath, { headingsOnly = false } = {}) {
  const seen = new Map();
  const queue = [startPath];
  while (queue.length) {
    const p = queue.shift();
    const html = await cached(`path-${PERIOD.id}-${p.replace(/[^a-z0-9]+/gi, '_')}`, () => fetchCatalogPage(p));
    for (const n of parseTree(html)) {
      if (!n.path || seen.has(n.path)) continue;
      seen.set(n.path, n);
      const isChild = n.path.startsWith(p + '|') && n.path.split('|').length === p.split('|').length + 1;
      if (isChild && (headingsOnly ? n.kind === 'Überschriftenelement' : n.kind !== 'Veranstaltung')) queue.push(n.path);
    }
  }
  return [...seen.values()];
}

// Every faculty of the catalog ("FB 01 ..." to "FB 16 ...", Kunsthochschule) and the headings below it,
// down to the examination regulations (POs). Cross-faculty lists (Bibliothek, Kernstudium, ...) hold no POs.
async function crawlCatalog() {
  const top = parseTree(await cached(`path-${PERIOD.id}-${CATALOG_ROOT.replace(/[^a-z0-9]+/gi, '_')}`, () => fetchCatalogPage(CATALOG_ROOT)));
  const faculties = Object.fromEntries(
    top
      .filter((n) => n.kind === 'Überschriftenelement' && n.path?.split('|').length === 2 && /^(FB \d+|KHK) /.test(n.name))
      .map((n) => [n.path, n.name.replace(/^KHK Kunsthochschule Kassel.*/, 'Kunsthochschule Kassel')]),
  );
  const nodes = [];
  for (const path of Object.keys(faculties)) {
    process.stdout.write(`\rCatalog: ${faculties[path]}`.padEnd(70));
    nodes.push(...(await crawlPermalinks(path, { headingsOnly: true })));
  }
  process.stdout.write('\n');
  return { nodes, faculties };
}

async function fetchModulePage(unitId) {
  return cached(`module-${PERIOD.id}-${unitId}`, async () => {
    const { html } = await session.get(detailUrl(unitId));
    const $ = load(html);
    const { action, fields } = formFields($, 'detailViewData');
    const tab = 'detailViewData:tabContainer:term-planning-container:tabs:unitRelationDataTab';
    fields.push([tab, ''], ['detailViewData:_idcl', tab], ['DISABLE_VALIDATION', 'true']);
    return (await session.post(action, fields)).html;
  });
}

const courseCache = new Map();
async function fetchCourse(unitId) {
  if (!courseCache.has(unitId)) {
    // eCampus sometimes serves a session collapsed panels (no title, or a parallel group without its
    // appointments); a new session gets the full page. FB 07 pages never have a title, so give up after three tries.
    const html = await cached(`course-${PERIOD.id}-${unitId}`, async () => {
      for (let attempt = 1; ; attempt++) {
        const { html } = await (attempt === 1 ? session : new Session({ delayMs: 300 })).get(detailUrl(unitId));
        if (isCompleteCoursePage(html) || attempt === 3) return html;
      }
    });
    courseCache.set(unitId, parseCourseDetail(html));
  }
  return courseCache.get(unitId);
}

async function fetchContents(unitId) {
  return parseCourseContents(
    await cached(`contents-${PERIOD.id}-${unitId}`, async () => {
      const { html } = await session.get(detailUrl(unitId));
      const { action, fields } = formFields(load(html), 'detailViewData');
      const tab = 'detailViewData:tabContainer:term-planning-container:tabs:contentsTab';
      fields.push([tab, ''], ['detailViewData:_idcl', tab], ['DISABLE_VALIDATION', 'true']);
      return (await session.post(action, fields)).html;
    }),
  );
}

async function fetchExam(unitId) {
  return parseExamDetail(await cached(`exam-${PERIOD.id}-${unitId}`, async () => (await session.get(detailUrl(unitId))).html));
}

// Exams and coursework of the PO tree that have a date this semester, with the module they belong to.
// Modules without any course this semester (only a retake exam, say) are not in the module list,
// so the exam keeps the module title itself.
async function scrapeExams(treeNodes, root) {
  const byNum = new Map(treeNodes.map((n) => [n.num, n]));
  const moduleOf = (n) => {
    for (let num = parentNum(n.num); num; num = parentNum(num)) {
      const p = byNum.get(num);
      if (p?.kind === 'Modul') return p;
    }
    return null;
  };
  const seen = new Set();
  const exams = [];
  for (const n of treeNodes) {
    if (!['Prüfung', 'Studienleistung'].includes(n.kind) || !n.unitId || !n.num.startsWith(root.num + '.') || seen.has(n.unitId)) continue;
    seen.add(n.unitId);
    try {
      const e = await fetchExam(n.unitId);
      if (!e.dates.length) continue;
      const mod = moduleOf(n);
      exams.push({
        id: n.unitId,
        kind: n.kind === 'Studienleistung' ? 'coursework' : 'exam',
        title: e.title ?? n.name,
        number: e.number,
        moduleId: mod?.unitId ? `m${mod.unitId}` : null,
        moduleTitle: mod?.name ?? e.title ?? n.name,
        remarks: e.remarks,
        dates: e.dates,
        url: `https://ecampus.uni-kassel.de${detailUrl(n.unitId)}`,
      });
    } catch (err) {
      console.warn(`\nExam ${n.unitId} failed: ${err.message}`);
    }
  }
  return exams.sort((a, b) => a.dates[0].date.localeCompare(b.dates[0].date));
}

async function fetchHandbook(url, key) {
  const page = async (lang) =>
    cached(`handbook-${key}-${lang}`, async () => {
      const res = await fetch(lang === 'en' ? `${url}&en=1` : url);
      if (!res.ok) throw new Error(`Handbook ${lang} -> ${res.status}`);
      return res.text();
    });
  return mergeHandbooks(parseHandbook(await page('en')), parseHandbook(await page('de')));
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

const looksGerman = (s) => !s || /[äöüß]|\b(und|der|die|das|des|für|im|von|zur?)\b/i.test(s);
const untranslated = new Set();
const untranslatedNotes = new Set();

async function scrapeProgram(program) {
  // Hand-made settings (Master Informatik) replace the rules file; others add to it (themes, sanity floor).
  const rules = PROGRAM_RULES[program.slug]?.categories ? PROGRAM_RULES[program.slug] : { ...(await loadRules(program.slug)), ...PROGRAM_RULES[program.slug] };
  console.log(`\n${program.po} -> ${program.slug}`);
  const treeNodes = program.heading ? await fetchHeadingTree(program) : parseTree(await fetchProgramTree(program));
  const root = treeNodes.find((n) => n.name === program.po && n.kind === (program.heading ? 'Überschriftenelement' : 'Prüfungsordnung'));
  if (!root) throw new Error('Program root row missing from expanded tree');
  let modules = buildCatalog(treeNodes, root.num);
  // Courses the tree lists outside any module (e.g. all seminars of an FB 11 program) become modules of their own.
  if (root.path) modules = attachListedCourses(modules, treeNodes, root.path, { area: 'Allgemein', perCourse: true });
  const listed = [...treeNodes];

  const supplementRoot = program.supplements && treeNodes.find((n) => n.name === program.supplements);
  if (supplementRoot?.path) {
    const supNodes = await crawlPermalinks(supplementRoot.path);
    listed.push(...supNodes);
    modules = mergeModules(modules, buildCatalog(supNodes, supplementRoot.num, { rootLabel: 'Ergänzungen' }));
    modules = attachListedCourses(modules, supNodes, supplementRoot.path, { area: 'Ergänzungen', fallbackTitle: 'Ergänzungen' });
  }
  const keyHeading = KEY_COMPETENCIES[program.slug];
  if (keyHeading) {
    const facultyNodes = parseTree(await facultyPage());
    const keyRoot = facultyNodes.find((n) => n.kind === 'Überschriftenelement' && n.name.startsWith('Schlüsselkompetenzen '));
    const keyNodes = keyRoot?.path ? await crawlPermalinks(keyRoot.path) : [];
    listed.push(...keyNodes);
    const sub = keyNodes.find((n) => n.name === keyHeading && n.path?.startsWith(keyRoot.path + '|'));
    if (!sub) throw new Error(`Key competency list "${keyHeading}" not found`);
    // Courses without a sub-heading join the program's own key competency module.
    const own = modules.find((m) => m.title.startsWith('Schlüsselkompetenzen'));
    modules = attachListedCourses(modules, keyNodes, sub.path, { area: own?.areas[0] ?? 'Schlüsselkompetenzen', fallbackTitle: own?.title ?? 'Schlüsselkompetenzen', pickOne: true });
  }
  const admission = CONDITIONAL_ADMISSION[program.slug];
  if (admission && !modules.some((m) => m.areas.some((a) => a.startsWith(admission.area)))) {
    const fromNodes = parseTree(await fetchProgramTree({ ...admission.from, parentPath: program.parentPath }));
    const fromRoot = fromNodes.find((n) => n.name === admission.from.po && n.kind === 'Prüfungsordnung');
    const account = fromRoot && fromNodes.find((n) => n.kind === 'Konto' && n.name === admission.account && n.num.startsWith(fromRoot.num + '.'));
    if (!account) throw new Error(`Admission account "${admission.account}" not found in ${admission.from.po}`);
    listed.push(...fromNodes);
    const extra = buildCatalog(fromNodes, account.num, { rootLabel: admission.area })
      .filter((m) => !admission.skip.test(m.title))
      .map((m) => ({ ...m, creditPo: admission.from.po }));
    console.log(`Conditional admission modules from ${admission.from.po}: ${extra.length}`);
    modules = mergeModules(modules, extra);
  }
  // Courses eCampus attaches to no program, placed from the module handbooks (scraper/unlisted.json).
  const unlistedFile = await readJson(path.join(here, 'unlisted.json'));
  const unlisted = (unlistedFile?.programs?.[program.slug] ?? []).filter(isPublic);
  if (unlisted.length) modules = attachUnlisted(modules, unlisted);
  // Courses eCampus attaches to a wrong module of this program (unlisted.json "detach").
  const detach = unlistedFile?.detach?.[program.slug] ?? [];
  if (detach.length) modules = detachCourses(modules, detach);
  const unlistedRows = new Map(unlisted.map((e) => [e.course, e]));
  console.log(`Modules with courses: ${modules.length}`);

  const tree = new Map(listed.filter((n) => n.unitId).map((n) => [n.unitId, n]));
  const courseIds = [...new Set(modules.flatMap((m) => m.courseIds))];
  const groupParts = (await readJson(path.join(here, 'group-parts.json')))?.courses ?? {};
  const courses = [];
  let i = 0;
  for (const id of courseIds) {
    i++;
    process.stdout.write(`\rCourses ${i}/${courseIds.length}`);
    try {
      const detail = await fetchCourse(id);
      // Some pages (e.g. FB 07 courses) leave out title, number and type; the catalog row has them.
      const row = tree.has(id) ? splitCourseName(tree.get(id).name) : (unlistedRows.get(id) ?? {});
      const course = { id, ...detail, title: detail.title ?? row.title ?? id, number: detail.number ?? row.number, type: detail.type ?? row.type, url: `https://ecampus.uni-kassel.de${detailUrl(id)}` };
      // Parallel groups that are parts of one course: hand-checked structure first, then the heading rule.
      const parts = groupParts[id] ? applyGroupParts(course, groupParts[id]) : null;
      if (groupParts[id] && !parts) console.warn(`\ngroup-parts.json: course ${id} has ${course.groups.length} groups, expected ${groupParts[id].groups}; left as alternatives`);
      courses.push(parts ?? mergeCourseParts(course));
    } catch (err) {
      console.warn(`\nCourse ${id} failed: ${err.message}`);
    }
  }
  process.stdout.write('\n');

  if (LANGUAGE_CHECK.has(program.slug)) {
    i = 0;
    for (const c of courses) {
      i++;
      process.stdout.write(`\rTeaching language ${i}/${courses.length}`);
      try {
        const { groups, ...lang } = courseLanguage(c, await fetchContents(c.id));
        c.lang = lang;
        c.groups.forEach((g, k) => (g.lang = groups[k]));
      } catch (err) {
        console.warn(`\nContents of course ${c.id} failed: ${err.message}`);
      }
    }
    process.stdout.write('\n');
    const counts = {};
    for (const c of courses) counts[c.lang?.code ?? 'unknown'] = (counts[c.lang?.code ?? 'unknown'] ?? 0) + 1;
    console.log(`Teaching languages: ${JSON.stringify(counts)}`);
  }

  i = 0;
  for (const m of modules) {
    i++;
    process.stdout.write(`\rModule credits ${i}/${modules.length}`);
    m.ects = m.ectsHint ?? null;
    if (!m.unitId) continue;
    try {
      const page = await fetchModulePage(m.unitId);
      // Modules borrowed from an older PO (conditional admission) carry their credits under that PO.
      m.ects = parseModuleCredits(page, m.creditPo ?? program.po);
    } catch (err) {
      console.warn(`\nModule ${m.unitId} failed: ${err.message}`);
    }
  }
  process.stdout.write('\n');

  const exams = rules.exams && !program.heading ? await scrapeExams(treeNodes, root) : [];
  if (rules.exams) console.log(`Exams with dates: ${exams.length}`);

  const known = new Set(courses.map((c) => c.id));
  // Remark translations keyed by the exact remark text in the data; missing ones are logged at the end.
  // Hand corrections (scraper/corrections.json) for what eCampus has wrong or not yet, e.g. a moved first session.
  const corrections = Object.fromEntries(Object.entries((await readJson(path.join(here, 'corrections.json')))?.courses ?? {}).filter(([, v]) => isPublic(v)));
  for (const w of applyCorrections(courses, corrections)) console.warn(w);
  const noteTranslations = {};
  for (const c of courses) {
    for (const s of c.groups.flatMap((g) => g.series)) {
      if (!s.note || noteTranslations[s.note]) continue;
      const tr = NOTE_TRANSLATIONS[normalizeNote(s.note)];
      if (tr) noteTranslations[s.note] = tr;
      else if (!looksEnglish(s.note)) untranslatedNotes.add(s.note);
    }
  }
  for (const note of exams.flatMap((e) => e.remarks)) {
    if (noteTranslations[note]) continue;
    const tr = NOTE_TRANSLATIONS[normalizeNote(note)];
    if (tr) noteTranslations[note] = tr;
    else if (!looksEnglish(note)) untranslatedNotes.add(note);
  }
  const english = (title) => {
    const en = translateTitle(title);
    if (!en) untranslated.add(title);
    return en ?? title;
  };
  const moodle = await readJson(path.join(here, 'moodle.json')) ?? {};
  const pickOneIds = new Set(await readJson(path.join(here, 'pick-one.json')) ?? []);
  const moduleRules = await readJson(path.join(here, 'module-rules.json')) ?? {};
  const ownThemes = (await readJson(path.join(here, 'themes.json')) ?? {})[program.slug];
  // Module ids by popularity, most popular first (hand-made; ready-made programs prefer them).
  const popular = (await readJson(path.join(here, 'popular.json')) ?? {})[program.slug];
  for (const c of courses) {
    if (moodle[c.id]) c.moodle = moodle[c.id];
    c.titleEn = english(c.title);
    c.typeEn = translateType(c.type) ?? c.type;
    for (const s of c.groups.flatMap((g) => g.series)) if (s.part) s.partEn = translateType(s.part) ?? s.part;
    if (!translateType(c.type) && c.type) untranslated.add(c.type);
  }
  const segments = new Set(modules.flatMap((m) => m.areas.flatMap((a) => a.split(' > '))));
  const labels = {};
  for (const seg of segments) {
    labels[seg] = translateArea(seg) ?? seg;
    if (!translateArea(seg)) untranslated.add(seg);
  }
  let handbook = [];
  if (program.handbookUrl) {
    try {
      handbook = await fetchHandbook(program.handbookUrl, program.slug);
    } catch (err) {
      console.warn(`Module handbook unavailable, continuing without codes: ${err.message}`);
    }
  }
  const categories = rules.categories ?? [];
  const sections = rules.sections ?? areaSections(modules, labels);
  const moduleIds = new Set(modules.map((m) => m.id));
  // Hand-made pick-one titles win; then the handbook rule; then the Grok pool classification.
  const pickRule = (id, title, pickOne, ids) => {
    if (pickOne || (rules.pickOne ?? []).includes(title)) return { pickOne: true };
    const r = moduleRules[id];
    if (r?.all) return { pickOne: false };
    if (r?.unverified) return pickOneIds.has(id) ? { pickOne: true, pick: { count: 1, fixed: [], unverified: true } } : { pickOne: false };
    if (r) {
      const fixed = (r.fixed ?? []).filter((c) => ids.includes(c));
      return r.count > 1 || fixed.length ? { pickOne: true, pick: { count: r.count, fixed } } : { pickOne: true };
    }
    return { pickOne: pickOneIds.has(id) };
  };
  const data = {
    generatedAt: new Date().toISOString(),
    period: PERIOD.label,
    program: program.po,
    programEn: program.year ? `${program.nameEn} (${program.year})` : program.nameEn,
    slug: program.slug,
    degree: program.degree,
    themes: ownThemes?.length ? ownThemes.map((th) => ({ ...th, modules: th.modules.filter((id) => moduleIds.has(id)) })).filter((th) => th.modules.length >= 2) : Boolean(rules.themes),
    ...(popular ? { popular: popular.filter((id) => moduleIds.has(id)) } : {}),
    categories,
    rulesSummary: rules.summary ?? null,
    rulesSources: rules.sources ?? [],
    sections: sections.map(({ id, name, nameDe }) => ({ id, name, ...(nameDe ? { nameDe } : {}), ...(id === 'admission' && admission ? { note: admission.note } : {}) })),
    handbookUrl: program.handbookUrl,
    noteTranslations,
    labels,
    modules: modules
      .map(({ id, title, ects, areas, firstArea, courseIds: ids, pickOne, unlisted: notInTree }) => {
        const titleEn = english(title);
        const official = matchHandbook({ title, titleEn }, handbook, rules.handbookAliases ?? {});
        // Title-derived ids ("t:...") mean eCampus attached the course to no module; place it by its handbook code.
        const fromCode = id.startsWith('t:') && rules.codeCategories ? categoryFromCode(official?.code, rules.codeCategories) : null;
        const cats = fromCode ? [fromCode] : moduleCategories({ title, areas }, categories, rules.categoryAliases ?? {});
        return {
          id,
          title,
          // The English handbook page repeats the German name where no English one exists; ours is better then.
          titleEn: (official && !looksGerman(official.nameEn) && official.nameEn) || titleEn,
          code: official?.code ?? null,
          ects,
          areas,
          categories: cats,
          section: moduleSection({ areas: rules.sections ? areas : [firstArea], categories: cats }, sections),
          ...pickRule(id, title, pickOne, ids),
          ...(notInTree ? { unlisted: true } : {}),
          courseIds: ids.filter((c) => known.has(c)),
        };
      })
      .filter((m) => m.courseIds.length)
      .sort((a, b) => a.titleEn.localeCompare(b.titleEn, 'en')),
    courses,
  };
  // Terms the module handbook plans each module for (scraper/offerings.js), for the next-semesters view.
  const offerings = await loadOfferings(program.slug);
  if (offerings) data.offerings = offerings;
  if (exams.length) {
    const shown = new Set(data.modules.map((m) => m.id));
    data.exams = exams.map((e) => ({
      ...e,
      moduleId: shown.has(e.moduleId) ? e.moduleId : null,
      moduleTitleEn: english(e.moduleTitle),
    }));
  }
  // A rule nothing matches is usually a module not offered this semester; worth a look after new rules.
  for (const c of categories) {
    if (!data.modules.some((m) => m.categories.includes(c.id))) console.log(`Rule without modules this semester: ${program.slug}: ${c.id}`);
  }
  const out = path.join(DATA, `${program.slug}.json`);
  // Never replace good data with a partial catalog: fixed floors where known, otherwise half of the last run.
  const previous = await readJson(out);
  const minModules = rules.minModules ?? Math.max(1, Math.ceil((previous?.modules.length ?? 0) / 2));
  const minCourses = rules.minCourses ?? Math.max(1, Math.ceil((previous?.courses.length ?? 0) / 2));
  if (data.modules.length < minModules || courses.length < minCourses) {
    throw new Error(`Refusing to write: only ${data.modules.length} modules and ${courses.length} courses (expected at least ${minModules} and ${minCourses})`);
  }
  await fs.mkdir(DATA, { recursive: true });
  // Write then rename, so a reader never sees a half-written file.
  await fs.writeFile(`${out}.tmp`, JSON.stringify(data, null, 1));
  await fs.rename(`${out}.tmp`, out);
  const missingEcts = data.modules.filter((m) => m.ects == null).length;
  console.log(`Wrote ${out}: ${data.modules.length} modules, ${courses.length} courses, ${missingEcts} modules without ECTS`);
  return data;
}

// Usual lecture period and break days over every course of the university (see semesterShape).
function semesterJson(courses) {
  const { start, end, breaks } = semesterShape(courses);
  return { start, end, breaks: [...breaks].sort() };
}

async function main() {
  console.log(`Catalog: FB 16, ${PERIOD.label}`);
  const catalog = await crawlCatalog();
  const allPrograms = discoverPrograms(catalog.nodes, catalog.faculties);
  const programs = allPrograms.filter((p) => !only || only.includes(p.slug));
  if (!programs.length) throw new Error('No study programs found in the faculty catalog');
  // A partial catalog would drop programs from the site; stop before anything is written.
  const before = (await readJson(path.join(DATA, 'programs.json')))?.programs?.length ?? 0;
  if (!only && allPrograms.length < before * 0.95) {
    throw new Error(`Only ${allPrograms.length} programs found, the last run had ${before}; catalog incomplete, nothing written`);
  }
  if (process.argv.includes('--list')) {
    for (const p of programs) console.log([p.slug, p.po, p.faculty, p.parentPath].join('\t'));
    return;
  }
  console.log(`Programs: ${programs.map((p) => p.po).join('; ')}`);
  const failed = [];
  for (const p of programs) {
    try {
      await scrapeProgram(p);
    } catch (err) {
      failed.push(p.slug);
      console.error(`${p.slug} failed, keeping its previous data: ${err.message}`);
    }
  }
  // The index lists every program that has a data file, including ones kept from an earlier run.
  const index = [];
  const allCourses = new Map();
  for (const p of allPrograms) {
    const d = await readJson(path.join(DATA, `${p.slug}.json`));
    // The ISZ German courses (scraper/german.js) are in every program; they count neither here nor for the semester.
    const own = d && { modules: d.modules.filter((m) => !isGermanModule(m)), courses: d.courses.filter((c) => c.linkLabel !== 'ISZ') };
    for (const c of own?.courses ?? []) allCourses.set(c.id, c);
    if (d) index.push({ slug: p.slug, name: p.po, nameEn: d.programEn, degree: p.degree, faculty: p.faculty, facultyEn: FACULTIES_EN[p.faculty] ?? p.faculty, modules: own.modules.length, courses: own.courses.length });
  }
  // Faculty order of the catalog, then Bachelor, Master, Lehramt.
  const order = { bachelor: 0, master: 1, lehramt: 2 };
  index.sort((a, b) => (a.faculty ?? '').localeCompare(b.faculty ?? '', 'de', { numeric: true }) || order[a.degree] - order[b.degree] || a.nameEn.localeCompare(b.nameEn, 'en'));
  await fs.writeFile(path.join(DATA, 'programs.json'), JSON.stringify({ period: PERIOD.label, semester: semesterJson([...allCourses.values()]), programs: index }, null, 1));
  await addGermanToFiles(programs.filter((p) => !failed.includes(p.slug)).map((p) => p.slug));
  if (untranslatedNotes.size) console.log(`Remarks without translation (add to scraper/notes.js):\n  ${[...untranslatedNotes].join('\n  ')}`);
  if (untranslated.size) console.log(`No English translation (kept German): ${[...untranslated].join('; ')}`);
  if (failed.length === programs.length) throw new Error(`Every program failed: ${failed.join(', ')}`);
  if (failed.length) console.warn(`Failed (old data kept): ${failed.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
