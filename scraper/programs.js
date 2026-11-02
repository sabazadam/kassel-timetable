// Study programs of the University of Kassel (all faculties). eCampus lists every examination regulation
// (PO) of a program, e.g. "Master Elektrotechnik (2023)" and "(2016)"; only the latest one is scraped.

import { translateProgram } from './translations.js';

// URL path per program. Programs not listed here get a slug from their name.
const SLUGS = {
  'Bachelor Elektrotechnik': 'bsc-elektrotechnik',
  'Bachelor Nachhaltige elektrotechnische Systeme': 'bsc-nachhaltige-et-systeme',
  'Bachelor Informatik': 'bsc-informatik',
  'Master Elektrotechnik': 'msc-elektrotechnik',
  'Master Nachhaltige Elektromobilität': 'msc-elektromobilitaet',
  'Master Informatik': 'msc-informatik',
  'Master Computer Science': 'msc-computer-science',
  'Master Electrical Communication Engineering': 'msc-ece',
  'Master Functional Safety Engineering': 'msc-fse',
  'Master Renewable Energy and Energy Efficiency for the Middle East and North Africa Region': 'msc-re2mena',
};

// English program names (some programs are taught in English and already have one).
const NAMES_EN = {
  'Bachelor Elektrotechnik': 'Bachelor Electrical Engineering',
  'Bachelor Nachhaltige elektrotechnische Systeme': 'Bachelor Sustainable Electrical Systems',
  'Bachelor Informatik': 'Bachelor Computer Science',
  'Master Elektrotechnik': 'Master Electrical Engineering',
  'Master Nachhaltige Elektromobilität': 'Master Sustainable Electromobility',
  'Master Informatik': 'Master Computer Science',
};

// Module handbooks on moduldatenbank.uni-kassel.de (official codes and English module names).
// Only some programs have a public one; the handbook PO may be newer than the eCampus PO.
// English faculty names (the catalog has German ones).
export const FACULTIES_EN = {
  'FB 01 Humanwissenschaften': 'FB 01 Human Sciences',
  'FB 02 Geistes- und Kulturwissenschaften': 'FB 02 Humanities and Cultural Studies',
  'FB 05 Gesellschaftswissenschaften': 'FB 05 Social Sciences',
  'FB 06 Architektur, Stadtplanung, Landschaftsplanung': 'FB 06 Architecture, Urban Planning, Landscape Planning',
  'FB 07 Wirtschaftswissenschaften': 'FB 07 Economics and Management',
  'FB 10 Mathematik und Naturwissenschaften': 'FB 10 Mathematics and Natural Sciences',
  'FB 11 Ökologische Agrarwissenschaften': 'FB 11 Organic Agricultural Sciences',
  'FB 14 Bauingenieur- und Umweltingenieurwesen': 'FB 14 Civil and Environmental Engineering',
  'FB 15 Maschinenbau': 'FB 15 Mechanical Engineering',
  'FB 16 Elektrotechnik / Informatik': 'FB 16 Electrical Engineering / Computer Science',
  'Kunsthochschule Kassel': 'Kassel School of Art and Design',
};

const HANDBOOKS = {
  // List 120 is "Computer Science, Master (PO-2026)" since 2026.
  'msc-computer-science': 120,
  'bsc-informatik': 119,
  'msc-elektromobilitaet': 121,
  'bsc-nachhaltige-et-systeme': 166,
  'msc-re2mena': 171,
};

// Short URL prefixes: degree first, then the subject (lehramt types abbreviated).
const SLUG_PREFIXES = [
  [/^bachelor-kombinationspr(ü|ue)fung /, 'bsc-kombi-'],
  [/^bachelor /, 'bsc-'],
  [/^master /, 'msc-'],
  [/^lehramt an gymnasien /, 'la-gym-'],
  [/^lehramt an haupt- u\. realschulen /, 'la-hr-'],
  [/^lehramt an grundschulen /, 'la-gs-'],
  [/^lehramt für förderpädagogik /, 'la-foe-'],
  [/^lehramt /, 'la-'],
  [/^staatsexamen /, 'la-staatsexamen-'],
];

