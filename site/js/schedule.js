import { CLASS_ROOMS, KICKOFF_ROOMS } from './note-rooms.js';
// Pure scheduling logic: no DOM, so it runs in the browser and under `node --test`.

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const isRecurring = (s) => s.rhythm === 'wöchentlich' || s.rhythm === '14-täglich';
// A series can sit in the weekly grid when it has a weekday and a time.
export const isPlaceable = (s) => isRecurring(s) && s.day != null && s.start != null && s.end != null;
export const isSingleDate = (s) => s.rhythm === 'Einzeltermin' && s.day != null && s.start != null && s.end != null;
// Some courses (often lectures shared with FB 07) are entered date by date instead of as a weekly series.
// Their single dates go into the week grid too; single dates next to a weekly series (exams, extra sessions) do not.
// In a group merged from parts (series.part), only the series' own part counts.
export const inGrid = (series, group) => isPlaceable(series) || (isSingleDate(series) && !(group?.series ?? []).some((o) => o.part === series.part && isPlaceable(o)));

// Selection state shape:
// { modules: { [moduleId]: { courses: { [courseId]: { on: bool, group: number, off: number[] } } } },
//   target: number, doneCategories: string[] }
export function emptyState() {
  return { modules: {}, target: 30, doneCategories: [] };
}

// Pick modules (module.pickOne): the student takes the fixed courses (module.pick.fixed, from the handbook)
// and chooses module.pick.count options (default 1) from the rest, e.g. one Proseminar out of a pool.
export const pickCount = (module) => module.pick?.count ?? 1;
const fixedIds = (module) => new Set(module.pick?.fixed ?? []);

// Courses are on by default, except the pool of pick modules (Projekt, Seminar, ...) where the user chooses.
export function courseConfig(state, module, courseId) {
  const on = !module.pickOne || fixedIds(module).has(courseId);
  return state.modules[module.id]?.courses?.[courseId] ?? { on, group: 0, off: [] };
}

// Exercise slots: eCampus often lists every tutorial time of an exercise as series of one group, and a
// student goes to one of them. Returns the alternatives as [{ indices, series }] (a slot entered as two
// series, before and after Christmas say, is one alternative), or null when the series are all attended.
// Only clear cases count: 3+ weekly slots, or 2 at the same time in different rooms. Series marked as a
// lecture or a whole-class exercise (Hörsaalübung, Hörsaal-Tutorium) are for everyone and stay fixed, and so are
// series.fixed of a group built from parts (mergeCourseParts / applyGroupParts in scraper/catalog.js). There
// group.slots says it outright: true means the other series are alternative times, false that all are attended.
const SLOT_TYPES = /^(?:Übung|Übungen|Tutorium|Hörsaalübung)$/i;
export const isFixedSeries = (s) => s.fixed === true || /Vorlesung|Hörsaal-?(?:übung|tutorium)/i.test(s.note ?? '');
export function exerciseSlots(course, group) {
  if (!group || group.slots === false || !(group.slots || SLOT_TYPES.test(course?.type ?? ''))) return null;
  const weekly = group.series.map((s, i) => [s, i]).filter(([s]) => isPlaceable(s) && !isFixedSeries(s));
  const slots = new Map();
  for (const [s, i] of weekly) {
    const key = [s.day, s.start, s.end, s.room ?? ''].join('|');
    if (!slots.has(key)) slots.set(key, { indices: [], series: s });
    slots.get(key).indices.push(i);
  }
  const list = [...slots.values()];
  const sameTime = list.length === 2 && list[0].series.day === list[1].series.day && list[0].series.start === list[1].series.start && list[0].series.end === list[1].series.end;
  return list.length >= 3 || sameTime || (group.slots && list.length >= 2) ? list : null;
}

// Series indices of a group the student attends: with exercise slots only the chosen slot (cfg.slot), plus
// single dates that are not tied to another slot's time (e.g. a room change for one week of that slot).
export function attendedSeries(course, group, slot = 0) {
  const all = group.series.map((_, i) => i);
  const slots = exerciseSlots(course, group);
  if (!slots) return all;
  const chosen = slots[Math.min(slot, slots.length - 1)];
  const other = slots.filter((x) => x !== chosen);
  const otherTime = (s) => other.some(({ series: o }) => o.day === s.day && o.start === s.start) && !(chosen.series.day === s.day && chosen.series.start === s.start);
  const s = (i) => group.series[i];
  return all.filter((i) => (isPlaceable(s(i)) ? isFixedSeries(s(i)) || chosen.indices.includes(i) : !otherTime(s(i))));
}

const EXERCISE_OF = /^(?:Übung|Übungen|Tutorium)\s+(?:zu|zur|zum)\s+(.+)$/i;
const baseTitle = (t) => (t ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();

// Alternatives inside a pick-one module: each exercise ("Übungen zu X") is bundled with lecture X,
// so one option is one subject. Returns [{ id, courseIds }] in module order; the first course leads.
export function courseOptions(module, courses) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const fixed = fixedIds(module);
  const ids = module.courseIds.filter((id) => byId.has(id) && !fixed.has(id));
  const leadOf = new Map();
  for (const id of ids) {
    // An exercise with the lecture's own title ("Präsentationstechniken für MINT", type Übung) also belongs to it.
    if (/^(Übung|Tutorium)/.test(byId.get(id).type ?? '')) {
      const t = baseTitle(byId.get(id).title);
      const lecture = ids.find((o) => o !== id && baseTitle(byId.get(o).title) === t && !/^(Übung|Tutorium)/.test(byId.get(o).type ?? ''));
      if (lecture) {
        leadOf.set(id, lecture);
        continue;
      }
    }
    const rest = EXERCISE_OF.exec(byId.get(id).title ?? '')?.[1]?.toLowerCase();
    if (!rest) continue;
    // Longest lecture title that the exercise title starts with, on a word boundary.
    let best = null;
    for (const other of ids) {
      const t = baseTitle(byId.get(other).title);
      if (other === id || !t || EXERCISE_OF.test(byId.get(other).title)) continue;
      if ((rest === t || rest.startsWith(`${t} `)) && (!best || t.length > best.len)) best = { id: other, len: t.length };
    }
    if (best) leadOf.set(id, best.id);
  }
  const options = new Map();
  for (const id of ids) {
    const lead = leadOf.get(id) ?? id;
    if (!options.has(lead)) options.set(lead, { id: lead, courseIds: [] });
    options.get(lead).courseIds.push(id);
  }
  // Keep the lecture first even if its exercise is listed before it.
  return [...options.values()].map((o) => ({ ...o, courseIds: [o.id, ...o.courseIds.filter((c) => c !== o.id)] }));
}

