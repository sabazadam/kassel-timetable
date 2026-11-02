// Module offering terms from the module handbook (moduldatenbank.uni-kassel.de): every module of a PO with
// the term it is offered in ("annually in summer semester"), so students can plan the next semesters even for
// modules that have no dates in eCampus yet. Writes scraper/offerings/<slug>.json, which scrape.js embeds as
// data.offerings; --apply also patches site/data/<slug>.json in place so no eCampus scrape is needed.
// Usage: node scraper/offerings.js [--fresh] [--apply]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, '.cache');
const BASE = 'https://moduldatenbank.uni-kassel.de/';

// Programs with an offerings list: slug -> moduldatenbank list id (the one embedded on the program's
// "Module handbook" page of uni-kassel.de).
export const OFFERING_LISTS = {
  'msc-computer-science': 120,
};

const clean = (s) => (s ?? '').replace(/ /g, ' ').replace(/­/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();

// Area tree of a list page: [{ id: '8.1.2', name, modules: [href] , parent }] in page order.
export function parseOfferingList(html) {
  const $ = load(html);
  const areas = [];
  const walk = (el, parent) => {
    $(el)
      .children('.indented')
      .each((i, child) => {
        const $c = $(child);
        const text = $c.children('.myHover').first().find('.text').first();
        if ($c.hasClass('module')) {
          const href = text.find('a[href]').attr('href');
          if (parent && href) parent.modules.push(href.replace(/&en=1$/, ''));
          return;
        }
        const link = text.find('a[href]').first();
        const number = /^([\d.]+?)\.?\s/.exec(clean(text.text()))?.[1];
        let area = parent;
        if (link.length && number) {
          area = { id: number, name: clean(link.text()), parent: parent?.id ?? null, modules: [] };
          areas.push(area);
        }
        walk(child, area);
      });
  };
  const roots = $('.indented').filter((i, el) => !$(el).parents('.indented').length);
  roots.each((i, el) => walk($(el).parent(), null));
  return areas;
}

// One module page: the th/td table, keyed by the (English) row heading.
export function parseModulePage(html) {
  const $ = load(html);
  const rows = {};
  $('tr').each((i, tr) => {
    const th = clean($(tr).children('th').first().text());
    const td = $(tr).children('td').first();
    if (!th || !td.length) return;
    td.find('br').replaceWith('\n');
    td.find('p, li, div').after('\n');
    rows[th] = clean(td.text());
  });
  return rows;
}

const COUNTS = { zwei: 2, drei: 3, vier: 4, two: 2, three: 3, four: 4 };

// "annually in summer semester" -> { term: 'summer', every: 2 }; "Summer und winter semester" -> { term: 'both', every: 1 };
// "Alle 4 Semester ab Sommersemester 2026" -> { term: 'summer', every: 4, from: 'S2026' } (S2026 = SoSe 2026,
// W2026 = WiSe 2026/27). A cycle with no start ("Alle 4 Semester") or no rule at all -> { term: 'unknown' }.
export function offeringCycle(text) {
  const s = (text ?? '').toLowerCase();
  const n = /(?:alle|every)\s+(\d|zwei|drei|vier|two|three|four)\.?\s+semester/.exec(s)?.[1];
  const every = n ? (COUNTS[n] ?? Number(n)) : null;
  const start = /(sommer|summer|winter)\w*\s+(\d{4})/.exec(s);
  if (every && start) {
    const winter = start[1] === 'winter';
    return { term: every % 2 ? 'cycle' : winter ? 'winter' : 'summer', every, from: `${winter ? 'W' : 'S'}${start[2]}` };
  }
  if (every) return { term: 'unknown' };
  const summer = /summer|sommer|\bsose\b/.test(s);
  const winter = /winter|\bwise\b/.test(s);
  if ((summer && winter) || /(every|each|jedes|jeden)\s+semester|half-yearly|halbjährlich/.test(s)) return { term: 'both', every: 1 };
  if (summer) return { term: 'summer', every: 2 };
  if (winter) return { term: 'winter', every: 2 };
  return { term: 'unknown' };
}

// "Englisch/Deutsch", "English" -> ['en', 'de'].
export function teachingLanguages(text) {
  const s = (text ?? '').toLowerCase();
  const out = [];
  if (/engl/.test(s)) out.push('en');
  if (/deutsch|german/.test(s)) out.push('de');
  return out;
}

const ects = (text) => {
  const n = /(\d+(?:[.,]\d+)?)\s*(?:cp|credit|ects|lp)/i.exec(text ?? '')?.[1];
  return n ? Number(n.replace(',', '.')) : null;
};

// Joins the list tree and the module pages into the offerings json.
export function buildOfferings({ areas, areasDe = [], pagesEn, namesDe, listId }) {
  const areaDe = new Map(areasDe.map((a) => [a.id, a.name]));
  const top = (id) => id.split('.')[0];
  const modules = new Map();
  for (const area of areas) {
    for (const href of area.modules) {
      const row = pagesEn.get(href);
      if (!row) continue;
      if (!modules.has(href)) {
        modules.set(href, {
          code: row['Module number / code'] || null,
          number: row['Unique module number'] || null,
          name: row['Module name'] || null,
          nameDe: namesDe.get(href) ?? null,
          url: `${BASE}${href}&en=1`,
          type: row['Type of module'] || null,
          frequency: row['Frequency of module offer'] || null,
          ...offeringCycle(row['Frequency of module offer']),
          duration: row['Duration'] || null,
          languages: teachingLanguages(row['Teaching language']),
          language: row['Teaching language'] || null,
          ects: ects(row['Credit points (ECTS)']),
          courseTypes: row['Course types'] || null,
          courses: row['Title of courses'] || null,
          responsible: row['Responsible person'] || null,
          lecturers: row['Lecturer(s)'] || null,
          prerequisites: row['Recommended (knowledge) prerequisites'] || null,
          requiredPrerequisites: row['Required prerequisites for participation'] || null,
          exam: row['Module examination(s)'] || null,
          workload: row['Student workload'] || null,
          content: row['Content'] || null,
          areas: [],
        });
      }
      modules.get(href).areas.push(area.id);
    }
  }
  return {
    source: `${BASE}showListAreas.php?id=${listId}&en=1`,
    areas: areas.map(({ id, name, parent }) => ({ id, name, ...(areaDe.get(id) ? { nameDe: areaDe.get(id) } : {}), ...(parent ? { parent } : {}), top: top(id) })),
    modules: [...modules.values()],
  };
}

async function get(url, key, fresh) {
  const file = path.join(CACHE, `mdb-${key}.html`);
  if (!fresh) {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {}
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const html = await res.text();
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, html);
  await new Promise((r) => setTimeout(r, 300));
  return html;
}

async function run() {
  const fresh = process.argv.includes('--fresh');
  const apply = process.argv.includes('--apply');
  for (const [slug, listId] of Object.entries(OFFERING_LISTS)) {
    const areas = parseOfferingList(await get(`${BASE}showListAreas.php?id=${listId}&en=1`, `list-${listId}-en`, fresh));
    const areasDe = parseOfferingList(await get(`${BASE}showListAreas.php?id=${listId}`, `list-${listId}-de`, fresh));
    const hrefs = [...new Set(areas.flatMap((a) => a.modules))];
    const pagesEn = new Map();
    for (const href of hrefs) {
      const key = href.replace(/\.php\?id=/, '-').replace(/[^a-zA-Z0-9-]/g, '');
      pagesEn.set(href, parseModulePage(await get(`${BASE}${href}&en=1`, `${key}-en`, fresh)));
    }
    // German names: the German list links the same module pages.
    const namesDe = new Map();
    const $ = load(await get(`${BASE}showListAreas.php?id=${listId}`, `list-${listId}-de`, false));
    $('.indented.module .text a[href]').each((i, a) => namesDe.set($(a).attr('href'), clean($(a).text())));
    if (areasDe.length !== areas.length) console.warn(`German list has ${areasDe.length} areas, English ${areas.length}`);

    const offerings = buildOfferings({ areas, areasDe, pagesEn, namesDe, listId });
    const unknown = offerings.modules.filter((m) => m.term === 'unknown');
    for (const m of unknown) console.warn(`No term for ${m.code} ${m.name}: ${JSON.stringify(m.frequency)}`);
    const counts = offerings.modules.reduce((acc, m) => ({ ...acc, [m.term]: (acc[m.term] ?? 0) + 1 }), {});
    console.log(`${slug}: ${offerings.modules.length} modules, ${offerings.areas.length} areas, terms ${JSON.stringify(counts)}`);

    const out = path.join(here, 'offerings', `${slug}.json`);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, JSON.stringify(offerings, null, 1));
    console.log(`Wrote ${out}`);
    if (apply) {
      const dataFile = path.join(here, '..', 'site', 'data', `${slug}.json`);
      const data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
      data.offerings = await loadOfferings(slug);
      await fs.writeFile(`${dataFile}.tmp`, JSON.stringify(data, null, 1));
      await fs.rename(`${dataFile}.tmp`, dataFile);
      console.log(`Patched ${dataFile}`);
    }
  }
}

// The offerings of a program, with the translations of its German fields (scraper/offerings/<slug>.i18n.json,
// { number (or code, for modules without one): { en: {field: text}, tr: {...} } }, made and reviewed with Grok)
// merged in as m.en; null when there are none. Course types stay untranslated: the abbreviations (VLmP) are
// the handbook's own and their glosses could not be confirmed.
export async function loadOfferings(slug) {
  const dir = path.join(here, 'offerings');
  let offerings;
  try {
    offerings = JSON.parse(await fs.readFile(path.join(dir, `${slug}.json`), 'utf8'));
  } catch {
    return null;
  }
  let i18n = {};
  try {
    i18n = JSON.parse(await fs.readFile(path.join(dir, `${slug}.i18n.json`), 'utf8'));
  } catch {}
  for (const m of offerings.modules) {
    const tr = i18n[m.number ?? m.code];
    if (tr) m.en = tr;
  }
  return offerings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run();
