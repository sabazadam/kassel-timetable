// Turns flat tree rows (from parseTree) into modules with their courses and study areas.
import { parentNum, splitCourseName } from './parse.js';

// Konto names that only group the whole program and say nothing about the area ("88/C53/H/2026 Abschluss").
// The admission account carries the same prefix ("88/C53/H/2026 Auflagen zur Zulassung ..."); it keeps its name.
const PO_PREFIX = /^\d+\/[A-Z]?\d+\/[A-Z]\/\d{4}\s*/;
const isNoiseArea = (name) => PO_PREFIX.test(name) && !/Auflagen|Zulassung/.test(name);
const areaName = (name) => name.replace(PO_PREFIX, '');

const isModule = (n) => n.kind === 'Modul' || (n.kind === 'Überschriftenelement' && /^Modul\s/.test(n.name));
const moduleTitle = (n) => (n.kind === 'Modul' ? n.name : n.name.replace(/^Modul\s+/, ''));

// nodes: rows from parseTree; rootNum: row number of the program root (excluded from areas).
// rootLabel: optional area prefix for every module below this root (e.g. "Ergänzungen").
export function buildCatalog(nodes, rootNum, { rootLabel = null } = {}) {
  const byNum = new Map(nodes.map((n) => [n.num, n]));
  const inside = (n) => n.num.startsWith(rootNum + '.');
  const modules = new Map();

  const ancestors = (num) => {
    const out = [];
    for (let p = parentNum(num); p && p !== rootNum; p = parentNum(p)) {
      const n = byNum.get(p);
      if (n) out.unshift(n);
    }
    return out;
  };

  for (const course of nodes) {
    if (course.kind !== 'Veranstaltung' || !course.unitId || !inside(course)) continue;
    const chain = ancestors(course.num);
    const modIdx = chain.findLastIndex(isModule);
    if (modIdx < 0) continue;
    const mod = chain[modIdx];
    const key = mod.unitId ? `m${mod.unitId}` : `t:${moduleTitle(mod)}`;
    const area = [rootLabel, ...chain.slice(0, modIdx).map((n) => n.name).filter((n) => !isNoiseArea(n)).map(areaName)]
      .filter(Boolean)
      .join(' > ');
    if (!modules.has(key)) {
      modules.set(key, { id: key, unitId: mod.unitId, title: moduleTitle(mod), firstArea: area || 'Allgemein', areas: new Set(), courseIds: new Set() });
    }
    const m = modules.get(key);
    m.areas.add(area || 'Allgemein');
    m.courseIds.add(course.unitId);
  }

  return [...modules.values()].map((m) => ({ ...m, areas: [...m.areas].sort(), courseIds: [...m.courseIds] }));
}

// Merge module lists from several roots (same module id -> union of areas and courses).
export function mergeModules(...lists) {
  const out = new Map();
  for (const m of lists.flat()) {
    const prev = out.get(m.id);
    if (!prev) {
      out.set(m.id, { ...m, areas: [...m.areas], courseIds: [...m.courseIds] });
      continue;
    }
    prev.areas = [...new Set([...prev.areas, ...m.areas])].sort();
    prev.courseIds = [...new Set([...prev.courseIds, ...m.courseIds])];
  }
  return [...out.values()];
}

// Category ids a module counts for: area categories match its area paths,
// module categories match its (German) title.
// "anyOf" / "oneOf" categories list options ({ type: 'area' | 'module', id }); a module counts when it matches one.
// An area option also covers its sub-areas ("Schwerpunkt E-Mobility" covers "Schwerpunkt E-Mobility > Pflichtmodule").
export const matchesOption = (module, o) =>
  o.type === 'module' ? module.title === o.id : module.areas.some((a) => a === o.id || a.startsWith(`${o.id} > `));

// "exclude": module titles a category never counts (e.g. a module eCampus files under two areas
// that the PO allows in only one of them).
export function moduleCategories(module, categories, aliases = {}) {
  const out = new Set();
  const excluded = new Set(categories.filter((c) => (c.exclude ?? []).includes(module.title)).map((c) => c.id));
  for (const c of categories) {
    if (c.group === 'module' && module.title === c.id) out.add(c.id);
    if ((c.group === 'anyOf' || c.group === 'oneOf') && (c.options ?? []).some((o) => matchesOption(module, o))) out.add(c.id);
  }
  const areaIds = new Set(categories.filter((c) => c.group === 'area' || !c.group).map((c) => c.id));
  for (const area of module.areas) {
    if (areaIds.has(area)) out.add(area);
    if (aliases[area]) out.add(aliases[area]);
  }
  return categories.map((c) => c.id).filter((id) => out.has(id) && !excluded.has(id));
}