// Every selected series, deduplicated by course + group + series index (a course can belong to two modules).
export function selectedEntries(data, state) {
  const courses = new Map(data.courses.map((c) => [c.id, c]));
  const modules = new Map(data.modules.map((m) => [m.id, m]));
  const seen = new Set();
  const out = [];
  for (const moduleId of Object.keys(state.modules)) {
    const mod = modules.get(moduleId);
    if (!mod) continue;
    for (const courseId of mod.courseIds) {
      const course = courses.get(courseId);
      if (!course) continue;
      const cfg = courseConfig(state, mod, courseId);
      if (!cfg.on) continue;
      const groupIndex = Math.min(cfg.group, course.groups.length - 1);
      const group = course.groups[groupIndex];
      if (!group) continue;
      const attended = new Set(attendedSeries(course, group, cfg.slot));
      group.series.forEach((series, seriesIndex) => {
        if (cfg.off.includes(seriesIndex) || !attended.has(seriesIndex)) return;
        const key = `${courseId}:${groupIndex}:${seriesIndex}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ key, module: mod, course, groupIndex, seriesIndex, series, grid: inGrid(series, group) });
      });
    }
  }
  return out;
}

const datesOverlap = (a, b) => {
  if (!a.startDate || !b.startDate) return true;
  return a.startDate <= (b.endDate ?? b.startDate) && b.startDate <= (a.endDate ?? a.startDate);
};

// Two placed series clash when they share a weekday, overlap in time, and their date ranges overlap.
// Biweekly series are treated as clashing too: the catalog does not say which weeks they use.
export function seriesConflict(a, b) {
  const timed = (s) => isPlaceable(s) || isSingleDate(s);
  if (!timed(a) || !timed(b) || a.day !== b.day) return false;
  const overlap = toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
  // A single date on a day the weekly series skips does not clash (56694: lecture dates in the tutorial slot).
  const skipped = (one, weekly) => isSingleDate(one) && (weekly.cancelled ?? []).includes(one.startDate);
  return overlap && datesOverlap(a, b) && !skipped(a, b) && !skipped(b, a);
}

// Single dates of one course at the same weekday and time become one grid block listing its dates.
export function mergeSingleDates(entries) {
  const out = [];
  const byKey = new Map();
  for (const e of entries) {
    if (!isSingleDate(e.series)) {
      out.push(e);
      continue;
    }
    const k = [e.ghost ? 'g' : '', e.course.id, e.groupIndex, e.series.day, e.series.start, e.series.end].join(':');
    const prev = byKey.get(k);
    if (prev) {
      prev.keys.push(e.key);
      prev.dates.push(e.series.startDate);
      prev.dates.sort();
      continue;
    }
    const merged = { ...e, keys: [e.key], dates: [e.series.startDate] };
    byKey.set(k, merged);
    out.push(merged);
  }
  return out;
}

// Returns a Set of entry keys that clash with at least one other entry from a different course.
// With a phase, only clashes on dates inside that phase count.
export function findConflicts(entries, phase = null) {
  const clashing = new Set();
  const list = phase ? entries.filter((e) => activeInPhase(e, phase)).map((e) => ({ e, s: clipToPhase(e.series, phase) })).filter((x) => x.s) : entries.map((e) => ({ e, s: e.series }));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].e;
      const b = list[j].e;
      if (a.course.id === b.course.id || a.grid === false || b.grid === false) continue;
      if (seriesConflict(list[i].s, list[j].s)) {
        clashing.add(a.key);
        clashing.add(b.key);
      }
    }
  }
  return clashing;
}

// ---------- phases ----------
// Some courses change their weekly meetings during the semester: eCampus lists several weekly series in one
// group with different date ranges (Tue/Wed/Thu until 14.01, then Mon/Wed/Fri). A phase is a stretch of weeks
// in which the same series run; the week view shows one phase at a time.

const mondayOf = (iso) => addDays(iso, 1 - weekday(iso));
const minDate = (a, b) => (a < b ? a : b);
const maxDate = (a, b) => (a > b ? a : b);

// Single dates at the slot of a weekly series, in weekly steps right before it (a first session in another
// room), are part of it: the series counts from the first of them.
function leadIn(series, group) {
  let from = series.startDate;
  const singles = new Set(
    (group?.series ?? []).filter((s) => isSingleDate(s) && s.day === series.day && s.start === series.start && s.end === series.end).map((s) => s.startDate),
  );
  while (singles.has(addDays(from, -7))) from = addDays(from, -7);
  return from;
}

// Weeks (Mondays, from and to inclusive) a recurring series counts for in the phase split, null when it has none. A start up to a week
// before or after the usual first week of the lecture period counts as that week (some lectures start in the
// introduction week, exercises a week late), and the same holds for the last week. shape: semesterShape(), may be null.
export function seriesWeeks(series, group = null, shape = null) {
  if (!isPlaceable(series) || !series.startDate) return null;
  const begin = leadIn(series, group);
  // A "weekly" series that meets in one week only is a single date: it makes no phase of its own.
  if (addDays(begin, 7) > (series.endDate ?? series.startDate)) return null;
  let from = mondayOf(begin);
  let to = mondayOf(series.endDate ?? series.startDate);
  if (shape?.start) {
    const first = mondayOf(shape.start);
    if (addDays(first, -7) <= from && from <= addDays(first, 7)) from = first;
  }
  if (shape?.end) {
    const last = mondayOf(shape.end);
    if (addDays(last, -7) <= to && to <= addDays(last, 7)) to = last;
  }
  return from <= to ? { from, to } : null;
}

// First and last meeting of a weekly (or biweekly) series between two dates, skipping cancelled dates; null
// when it does not meet there.
function meetings(series, from, to) {
  const step = series.rhythm === '14-täglich' ? 14 : 7;
  const end = minDate(series.endDate ?? series.startDate, to);
  const skip = new Set(series.cancelled ?? []);
  let first = null;
  let last = null;
  for (let d = addDays(series.startDate, (series.day - weekday(series.startDate) + 7) % 7); d <= end; d = addDays(d, step)) {
    if (d < from || skip.has(d)) continue;
    first ??= d;
    last = d;
  }
  return first ? { first, last } : null;
}

// Phases of a list of items { key, series, weeks?, sig? }: weeks from seriesWeeks (single dates have none and
// only show up in the phases their date falls in). Neighbouring weeks whose running items have the same
// signatures (default: key) form one phase. Weeks without classes (a break, shape.breaks on every weekday, or
// nothing running) join the phase after them, so a series paused over Christmas is no change. A one-week phase
// that only lacks something of its neighbour (a class starting a week later or ending a week earlier) joins that
// neighbour. Returns [{ from, to, first, last, keys: Set }]: from/to Monday and Sunday, first/last the first and
// last meeting inside. One phase (or none) means the timetable never changes.
export function computePhases(items, shape = null) {
  const weekly = items.filter((i) => i.weeks);
  if (!weekly.length) return [];
  const start = weekly.reduce((m, i) => minDate(m, i.weeks.from), weekly[0].weeks.from);
  const end = weekly.reduce((m, i) => maxDate(m, i.weeks.to), weekly[0].weeks.to);
  const breaks = shape?.breaks ?? new Set();
  let phases = [];
  let pendingFrom = null;
  for (let w = start; w <= end; w = addDays(w, 7)) {
    const running = weekly.filter((i) => i.weeks.from <= w && w <= i.weeks.to);
    if (!running.length || [0, 1, 2, 3, 4].every((n) => breaks.has(addDays(w, n)))) {
      pendingFrom ??= w;
      continue;
    }
    const sigs = new Set(running.map((i) => i.sig ?? i.key));
    const sig = [...sigs].sort().join('|');
    const prev = phases.at(-1);
    if (prev && prev.sig === sig) {
      prev.to = addDays(w, 6);
      prev.weeks++;
      running.forEach((i) => prev.keys.add(i.key));
    } else {
      phases.push({ from: pendingFrom ?? w, to: addDays(w, 6), sig, sigs, weeks: 1, keys: new Set(running.map((i) => i.key)) });
    }
    pendingFrom = null;
  }
  if (pendingFrom && phases.length) phases.at(-1).to = addDays(end, 6);
  const subset = (a, b) => [...a.sigs].every((x) => b.sigs.has(x));
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    // At the start or end of the semester a phase of up to three weeks is a late start or an early end (the
    // block says from or until when), not a timetable of its own.
    const edge = (i === 0 || i === phases.length - 1) && p.weeks <= 3;
    if ((p.weeks !== 1 && !edge) || phases.length < 2) continue;
    const next = phases[i + 1];
    const prev = phases[i - 1];
    const into = next && subset(p, next) ? next : prev && subset(p, prev) ? prev : null;
    if (!into) continue;
    into.from = minDate(into.from, p.from);
    into.to = maxDate(into.to, p.to);
    into.weeks += 1;
    p.keys.forEach((k) => into.keys.add(k));
    phases.splice(i, 1);
    // The phases on both sides of the merged week may now be the same.
    for (let j = 1; j < phases.length; j++) {
      if (phases[j].sig !== phases[j - 1].sig) continue;
      phases[j - 1].to = phases[j].to;
      phases[j - 1].weeks += phases[j].weeks;
      phases[j].keys.forEach((k) => phases[j - 1].keys.add(k));
      phases.splice(j--, 1);
    }
    i = -1;
  }
  // Meetings before the first or after the last phase week (intro week, a week over the end) still count.
  phases = phases.map(({ from, to, keys }, n) => {
    const dates = weekly
      .filter((i) => keys.has(i.key))
      .map((i) => meetings(i.series, n === 0 ? '0000-01-01' : from, n === phases.length - 1 ? '9999-12-31' : to))
      .filter(Boolean);
    const first = dates.length ? dates.reduce((m, d) => minDate(m, d.first), dates[0].first) : from;
    const last = dates.length ? dates.reduce((m, d) => maxDate(m, d.last), dates[0].last) : to;
    return { from, to, first, last, keys };
  });
  return phases;
}

// Phase items for selected entries: weekly series in the grid. The signature is the block as the week view
// draws it (course, weekday, time), so a series split in two with the same slot is no change.
export function entryPhaseItems(entries, shape = null) {
  return entries
    .filter((e) => e.grid !== false && isPlaceable(e.series))
    .map((e) => ({
      key: e.key,
      series: e.series,
      weeks: seriesWeeks(e.series, e.course.groups[e.groupIndex], shape),
      sig: [e.course.id, e.series.day, e.series.start, e.series.end, e.series.rhythm].join(':'),
    }));
}

export const selectionPhases = (entries, shape = null) => computePhases(entryPhaseItems(entries, shape), shape);

// The phase a date (YYYY-MM-DD) falls in: before the first phase the first, after the last the last.
export function phaseIndexAt(phases, date) {
  if (!phases.length) return -1;
  const i = phases.findIndex((p) => date <= p.to);
  return i < 0 ? phases.length - 1 : i;
}

// Whether a selected entry is on the timetable of a phase. Weekly series by their phase weeks (phase.keys when
// the phase came from these entries), single dates by their date. Entries without dates always show.
export function activeInPhase(entry, phase, shape = null) {
  const s = entry.series;
  if (isPlaceable(s)) {
    if (phase.keys?.has(entry.key)) return true;
    const w = s.startDate ? seriesWeeks(s, entry.course?.groups?.[entry.groupIndex], shape) : null;
    if (w) return w.from <= phase.to && phase.from <= addDays(w.to, 6);
  }
  if (entry.dates) return entry.dates.some((d) => phase.from <= d && d <= phase.to);
  if (!s.startDate) return true;
  return s.startDate <= phase.to && phase.from <= (s.endDate ?? s.startDate);
}

// The grid entries of one phase. A slot entered as two series (before and after Christmas, say) shows once,
// as the series with most days in the phase; the block carries the keys of both (for clash marks).
export function phaseEntries(entries, phase, shape = null) {
  const out = [];
  const bySlot = new Map();
  const days = (e) => {
    const c = clipToPhase(e.series, phase);
    return c ? new Date(`${c.endDate}T12:00:00Z`) - new Date(`${c.startDate}T12:00:00Z`) : -1;
  };
  for (const e of entries) {
    if (!activeInPhase(e, phase, shape)) continue;
    if (!isPlaceable(e.series)) {
      out.push(e);
      continue;
    }
    const slot = [e.ghost ? 'g' : '', e.course.id, e.series.day, e.series.start, e.series.end].join(':');
    const prev = bySlot.get(slot);
    if (!prev) {
      const item = { ...e, keys: [...(e.keys ?? [e.key])] };
      bySlot.set(slot, item);
      out.push(item);
    } else if (days(e) > days(prev)) {
      const item = { ...e, keys: [...prev.keys, ...(e.keys ?? [e.key])] };
      bySlot.set(slot, item);
      out[out.indexOf(prev)] = item;
    } else {
      prev.keys.push(...(e.keys ?? [e.key]));
    }
  }
  return out;
}

// When a weekly series shown in a phase starts more than a week after the phase's first meeting or ends more than a
// week before its last: { from } or { until } (the first or last meeting), for a note on the block. Else null.
export function partialInPhase(series, phase) {
  if (!isPlaceable(series) || !series.startDate || !phase?.first) return null;
  const m = meetings(series, '0000-01-01', '9999-12-31');
  if (!m) return null;
  if (m.first > addDays(phase.first, 7)) return { from: m.first };
  if (m.last < addDays(phase.last, -7)) return { until: m.last };
  return null;
}

// A series cut to the dates of a phase (for clashes inside it); null when nothing is left.
export function clipToPhase(series, phase) {
  if (!series.startDate) return series;
  const startDate = maxDate(series.startDate, phase.from);
  const endDate = minDate(series.endDate ?? series.startDate, phase.to);
  return startDate <= endDate ? { ...series, startDate, endDate } : null;
}

// The dates a timetable changes on (first day of every phase after the first) and, per change, which courses
// start or stop meeting at a slot. For the notice above the week.
export function phaseChanges(phases, entries) {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  return phases.slice(1).map((p, i) => {
    const prev = phases[i];
    const changed = new Set();
    for (const k of new Set([...p.keys, ...prev.keys])) {
      if (p.keys.has(k) !== prev.keys.has(k) && byKey.get(k)) changed.add(byKey.get(k).course.id);
    }
    return { date: p.first, phase: i + 1, courseIds: [...changed] };
  });
}

// Phases of one parallel group on its own (the course detail lists them), and the series whose dates should be
// written next to them: all weekly series when the group has phases, otherwise those that run only part of the
// lecture period.
export function groupPhases(group, shape = null) {
  const items = (group?.series ?? []).map((s, i) => ({ key: String(i), series: s, weeks: seriesWeeks(s, group, shape), sig: [s.day, s.start, s.end, s.rhythm].join(':') }));
  const phases = computePhases(items, shape);
  const full = shape?.start && shape?.end ? seriesWeeks({ rhythm: 'wöchentlich', day: 1, start: '00:00', end: '00:01', startDate: shape.start, endDate: shape.end }, null, shape) : null;
  const dated = new Set(
    items
      .filter((x) => isPlaceable(x.series) && x.series.startDate && (phases.length > 1 || !full || !x.weeks || x.weeks.from !== full.from || x.weeks.to !== full.to))
      .map((x) => Number(x.key)),
  );
  return { phases, dated };
}

// A pick-one module counts (credits, requirements) only once its options are chosen: pick.count of them,
// or all the semester offers when that is fewer. Fixed courses alone are not enough.
export function moduleComplete(data, state, module) {
  if (!state.modules[module.id]) return false;
  if (!module.pickOne) return true;
  const options = courseOptions(module, data.courses);
  const chosen = options.filter((o) => o.courseIds.some((id) => courseConfig(state, module, id).on)).length;
  return chosen >= Math.min(pickCount(module), options.length);
}

// pending: selected pick-one modules still waiting for a choice; they add no credits yet.
export function totalEcts(data, state) {
  const modules = new Map(data.modules.map((m) => [m.id, m]));
  let sum = 0;
  let unknown = 0;
  let pending = 0;
  for (const id of Object.keys(state.modules)) {
    const m = modules.get(id);
    if (!m) continue;
    if (!moduleComplete(data, state, m)) pending++;
    else if (m.ects == null) unknown++;
    else sum += m.ects;
  }
  return { sum, unknown, pending };
}

// Side-by-side layout for overlapping blocks in one day column.
// Input: entries of a single day. Output: Map key -> { col, cols }.
export function layoutDay(entries) {
  const sorted = [...entries].sort(
    (a, b) => toMinutes(a.series.start) - toMinutes(b.series.start) || toMinutes(b.series.end) - toMinutes(a.series.end),
  );
  const result = new Map();
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const colEnds = [];
    for (const e of cluster) {
      const start = toMinutes(e.series.start);
      let col = colEnds.findIndex((end) => end <= start);
      if (col < 0) col = colEnds.length;
      colEnds[col] = toMinutes(e.series.end);
      result.set(e.key, { col, cols: 0 });
    }
    for (const e of cluster) result.get(e.key).cols = colEnds.length;
    cluster = [];
  };
  for (const e of sorted) {
    if (cluster.length && toMinutes(e.series.start) >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, toMinutes(e.series.end));
  }
  if (cluster.length) flush();
  return result;
}

// Text search and filters over modules. Returns matching modules in input order.
// Teaching languages of a course, from the scraper's check (course.lang, group.lang): codes "de" and "en",
// plus unknown when a course or group has no reliable language. Null when the program was not checked.
export function courseLanguages(course) {
  if (!course.lang) return null;
  const codes = new Set();
  let unknown = false;
  const add = (code) => {
    if (code === 'de-en') codes.add('de').add('en');
    else if (code === 'de' || code === 'en') codes.add(code);
    else unknown = true;
  };
  if (course.lang.code === 'mixed') course.groups.forEach((g) => add(g.lang));
  else add(course.lang.code);
  return { codes, unknown };
}

export function moduleLanguages(mod, courseById) {
  const all = mod.courseIds.map((id) => courseById.get(id)).filter(Boolean).map(courseLanguages).filter(Boolean);
  if (!all.length) return null;
  return { codes: new Set(all.flatMap((l) => [...l.codes])), unknown: all.some((l) => l.unknown) };
}

export function filterModules(data, { query = '', area = '', type = '', day = 0, category = '', language = '' } = {}) {
  const courses = new Map(data.courses.map((c) => [c.id, c]));
  const q = query.trim().toLowerCase();
  return data.modules.filter((m) => {
    const list = m.courseIds.map((id) => courses.get(id)).filter(Boolean);
    if (category && !(m.categories ?? []).includes(category)) return false;
    if (language && !moduleLanguages(m, courses)?.codes.has(language)) return false;
    if (area && !m.areas.some((a) => a === area || a.startsWith(area + ' > '))) return false;
    if (type && !list.some((c) => c.type === type)) return false;
    if (day && !list.some((c) => c.groups.some((g) => g.series.some((s) => s.day === day && isRecurring(s))))) return false;
    if (!q) return true;
    const hay = [
      m.title,
      m.titleEn ?? '',
      ...m.areas,
      ...list.flatMap((c) => [c.title, c.titleEn ?? '', c.number, c.type ?? '', c.typeEn ?? '', c.responsible ?? '']),
    ].join(' ').toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}

// Required categories: covered when enough selected modules belong to it (count, default one) or the
// user marked it as already passed.
export function categoryStatus(data, state) {
  const done = new Set(state.doneCategories ?? []);
  return (data.categories ?? []).map((c) => {
    const modules = data.modules.filter((m) => moduleComplete(data, state, m) && (m.categories ?? []).includes(c.id));
    const need = c.count ?? 1;
    const inOption = (o) => (m) => (o.type === 'module' ? m.title === o.id : m.areas.some((a) => a === o.id || a.startsWith(`${o.id} > `)));
    const ectsOf = (list) => list.reduce((sum, m) => sum + (m.ects ?? 0), 0);
    // "ects": the PO asks for credits, not a number of modules. The goal is capped at what this
    // semester offers (per option for "oneOf"), like counts are capped when rules are written.
    const offered = data.modules.filter((m) => (m.categories ?? []).includes(c.id));
    const pools = c.group === 'oneOf' ? (c.options ?? []).map((o) => [modules.filter(inOption(o)), offered.filter(inOption(o))]) : [[modules, offered]];
    const meets = ([chosen, avail]) => chosen.length >= need && (c.ects == null || ectsOf(chosen) >= Math.min(c.ects, ectsOf(avail)));
    // "oneOf": all `need` modules (and credits) must come from one option (e.g. one specialization of the student's choice).
    const enough = pools.some(meets);
    const ects = c.ects == null ? null : Math.max(0, ...pools.map(([chosen]) => ectsOf(chosen)));
    return { ...c, need, modules, ectsHave: ects, done: done.has(c.id), covered: done.has(c.id) || enough };
  });
}

// ---------- free days and ready-made programs ----------

// Every way to take a module: one parallel group per course, and in pick-one modules one option
// (lecture + exercise). Returns [{ courses: { [courseId]: { on, group, off } }, series: [{ courseId, series }] }].
export function moduleVariants(module, courses, limit = 24) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const fixed = (module.pick?.fixed ?? []).filter((id) => byId.has(id));
  const bundles = module.pickOne
    ? choose(courseOptions(module, courses), pickCount(module), limit).map((os) => [...fixed, ...os.flatMap((o) => o.courseIds)])
    : [module.courseIds.filter((id) => byId.has(id))];
  const out = [];
  for (const ids of bundles) {
    let combos = [[]];
    for (const id of ids) {
      const course = byId.get(id);
      // One choice per parallel group, and per exercise slot inside a group.
      const choices = (course.groups.length ? course.groups : [null]).flatMap((group, g) =>
        Array.from({ length: exerciseSlots(course, group)?.length ?? 1 }, (_, slot) => [id, g, slot]),
      );
      combos = combos.flatMap((c) => choices.map((choice) => [...c, choice])).slice(0, limit);
    }
    for (const combo of combos) {
      const variant = { courses: {}, series: [] };
      for (const [id, g, slot] of combo) {
        variant.courses[id] = { on: true, group: g, off: [], ...(slot ? { slot } : {}) };
        const group = byId.get(id).groups[g];
        for (const i of group ? attendedSeries(byId.get(id), group, slot) : []) variant.series.push({ courseId: id, series: group.series[i] });
      }
      out.push(variant);
    }
  }
  return out;
}

// Up to limit ways to pick k items, in order (fewer items than k: all of them).
function choose(items, k, limit) {
  if (k >= items.length) return [items];
  const out = [];
  const walk = (start, picked) => {
    if (out.length >= limit) return;
    if (picked.length === k) return void out.push(picked);
    for (let i = start; i < items.length; i++) walk(i + 1, [...picked, items[i]]);
  };
  walk(0, []);
  return out;
}

// Variants with no weekly meeting on any of the given weekdays (1 = Monday).
export function fittingVariants(module, courses, freeDays = []) {
  return moduleVariants(module, courses).filter(
    (v) => !v.series.some(({ series }) => isPlaceable(series) && freeDays.includes(series.day)),
  );
}

// Small seeded PRNG so "show other programs" is repeatable for a given seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const clashesWith = (item, placed) =>
  isPlaceable(item.series) && placed.some((p) => p.courseId !== item.courseId && isPlaceable(p.series) && seriesConflict(p.series, item.series));

// Weekdays (1-5) with no weekly meeting all semester, and idle minutes between classes in a week. With a
// semester shape the idle minutes are counted per phase (a class that ends in January leaves no gap next to
// one that starts then) and averaged over the weeks.
export function weekShape(series, shape = null) {
  const placeable = series.filter(isPlaceable);
  const freeWeekdays = [1, 2, 3, 4, 5].filter((d) => !placeable.some((s) => s.day === d));
  const phases = shape ? computePhases(placeable.map((s, i) => ({ key: String(i), series: s, weeks: seriesWeeks(s, null, shape) })), shape) : [];
  if (phases.length < 2) return { freeWeekdays, gapMinutes: idleMinutes(placeable) };
  let weighted = 0;
  let weeks = 0;
  for (const p of phases) {
    const n = Math.round((new Date(`${p.to}T12:00:00Z`) - new Date(`${p.from}T12:00:00Z`)) / (7 * 864e5));
    const list = placeable.filter((s, i) => activeInPhase({ key: String(i), series: s }, p, shape));
    weighted += n * idleMinutes(list);
    weeks += n;
  }
  return { freeWeekdays, gapMinutes: Math.round(weighted / weeks) };
}

function idleMinutes(series) {
  const byDay = new Map();
  for (const s of series) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day).push([toMinutes(s.start), toMinutes(s.end)]);
  }
  let gapMinutes = 0;
  for (const spans of byDay.values()) {
    spans.sort((a, b) => a[0] - b[0]);
    let end = spans[0][1];
    for (const [s, e] of spans.slice(1)) {
      if (s > end) gapMinutes += s - end;
      end = Math.max(end, e);
    }
  }
  return gapMinutes;
}

// Conflict-free programs near the ECTS target. Kept modules stay as they are; the rest is filled with
// randomized greedy picks that favor uncovered requirement categories. Deterministic for a given seed.
// favor: module ids of an interest area, picked and scored higher. goal: "balanced", "requirements"
// (cover as many open requirements as possible) or "compact" (as many free weekdays as possible).
// popular: module ids, most popular first; they are picked and scored higher, the first ones most.
// Project modules (every course a "Projekt") are left out: a ready-made semester should be regular classes.
export function suggestPrograms(
  data,
  { freeDays = [], target = 30, keep = {}, done = [], count = 6, seed = 1, attempts = 300, skipSections = ['admission', 'german'], favor = [], goal = 'balanced', popular = [], shape = null } = {},
) {
  const rand = mulberry32(seed);
  const favored = new Set(favor);
  // 1 for the most popular module down to just above 0 for the last listed one, 0 for the rest.
  const popularity = new Map(popular.map((id, i) => [id, 1 - i / popular.length]));
  const pop = (id) => popularity.get(id) ?? 0;
  // An interest program is about its area: open requirements only nudge the picks there.
  const coverWeight = goal === 'requirements' ? { area: 12, other: 6 } : favor.length ? { area: 1.5, other: 1 } : { area: 6, other: 2 };
  const categoryGroup = new Map((data.categories ?? []).map((c) => [c.id, c.group]));
  const kept = data.modules.filter((m) => keep[m.id]);
  const keptSeries = selectedEntries(data, { modules: keep }).map((e) => ({ courseId: e.course.id, series: e.series }));
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  // Courses with no dates at all this semester (listed in eCampus, but not offered yet) cannot be attended.
  const offered = (m) => m.courseIds.some((id) => courseById.get(id)?.groups.length);
  const project = (m) => m.courseIds.length > 0 && m.courseIds.every((id) => /^Projekt/i.test(courseById.get(id)?.type ?? ''));
  const pool = data.modules
    .filter((m) => !keep[m.id] && m.ects != null && !skipSections.includes(m.section) && offered(m) && !project(m))
    .map((m) => ({ m, variants: fittingVariants(m, data.courses, freeDays) }))
    .filter((c) => c.variants.length);

  const found = new Map();
  for (let attempt = 0; attempt < attempts; attempt++) {
    const picked = {};
    const unscheduled = kept.filter((m) => !moduleVariants(m, data.courses).some((v) => v.series.some((x) => isPlaceable(x.series)))).map((m) => m.id);
    const placed = [...keptSeries];
    const covered = new Set([...done, ...kept.flatMap((m) => m.categories ?? [])]);
    const used = new Set(kept.flatMap((m) => m.courseIds));
    let ects = kept.reduce((s, m) => s + (m.ects ?? 0), 0);
    let left = [...pool];
    while (ects < target) {
      left = left.filter(({ m }) => ects + m.ects <= target + 2 && !m.courseIds.some((id) => used.has(id)));
      if (!left.length) break;
      // Area requirements weigh most, then project/seminar/key competencies, then free electives.
      const weight = ({ m }) => {
        const open = (m.categories ?? []).filter((c) => !covered.has(c));
        const base = open.some((c) => categoryGroup.get(c) === 'area') ? coverWeight.area : open.length ? coverWeight.other : 1;
        // In an interest program the area's own modules come first; popularity mostly ranks inside the area.
        return favored.has(m.id) ? base * 24 * (1 + 3 * pop(m.id)) : base * (1 + (favored.size ? 1 : 3) * pop(m.id));
      };
      const total = left.reduce((s, c) => s + weight(c), 0);
      let r = rand() * total;
      let i = 0;
      while (i < left.length - 1 && (r -= weight(left[i])) > 0) i++;
      const [cand] = left.splice(i, 1);
      const variant = shuffled(cand.variants, rand).find((v) => v.series.every((s) => !clashesWith(s, placed)));
      if (!variant) continue;
      picked[cand.m.id] = { courses: variant.courses };
      // "nach Vereinbarung" courses have no weekly slot yet: they take time, just not a known day.
      if (!variant.series.some((x) => isPlaceable(x.series))) unscheduled.push(cand.m.id);
      placed.push(...variant.series);
      for (const c of cand.m.categories ?? []) covered.add(c);
      for (const id of cand.m.courseIds) used.add(id);
      ects += cand.m.ects;
    }
    const added = Object.keys(picked).sort();
    const key = added.join(',');
    if (!added.length || found.has(key)) continue;
    const week = weekShape(placed.map((p) => p.series), shape);
    const newlyCovered = (data.categories ?? [])
      .filter((c) => covered.has(c.id) && !done.includes(c.id) && !kept.some((m) => (m.categories ?? []).includes(c.id)))
      .map((c) => c.id);
    const favoredCount = added.filter((id) => favored.has(id)).length;
    const score =
      -2 * Math.abs(target - ects) +
      (goal === 'requirements' ? 4 : favored.size ? 0.5 : 1.5) * newlyCovered.length +
      (goal === 'compact' ? 4 : 1) * week.freeWeekdays.length -
      (goal === 'compact' ? 3 : 0.5) * unscheduled.length -
      week.gapMinutes / 200 +
      6 * favoredCount +
      2 * added.reduce((s, id) => s + (favored.size && !favored.has(id) ? pop(id) / 3 : pop(id)), 0);
    found.set(key, { modules: { ...keep, ...picked }, added, ects, newlyCovered, favoredCount, unscheduled, ...week, score });
  }

  // Best first, skipping programs that differ from an already chosen one by a single module.
  const ranked = [...found.values()].sort((a, b) => b.score - a.score);
  const chosen = [];
  const similar = (a, b) => a.added.filter((id) => !b.added.includes(id)).length <= 1 && Math.abs(a.added.length - b.added.length) <= 1;
  for (const p of ranked) if (chosen.length < count && !chosen.some((c) => similar(c, p))) chosen.push(p);
  for (const p of ranked) if (chosen.length < count && !chosen.includes(p)) chosen.push(p);
  return chosen;
}

// A fixed program (someone's own plan) in the shape suggestPrograms returns. modules: { moduleId: { courses } }.
export function fixedProgram(data, modules, { favor = [], shape = null } = {}) {
  const ids = Object.keys(modules).filter((id) => data.modules.some((m) => m.id === id));
  const mods = ids.map((id) => data.modules.find((m) => m.id === id));
  const picked = Object.fromEntries(ids.map((id) => [id, structuredClone(modules[id])]));
  const entries = selectedEntries(data, { modules: picked });
  const covered = new Set(mods.flatMap((m) => m.categories ?? []));
  return {
    modules: picked,
    added: [...ids].sort(),
    ects: mods.reduce((s, m) => s + (m.ects ?? 0), 0),
    newlyCovered: (data.categories ?? []).filter((c) => covered.has(c.id)).map((c) => c.id),
    favoredCount: ids.filter((id) => favor.includes(id)).length,
    unscheduled: mods.filter((m) => !entries.some((e) => e.module.id === m.id && isPlaceable(e.series))).map((m) => m.id),
    ...weekShape(entries.map((e) => e.series), shape),
    score: 0,
  };
}

// ---------- compulsory modules ----------
// Rules categories marked "compulsory" (checked against the PO: every module of the category must be taken).
// Modules placed in a category by guesswork (unlisted courses) do not count as compulsory.
export const compulsoryCategories = (data) => (data.categories ?? []).filter((c) => c.compulsory);
export function compulsoryModules(data) {
  const ids = new Set(compulsoryCategories(data).map((c) => c.id));
  return data.modules.filter((m) => !m.unlisted && (m.categories ?? []).some((id) => ids.has(id)));
}

// The compulsory modules this semester offers that are not chosen yet, each with the parallel-group combination
// that clashes least with what is chosen so far (date-aware, so courses of different phases do not clash), then
// avoids free days. Modules with fewer combinations go first so they keep their only slot. Pick-one modules are
// added like a manual click: fixed courses on, the option left to the student.
export function compulsoryPlan(data, state, { freeDays = [] } = {}) {
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  const all = compulsoryModules(data);
  const offered = all.filter((m) => m.courseIds.some((id) => courseById.get(id)?.groups.length));
  const todo = offered.filter((m) => !state.modules[m.id]);
  const placed = selectedEntries(data, state).map((e) => ({ courseId: e.course.id, series: e.series }));
  const variants = new Map(todo.map((m) => [m.id, m.pickOne ? [] : moduleVariants(m, data.courses)]));
  const modules = {};
  let clashes = 0;
  for (const m of [...todo].sort((a, b) => variants.get(a.id).length - variants.get(b.id).length)) {
    const cost = (v) => ({
      clash: v.series.filter((item) => clashesWith(item, placed)).length,
      free: v.series.filter(({ series }) => isPlaceable(series) && freeDays.includes(series.day)).length,
    });
    let best = null;
    for (const v of variants.get(m.id)) {
      const c = cost(v);
      if (!best || c.clash < best.c.clash || (c.clash === best.c.clash && c.free < best.c.free)) best = { v, c };
    }
    modules[m.id] = { courses: best ? best.v.courses : {} };
    if (best) {
      clashes += best.c.clash;
      placed.push(...best.v.series);
    }
  }
  return {
    modules,
    added: todo.map((m) => m.id),
    chosen: offered.filter((m) => state.modules[m.id]).map((m) => m.id),
    notOffered: all.filter((m) => !offered.includes(m)).map((m) => m.id),
    clashes,
  };
}
// Room of a series. Some lecturers leave the room column empty and write it in the remark
// ("Vorlesung, Raum 0445E im Fachgebiet", "Findet in der WA71 R. 0117 statt"); take the room phrase from there.
const ROOM_IN_NOTE = new RegExp(
  [
    // "Raum 0445E im Fachgebiet", "Seminarraum 3001, Mosenthalstr. 8", "Hörsaal -1319", "Raum WA 2315", "Raum im Fachgebiet"
    String.raw`(?:Seminarraum|Fachgebietsraum|Multifunktionsraum|Hörsaal|Labor|Raum)\s+(?:(?:WA\s+)?-?\d[\w/-]*(?:\.\d+)*(?:,\s*[A-ZÄÖÜ][\wäöüß-]*(?:[sS]tr\.|[sS]traße)\s*\d+(?:\s?[a-z]\b)?)?|(?=im ))(?:\s*im (?:Fachgebiet|Gebäude)(?: \d+)?)?(?:\s*\(Raum\s+-?\d+\w*\))?(?:\s*\([A-ZÄÖÜ][^()]*\d[^()]*\))?`,
    // Named rooms: "Raum Incon (Moritzstr. 2)", "Seminarraum Soziologie"
    String.raw`(?:Seminarraum|Raum)\s+(?!im\b|Fachgebiet\b)[A-ZÄÖÜ][\wäöüß]+(?:\s*\([^)]*\d[^)]*\))?`,
    // "Place: ComLab", "Ort: Labor 0329"
    String.raw`(?<=\b(?:Place|Ort):\s?)[A-ZÄÖÜ0-9][\w-]*`,
    // "R. 0644 / 0645", "R2335/R2348", with a building in front: "WA71 R. 0117", "Mö7, R. 4223"
    String.raw`(?:(?:WA|Mö)\s?\d+,?\s)?\bR\.?\s?-?\d{3,4}[a-z]?(?:\s*\/\s*R?\.?\s?\d{3,4}[a-z]?)*`,
    // "KIS-Seminarraum [Kassel Institut 3231]"
    String.raw`\b[A-ZÄÖÜ][\w]*-Seminarraum\b(?:\s*\[[^\]]+\])?`,
  ].join('|'),
  'g',
);
// Remarks whose room the patterns below cannot read, or would read wrongly (checked against eCampus
// with Grok, WiSe 2026/27). An empty string means the remark names no class room.
const NOTE_ROOMS = {
  'Vorbesprechung am 21.10.2026 um 10.00 Uhr, Labor im Fachgebiet ComLab, Eingang 2315': 'Labor ComLab im Fachgebiet (Eingang 2315)',
  'No lecture on 18.12.2026.Time was shifted to 14:15 to avoid overlap with nanophysics.Room is IBC3112': 'IBC3112',
  'Findet in der Mönchebergstraße 7 im Raum 2720 (zum Konstruieren) sowie im Raum 0517 (Labor mit Windkanal) statt.': 'Raum 2720 und Raum 0517 (Möncheberg 7)',
  'Wednesday, March 3, 14 – 16 h: Preparation in German for students only (Room 1216, Arnold-Bode-Str. 10)': 'Raum 1216 (Arnold-Bode 10)',
  'Monday, March 8, 10 – 14 h: Debriefing in German for students only (Room 1216, Arnold-Bode-Str. 10)': 'Raum 1216 (Arnold-Bode 10)',
  'Thursday, March 4 (1pm-8pm) and Friday, March 5 (8am-8pm): International Workshop in English (room: Senatssaal)': 'Senatssaal',
  'Die Veranstaltung findet in der Supervisionspraxis von Thomas Thiel in der Mariendorfer Str. 7 in Kassel statt.': 'Mariendorfer Str. 7, Kassel',
  'Die Veranstaltung findet in der Praxis statt:Praxis für Systemische Beratung und Supervision Diana Sahr, Max-Planck-Str. 36, 34131 Kassel': 'Max-Planck-Str. 36, Kassel',
  'Ort: Diakonisches Werk Region Kassel, Wildemannsgasse 14, 34117 Kassel, Erdgeschoß': 'Diakonisches Werk, Wildemannsgasse 14, Kassel',
  'HS Fulda, R 22.026; VL von': 'Hochschule Fulda, R 22.026',
  'Ort: SDG +LAB': 'SDG +LAB',
  'Vorlesung Labor 0303c im Fachgebiet IES bei Prof. Sick': 'Labor 0303c im Fachgebiet IES',
};
// Remarks that contain one of these name that place.
const NOTE_ROOM_PREFIXES = [
  ['Ort: Diakonisches Werk Region Kassel, Wildemannsgasse 14', 'Diakonisches Werk, Wildemannsgasse 14, Kassel'],
  ['Ort: Universität Kassel, Wissenschaftliches Zentrum für Informationstechnikgestaltung (ITeG)', 'ITeG, Pfannkuchstr. 1'],
  ['(Start 15 Uhr) bis zum 24.01.27 (Ende 15 Uhr). Das Seminar findet statt in der: Tagungsstätte lila_bunt', 'Tagungsstätte lila_bunt, Zülpich'],
  ['Das Seminar findet an der Uni Göttingen in Präsenz statt!', 'Uni Göttingen, Zentralcampus, VG 3.105'],
];

// A remark as the checked room tables key it: markup replaced by spaces, at most 600 characters.
export const noteKey = (text) => (text ?? '').replace(/<[^>]+>/g, ' ').slice(0, 600);

export function roomOf(series) {
  if (series.room) return series.room;
  let note = (series.note ?? '').replace(/\u200b/g, '').trim();
  if (noteKey(series.note) in CLASS_ROOMS) return CLASS_ROOMS[noteKey(series.note)];
  if (note in NOTE_ROOMS) return NOTE_ROOMS[note];
  const known = NOTE_ROOM_PREFIXES.find(([part]) => note.includes(part));
  if (known) return known[1];
  // The whole remark is an eCampus room name ("Raum 1112, Seminarraum 3 (Moritzstr. 18 Campus Center)").
  if (/^(?:Raum|Hörsaal|Seminarraum) [^()]{1,60}\([^()]+\)$/.test(note)) return note;
  // A room in a kick-off or introduction clause is that meeting's room, not the class room, and a notice
  // board ("Aushangkasten neben Raum 1104") is no class room either: only read what comes before them
  // ("R. 2315 ComLab, Kick-off meeting is on 01.02.2027").
  const kickoff = note.search(/Vorbesprechung|Kick-?Off|Einführungs(?:termin|veranstaltung|sitzung)|Aushang/i);
  if (kickoff >= 0) note = note.slice(0, kickoff);
  const all = [...note.matchAll(ROOM_IN_NOTE)].map((m) => m[0].trim());
  const numbered = all.filter((r) => /\d/.test(r));
  const pool = numbered.length ? numbered : all;
  // "first session in Hörsaal X, ab 27.10 Raum Y": the room after "ab <date>" is the regular one. Otherwise the
  // first room named is the class room ("Raum 0504, Diagonale 5, Hörsaal 3").
  const room = (/\bab\s+\d/.test(note) ? pool.at(-1) : pool[0]) ?? '';
  // "Raum Fachgebiet" is a shorthand for "Raum im Fachgebiet" (no number given).
  return room || (/^Raum Fachgebiet\b/.test(note.trim()) ? 'Raum im Fachgebiet' : '');
}

// ---------- important notes ----------

const MONTHS_DE = { januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };
const pad = (n) => String(n).padStart(2, '0');

// First date in a German remark: "22.10.2026", "20.10." (year from context) or "26. Oktober".
export function noteDate(text, year) {
  let m = /(\d{1,2})\.(\d{1,2})\.(\d{4})?/.exec(text);
  if (m) return `${m[3] ?? year}-${pad(m[2])}-${pad(m[1])}`;
  m = /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/i.exec(text);
  return m ? `${year}-${pad(MONTHS_DE[m[2].toLowerCase()])}-${pad(m[1])}` : null;
}

// Time or time range written before "Uhr": "14.00 Uhr", "12:00-13:00 Uhr", "von 14:45 bis 16 Uhr".
export function noteTime(text) {
  const m = /(\d{1,2})[.:](\d{2})(?:\s*(?:-|bis)\s*(\d{1,2})(?:[.:](\d{2}))?)?\s*Uhr/.exec(text);
  if (!m) return null;
  const start = `${pad(m[1])}:${m[2]}`;
  return m[3] ? `${start}-${pad(m[3])}:${m[4] ?? '00'}` : start;
}

// Room named in a remark, without the "no kick-off rooms" rule of roomOf: "Raum 0328", "Ort: 0307".
function noteRoom(text) {
  // Compound names like "Multifunktionsraum 1624" count too; they are normalized to "Raum 1624".
  const m = [...text.matchAll(/(Hörsaal|\p{L}*[Rr]aum|Ort:)\s*(-?\d[\w/-]*(?:\.\d+)*)(\s*im Fachgebiet)?/gu)].at(-1);
  if (!m) return null;
  return `${m[1] === 'Hörsaal' ? 'Hörsaal' : 'Raum'} ${m[2]}${m[3] ?? ''}`.trim();
}

const NOTE_ORDER = { first: 0, kickoff: 1, registration: 2, note: 3 };

// Important notes of a course, from its dates and remarks:
//  first        a one-off first session before the weekly series (often in another room)
//  kickoff      a kick-off meeting (Vorbesprechung) with date, time and room when given
//  registration a registration deadline
//  note         any other remark that says more than the room
export function courseNotes(course) {
  const all = course.groups.flatMap((g) => g.series);
  const year = Number((all.find((s) => s.startDate)?.startDate ?? `${new Date().getFullYear()}`).slice(0, 4));
  const weeklyStart = all.filter(isRecurring).map((s) => s.startDate).filter(Boolean).sort()[0];
  const out = [];
  for (const s of all) {
    if (s.rhythm === 'Einzeltermin' && weeklyStart && s.startDate && s.startDate < weeklyStart) {
      // The single date's own remark says what is special about it ("mit Prüfung"), so it stays with the note.
      out.push({ kind: 'first', date: s.startDate, time: s.start && s.end ? `${s.start}-${s.end}` : null, room: s.room || null, ...(s.note ? { text: s.note } : {}) });
    }
  }
  const seen = new Set();
  for (const s of all) {
    const text = (s.note ?? '').replace(/​/g, '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const deadline = /Anmeldung[^.]*?erforderlich bis (?:zum )?(\d{1,2}\.\d{1,2}\.\d{4})/.exec(text);
    if (/Vorbesprechung|Kick-?Off/i.test(text)) {
      const room = noteKey(text) in KICKOFF_ROOMS ? KICKOFF_ROOMS[noteKey(text)] || null : noteRoom(text);
      out.push({ kind: 'kickoff', date: noteDate(text, year), time: noteTime(text), room, text });
    } else if (deadline) {
      out.push({ kind: 'registration', date: noteDate(deadline[1], year), text });
    } else if (out.some((n) => n.kind === 'first') && /erste[rn]? Termin/i.test(text)) {
      continue; // already shown as the first session
    } else if (roomOf({ note: text }) && text.length < 45) {
      continue; // only says where the room is; the calendar shows that
    } else {
      out.push({ kind: 'note', text });
    }
  }
  return out.sort((a, b) => NOTE_ORDER[a.kind] - NOTE_ORDER[b.kind]);
}

// ---------- things worth checking ----------

// Campus of a room, from the building eCampus writes in its last parentheses
// ("Raum 0213 (Nora-Platiel 6)", "Hörsaal 0446 (WA-altes Gebäude (WA 73))"). Null when unknown.
const CAMPUSES = [
  ['online', /Virtuelles Gebäude/],
  ['witzenhausen', /\bWIZ\b/],
  ['wa', /\bWA[- ]|Wilhelmsh/],
  ['oberzwehren', /Heinr\.?-Plett|AVZ/],
  ['kunsthochschule', /Menzelstr/],
  ['sport', /Damaschkestr/],
  ['hopla', /Moritzstr|Kurt-Wolters|Möncheberg|Arnold-Bode|Nora-Platiel|G\.-Forster|Universitätsplatz|Diagonale|Henschelstr|Gottschalk|Kleine Rosenstr|Untere Königsstr/],
];
export function campusOf(room) {
  if (!room) return null;
  const building = /\(([^()]*(?:\([^()]*\))?[^()]*)\)\s*$/.exec(room)?.[1] ?? room;
  return CAMPUSES.find(([, re]) => re.test(building))?.[0] ?? null;
}

const isOnline = (series) => campusOf(series.room) === 'online' || /\b(online|zoom|webex|digital statt|BigBlueButton)\b/i.test(series.note ?? '');

const median = (values) => {
  const v = [...values].sort();
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

// The usual lecture period and the break days of a semester, read from all weekly series of the data:
// a date counts as a break day when at least a third of the weekly series running on it skip it.
export function semesterShape(courses) {
  const weekly = courses.flatMap((c) => c.groups.flatMap((g) => g.series)).filter((s) => isPlaceable(s) && s.startDate && s.endDate);
  const skipped = new Map();
  for (const s of weekly) for (const d of s.cancelled ?? []) skipped.set(d, (skipped.get(d) ?? 0) + 1);
  const breaks = new Set();
  for (const [d, n] of skipped) {
    const running = weekly.filter((s) => s.day === weekday(d) && s.startDate <= d && d <= s.endDate).length;
    if (n >= 3 && n >= running / 3) breaks.add(d);
  }
  return { start: median(weekly.map((s) => s.startDate)), end: median(weekly.map((s) => s.endDate)), breaks };
}

// Classes on another campus with less than this many minutes in between get a warning.
const TRAVEL_MINUTES = { witzenhausen: 120 };
const travelLimit = (a, b) => Math.max(TRAVEL_MINUTES[a] ?? 45, TRAVEL_MINUTES[b] ?? 45);

// Things a student should know about the selected classes, beyond clashes:
//  cancelled  a weekly class skips dates outside the semester breaks
//  late       a weekly class starts two or more weeks after most classes
//  early      a weekly class ends two or more weeks before most classes
//  period     both
//  noRoom     a weekly class has no room yet
//  roomNote   the room column and the lecturer's remark name different rooms
//  online     a class is held online
//  campus     two classes on the same day are on different campuses with little time in between
export function scheduleWarnings(entries, shape) {
  const out = [];
  const seen = new Set();
  const once = (key, w) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(w);
  };
  for (const e of entries) {
    const s = e.series;
    if (isOnline(s)) once(`online:${e.course.id}`, { kind: 'online', course: e.course, series: s });
    if (!isPlaceable(s)) continue;
    const cancelled = (s.cancelled ?? []).filter((d) => !shape.breaks.has(d)).sort();
    if (cancelled.length) once(`cancelled:${e.key}`, { kind: 'cancelled', course: e.course, series: s, dates: cancelled });
    const late = shape.start && s.startDate && s.startDate >= addDays(shape.start, 14);
    const early = shape.end && s.endDate && s.endDate <= addDays(shape.end, -14);
    const kind = late && early ? 'period' : late ? 'late' : early ? 'early' : null;
    if (kind) once(`period:${e.key}`, { kind, course: e.course, series: s, from: s.startDate, to: s.endDate });
    if (!roomOf(s) && !isOnline(s)) once(`noRoom:${e.key}`, { kind: 'noRoom', course: e.course, series: s });
    // The room column says one room, the lecturer's remark another ("Raum 4048, Kurt-Wolters-Str. 5").
    const noted = s.room && s.note ? roomOf({ note: s.note }) : '';
    const numbers = noted.match(/\d{3,4}/g) ?? [];
    if (numbers.length && !numbers.some((n) => s.room.includes(n))) once(`roomNote:${e.key}`, { kind: 'roomNote', course: e.course, series: s, room: s.room, noted });
  }
  const timed = entries.filter((e) => e.grid !== false && (isPlaceable(e.series) || isSingleDate(e.series)) && !isOnline(e.series));
  for (const a of timed) {
    for (const b of timed) {
      if (a.course.id === b.course.id || a.series.day !== b.series.day) continue;
      const gap = toMinutes(b.series.start) - toMinutes(a.series.end);
      const [ca, cb] = [campusOf(roomOf(a.series)), campusOf(roomOf(b.series))];
      if (gap < 0 || !ca || !cb || ca === cb || gap >= travelLimit(ca, cb) || !datesOverlap(a.series, b.series)) continue;
      // Only the next class after a: a later one on the same campus as the next leaves time to travel.
      const next = timed.some((c) => c !== b && c.series.day === a.series.day && datesOverlap(a.series, c.series) &&
        toMinutes(c.series.start) >= toMinutes(a.series.end) && toMinutes(c.series.start) < toMinutes(b.series.start));
      if (next) continue;
      once(`campus:${a.key}:${b.key}`, { kind: 'campus', from: a, to: b, fromCampus: ca, toCampus: cb, gap, day: a.series.day });
    }
  }
  const order = { campus: 0, roomNote: 1, cancelled: 1, late: 2, early: 2, period: 2, noRoom: 3, online: 4 };
  return out.sort((x, y) => order[x.kind] - order[y.kind]);
}
