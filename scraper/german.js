// Free German courses of the ISZ / Sprachenzentrum (scraper/german-courses.json), shown in every program as the
// section "german". eCampus does not list them, so they come from the ISZ course list by hand.
// Usage: node scraper/german.js  (adds them to every site/data/<program>.json; running it again replaces them)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GERMAN_SECTION = 'german';
const PREFIX = 'isz:';

const SECTION = {
  id: GERMAN_SECTION,
  name: 'German Courses (ISZ)',
  nameDe: 'Deutschkurse (ISZ)',
  note: {
    en: 'Free German courses of the Language Centre (ISZ), only for enrolled Uni Kassel students. Register with the ISZ, not in eCampus. Whether the credits count in your program depends on your PO (e.g. key competencies or Studium Generale).',
    tr: 'Dil Merkezi\'nin (ISZ) ücretsiz Almanca kursları, yalnızca Uni Kassel\'e kayıtlı öğrenciler için. Kayıt eCampus\'tan değil ISZ\'den yapılır. Kredilerin programında sayılıp sayılmayacağı PO\'na bağlı (ör. anahtar yetkinlikler veya Studium Generale).',
    de: 'Kostenfreie Deutschkurse des Sprachenzentrums (ISZ), nur für immatrikulierte Studierende der Uni Kassel. Die Anmeldung läuft über das ISZ, nicht über eCampus. Ob die Credits in deinem Studiengang zählen, regelt deine PO (z. B. Schlüsselkompetenzen oder Studium Generale).',
  },
};

// One module with one course per entry; each entry group is a parallel group, each of its days a weekly series.
export function germanEntries(file, semester) {
  const modules = [];
  const courses = [];
  const noteTranslations = {};
  for (const e of file.courses) {
    const note = e.note?.de ?? '';
    if (note) noteTranslations[note] = { en: e.note.en, tr: e.note.tr };
    courses.push({
      id: e.id,
      title: e.title,
      number: null,
      type: 'Sprachkurs',
      language: null,
      responsible: null,
      groups: e.groups.map((g, k) => ({
        name: `${k + 1}. Parallelgruppe`,
        series: g.days.map((day, i) => ({
          rhythm: 'wöchentlich',
          day,
          start: g.start,
          end: g.end,
          startDate: g.startDate ?? semester.start,
          endDate: semester.end,
          cancelled: [],
          note: i === 0 ? note : '',
          instructors: g.instructors,
          room: g.rooms?.[day] ?? g.room,
        })),
      })),
      url: file.source,
      linkLabel: 'ISZ',
      titleEn: e.titleEn,
      typeEn: 'Language course',
    });
    modules.push({
      id: `${PREFIX}${e.id}`,
      title: e.title,
      titleEn: e.titleEn,
      code: null,
      ects: e.ects,
      areas: [`Deutschkurse (ISZ) > ${e.track}`],
      categories: [],
      section: GERMAN_SECTION,
      pickOne: false,
      courseIds: [e.id],
    });
  }
  return { section: SECTION, modules, courses, noteTranslations };
}

// Adds the German courses to a program's data, replacing any added before.
export function addGermanCourses(data, file, semester) {
  const { section, modules, courses, noteTranslations } = germanEntries(file, semester);
  const ids = new Set(courses.map((c) => c.id));
  data.sections = [...(data.sections ?? [{ id: 'all', name: 'Modules' }]).filter((s) => s.id !== GERMAN_SECTION), section];
  data.modules = [...data.modules.filter((m) => !isGermanModule(m)), ...modules];
  data.courses = [...data.courses.filter((c) => !ids.has(c.id)), ...courses];
  data.noteTranslations = { ...data.noteTranslations, ...noteTranslations };
  return data;
}

export const isGermanModule = (m) => m.id.startsWith(PREFIX);

export async function loadGermanCourses() {
  return JSON.parse(await fs.readFile(path.join(here, 'german-courses.json'), 'utf8'));
}

// Adds them to the given programs' data files (all when slugs is null); the semester comes from programs.json.
export async function addGermanToFiles(slugs = null) {
  const DATA = path.join(here, '..', 'site', 'data');
  const { semester } = JSON.parse(await fs.readFile(path.join(DATA, 'programs.json'), 'utf8'));
  const file = await loadGermanCourses();
  const names = slugs ? slugs.map((s) => `${s}.json`) : (await fs.readdir(DATA)).filter((f) => f.endsWith('.json') && f !== 'programs.json');
  for (const name of names) {
    const out = path.join(DATA, name);
    const data = addGermanCourses(JSON.parse(await fs.readFile(out, 'utf8')), file, semester);
    await fs.writeFile(`${out}.tmp`, JSON.stringify(data, null, 1));
    await fs.rename(`${out}.tmp`, out);
  }
  console.log(`German courses (${file.courses.length}) added to ${names.length} programs`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await addGermanToFiles();