// The list section a module is shown in: its first requirement category in section order,
// otherwise the first section whose area prefix matches, otherwise the last section.
export function moduleSection(module, sections) {
  for (const s of sections) {
    if (s.category && (module.categories ?? []).includes(s.id)) return s.id;
  }
  for (const s of sections) {
    if (s.areaPrefix && module.areas.some((a) => a.startsWith(s.areaPrefix))) return s.id;
    if (s.areaTop && module.areas.some((a) => a.split(' > ')[0] === s.areaTop)) return s.id;
  }
  return sections.at(-1).id;
}

// Requirement category from a handbook code ("TeI-01" -> Technische Informatik), or null.
export function categoryFromCode(code, table) {
  const prefix = /^(.+?)-\d+$/.exec(code ?? '')?.[1];
  return (prefix && table[prefix]) ?? null;
}

// Sections for a program without hand-made ones: one per top-level area of its tree, in tree order.
// labels: German area name -> English.
export function areaSections(modules, labels = {}) {
  const tops = [...new Set(modules.map((m) => (m.firstArea ?? m.areas[0] ?? 'Allgemein').split(' > ')[0]))];
  // Admission requirements (Auflagen) and catch-all areas go last, like in Master Informatik.
  const isAdmission = (top) => /^(Zulassung|Auflagen zur Zulassung)/.test(top);
  const rank = (top) => (isAdmission(top) ? 2 : /^(Ergänzungen|Allgemein)$/.test(top) ? 1 : 0);
  tops.sort((a, b) => rank(a) - rank(b));
  // The admission section gets the fixed id "admission", which the ready-made programs leave out.
  return tops.map((top) => ({ id: isAdmission(top) ? 'admission' : top, name: labels[top] ?? top, nameDe: top, areaTop: top }));
}

// Courses listed under plain headings instead of a module (the faculty's key competency lists,
// labs in the supplements). Each course joins the module named like its nearest heading below rootPath,
// or fallbackTitle when it has none; such modules are created when the program has none yet.
// Courses the program already has, and courses inside a module (handled by buildCatalog), are skipped.
// pickOne: the listed courses are alternatives, so modules that receive one become pick-one modules.
// perCourse: every course becomes its own module (named after the course), placed in the area of its
// headings and accounts; used for courses a PO tree lists outside any module.
export function attachListedCourses(modules, nodes, rootPath, { area, fallbackTitle, pickOne = false, perCourse = false }) {
  const byPath = new Map(nodes.filter((n) => n.path).map((n) => [n.path, n]));
  const known = new Set(modules.flatMap((m) => m.courseIds));
  const out = modules.map((m) => ({ ...m, areas: [...m.areas], courseIds: [...m.courseIds] }));
  for (const course of nodes) {
    if (course.kind !== 'Veranstaltung' || !course.unitId || known.has(course.unitId)) continue;
    if (!course.path?.startsWith(rootPath + '|')) continue;
    const chain = [];
    const parts = course.path.split('|');
    for (let i = rootPath.split('|').length + 1; i < parts.length; i++) {
      const n = byPath.get(parts.slice(0, i).join('|'));
      if (n) chain.push(n);
    }
    if (chain.some(isModule)) continue;
    const title = perCourse ? (splitCourseName(course.name).title ?? course.name) : (chain.at(-1)?.name ?? fallbackTitle);
    const where = perCourse ? chain.map((n) => n.name).filter((n) => !isNoiseArea(n)).map(areaName).join(' > ') || area : area;
    let m = out.find((x) => x.title === title);
    if (!m) {
      m = { id: `t:${title}`, unitId: null, title, firstArea: where, areas: [where], courseIds: [] };
      out.push(m);
    }
    m.courseIds.push(course.unitId);
    if (pickOne) m.pickOne = true;
    known.add(course.unitId);
  }
  return out;
}

// Courses eCampus attaches to no program (found with the course search, placed from the module handbooks):
// entries { course, module, areas, ects? } from scraper/unlisted.json. A course joins the program's module of
// the same title, otherwise a module of its own ("t:<module>") in the given areas. Such modules are marked
// unlisted, so the site can say that eCampus does not list them under the program.
export function attachUnlisted(modules, entries) {
  const known = new Set(modules.flatMap((m) => m.courseIds));
  const out = modules.map((m) => ({ ...m, areas: [...m.areas], courseIds: [...m.courseIds] }));
  for (const e of entries) {
    if (known.has(e.course)) continue;
    let m = out.find((x) => x.title === e.module);
    if (!m) {
      m = { id: `t:${e.module}`, unitId: null, title: e.module, firstArea: e.areas[0], areas: [...e.areas], courseIds: [], unlisted: true, ectsHint: e.ects ?? null };
      out.push(m);
    }
    // A module made here takes the areas of all its entries (lecture and exercise may be listed apart).
    if (m.unlisted) for (const a of e.areas) if (!m.areas.includes(a)) m.areas.push(a);
    m.courseIds.push(e.course);
    known.add(e.course);
  }
  return out;
}