export const slugOf = (name) => {
  if (SLUGS[name]) return SLUGS[name];
  let s = name.toLowerCase();
  for (const [re, prefix] of SLUG_PREFIXES) {
    if (re.test(s)) {
      s = prefix + s.replace(re, '');
      break;
    }
  }
  return s
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

// Programs replaced by a renamed successor with a newer PO; the site shows only the successor
// (Master Informatik 2018 -> Master Computer Science PO-2026, taught in English from WiSe 2026/27).
export const SUPERSEDED = { 'Master Informatik': 'Master Computer Science' };

export const degreeOf = (name) => (/^Bachelor/.test(name) ? 'bachelor' : /^Master/.test(name) ? 'master' : 'lehramt');

// "Master Elektrotechnik (2023)", "Bachelor-Kombinationsprüfung Geschichte (2017) Hauptfach",
// "Lehramt an Gymnasien Mathematik (2023)", "Master Literatur – Kunst – Medienkulturen (PO-2026)".
const PO_NAME = /^((?:Bachelor|Master|Lehramt|Staatsexamen)\b.+?) \((?:PO-)?(\d{4})\)(?: (\S.*))?$/;

// nodes: parseTree rows of catalog pages (the faculty pages and their sub-headings).
// faculties: top-level catalog path ("title:354|title:365") -> faculty name.
// Returns the latest PO of each program (Bachelor, Master, Lehramt). Some POs carry a role after the
// year ("... (2022) Hauptfach"); the role is part of the program name. A few faculties (FB 11) list a
// program as a plain heading ("Master Ökologische Landwirtschaft") with its modules below, without a PO.
export function discoverPrograms(nodes, faculties = {}) {
  const latest = new Map();
  for (const n of nodes) {
    if (n.kind !== 'Prüfungsordnung') continue;
    const m = PO_NAME.exec(n.name);
    if (!m) continue;
    const [, base, year, role] = m;
    const name = role ? `${base} ${role}` : base;
    if (!latest.has(name) || Number(year) > latest.get(name).year) latest.set(name, { name, year: Number(year), po: n.name, path: n.path });
  }
  const headings = nodes.filter((n) => n.kind === 'Überschriftenelement');
  const poPaths = nodes.filter((n) => n.kind === 'Prüfungsordnung' && n.path).map((n) => n.path);
  for (const h of headings) {
    if (!/^(Bachelor|Master) /.test(h.name) || /Ergänzungen/.test(h.name) || !h.path || latest.has(h.name)) continue;
    if (poPaths.some((p) => p.startsWith(h.path + '|'))) continue;
    latest.set(h.name, { name: h.name, year: null, po: h.name, path: h.path, heading: true });
  }
  for (const [old, successor] of Object.entries(SUPERSEDED)) if (latest.has(successor)) latest.delete(old);
  return [...latest.values()].map(({ name, year, po, path, heading }) => {
    const parentPath = path ? path.split('|').slice(0, -1).join('|') : null;
    const facultyPath = path ? path.split('|').slice(0, 2).join('|') : null;
    const slug = slugOf(name);
    // "Master Informatik Ergänzungen": modules not yet in the PO tree. Some headings carry a long description after the name.
    const supplements = headings.find((h) => h.name === `${name} Ergänzungen` || h.name.startsWith(`${name} Ergänzungen `));
    const handbook = HANDBOOKS[slug];
    return {
      slug,
      name,
      nameEn: NAMES_EN[name] ?? translateProgram(name) ?? name,
      degree: degreeOf(name),
      year,
      po,
      parentPath,
      // Listed as a heading instead of a PO (FB 11); its subtree is expanded the same way.
      heading: Boolean(heading),
      path,
      faculty: faculties[facultyPath] ?? null,
      supplements: supplements?.name ?? null,
      handbookUrl: handbook ? `https://moduldatenbank.uni-kassel.de/showListAreas.php?id=${handbook}` : null,
    };
  });
}
