// Sharing a timetable with friends without accounts: the selection travels inside the link
// (#share=...), the friend's browser keeps it, and the week views are laid over each other to find
// the hours everyone is free. No DOM, so it runs in the browser and under `node --test`.
import { mergeSingleDates, phaseEntries, phaseIndexAt, selectedEntries, selectionPhases, toMinutes } from './schedule.js';

export const SHARE_PREFIX = '#share=';
const MAX_NAME = 30;
const MAX_PARTS = 4;
const validSlug = (s) => typeof s === 'string' && /^(bsc|msc|la)-[a-z0-9-]+$/.test(s);
export const cleanName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

const toBase64Url = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text) => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

// Payload: { name, parts: [{ slug, modules }] }, one part per study program the person takes courses in
// (Kombi Bachelor: Hauptfach and Nebenfach). modules has the shape of state.modules (schedule.js).
// The text is "z" + deflated JSON, or "j" + plain JSON where the browser cannot compress.
export async function encodeShare({ name, parts }) {
  const json = JSON.stringify({ v: 1, n: cleanName(name), p: parts.map((p) => [p.slug, p.modules]) });
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'undefined') return `j${toBase64Url(bytes)}`;
  return `z${toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
}

// The payload of a link, or null when it is broken or not ours. Only known fields pass.
export async function decodeShare(text) {
  try {
    const kind = text[0];
    let bytes = fromBase64Url(text.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j') return null;
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    if (raw?.v !== 1 || !Array.isArray(raw.p)) return null;
    const parts = raw.p
      .filter((p) => Array.isArray(p) && validSlug(p[0]) && p[1] && typeof p[1] === 'object' && !Array.isArray(p[1]))
      .slice(0, MAX_PARTS)
      .map(([slug, modules]) => ({ slug, modules }));
    const name = cleanName(raw.n);
    return parts.length && name ? { name, parts } : null;
  } catch {
    return null;
  }
}

export const shareLink = async (base, payload) => `${base}${SHARE_PREFIX}${await encodeShare(payload)}`;
export const shareFromHash = (hash) => (hash?.startsWith(SHARE_PREFIX) ? hash.slice(SHARE_PREFIX.length) : null);

const ALL_DATES = { from: '0000-01-01', to: '9999-12-31' };

// The weekly meetings of one program's selection on the week holding `date` (YYYY-MM-DD), as the person's
// own week view shows them: with phases (classes that change their meetings mid-semester) the phase of that
// date, widened at the ends like the week view. [{ day, start, end, courseId, title, titleEn, type, typeEn }]
export function weekBusy(data, modules, date, shape = null) {
  const entries = selectedEntries(data, { modules });
  const phases = selectionPhases(entries, shape);
  let phase = ALL_DATES;
  if (phases.length > 1) {
    const i = phaseIndexAt(phases, date);
    phase = { ...phases[i], from: i === 0 ? ALL_DATES.from : phases[i].from, to: i === phases.length - 1 ? ALL_DATES.to : phases[i].to };
  }
  const seen = new Set();
  const out = [];
  for (const e of mergeSingleDates(phaseEntries(entries, phase, shape).filter((x) => x.grid))) {
    const key = [e.course.id, e.series.day, e.series.start, e.series.end].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const { title, titleEn, type, typeEn } = e.course;
    out.push({ day: e.series.day, start: toMinutes(e.series.start), end: toMinutes(e.series.end), courseId: e.course.id, title, titleEn, type, typeEn });
  }
  return out.sort((a, b) => a.day - b.day || a.start - b.start);
}

// Free stretches of one day between `from` and `to` (minutes) that none of the busy blocks touch.
export function freeIntervals(busy, from, to) {
  const blocks = busy.map((b) => [Math.max(from, b.start), Math.min(to, b.end)]).filter(([s, e]) => s < e).sort((a, b) => a[0] - b[0]);
  const out = [];
  let at = from;
  for (const [s, e] of blocks) {
    if (s > at) out.push([at, s]);
    at = Math.max(at, e);
  }
  if (at < to) out.push([at, to]);
  return out;
}

// Hours every person is free, per weekday: { [day]: [[start, end]] } in minutes, only stretches of at
// least `min` minutes. people: one busy list (weekBusy, all programs joined) per person.
export function commonFree(people, { days = [1, 2, 3, 4, 5], from = 8 * 60, to = 20 * 60, min = 60 } = {}) {
  const out = {};
  for (const d of days) {
    const busy = people.flat().filter((b) => b.day === d);
    out[d] = freeIntervals(busy, from, to).filter(([s, e]) => e - s >= min);
  }
  return out;
}

export const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Friends kept in this browser: [{ id, name, parts, added }]. A link from someone already in the list
// (same name) replaces their old timetable, so a re-sent link is an update, not a second person.
export function addFriend(friends, payload, now = Date.now()) {
  const same = friends.find((f) => f.name.toLowerCase() === payload.name.toLowerCase());
  const friend = { id: same?.id ?? `f${now.toString(36)}`, name: payload.name, parts: payload.parts, added: now, hidden: same?.hidden ?? false };
  return { friends: same ? friends.map((f) => (f === same ? friend : f)) : [...friends, friend], friend, updated: Boolean(same) };
}

// Courses two people both take (same course id), each with the meetings they sit in together (same day
// and times) and, when they are in different groups, both sides' times. Sorted by first meeting.
// [{ courseId, title, titleEn, together: [{ day, start, end }], mine: [...], theirs: [...] }]
export function sharedCourses(mine, theirs) {
  const byCourse = (busy) => {
    const map = new Map();
    for (const b of busy) {
      if (!map.has(b.courseId)) map.set(b.courseId, []);
      map.get(b.courseId).push(b);
    }
    return map;
  };
  const a = byCourse(mine);
  const b = byCourse(theirs);
  const slot = ({ day, start, end }) => ({ day, start, end });
  const key = (x) => `${x.day}|${x.start}|${x.end}`;
  const out = [];
  for (const [courseId, list] of a) {
    const other = b.get(courseId);
    if (!other) continue;
    const otherKeys = new Set(other.map(key));
    const { title, titleEn } = list[0];
    out.push({
      courseId,
      title,
      titleEn,
      together: list.filter((x) => otherKeys.has(key(x))).map(slot),
      mine: list.map(slot),
      theirs: other.map(slot),
    });
  }
  const first = (c) => Math.min(...c.mine.map((x) => x.day * 1440 + x.start));
  return out.sort((x, y) => first(x) - first(y));
}
