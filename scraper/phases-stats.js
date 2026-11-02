// Phase statistics over all programs in site/data (REPORT-phases.md): courses whose weekly series in one group run in
// different date ranges, courses that run only part of the lecture period, and modules that make phases on their own.
// Run: node scraper/phases-stats.js
import fs from 'node:fs';
import { computePhases, seriesWeeks, isPlaceable, selectedEntries, selectionPhases } from '../site/js/schedule.js';
const dir = new URL('../site/data', import.meta.url).pathname;
const idx = JSON.parse(fs.readFileSync(`${dir}/programs.json`));
const shape = { ...idx.semester, breaks: new Set(idx.semester.breaks) };
const slugs = idx.programs.map((p) => p.slug);
const courses = new Map(); // id -> {course, programs:Set, groups:[...]}
let noiseOnly = new Set();
const perProgram = {};
for (const slug of slugs) {
  const d = JSON.parse(fs.readFileSync(`${dir}/${slug}.json`));
  perProgram[slug] = new Set();
  for (const c of d.courses) {
    c.groups.forEach((g, gi) => {
      const weekly = g.series.map((s, i) => ({ s, i })).filter(({ s }) => isPlaceable(s) && s.startDate);
      if (weekly.length < 2) return;
      const ranges = new Set(weekly.map(({ s }) => `${s.startDate}|${s.endDate}`));
      if (ranges.size < 2) return;
      const items = weekly.map(({ s, i }) => ({ key: String(i), series: s, weeks: seriesWeeks(s, g, shape), sig: [s.day, s.start, s.end, s.rhythm].join(':') }));
      const ph = computePhases(items, shape);
      if (ph.length < 2) { noiseOnly.add(`${c.id}:${gi}`); return; }
      // sequential: some series stops before another one starts
      const w = items.map((x) => x.weeks);
      const sequential = w.some((a) => w.some((b) => a.to < b.from));
      const rec = courses.get(c.id) ?? { id: c.id, title: c.title, number: c.number, programs: new Set(), groups: [] };
      rec.programs.add(slug);
      if (!rec.groups.some((x) => x.gi === gi)) rec.groups.push({ gi, sequential, phases: ph.map((p) => `${p.first.slice(5)}..${p.last.slice(5)}`), series: weekly.map(({ s }) => `${s.rhythm === '14-täglich' ? '2w ' : ''}d${s.day} ${s.start}-${s.end} ${s.startDate}..${s.endDate}`) });
      courses.set(c.id, rec);
      perProgram[slug].add(c.id);
    });
  }
}
const all = [...courses.values()];
const seq = all.filter((r) => r.groups.some((g) => g.sequential));
console.log('programs scanned', slugs.length);
console.log('courses (unique ids) with >1 phase inside a group:', all.length, ' sequential (a series ends before another starts):', seq.length, ' late-start/early-end only:', all.length - seq.length);
console.log('groups with differing ranges that the noise rules treat as one phase:', noiseOnly.size);
const progs = Object.entries(perProgram).filter(([, s]) => s.size).sort((a, b) => b[1].size - a[1].size);
console.log('programs with at least one such course:', progs.length);
console.log(progs.map(([k, s]) => `${k}:${s.size}`).join(' '));
const hist = {}; for (const r of all) for (const g of r.groups) hist[g.phases.length] = (hist[g.phases.length] ?? 0) + 1;
console.log('phase count histogram (groups):', hist);
// Courses that run only part of the lecture period (every weekly series of a group starts late or ends early):
// they make phases in a selection together with other courses.
{
  const P = seriesWeeks({ rhythm: 'wöchentlich', day: 1, start: '08:00', end: '09:00', startDate: shape.start, endDate: shape.end }, null, shape);
  const partial = new Map();
  const perProg = {};
  for (const slug of slugs) {
    const d = JSON.parse(fs.readFileSync(`${dir}/${slug}.json`));
    perProg[slug] = 0;
    for (const c of d.courses) {
      const hit = c.groups.some((g) => {
        const w = g.series.map((s) => seriesWeeks(s, g, shape)).filter(Boolean);
        if (!w.length) return false;
        const from = w.reduce((m, x) => (x.from < m ? x.from : m), w[0].from);
        const to = w.reduce((m, x) => (x.to > m ? x.to : m), w[0].to);
        return from > P.from || to < P.to;
      });
      if (hit) { perProg[slug]++; partial.set(c.id, (partial.get(c.id) ?? []).concat(slug)); }
    }
  }
  console.log('lecture period weeks', P);
  console.log('courses with a group running only part of the lecture period:', partial.size, 'programs with any:', Object.values(perProg).filter(Boolean).length);
  console.log(Object.entries(perProg).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k}:${n}`).join(' '));
}
{
let mods = 0, phased = 0; const uniq = new Map(); const per = {};
const hist = {};
for (const p of idx.programs) {
  const d = JSON.parse(fs.readFileSync(`${dir}/${p.slug}.json`));
  for (const m of d.modules) {
    mods++;
    const ph = selectionPhases(selectedEntries(d, { modules: { [m.id]: { courses: {} } } }), shape);
    if (ph.length > 1) { phased++; per[p.slug] = (per[p.slug] ?? 0) + 1; uniq.set(m.title, ph.map((x) => `${x.first.slice(5)}..${x.last.slice(5)}`).join(' / ')); hist[ph.length] = (hist[ph.length] ?? 0) + 1; }
  }
}
console.log('modules (program x module):', mods, 'with >1 phase on their own:', phased, 'distinct module titles:', uniq.size, 'programs:', Object.keys(per).length, 'hist', hist);
console.log(Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${k}:${n}`).join(' '));
}