// Takes courses out of modules eCampus wrongly attached them to: [{ module: title, course }].
// Hand corrections (scraper/corrections.json) for what eCampus has wrong or not yet: series: [{ match, set }]
// patches the matching series (e.g. a moved first session). Returns warnings for entries that match nothing.
export function applyCorrections(courses, corrections) {
  const warnings = [];
  for (const c of courses) {
    for (const s of corrections[c.id]?.series ?? []) {
      const hits = c.groups.flatMap((g) => g.series).filter((x) => Object.entries(s.match).every(([k, v]) => x[k] === v));
      if (!hits.length) warnings.push(`Correction for course ${c.id} matches no series: ${JSON.stringify(s.match)}`);
      for (const x of hits) Object.assign(x, s.set);
    }
  }
  return warnings;
}

// Parallel groups are alternatives, except when eCampus gives them different kinds: "Übung (1. Parallelgruppe)"
// plus "Tutorium (2. Parallelgruppe)" (69657) means a session for everyone plus tutorial times. Such a course
// becomes one group: the other parts' series are fixed (series.fixed), each series keeps its kind (series.part),
// and the tutorial times are picked from (group.slots, see exerciseSlots). Only the clear shape counts: exactly
// one tutorial group and other groups of distinct lecture/exercise kinds. Other shapes come from group-parts.json.
const TUTORIAL_KINDS = /^(?:Tutorium|Tutorien)$/i;
const PART_KINDS = /^(?:Vorlesung|Übung|Übungen|Hörsaalübung|Seminar|Praktikum|Vorlesung\s*\/\s*(?:Übung|Seminar))$/i;
export function mergeCourseParts(course) {
  const groups = course.groups ?? [];
  if (groups.length < 2 || !groups.every((g) => g.kind)) return course;
  const tutorials = groups.filter((g) => TUTORIAL_KINDS.test(g.kind));
  const rest = groups.filter((g) => !TUTORIAL_KINDS.test(g.kind));
  if (tutorials.length !== 1 || !rest.every((g) => PART_KINDS.test(g.kind)) || new Set(rest.map((g) => g.kind)).size !== rest.length) return course;
  const series = [
    ...rest.flatMap((g) => g.series.map((s) => ({ ...s, part: g.kind, fixed: true }))),
    ...tutorials[0].series.map((s) => ({ ...s, part: tutorials[0].kind })),
  ];
  const languages = [...new Set(groups.map((g) => g.language).filter(Boolean))];
  const { kind, language, ...first } = groups[0];
  return { ...course, groups: [{ ...first, ...(languages.length === 1 ? { language: languages[0] } : {}), parts: groups.map((g) => g.kind), slots: true, series }] };
}

// Hand-checked group structure (scraper/group-parts.json): { groups, fixed, pick, slots } by group index.
// Groups not in `pick` are attended by everyone; the student takes one `pick` group (none: all groups are one);
// `slots` groups list alternative times of one session. Each resulting group carries the shared series, so the
// group select chooses among the pick groups only. Returns null when eCampus no longer has `groups` groups.
export function applyGroupParts(course, spec) {
  const groups = course.groups ?? [];
  if (groups.length !== spec.groups) return null;
  const pick = spec.pick ?? [];
  const slots = new Set(spec.slots ?? []);
  const seriesOf = (i) => groups[i].series.map((s) => ({ ...s, ...(groups[i].kind ? { part: groups[i].kind } : {}), ...(slots.has(i) ? {} : { fixed: true }) }));
  const shared = groups.map((_, i) => i).filter((i) => !pick.includes(i)).flatMap(seriesOf);
  const group = (i, series) => {
    const { kind, ...g } = groups[i];
    return { ...g, slots: series.some((s) => !s.fixed), series };
  };
  if (!pick.length) return { ...course, groups: [group(0, shared)] };
  return { ...course, groups: pick.map((i) => group(i, [...shared, ...seriesOf(i)])) };
}

export function detachCourses(modules, entries) {
  return modules.map((m) => {
    const drop = new Set(entries.filter((e) => e.module === m.title).map((e) => e.course));
    return drop.size ? { ...m, courseIds: m.courseIds.filter((id) => !drop.has(id)) } : m;
  });
}
