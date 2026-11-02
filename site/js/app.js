// UI wiring: renders the module list, the weekly calendar, ready-made programs and the header from data + state.
import {
  emptyState,
  courseConfig,
  exerciseSlots,
  attendedSeries,
  selectedEntries,
  findConflicts,
  totalEcts,
  moduleComplete,
  layoutDay,
  filterModules,
  isPlaceable,
  isSingleDate,
  mergeSingleDates,
  toMinutes,
  categoryStatus,
  courseOptions,
  pickCount,
  fittingVariants,
  suggestPrograms,
  fixedProgram,
  roomOf,
  courseNotes,
  semesterShape,
  scheduleWarnings,
  courseLanguages,
  moduleLanguages,
  selectionPhases,
  phaseIndexAt,
  phaseEntries,
  partialInPhase,
  compulsoryModules,
  compulsoryCategories,
  compulsoryPlan,
  phaseChanges,
  groupPhases,
} from './schedule.js';
import { buildIcs } from './ics.js';
import { addFriend, clock, commonFree, decodeShare, shareFromHash, shareLink, weekBusy } from './share.js';
import { floorOf, linkPlace, mapUrl, roomParts } from './campus-map.js';
import { openFeedback } from './feedback.js';
import { noteVisit, openNews, unseen } from './news.js';
import { LANGS, SECTION_DE, detectLang, translator, translateRoom } from './i18n.js';
import { programThemes, themeModules } from './themes.js';
import { semesterLabel, periodKey, semesterRange, offeredIn, nextOfferings, primaryArea, mainSubjects, filterOfferings, takenBefore } from './offerings.js';

// Study program from the URL: /<slug>/ when published, ?p=<slug> for a local server on site/.
const PROGRAM = (() => {
  const valid = (s) => /^(bsc|msc|la)-[a-z0-9-]+$/.test(s ?? '');
  const query = new URLSearchParams(location.search).get('p');
  if (valid(query)) return query;
  const segment = location.pathname.split('/').filter(Boolean)[0];
  return valid(segment) ? segment : 'msc-computer-science';
})();
// Published pages live at /<slug>/; a local server serves every program from site/ with ?p=<slug>.
const PUBLISHED = location.pathname.split('/').filter(Boolean)[0] === PROGRAM;
const programUrl = (slug) => (PUBLISHED ? `../${slug}/` : `?p=${slug}`);
// Master Informatik keeps the original key so existing selections survive; other programs get their own.
const storageKey = (slug) => (slug === 'msc-informatik' ? 'ders-programi:v1' : `ders-programi:v1:${slug}`);
const STORAGE_KEY = storageKey(PROGRAM);
// The program opened before this page, read before this page records itself as the last one.
const LAST_PROGRAM = (() => {
  try {
    return localStorage.getItem('ders-programi:last');
  } catch {
    return null;
  }
})();
const FRIENDS_KEY = 'ders-programi:friends';
const NAME_KEY = 'ders-programi:name';
// Programs the student shares and compares as their own (Kombi: Hauptfach and Nebenfach), as slugs.
const MINE_KEY = 'ders-programi:mine';
const LANG_KEY = 'ders-programi:lang';
const LIST_KEY = 'ders-programi:list';
const HIDE_LATER_KEY = 'ders-programi:hide-later';
// Modules a student plans for coming semesters (next-semesters view): { 'S2027': [module number] }.
const PLAN_KEY = `ders-programi:plan:${PROGRAM}`;
// The next-semesters view offers the current semester and this many after it.
const TERMS_AHEAD = 3;
const WEEKDAYS = [1, 2, 3, 4, 5];
// The hour height follows the window so the whole week fits on screen, within these bounds.
const MIN_HOUR_PX = 54;
const MAX_HOUR_PX = 72;
// Below this width the week is a day-by-day list instead of a grid.
const AGENDA_QUERY = '(max-width: 700px)';
// Below this width one view (list, week or ready-made programs) fills the screen, switched from the dock.
const MOBILE_QUERY = '(max-width: 900px)';
const isMobile = () => matchMedia(MOBILE_QUERY).matches;
// The department said dates and rooms for the open courses come out on this day; the data was refreshed
// that evening, so from then on the generic text is shown.
const TBA_ANNOUNCE_DAY = '2026-10-16';
// First week of WiSe 2026/27: many exercise groups start only after the lectures' introductions. The notice on
// exercise courses disappears by itself on Friday 23.10.2026 at 17:00 Berlin time (still CEST then).
const EXERCISE_NOTICE_UNTIL = new Date('2026-10-23T17:00:00+02:00');
const exerciseNotice = (course) => Date.now() < EXERCISE_NOTICE_UNTIL.getTime() && /^(Übung|Tutorium)$/.test(course?.type ?? '');
// This week's meeting of a weekly series is still ahead (Berlin time): the notice goes once it has passed.
const seriesAhead = (series) => {
  const now = berlinNow();
  return series.day > now.day || (series.day === now.day && (series.end ?? '').padStart(5, '0') > now.hm);
};
const exerciseAhead = (course, series) =>
  exerciseNotice(course) && (series ? seriesAhead(series) : course.groups.some((g) => g.series.some((x) => x.day && seriesAhead(x))));

// Now in Berlin: { date: 'YYYY-MM-DD', hm: 'HH:MM', day: 1 (Monday) to 7 }.
function berlinNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1 };
}

// A dated note is over once its day has passed, and on that day once its end time (or its start time, when
// that is all it gives) has passed.
function noteOver(n) {
  if (!n.date) return false;
  const now = berlinNow();
  if (n.date !== now.date) return n.date < now.date;
  const end = n.time?.split('-').at(-1)?.trim();
  return Boolean(end) && end.padStart(5, '0') <= now.hm;
}
const tbaKey = (key) => (new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) < TBA_ANNOUNCE_DAY ? `${key}Friday` : key);
// Master Computer Science links the university's handbook page; other programs the moduldatenbank list, when there is one.
const HANDBOOK_PAGES = {
  'msc-computer-science': 'https://www.uni-kassel.de/uni/studium/computer-science-master/pruefungsordnung-und-modulhandbuch/modulhandbuch-master-computer-science.html',
  'msc-informatik':
    'https://www.uni-kassel.de/uni/en/studium/computer-science-master/examination-regulations-and-module-handbook/module-handbook-master-computer-science.html',
};
// Short German labels for the requirement categories (data carries English ones).
const CATEGORY_SHORT_DE = {
  'Vertiefung in Mathematik/Elektrotechnik': 'Mathe/ET',
  'Theoretische Informatik': 'Theoretische Inf.',
  'Technische Informatik': 'Technische Inf.',
  'Praktische Informatik': 'Praktische Inf.',
  Projekt: 'Projekt',
  Seminar: 'Seminar',
  Schlüsselkompetenzen: 'Schlüsselkomp.',
};

const $ = (id) => document.getElementById(id);

// Small element builder; text goes through textContent so scraped strings are never parsed as HTML.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let data = null;
let programs = [];
// Usual lecture period and break days (from programs.json, else from this program's courses).
let semester = null;
let state = loadState();
let lang = loadLang();
let t = translator(lang);
const ui = {
  query: '',
  category: '',
  language: '',
  // Hide modules that run in another semester only (module handbook), remembered across visits.
  hideLater: (() => {
    try {
      return localStorage.getItem(HIDE_LATER_KEY) === '1';
    } catch {
      return false;
    }
  })(),
  showMisfits: false,
  open: new Set(),
  expanded: new Set(),
  preview: null,
  // A date inside the phase the week view shows (null: today's phase, Berlin time).
  phaseDate: null,
  view: 'week',
  keepSelected: true,
  variant: {},
  listOpen: loadListOpen(),
  // Phone view: starts on the list until something is chosen, then on the week.
  mview: Object.keys(state.modules).length ? 'week' : 'list',
  filtersOpen: false,
  // Next-semesters view: chosen semester key (null = all), area filter, search, open module cards.
  termKey: undefined,
  termArea: '',
  termQuery: '',
  termOpen: new Set(),
  // Friends view: shortest shared free stretch worth showing (minutes).
  freeMin: 60,
};

// The module list starts open on wide screens, and on any screen while nothing is chosen yet;
// otherwise closed so the week has the room. A choice made with the toggle wins.
function loadListOpen() {
  try {
    const saved = localStorage.getItem(LIST_KEY);
    if (saved) return saved === 'open';
  } catch {}
  return matchMedia('(min-width: 1180px)').matches || !Object.keys(state.modules).length;
}

function setListOpen(open) {
  ui.listOpen = open;
  try {
    localStorage.setItem(LIST_KEY, open ? 'open' : 'closed');
  } catch {}
  renderListToggle();
  if (ui.lastCalendar && ui.view === 'week') renderCalendar(ui.lastCalendar.entries, ui.lastCalendar.conflicts);
}

function renderListToggle() {
  $('layout').classList.toggle('list-closed', !ui.listOpen);
  const btn = $('toggle-list');
  btn.setAttribute('aria-expanded', String(ui.listOpen));
  btn.textContent = ui.listOpen ? t('hideList') : t('showList');
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // "Passed" categories were removed from the UI; drop old values so they cannot hide requirements.
    if (raw) return { ...emptyState(), freeDays: [], ...JSON.parse(raw), doneCategories: [] };
  } catch {}
  return { ...emptyState(), freeDays: [] };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function loadLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && LANGS[saved]) return saved;
  } catch {}
  return detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

function setLang(next) {
  lang = next;
  t = translator(lang);
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
  applyStaticText();
  render();
}

// Stable, distinct color per module (golden-angle hue spacing).
const colorCache = new Map();
function moduleColor(moduleId) {
  if (!colorCache.has(moduleId)) {
    const i = data.modules.findIndex((m) => m.id === moduleId);
    colorCache.set(moduleId, `hsl(${Math.round((i * 137.508) % 360)} 58% 44%)`);
  }
  return colorCache.get(moduleId);
}

// Names follow the interface language: German originals in German, English translations otherwise.
const nameOf = (x) => (lang === 'de' ? x.title : x.titleEn ?? x.title);
// The other-language name, shown small under the name: only in the German interface (the English name there).
// Other interfaces show English only (user, 2026-10-19: no German text in the English interface).
const altNameOf = (x) => (lang === 'de' && x.titleEn && x.titleEn !== x.title ? x.titleEn : null);
const typeOf = (c) => (lang === 'de' ? c.type : c.typeEn ?? c.type) ?? '';
const lastSegment = (area) => area.split(' > ').at(-1);
const areaLabel = (segment) => (lang === 'de' ? segment : data.labels?.[segment] ?? segment);
const areaPathLabel = (area) => area.split(' > ').map(areaLabel).join(' > ');
const sectionName = (s) => (lang === 'de' ? s.nameDe ?? SECTION_DE[s.id] ?? s.name : s.name);
const moduleById = (id) => data.modules.find((m) => m.id === id);
const courseById = (id) => data.courses.find((c) => c.id === id);
const categoryById = (id) => data.categories?.find((c) => c.id === id);
const categoryShort = (c) => (lang === 'de' ? CATEGORY_SHORT_DE[c.id] ?? c.short : c.short);
const categoryName = (c) => (lang === 'de' ? c.nameDe ?? c.id : lang === 'tr' ? c.nameTr ?? c.name : c.name);
// Rule notes and summaries come from the handbooks in English, with Turkish and German versions.
const categoryNote = (c) => (lang === 'de' ? c.noteDe : lang === 'tr' ? c.noteTr : null) ?? c.note;
const rulesSummary = () => (data.rulesSummary ? data.rulesSummary[lang] ?? data.rulesSummary.en : null);
const timeRange = (s) => (s.start && s.end ? `${s.start}-${s.end}` : '');
const formatDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : lang, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const dayName = (d) => t('days')[d];
const dayShort = (d) => t('daysShort')[d];
const listJoin = (items) => new Intl.ListFormat(lang, { type: 'conjunction' }).format(items);
const freeDays = () => state.freeDays ?? [];

function describeSeries(s) {
  if (isPlaceable(s)) return `${dayShort(s.day)} ${timeRange(s)}${s.rhythm === '14-täglich' ? t('biweekly') : ''}`;
  if (s.rhythm === 'Einzeltermin' && s.startDate) return `${formatDate(s.startDate)} ${timeRange(s)}`;
  if (s.rhythm === 'Blockveranstaltung' && s.startDate) return `${t('block')} ${formatDate(s.startDate)}-${formatDate(s.endDate)} ${timeRange(s)}`;
  if (s.rhythm === 'nach Vereinbarung') return t('byArrangement');
  return s.rhythm || t('noTime');
}

// Whether a module can be taken without classes on the free days, cached per free-day set.
const fitCache = { key: '', map: new Map() };
function fitsFreeDays(mod) {
  const key = freeDays().join(',');
  if (fitCache.key !== key) Object.assign(fitCache, { key, map: new Map() });
  if (!fitCache.map.has(mod.id)) fitCache.map.set(mod.id, !key || fittingVariants(mod, data.courses, freeDays()).length > 0);
  return fitCache.map.get(mod.id);
}

// "3 dates: 19.10., 09.11., 16.11." (all dates, day and month).
const datesLabel = (dates) => t('singleDates', { n: dates.length, dates: dates.map((d) => formatDate(d).slice(0, 5)).join(' ') });

// False when no course of the module has a weekly slot (projects, seminars "nach Vereinbarung").
const hasFixedTime = (mod) =>
  mod.courseIds.map(courseById).some((c) => c?.groups.some((g) => g.series.some((s) => isPlaceable(s) || isSingleDate(s))));

// Courses without any announced date (all "nach Vereinbarung"): selected, but not placeable yet.
const isTba = (course) => course.groups.every((g) => g.series.every((s) => s.rhythm === 'nach Vereinbarung'));

let toastTimer = null;
function showToast(text) {
  const toast = $('toast');
  toast.replaceChildren(
    h('span', {}, text),
    h('button', { type: 'button', class: 'quiet', onclick: () => (toast.hidden = true) }, t('close')),
  );
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 9000);
}

// Warns once per action when a newly chosen course has no announced date yet.
function warnTba(courses) {
  const tba = courses.filter(isTba);
  if (tba.length) showToast(t(tbaKey('tbaWarning'), { name: listJoin([...new Set(tba.map(nameOf))]) }));
}

// ---------- important notes ----------

// eCampus remarks are German. Other languages get the translation from the scraper plus the original.
// Returns { text, original?, untranslated? }.
function remark(text) {
  if (!text || lang === 'de') return { text };
  const tr = data.noteTranslations?.[text];
  const translated = tr?.[lang] ?? tr?.en;
  if (translated) return { text: translated, original: text };
  const english = /\b(the|will|lectures|students|this|from|are)\b/i.test(text) && !/\b(der|die|das|und|bitte|findet)\b/.test(text);
  return english ? { text } : { text, untranslated: true };
}
const roomName = (room) => (lang === 'de' ? room ?? '' : translateRoom(room, lang));
// The campus map link of a class, in the calendar: it opens the campus with the class's building marked,
// and says how to get from there to the room (the building's floor buttons, or the map's search), since
// the map marks only the building. A block shows it once opened (not on phones: the agenda has none). The
// click stays on the link: it does not open the class's module.
const PIN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.6 5-8.6A5 5 0 0 0 3 6.4C3 10.4 8 15 8 15z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="6.5" r="1.8" fill="currentColor"/></svg>';
const CAMPUS_BUILDINGS = [5, 15, 57, 59, 65, 69];
function mapLink(room, cls) {
  const place = linkPlace(room);
  if (!place) return null;
  const { number } = roomParts(room);
  const level = place.building ? 'Building' : place.l ? 'Room' : CAMPUS_BUILDINGS.includes(place.b) ? 'Campus' : 'Building';
  const hint = number && (place.building || !place.l) ? t('mapFindRoom', { number, floor: floorOf(number) }) : null;
  const a = h(
    'a',
    { class: cls, href: mapUrl(room, lang), target: '_blank', rel: 'noopener', onclick: (ev) => ev.stopPropagation() },
    h('span', { class: 'map-pin' }),
    h('span', { class: 'map-text' }, h('b', {}, t(`mapShow${level}`)), hint ? h('small', {}, hint) : null),
  );
  a.firstChild.innerHTML = PIN_ICON;
  return a;
}
const remarkTitle = (text) => {
  const r = remark(text);
  return r.original ? `${r.text}\n\n${t('germanOriginal')}: ${r.original}` : r.text;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const noteSummary = (n) => [n.date ? formatDate(n.date) : null, n.time, n.room ? roomName(n.room) : null].filter(Boolean).join(', ');
// The note a calendar block should flag: an upcoming first session elsewhere or kick-off meeting.
const blockAlert = (course) =>
  courseNotes(course).find((n) => (n.kind === 'first' || n.kind === 'kickoff') && !noteOver(n));

// A remark as shown in notes: translation first, then the German original in small type.
function remarkLines(text) {
  if (!text) return [];
  const r = remark(text);
  if (r.untranslated) return [h('span', { class: 'note-orig-label' }, t('notTranslated')), h('span', { class: 'note-text', lang: 'de', title: text }, text)];
  return [
    h('span', { class: 'note-text', title: r.text }, r.text),
    r.original ? h('span', { class: 'note-orig', lang: 'de', title: r.original }, `${t('germanOriginal')}: ${r.original}`) : null,
  ];
}

// Notes under a course: a label per kind, the parsed date/time/room, and the original remark (German).
function notesList(course) {
  const notes = courseNotes(course);
  if (!notes.length) return null;
  return h(
    'ul',
    { class: 'notes' },
    notes.map((n) =>
      h(
        'li',
        { class: `note note-${n.kind}` },
        h('span', { class: 'note-kind' }, t(`note_${n.kind}`)),
        n.kind === 'note' ? null : h('span', { class: 'note-sum' }, noteSummary(n)),
        ...remarkLines(n.text),
      ),
    ),
  );
}

// ---------- state changes ----------

function toggleModule(moduleId) {
  ui.preview = null;
  ui.compulsoryUndo = null;
  if (state.modules[moduleId]) {
    delete state.modules[moduleId];
    ui.open.delete(moduleId);
  } else {
    // With free days set, start from the first group combination that keeps them free.
    const mod = moduleById(moduleId);
    const variant = freeDays().length && !mod.pickOne ? fittingVariants(mod, data.courses, freeDays())[0] : null;
    state.modules[moduleId] = { courses: variant ? variant.courses : {} };
    ui.open.add(moduleId);
    if (!mod.pickOne) warnTba(mod.courseIds.map(courseById).filter(Boolean));
  }
  commit();
}

function updateCourse(moduleId, courseId, patch) {
  if (!state.modules[moduleId]) state.modules[moduleId] = { courses: {} };
  const current = courseConfig(state, moduleById(moduleId), courseId);
  state.modules[moduleId].courses[courseId] = { ...current, ...patch };
  commit();
}

// Pick-one modules behave like radio buttons: choosing a subject (lecture + exercise) turns the others off.
// Modules where the handbook asks for several options (pick.count > 1) toggle one option at a time, up to the count.
function chooseOption(mod, option, on) {
  state.modules[mod.id] ??= { courses: {} };
  const entry = state.modules[mod.id];
  const options = courseOptions(mod, data.courses);
  const many = pickCount(mod) > 1;
  const chosen = options.filter((o) => o.courseIds.some((id) => courseConfig(state, mod, id).on)).length;
  if (many && on && chosen >= pickCount(mod)) {
    showToast(t('pickLimit', { n: pickCount(mod) }));
    render();
    return;
  }
  for (const o of options) {
    if ((many || !on) && o.id !== option.id) continue;
    const enable = on && o.id === option.id;
    for (const id of o.courseIds) entry.courses[id] = { ...courseConfig(state, mod, id), on: enable };
  }
  ui.open.add(mod.id);
  commit();
  if (on) warnTba(option.courseIds.map(courseById));
}

function toggleSeries(moduleId, courseId, seriesIndex, on) {
  const cfg = courseConfig(state, moduleById(moduleId), courseId);
  const off = new Set(cfg.off);
  if (on) off.delete(seriesIndex);
  else off.add(seriesIndex);
  updateCourse(moduleId, courseId, { off: [...off].sort((a, b) => a - b) });
}

function toggleFreeDay(day) {
  const set = new Set(freeDays());
  if (set.has(day)) set.delete(day);
  else set.add(day);
  state.freeDays = [...set].sort();
  commit();
}

function applyProgram(program) {
  const replacing = Object.keys(state.modules).filter((id) => !program.modules[id]);
  if (replacing.length && !confirm(t('confirmReplace', { n: replacing.length }))) return;
  state.modules = structuredClone(program.modules);
  ui.open = new Set(program.added);
  setView('week');
  commit();
  const added = program.added.map(moduleById);
  warnTba(added.flatMap((m) => m.courseIds.filter((id) => courseConfig(state, m, id).on).map(courseById)));
}

function commit() {
  saveState();
  render();
}

function setView(view) {
  ui.view = view;
  if (ui.mview !== 'list') ui.mview = view;
  $('tab-week').setAttribute('aria-selected', String(view === 'week'));
  $('tab-suggest').setAttribute('aria-selected', String(view === 'suggest'));
  $('tab-terms').setAttribute('aria-selected', String(view === 'terms'));
  $('tab-friends').setAttribute('aria-selected', String(view === 'friends'));
  $('view-week').hidden = view !== 'week';
  $('view-suggest').hidden = view !== 'suggest';
  $('view-terms').hidden = view !== 'terms';
  $('view-friends').hidden = view !== 'friends';
  render();
}

// ---------- rendering ----------

function applyStaticText() {
  document.documentElement.lang = lang;
  document.title = t('title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  renderListToggle();
  showNewsDot();
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  $('lang').value = lang;
  $('free-min').replaceChildren(...FREE_MINUTES.map((n) => h('option', { value: String(n), selected: n === ui.freeMin }, t('minutesShort', { n }))));
  if (!data) return;
  renderProgramPicker();
  const date = formatDate(data.generatedAt.slice(0, 10));
  const handbook = HANDBOOK_PAGES[PROGRAM] ?? data.handbookUrl;
  if (!handbook) {
    $('footnote').replaceChildren(t('sourcePlain', { date }));
    return;
  }
  const link = h('a', { href: handbook, target: '_blank', rel: 'noopener' }, 'Modulhandbuch');
  const [before, after] = t('source', { date, link: '{link}' }).split('{link}');
  $('footnote').replaceChildren(before, link, after ?? '');
}

// Program name in the interface language: German PO name in German, English otherwise.
const programName = (p) => (lang === 'de' ? p.name : p.nameEn ?? p.name);

// Subtitle with a program switch. Published pages live at /<slug>/, a local server uses ?p=<slug>.
function renderProgramPicker() {
  const listed = programs.some((p) => p.slug === PROGRAM);
  const list = listed ? programs : [...programs, { slug: PROGRAM, name: data.program, nameEn: data.programEn, degree: data.degree }];
  const select = h(
    'select',
    {
      id: 'program',
      'aria-label': t('program'),
      onchange: (ev) => {
        const slug = ev.target.value;
        location.href = programUrl(slug);
      },
    },
    // One group per faculty and degree, in the order of programs.json (faculty, then Bachelor, Master, Lehramt).
    [...new Set(list.map((p) => `${p.faculty ?? ''}|${p.degree}`))].map((key) => {
      const items = list.filter((p) => `${p.faculty ?? ''}|${p.degree}` === key);
      const { faculty, facultyEn, degree } = items[0];
      const degreeLabel = degree === 'bachelor' ? 'Bachelor' : degree === 'master' ? 'Master' : t('lehramt');
      const facultyLabel = lang === 'de' ? faculty : facultyEn ?? faculty;
      return h(
        'optgroup',
        { label: facultyLabel ? `${facultyLabel}: ${degreeLabel}` : degreeLabel },
        items.map((p) => h('option', { value: p.slug, selected: p.slug === PROGRAM }, programName(p))),
      );
    }),
  );
  $('subtitle').replaceChildren(select, h('span', {}, data.period));
  // Back to the list of all programs (the bare domain when published, the dev server's default page locally).
  $('home-link').href = PUBLISHED ? '/' : '?';
  // The home page offers "continue" with the program opened last.
  try {
    localStorage.setItem('ders-programi:last', PROGRAM);
  } catch {}
}

// Phones: the dock picks the view; the week and ready-made views reuse the desktop tabs.
function setMobileView(view) {
  ui.mview = view;
  if (view === 'list') render();
  else setView(view);
  // Start the new view at its top, not wherever the last one was scrolled to.
  const top = $('layout').offsetTop;
  if (window.scrollY > top) window.scrollTo(0, top);
}

function renderMobileNav(sum, target, clash) {
  document.body.dataset.mview = ui.mview;
  for (const btn of document.querySelectorAll('#mobile-nav button')) {
    if (btn.dataset.mview === ui.mview) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  const count = Object.keys(state.modules).length;
  const listStat = $('nav-list-stat');
  const text = count ? t('navSelected', { n: count }) : t('navNone');
  // A short pulse on the count answers a tap on "Add" or "Remove" while the week is out of sight.
  if (listStat.textContent && listStat.textContent !== text) {
    listStat.classList.remove('bump');
    void listStat.offsetWidth;
    listStat.classList.add('bump');
  }
  listStat.textContent = text;
  const weekStat = $('nav-week-stat');
  weekStat.textContent = clash ? t('conflicts', { n: clash }) : `${sum}/${target} ECTS`;
  weekStat.classList.toggle('clash', clash > 0);
  $('nav-friends-stat').textContent = friends.length ? t('friendsCount', { n: friends.length }) : t('navShare');
  if (data.offerings) {
    const key = termKey();
    const planned = key ? planFor(key).length : 0;
    $('nav-terms-stat').textContent = planned ? t('termPlanned', { n: planned }) : key ? semesterLabel(key) : t('termAll');
  }
}

function renderFilterToggle() {
  const active = freeDays().length + (ui.hideLater && laterModules().length ? 1 : 0);
  const n = $('filters-count');
  n.hidden = !active;
  n.textContent = String(active);
  $('filters-toggle').setAttribute('aria-expanded', String(ui.filtersOpen));
  $('sidebar').classList.toggle('filters-open', ui.filtersOpen);
}

function render() {
  const entries = selectedEntries(data, state);
  const conflicts = findConflicts(entries);
  renderStats(entries, conflicts);
  renderFilterToggle();
  if (data.categories.length) renderCategories();
  renderFreeDays();
  renderCompulsory();
  renderModuleList(conflicts);
  if (ui.view === 'week') {
    renderCalendar(entries, conflicts);
    renderOtherDates(entries);
  } else if (ui.view === 'terms') {
    renderOfferings();
  } else if (ui.view === 'friends') {
    renderFriends();
  } else {
    renderSuggestions();
  }
}

function renderStats(entries, conflicts) {
  const { sum, unknown, pending } = totalEcts(data, state);
  const target = Number(state.target) || 30;
  $('ects-sum').textContent = String(sum);
  $('ects-target').value = String(target);
  const bar = $('ects-bar');
  bar.style.width = `${Math.min(100, (sum / target) * 100)}%`;
  bar.classList.toggle('reached', sum >= target);
  const count = Object.keys(state.modules).length;
  $('ects-note').textContent = count
    ? t('modulesSelected', { n: count }) + (unknown ? t('ectsUnknown', { n: unknown }) : '') + (pending ? t('ectsPending', { n: pending }) : '')
    : t('nothingSelected');
  const clashCourses = new Set(entries.filter((e) => conflicts.has(e.key)).map((e) => e.course.id)).size;
  const badge = $('conflict-badge');
  badge.className = `badge ${conflicts.size ? 'bad' : 'ok'}`;
  badge.textContent = conflicts.size ? t('conflicts', { n: clashCourses }) : t('noConflict');
  $('export-ics').disabled = entries.length === 0;
  renderMobileNav(sum, target, conflicts.size ? clashCourses : 0);
}

// For pick-one modules the chosen subject says more than the module name.
function chosenNames(m, modules = state.modules) {
  if (!m.pickOne) return [nameOf(m)];
  const on = courseOptions(m, data.courses).filter((o) =>
    o.courseIds.some((id) => courseConfig({ modules }, m, id).on),
  );
  return on.map((o) => nameOf(courseById(o.id)));
}

// The program's rules in a few sentences, with the handbook or PO they come from.
function renderRulesBox() {
  const box = $('rules-box');
  const text = rulesSummary();
  box.hidden = !text;
  if (!text) return;
  const open = box.open;
  box.replaceChildren(
    h('summary', {}, t('rulesTitle')),
    h('p', {}, text),
    ...(data.rulesSources ?? []).map((url, i) => h('a', { href: url, target: '_blank', rel: 'noopener' }, `${t('rulesSource')} ${i + 1}`)),
  );
  box.open = open;
}

function renderCategories() {
  const status = categoryStatus(data, state);
  const slot = (c) => {
    const names = c.modules.flatMap((m) => chosenNames(m));
    const detail = [c.modules.length ? (names.length ? names.join(', ') : t('noCourseChosen')) : t('reqNone'), categoryNote(c)].filter(Boolean).join('\n');
    // "Pick two" rules show how many are chosen so far.
    // Credit rules show credits instead.
    const progress =
      c.ects != null ? ` ${Math.min(c.ectsHave, c.ects)}/${c.ects} ECTS` : c.need > 1 ? ` ${Math.min(c.modules.length, c.need)}/${c.need}` : '';
    return h(
      'li',
      { class: `req${c.covered ? ' covered' : ''}${ui.category === c.id ? ' active' : ''}` },
      h(
        'button',
        {
          type: 'button',
          title: `${categoryName(c)}: ${detail}\n${t('reqFilter', { name: categoryName(c) })}`,
          'aria-pressed': String(ui.category === c.id),
          onclick: () => {
            ui.category = ui.category === c.id ? '' : c.id;
            if (ui.category && !ui.listOpen) setListOpen(true);
            if (ui.category && isMobile()) setMobileView('list');
            else render();
          },
        },
        h('span', { class: 'req-mark', 'aria-hidden': 'true' }),
        h('span', { class: 'req-name' }, categoryShort(c) + progress),
        h('span', { class: 'sr-only' }, `: ${detail}`),
      ),
    );
  };
  const missing = status.filter((c) => !c.covered).length;
  const summary = $('req-summary');
  summary.className = missing ? '' : 'done';
  summary.textContent = missing ? t('reqOpen', { n: missing }) : t('reqDone');
  // Master Informatik has its rule text in the interface; other programs bring a summary from their handbook.
  const rules = PROGRAM === 'msc-informatik' ? t('reqSummary', { n: missing }) : [rulesSummary(), missing ? t('reqOpenLong', { n: missing }) : t('reqDone')].filter(Boolean).join('\n');
  summary.title = missing || data.rulesSummary ? rules : t('reqDone');
  $('categories').replaceChildren(
    ...status.filter((c) => c.group !== 'module').map(slot),
    h('li', { class: 'divider', 'aria-hidden': 'true' }),
    ...status.filter((c) => c.group === 'module').map(slot),
  );
}

// Programs whose PO makes every module of a category compulsory: one opt-in button adds the ones this semester
// offers (clash-free parallel groups where possible). Never applied by itself; the previous choice can be restored.
let compulsoryIds = new Set();
function renderCompulsory() {
  const bar = $('compulsory-bar');
  const all = compulsoryModules(data);
  compulsoryIds = new Set(all.map((m) => m.id));
  bar.hidden = !all.length;
  if (!all.length) return;
  const plan = compulsoryPlan(data, state, { freeDays: freeDays() });
  const cats = compulsoryCategories(data);
  const sem = cats.find((c) => c.semester)?.semester;
  const add = () => {
    ui.compulsoryUndo = JSON.stringify(state.modules);
    Object.assign(state.modules, plan.modules);
    warnTba(plan.added.flatMap((id) => moduleById(id).courseIds.map(courseById)).filter(Boolean));
    showToast(plan.clashes ? t('compulsoryAddedClash', { n: plan.added.length, c: plan.clashes }) : t('compulsoryAdded', { n: plan.added.length }));
    commit();
  };
  const undo = () => {
    state.modules = JSON.parse(ui.compulsoryUndo);
    ui.compulsoryUndo = null;
    commit();
  };
  const notes = cats.filter((c) => c.count > 1 && c.note).map(categoryNote);
  if (plan.notOffered.length) notes.push(t('compulsoryNotOffered', { list: listJoin(plan.notOffered.map((id) => nameOf(moduleById(id)))) }));
  bar.replaceChildren(
    h(
      'div',
      { class: 'compulsory-head' },
      h('span', {}, h('b', {}, sem ? t('compulsoryTitleSem', { sem }) : t('compulsoryTitle')), ' ', t('compulsoryCount', { n: all.length - plan.notOffered.length - plan.added.length, total: all.length - plan.notOffered.length })),
      plan.added.length ? h('button', { type: 'button', class: 'toggle', onclick: add }, t('compulsoryAdd', { n: plan.added.length })) : null,
      ui.compulsoryUndo ? h('button', { type: 'button', class: 'quiet', onclick: undo }, t('compulsoryUndo')) : null,
    ),
    h('p', { class: 'hint' }, [t('compulsoryHint'), ...notes].join(' ')),
  );
}

function renderFreeDays() {
  const chosen = freeDays();
  $('free-days-chosen').textContent = chosen.length ? chosen.map(dayShort).join(', ') : '';
  // Open by itself when free days are already chosen (e.g. from an earlier visit).
  if (chosen.length && !ui.freeDaysSeen) $('free-days-box').open = true;
  ui.freeDaysSeen = true;
  renderHideLater();
  $('free-days').replaceChildren(
    ...WEEKDAYS.map((d) =>
      h(
        'button',
        {
          type: 'button',
          title: t('freeDayTitle', { day: dayName(d) }),
          'aria-pressed': String(freeDays().includes(d)),
          onclick: () => toggleFreeDay(d),
        },
        dayShort(d),
      ),
    ),
  );
}

function renderModuleList(conflicts) {
  let modules = filterModules(data, { query: ui.query, category: ui.category, language: ui.language });
  if (ui.hideLater) {
    const later = new Set(laterModules());
    modules = modules.filter((m) => !later.has(m) || state.modules[m.id]);
  }
  const misfits = modules.filter((m) => !state.modules[m.id] && !fitsFreeDays(m));
  if (!ui.showMisfits) modules = modules.filter((m) => !misfits.includes(m));

  const parts = [t('modulesShown', { n: modules.length })];
  if (misfits.length) {
    parts.push(
      t('misfits', { n: misfits.length, days: listJoin(freeDays().map(dayName)) }),
      h(
        'button',
        {
          type: 'button',
          onclick: () => {
            ui.showMisfits = !ui.showMisfits;
            render();
          },
        },
        ui.showMisfits ? t('hide') : t('showAnyway'),
      ),
    );
  }
  // Programs with a checked teaching language (scraper LANGUAGE_CHECK) can be filtered by it.
  if (data.courses.some((c) => c.lang)) {
    const select = h(
      'select',
      {
        class: 'lang-filter',
        'aria-label': t('langFilter'),
        onchange: (ev) => {
          ui.language = ev.target.value;
          render();
        },
      },
      ['', 'en', 'de'].map((code) => {
        const opt = h('option', { value: code }, `${t('langFilter')}: ${code ? t(`lang_${code}`) : t('langAll')}`);
        opt.selected = code === ui.language;
        return opt;
      }),
    );
    parts.push(select);
  }
  parts.push(reportButton(t('fbMissingLink'), reportMissing, 'report-missing'));
  $('result-count').replaceChildren(...parts);
  // The rule behind the requirement the list is filtered by; visible text, so it also works on phones.
  const active = ui.category ? categoryById(ui.category) : null;
  const note = active ? [categoryName(active), categoryNote(active)].filter(Boolean).join(': ') : '';
  $('rule-note').hidden = !note;
  $('rule-note').textContent = note;
  renderRulesBox();

  const list = $('module-list');
  const scroll = list.scrollTop;
  list.replaceChildren(...sectionedList(modules, conflicts));
  list.scrollTop = scroll;
}

// Codes like "PI-10" sort by prefix, then number; modules without a code go last.
function compareModules(a, b) {
  const key = (m) => {
    const match = /^(.*?)(\d+)$/.exec(m.code ?? '');
    return match ? [0, match[1], Number(match[2])] : [1, '', 0];
  };
  const [ka, kb] = [key(a), key(b)];
  return ka[0] - kb[0] || ka[1].localeCompare(kb[1]) || ka[2] - kb[2] || nameOf(a).localeCompare(nameOf(b), lang);
}

// Module list grouped like the module handbook. Empty sections are hidden.
function sectionedList(modules, conflicts) {
  const sections = data.sections ?? [{ id: 'all', name: 'Modules' }];
  const filtering = Boolean(ui.query || ui.category);
  const status = categoryStatus(data, state);
  const out = [];
  for (const section of sections) {
    const items = modules.filter((m) => (m.section ?? 'all') === section.id).sort(compareModules);
    if (!items.length) continue;
    const picked = items.filter((m) => state.modules[m.id]).length;
    const covered = status.find((c) => c.id === section.id)?.covered;
    // Sections start collapsed; a search or filter shows every match.
    const collapsed = !ui.expanded.has(section.id) && !filtering;
    // Header and cards share one <li>, so the sticky header only sticks within its own section.
    const head = h(
        'div',
        { class: `section-head${picked ? ' has-picks' : ''}${covered ? ' covered' : ''}` },
        h(
          'button',
          {
            type: 'button',
            'aria-expanded': String(!collapsed),
            onclick: () => {
              // While a requirement filter or search holds every section open, collapsing one goes back
              // to the plain list (filter and search cleared, sections closed).
              if (filtering && (ui.category || ui.query)) {
                ui.category = '';
                ui.query = '';
                $('search').value = '';
                ui.expanded.delete(section.id);
                render();
                return;
              }
              if (ui.expanded.has(section.id)) ui.expanded.delete(section.id);
              else ui.expanded.add(section.id);
              renderModuleList(findConflicts(selectedEntries(data, state)));
            },
          },
          caret(),
          h('span', { class: 'section-name' }, sectionName(section)),
          h('span', { class: 'section-count' }, picked ? t('selectedOf', { a: picked, b: items.length }) : String(items.length)),
        ),
      );
    out.push(
      h(
        'li',
        { class: 'section' },
        head,
        // Some sections explain who they are for (conditional admission); the note shows when the section is open.
        collapsed || !section.note ? null : h('p', { class: 'section-note' }, section.note[lang] ?? section.note.en),
        collapsed ? null : h('ul', { class: 'section-items' }, items.map((m) => moduleCard(m, conflicts))),
      ),
    );
  }
  return out;
}

// Small chevron; rotates when its section is open.
function caret() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('class', 'caret');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3 1.5 6.5 5 3 8.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  svg.append(path);
  return svg;
}

function moduleCard(mod, conflicts) {
  const selected = Boolean(state.modules[mod.id]);
  const open = ui.open.has(mod.id);
  const fits = fitsFreeDays(mod);
  // Listed by the study planner but without any date this semester: may not be offered at all.
  const dateless = isDateless(mod);
  // The module handbook may say why: the module runs in another semester only.
  const later = dateless ? laterOffering(mod) : null;
  const courses = mod.courseIds.map(courseById).filter(Boolean);
  // Tags skip what the section header already says and the catch-all "Freier Schwerpunkt".
  const hidden = (a) => a === mod.section || a === 'Schwerpunkt > Freier Schwerpunkt';
  const areas = [...new Set(mod.areas.filter((a) => !hidden(a)).map((a) => areaLabel(lastSegment(a))))];
  const otherCategories = (mod.categories ?? []).filter((id) => id !== mod.section).map(categoryById).filter(Boolean);
  const alt = altNameOf(mod);

  const head = h(
    'div',
    { class: 'module-head' },
    h(
      'div',
      {
        class: 'info',
        title: mod.areas.map(areaPathLabel).join('\n'),
        onclick: () => {
          if (ui.open.has(mod.id)) ui.open.delete(mod.id);
          else ui.open.add(mod.id);
          render();
        },
      },
      h('div', { class: 'module-title' }, nameOf(mod)),
      alt ? h('div', { class: 'module-alt', lang: lang === 'de' ? 'en' : 'de' }, alt) : null,
      h(
        'div',
        { class: 'module-meta' },
        mod.code ? h('span', { class: 'tag code', title: t('handbookCode') }, mod.code) : null,
        h('span', { class: 'tag ects' }, mod.ects != null ? `${mod.ects} ECTS` : t('ectsMissing')),
        selected && !moduleComplete(data, state, mod) ? h('span', { class: 'tag warn' }, t('choicePending')) : null,
        fits ? null : h('span', { class: 'tag warn' }, t('onFreeDay')),
        languageTags(moduleLanguages(mod, { get: courseById })),
        later
          ? h('span', { class: 'tag warn not-announced' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, '!'), later.next ? t('termNotNow', { term: semesterLabel(later.next) }) : t('termNotNowPlain'))
          : dateless
            ? h('span', { class: 'tag warn not-announced' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, '!'), t('notAnnouncedTag'))
            : null,
        dateless || hasFixedTime(mod) ? null : h('span', { class: 'tag', title: t('byArrangement') }, t('noFixedTime')),
        mod.unlisted && !dateless ? h('span', { class: 'tag' }, t('unlistedTag')) : null,
        compulsoryIds.has(mod.id) ? h('span', { class: 'tag must' }, t('compulsoryTag')) : null,
        otherCategories.map((c) => h('span', { class: 'tag req-tag', title: categoryName(c) }, categoryShort(c))),
        areas.slice(0, 2).map((a) => h('span', { class: 'tag' }, a)),
        areas.length > 2 ? h('span', { class: 'tag', title: areas.slice(2).join('\n') }, `+${areas.length - 2}`) : null,
      ),
    ),
    h('button', { type: 'button', class: 'toggle', onclick: () => toggleModule(mod.id) }, selected ? t('remove') : t('add')),
  );

  const options = mod.pickOne ? courseOptions(mod, data.courses) : [];
  const fixed = courses.filter((c) => (mod.pick?.fixed ?? []).includes(c.id));
  const chosen = options.filter((o) => selected && o.courseIds.some((id) => courseConfig(state, mod, id).on)).length;
  const hint = !mod.pickOne
    ? null
    : h(
        'p',
        { class: 'hint' },
        fixed.length ? `${t('pickFixedNote')} ` : '',
        pickCount(mod) > 1 || fixed.length ? t('pickSomeHint', { n: pickCount(mod), chosen }) : t('pickOneHint'),
        mod.pick?.unverified ? ` ${t('pickUnverified')}` : '',
      );
  const blocks = mod.pickOne
    ? [...fixed.map((c) => courseBlock(mod, c, selected, conflicts)), ...options.map((o) => optionBlock(mod, o, selected, conflicts))]
    : courses.map((c) => courseBlock(mod, c, selected, conflicts));
  const unlistedHint = later
    ? h('p', { class: 'hint' }, t('termNotNowHint', { rule: termRule(later.offering), next: later.next ? semesterLabel(later.next) : '?' }))
    : dateless
      ? h('p', { class: 'hint' }, t('noDatesHint')) : mod.unlisted ? h('p', { class: 'hint' }, t('unlistedHint')) : null;
  const body = open
    ? h('div', { class: 'module-body' }, unlistedHint, hint, blocks, reportButton(t('feedback'), () => reportModule(mod), 'report-link'))
    : null;

  return h(
    'li',
    {
      class: `module${selected ? ' selected' : ''}${fits ? '' : ' misfit'}`,
      id: `mod-${mod.id}`,
      style: `--mod-color: ${moduleColor(mod.id)}`,
      onmouseenter: () => setPreview(selected ? null : mod.id),
      onmouseleave: () => setPreview(null),
    },
    head,
    body,
  );
}

// "English", "German", "English + German" and a warning when some course has no reliable language.
function languageTags(langs) {
  if (!langs) return null;
  const known = ['en', 'de'].filter((code) => langs.codes.has(code));
  return [
    known.length ? h('span', { class: 'tag lang' }, known.map((code) => t(`lang_${code}`)).join(' + ')) : null,
    langs.unknown ? h('span', { class: 'tag warn lang-unknown' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, '?'), t('langUnknownTag')) : null,
  ];
}

// Visible explanation under a course when its language is guessed from the description or unclear.
function languageNote(course) {
  const l = course.lang;
  if (!l) return null;
  const who = course.responsible ? ` (${course.responsible})` : '';
  if (l.conflict) return h('p', { class: 'lang-note warn' }, t('langConflictHint', { a: t(`lang_${l.conflict.ecampus}`), b: t(`lang_${l.conflict.description}`), who }));
  if (!l.code) return h('p', { class: 'lang-note warn' }, t('langUnknownHint', { who }));
  if (l.source === 'description') return h('p', { class: 'lang-note' }, t('langFromDescription'));
  return null;
}

// One alternative in a pick-one module: a lecture with its exercise, chosen with a single checkbox.
function optionBlock(mod, option, moduleSelected, conflicts) {
  const courses = option.courseIds.map(courseById);
  const lead = courses[0];
  const on = moduleSelected && courses.some((c) => courseConfig(state, mod, c.id).on);
  const box = h('input', { type: 'checkbox', onchange: (ev) => chooseOption(mod, option, ev.target.checked) });
  box.checked = on;
  const parts = [...new Set(courses.map(typeOf).filter(Boolean))].join(' + ');
  return h(
    'div',
    { class: `option${on ? ' chosen' : ''}` },
    h(
      'label',
      { class: 'option-head check' },
      box,
      h('span', { class: 'option-title', title: altNameOf(lead) }, nameOf(lead)),
      parts ? h('span', { class: 'option-parts' }, parts) : null,
    ),
    courses.map((c) => courseBlock(mod, c, on, conflicts, { inOption: true, single: courses.length === 1 })),
  );
}

const langName = (code) => (code === 'de-en' ? `${t('lang_de')} + ${t('lang_en')}` : t(`lang_${code}`));

// Language of the chosen parallel group when groups differ, otherwise of the whole course.
function courseLanguageTag(course, group) {
  if (!courseLanguages(course)) return null;
  const code = course.lang.code === 'mixed' ? group?.lang : course.lang.code;
  return code ? h('span', { class: 'tag lang' }, langName(code)) : h('span', { class: 'tag warn lang-unknown' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, '?'), t('langUnknownTag'));
}

function courseBlock(mod, course, moduleSelected, conflicts, { inOption = false, single = false } = {}) {
  const cfg = courseConfig(state, mod, course.id);
  const groupIndex = Math.min(cfg.group, course.groups.length - 1);
  const group = course.groups[groupIndex];
  // Series that run only part of the semester, or of a group whose weekly meetings change, carry their dates.
  const { phases, dated } = groupPhases(group, semester);
  // Fixed series found in every group (the shared lecture of a course built from parts) are in every option, so leave them out.
  const sharedKey = (s) => [s.day, s.start, s.end, s.startDate, s.room].join('|');
  const sharedKeys = course.groups.length < 2 ? new Set() : course.groups.map((g) => new Set(g.series.filter((s) => s.fixed).map(sharedKey))).reduce((a, b) => new Set([...a].filter((k) => b.has(k))));
  const isShared = (s) => s.fixed === true && sharedKeys.has(sharedKey(s));
  const withDates = (g) => {
    const d = g === group ? dated : groupPhases(g, semester).dated;
    return g.series.map((s, i) => (d.has(i) ? `${describeSeries(s)} (${dateRange(s.startDate, s.endDate)})` : describeSeries(s))).filter((_, i) => !isShared(g.series[i]));
  };

  const groupSelect =
    course.groups.length > 1
      ? h(
          'select',
          {
            class: 'group-select',
            'aria-label': t('parallelGroup'),
            onchange: (ev) => updateCourse(mod.id, course.id, { group: Number(ev.target.value), off: [], slot: 0 }),
          },
          course.groups.map((g, i) => {
            const label = /^\d+\. Parallelgruppe$/.test(g.name) ? `${t('parallelGroup')} ${i + 1}` : g.name;
            const groupLang = course.lang?.code === 'mixed' ? ` (${g.lang ? langName(g.lang) : t('langUnknownTag')})` : '';
            const opt = h('option', { value: String(i) }, `${label}${groupLang}: ${withDates(g).join(', ')}`);
            opt.selected = i === groupIndex;
            return opt;
          }),
        )
      : null;

  // Tutorial times of one exercise: the student goes to one, so they are a choice, not a list.
  const slots = exerciseSlots(course, group);
  const slotIndex = slots ? Math.min(cfg.slot ?? 0, slots.length - 1) : 0;
  const attended = new Set(group ? attendedSeries(course, group, slotIndex) : []);
  const slotSelect = slots
    ? h(
        'label',
        { class: 'slot-pick' },
        h('span', {}, t('exerciseSlot')),
        h(
          'select',
          {
            class: 'group-select',
            disabled: !moduleSelected || !cfg.on,
            onchange: (ev) => updateCourse(mod.id, course.id, { slot: Number(ev.target.value) }),
          },
          slots.map(({ series: s }, i) => {
            const opt = h('option', { value: String(i) }, `${describeSeries(s)}, ${roomName(roomOf(s))}`);
            opt.selected = i === slotIndex;
            return opt;
          }),
        ),
      )
    : null;

  const series = (group?.series ?? []).map((s, i) => {
    if (!attended.has(i)) return null;
    const key = `${course.id}:${groupIndex}:${i}`;
    const box = h('input', {
      type: 'checkbox',
      disabled: !moduleSelected || !cfg.on,
      onchange: (ev) => toggleSeries(mod.id, course.id, i, ev.target.checked),
    });
    box.checked = !cfg.off.includes(i);
    const onFree = isPlaceable(s) && freeDays().includes(s.day);
    return h(
      'li',
      {},
      h(
        'label',
        {},
        box,
        h('span', { class: `when${onFree ? ' on-free-day' : ''}`, title: onFree ? t('onFreeDayTitle') : null }, s.part ? h('span', { class: 'part' }, `${lang === 'de' ? s.part : (s.partEn ?? s.part)} `) : null, describeSeries(s)),
        h('span', { class: 'where', title: [s.room, s.note ? remarkTitle(s.note) : null].filter(Boolean).join('\n') }, roomName(roomOf(s))),
        moduleSelected && conflicts.has(key) ? h('span', { class: 'clash' }, t('conflict')) : h('span'),
        dated.has(i) ? h('span', { class: 'period' }, t('seriesPeriod', { range: dateRange(s.startDate, s.endDate) })) : null,
      ),
    );
  });

  const courseBox = h('input', {
    type: 'checkbox',
    disabled: !moduleSelected,
    title: t('includeCourse'),
    onchange: (ev) => updateCourse(mod.id, course.id, { on: ev.target.checked }),
  });
  courseBox.checked = cfg.on;
  // A single-course option is switched by the option checkbox alone.
  if (single) courseBox.hidden = true;

  return h(
    'div',
    { class: `course${cfg.on ? '' : ' off'}` },
    h(
      'label',
      { class: 'course-head check' },
      courseBox,
      h(
        'span',
        {},
        h('span', { class: 'course-type' }, typeOf(course)),
        ' ',
        course.number ? h('span', { class: 'course-number' }, `${t('courseNo')} ${course.number}`) : null,
        !inOption && nameOf(course) !== nameOf(mod) ? h('span', { class: 'course-title', title: altNameOf(course) }, nameOf(course)) : null,
        courseLanguageTag(course, group),
      ),
      h('a', { href: course.url, target: '_blank', rel: 'noopener' }, course.linkLabel ?? 'eCampus'),
      moodleLink(course),
    ),
    groupSelect,
    slotSelect,
    languageNote(course),
    phases.length > 1
      ? h('p', { class: 'phase-note' }, t('coursePhases', { list: phases.map((p) => dateRange(p.first, p.last)).join(', ') }))
      : null,
    h('ul', { class: 'series-list' }, series),
    isTba(course) && moduleSelected && cfg.on ? h('p', { class: 'tba-note' }, t(tbaKey('tbaNote'))) : null,
    exerciseAhead(course) ? h('p', { class: 'tba-note' }, t('exerciseNotice')) : null,
    notesList(course),
  );
}

// ---------- Feedback ----------

// What the site showed for the reported group, so the report says which data looked wrong.
const shownContext = (group) =>
  (group?.series ?? []).map((s) => [describeSeries(s), roomOf(s)].filter(Boolean).join(', ')).join('; ').slice(0, 300) || null;

const feedbackBase = () => ({ program: PROGRAM, lang, dataVersion: data?.generatedAt ?? null });
// One report button per module; the form asks which of its courses is wrong.
function reportModule(mod) {
  const courses = mod.courseIds.map(courseById).filter(Boolean).map((c) => {
    const cfg = courseConfig(state, mod, c.id);
    const group = c.groups[Math.min(cfg.group, c.groups.length - 1)];
    return { id: c.id, type: typeOf(c), number: c.number, title: nameOf(c), context: shownContext(group) };
  });
  // Chips name the course type; the course number only tells apart two courses of the same type.
  for (const c of courses) {
    const twin = courses.some((o) => o !== c && o.type === c.type);
    c.label = (twin ? [c.type, c.number].filter(Boolean).join(' ') : c.type) || c.title;
  }
  openFeedback({ ...feedbackBase(), moduleId: mod.id, moduleTitle: nameOf(mod), color: moduleColor(mod.id), courses }, { h, t });
}
const reportMissing = () => openFeedback({ ...feedbackBase(), category: 'missing' }, { h, t });
// The footer link is for anything: suggestions, problems with the site, data mistakes.
// The header's news button: a dot (and its count for screen readers) while there is unread news.
function showNewsDot() {
  const n = unseen(PROGRAM).length;
  $('news-dot').hidden = n === 0;
  $('news').setAttribute('aria-label', n ? `${t('news')}, ${t('newsUnseen', { n })}` : t('news'));
}
const reportGeneral = () => openFeedback({ ...feedbackBase(), category: 'idea', title: 'fbFeedbackTitle' }, { h, t });
const FLAG_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14.5V2.2M3.5 2.5h8.2l-1.9 3.2 1.9 3.3H3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
function reportButton(label, onclick, cls) {
  const b = h('button', { type: 'button', class: cls, onclick });
  b.innerHTML = FLAG_ICON;
  b.append(h('span', {}, label));
  return b;
}

function setPreview(moduleId) {
  if (ui.preview === moduleId || ui.view !== 'week') return;
  ui.preview = moduleId;
  const entries = selectedEntries(data, state);
  renderCalendar(entries, findConflicts(entries));
}

function previewEntries() {
  if (!ui.preview) return [];
  const temp = { ...state, modules: { [ui.preview]: { courses: {} } } };
  return selectedEntries(data, temp).map((e) => ({ ...e, key: `ghost:${e.key}`, ghost: true }));
}

// Whole semester, for selections whose timetable never changes.
const ALL_DATES = { from: '0000-01-01', to: '9999-12-31' };

// The phase of the selection the week view shows, widened at both ends so dates before the first or after the
// last phase still show. Null when the timetable is the same all semester.
function viewPhase(phases) {
  if (phases.length < 2) return null;
  const index = phaseIndexAt(phases, ui.phaseDate ?? berlinNow().date);
  return { ...phases[index], index, from: index === 0 ? ALL_DATES.from : phases[index].from, to: index === phases.length - 1 ? ALL_DATES.to : phases[index].to };
}

function renderCalendar(entries, conflicts) {
  ui.lastCalendar = { entries, conflicts };
  const cal = $('calendar');
  cal.setAttribute('aria-label', t('tabWeek'));
  const ghosts = previewEntries();
  // Courses that change their weekly meetings during the semester: one phase at a time, clashes inside it.
  const phases = selectionPhases(entries, semester);
  const phase = viewPhase(phases);
  renderPhaseNav(phases, phase, entries);
  if (phase) conflicts = findConflicts(entries, phase);
  const placed = mergeSingleDates(phaseEntries([...entries, ...ghosts], phase ?? ALL_DATES, semester).filter((e) => e.grid));
  // A series that starts late or ends early in the phase says from or until when, so the week is not read as all of it.
  for (const e of placed) {
    const p = phase && !e.dates ? partialInPhase(e.series, phase) : null;
    if (p) e.spanText = p.from ? t('seriesFrom', { date: formatDate(p.from).slice(0, 5) }) : t('seriesUntil', { date: formatDate(p.until).slice(0, 5) });
  }
  const agenda = matchMedia(AGENDA_QUERY).matches;
  cal.classList.toggle('agenda', agenda);
  if (agenda) return renderAgenda(cal, placed, conflicts, entries.length + ghosts.length > 0);

  const days = [...WEEKDAYS];
  for (const e of placed) if (!days.includes(e.series.day)) days.push(e.series.day);
  days.sort((a, b) => a - b);

  // The day runs from 8:00 to 19:00; courses outside that stretch the grid.
  let first = 8;
  let last = 19;
  for (const e of placed) {
    first = Math.min(first, Math.floor(toMinutes(e.series.start) / 60));
    last = Math.max(last, Math.ceil(toMinutes(e.series.end) / 60));
  }
  // Fit the hours between the calendar's top (at page scroll 0) and the window bottom, minus the day headings.
  const top = cal.getBoundingClientRect().top + window.scrollY;
  const HOUR_PX = Math.max(MIN_HOUR_PX, Math.min(MAX_HOUR_PX, Math.floor((window.innerHeight - top - 56) / (last - first))));
  cal.style.setProperty('--hour', `${HOUR_PX}px`);
  const height = (last - first) * HOUR_PX;
  const free = new Set(freeDays());

  cal.style.setProperty('--days', String(days.length));
  const nodes = [h('div', { class: 'cal-head' }, '')];
  for (const d of days) {
    nodes.push(h('div', { class: `cal-head${free.has(d) ? ' free' : ''}` }, dayName(d), free.has(d) ? h('small', {}, t('freeDay')) : null));
  }

  const times = h('div', { class: 'cal-times', style: `height:${height}px` });
  // Each label sits just under the line its hour starts at, so the first hour is labelled too.
  for (let hr = first; hr < last; hr++) {
    times.append(h('span', { style: `top:${(hr - first) * HOUR_PX}px` }, `${String(hr).padStart(2, '0')}:00`));
  }
  nodes.push(times);

  for (const d of days) {
    const col = h('div', { class: `cal-day${free.has(d) ? ' free' : ''}`, style: `height:${height}px` });
    const dayEntries = placed.filter((e) => e.series.day === d);
    const layout = layoutDay(dayEntries);
    for (const e of dayEntries) {
      const { col: c, cols } = layout.get(e.key);
      const top = ((toMinutes(e.series.start) - first * 60) / 60) * HOUR_PX;
      const hgt = Math.max(22, ((toMinutes(e.series.end) - toMinutes(e.series.start)) / 60) * HOUR_PX - 2);
      const width = 100 / cols;
      const clash = (e.keys ?? [e.key]).some((k) => conflicts.has(k));
      // Date-by-date courses name their dates, so the block is not read as a weekly class.
      const datesText = e.dates ? datesLabel(e.dates) : (e.spanText ?? null);
      // Every layout is in the DOM; fitBlocks() shows the richest one that fits the block (see .fit-* in CSS).
      const minutes = toMinutes(e.series.end) - toMinutes(e.series.start);
      const room = roomName(roomOf(e.series));
      const shortRoom = room.replace(/\s*\(.*\)\s*$/, '');
      const classes = ['block', e.ghost ? 'ghost' : '', clash ? 'conflict' : ''].filter(Boolean).join(' ');
      // An upcoming kick-off or first session elsewhere replaces the room line, flagged, so students
      // know to check before going to the usual room.
      const alert = blockAlert(e.course);
      const exercise = exerciseAhead(e.course, e.series);
      const alertText = alert ? `${t(`note_${alert.kind}`)}: ${noteSummary(alert)}` : null;
      const where = alertText ?? room;
      const whereShort = alertText ? `${t(`note_${alert.kind}`)} ${alert.date ? formatDate(alert.date).slice(0, 5) : ''}`.trim() : shortRoom;
      // The time leads every layout, so the week reads by the clock first.
      const hm = (text) => h('b', { class: 'hm' }, text);
      const lines = [
        h('div', { class: 'd when' }, hm(timeRange(e.series)), ` ${typeOf(e.course)}`),
        datesText ? h('div', { class: 'd dates' }, datesText) : null,
        h('div', { class: 'd combo' }, hm(timeRange(e.series)), whereShort ? ` ${whereShort}` : '', e.dates ? ` (${t('singleDatesShort', { n: e.dates.length })})` : ''),
        h('div', { class: 't' }, nameOf(e.course)),
        where ? h('div', { class: `d room${alert ? ' alert' : ''}` }, where) : null,
        whereShort ? h('div', { class: `d room-short${alert ? ' alert' : ''}` }, whereShort) : null,
        exercise ? h('div', { class: 'd room alert' }, t('exerciseNoticeShort')) : null,
        e.ghost ? null : mapLink(roomOf(e.series), 'map-row'),
        h('div', { class: 'one' }, hm(e.series.start), whereShort ? ` ${whereShort},` : '', ` ${nameOf(e.course)}`),
      ];
      col.append(
        h(
          'div',
          {
            class: alert || exercise ? `${classes} has-alert` : classes,
            'data-minutes': String(minutes),
            'data-alert': alert ? t('alertTitle') : exercise ? t('exerciseNoticeShort') : null,
            style: `top:${top}px;height:${hgt}px;left:calc(${c * width}% + 3px);width:calc(${width}% - 6px);--mod-color:${moduleColor(e.module.id)}`,
            tabindex: e.ghost ? null : '0',
            // A tap on a block whose details are cut off opens it first (touch has no hover); the next tap goes to the module.
            // Touch also sends mouse enter and leave right after the tap, which would close it again, so a
            // touched block opens and closes by focus alone.
            onpointerdown: (ev) => {
              const b = ev.currentTarget;
              b.dataset.touch = ev.pointerType !== 'mouse' ? '1' : '';
              b.dataset.tapOpens = ev.pointerType !== 'mouse' && !b.classList.contains('expanded') && hidesDetails(b) ? '1' : '';
            },
            onclick: (ev) => {
              const b = ev.currentTarget;
              if (b.dataset.tapOpens) {
                b.dataset.tapOpens = '';
                expandBlock(b, true);
                b.focus();
                return;
              }
              focusModule(e.module.id);
            },
            onkeydown: (ev) => (ev.key === 'Enter' ? focusModule(e.module.id) : null),
            onmouseenter: (ev) => (ev.currentTarget.dataset.touch ? null : expandBlock(ev.currentTarget, true)),
            onmouseleave: (ev) => (ev.currentTarget.dataset.touch ? null : expandBlock(ev.currentTarget, false)),
            // Focus moving to the block's map link keeps it open.
            onfocusin: (ev) => expandBlock(ev.currentTarget, true),
            onfocusout: (ev) => (ev.currentTarget.contains(ev.relatedTarget) ? null : expandBlock(ev.currentTarget, false)),
          },
          clash ? h('div', { class: 'flag' }, t('conflict')) : null,
          lines,
        ),
      );
    }
    nodes.push(col);
  }

  if (!entries.length && !ghosts.length) nodes.push(h('div', { class: 'cal-empty' }, t(isMobile() ? 'emptyWeekMobile' : 'emptyWeek')));
  cal.replaceChildren(...nodes);
  fitBlocks();
}

const shortDate = (iso) => formatDate(iso).slice(0, 5);
const dateRange = (from, to) => `${shortDate(from)} - ${shortDate(to)}`;

// Above the week, only when the chosen classes change during the semester: what changes when, and buttons to
// step through the phases ("20.10 - 14.01", "18.01 - 12.02"); today's phase is marked.
function renderPhaseNav(phases, phase, entries) {
  const nav = $('phase-nav');
  if (!phase) {
    nav.hidden = true;
    nav.replaceChildren();
    return;
  }
  const today = phaseIndexAt(phases, berlinNow().date);
  const byId = new Map(entries.map((e) => [e.course.id, e.course]));
  const changes = phaseChanges(phases, entries);
  const go = (i) => {
    ui.phaseDate = phases[i].first;
    renderCalendar(ui.lastCalendar.entries, ui.lastCalendar.conflicts);
  };
  const chips = phases.map((p, i) => {
    const clash = findConflicts(entries, { ...p, from: i === 0 ? ALL_DATES.from : p.from, to: i === phases.length - 1 ? ALL_DATES.to : p.to }).size > 0;
    const b = h(
      'button',
      {
        type: 'button',
        class: ['phase-chip', clash ? 'has-clash' : ''].filter(Boolean).join(' '),
        'aria-pressed': String(i === phase.index),
        title: clash ? t('phaseHasClash') : null,
        onclick: () => go(i),
      },
      dateRange(p.first, p.last),
      i === today ? h('small', {}, t('phaseToday')) : null,
      clash ? h('small', { class: 'clash' }, t('conflict')) : null,
    );
    return b;
  });
  nav.hidden = false;
  nav.replaceChildren(
    h('p', { class: 'phase-notice' }, h('strong', {}, t('phaseNotice', { dates: listJoin(changes.map((c) => shortDate(c.date))) })), ' ', t('phaseNoticeHint')),
    h(
      'ul',
      { class: 'phase-changes' },
      changes.map((c) => h('li', {}, t('phaseChangeLine', { date: shortDate(c.date), list: listJoin(c.courseIds.map((id) => `${nameOf(byId.get(id))} (${typeOf(byId.get(id))})`)) }))),
    ),
    h(
      'div',
      { class: 'phase-controls', role: 'group', 'aria-label': t('phaseNavLabel') },
      h('button', { type: 'button', class: 'phase-step', disabled: phase.index === 0, 'aria-label': t('phasePrev'), onclick: () => go(phase.index - 1) }, '<'),
      ...chips,
      h('button', { type: 'button', class: 'phase-step', disabled: phase.index === phases.length - 1, 'aria-label': t('phaseNext'), onclick: () => go(phase.index + 1) }, '>'),
    ),
  );
}

// True when the block's current layout leaves out or cuts off part of its details.
const hidesDetails = (block) =>
  !block.classList.contains('fit-full') ||
  !!block.querySelector('.map-row') ||
  overflows(block) ||
  [...block.children].some((c) => c.offsetParent && (c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1));

// Phone layout: one list per weekday, each class with its full time, title, type and room.
function renderAgenda(cal, placed, conflicts, any) {
  cal.style.removeProperty('--days');
  const free = new Set(freeDays());
  const days = [...new Set([...WEEKDAYS, ...placed.map((e) => e.series.day)])].sort((a, b) => a - b);
  const nodes = days.map((d) => {
    const items = placed.filter((e) => e.series.day === d).sort((a, b) => toMinutes(a.series.start) - toMinutes(b.series.start));
    return h(
      'section',
      { class: `agenda-day${free.has(d) ? ' free' : ''}` },
      h('h3', {}, dayName(d), free.has(d) ? h('small', {}, t('freeDay')) : null),
      items.length
        ? h(
            'ul',
            {},
            items.map((e) => {
              const alert = blockAlert(e.course);
              const room = roomOf(e.series);
              const kind = typeOf(e.course);
              return h(
                'li',
                {
                  class: ['agenda-item', e.ghost ? 'ghost' : '', (e.keys ?? [e.key]).some((k) => conflicts.has(k)) ? 'conflict' : ''].filter(Boolean).join(' '),
                  style: `--mod-color:${moduleColor(e.module.id)}`,
                  onclick: e.ghost ? null : () => focusModule(e.module.id),
                },
                h('span', { class: 'agenda-time' }, h('b', {}, e.series.start), e.series.end),
                h(
                  'span',
                  { class: 'agenda-body' },
                  h('strong', {}, nameOf(e.course)),
                  h('span', {}, kind, kind && room ? ', ' : '', room ? roomName(room) : null),
                  e.dates ? h('span', { class: 'dates' }, datesLabel(e.dates)) : e.spanText ? h('span', { class: 'dates' }, e.spanText) : null,
                  alert ? h('span', { class: 'alert' }, `${t(`note_${alert.kind}`)}: ${noteSummary(alert)}`) : null,
                  exerciseAhead(e.course, e.series) ? h('span', { class: 'alert' }, t('exerciseNoticeShort')) : null,
                  (e.keys ?? [e.key]).some((k) => conflicts.has(k)) ? h('span', { class: 'flag' }, t('conflict')) : null,
                ),
              );
            }),
          )
        : null,
    );
  });
  if (!any) nodes.push(h('div', { class: 'cal-empty' }, t(isMobile() ? 'emptyWeekMobile' : 'emptyWeek')));
  cal.replaceChildren(...nodes);
}

// Layouts from richest to most compact. Each block starts at the richest its duration allows and
// steps down while its content overflows, so long titles and narrow (side-by-side) blocks stay readable.
// True when a visible line ends below the block's padding edge (scrollHeight misses line-clamped text).
function overflows(block) {
  const limit = block.getBoundingClientRect().bottom - parseFloat(getComputedStyle(block).paddingBottom) + 0.5;
  return [...block.children].some((c) => c.offsetParent !== null && c.getBoundingClientRect().bottom > limit);
}

const FITS = ['fit-full', 'fit-tight', 'fit-compact', 'fit-tiny'];
function fitBlock(block) {
  const minutes = Number(block.dataset.minutes);
  let level = minutes >= 60 ? 0 : minutes >= 40 ? 1 : 2;
  const apply = () => {
    block.classList.remove(...FITS);
    block.classList.add(FITS[level]);
  };
  apply();
  while (level < FITS.length - 1 && overflows(block)) {
    level++;
    apply();
  }
}
function fitBlocks() {
  for (const block of $('calendar').querySelectorAll('.block')) if (!block.classList.contains('expanded')) fitBlock(block);
}

// Hover, focus or a tap opens a block to its full content and the whole day's width, over its neighbours.
function expandBlock(block, open) {
  if (open) {
    // A block that fits still opens when it has a map link, which only an open block shows.
    const needed = !block.classList.contains('fit-full') || overflows(block) || block.querySelector('.map-row');
    if (block.classList.contains('expanded') || !needed) return;
    // Measure the open size at once, then go back and let the transition grow width and height together.
    const from = block.getBoundingClientRect().height;
    const fit = FITS.find((f) => block.classList.contains(f));
    block.style.transition = 'none';
    block.classList.remove(...FITS);
    block.classList.add('fit-full', 'expanded');
    block.style.setProperty('--open-h', 'auto');
    const to = block.getBoundingClientRect().height;
    block.classList.remove('fit-full', 'expanded');
    if (fit) block.classList.add(fit);
    block.style.setProperty('--open-h', `${from}px`);
    void block.offsetWidth;
    block.style.transition = '';
    block.classList.remove(...FITS);
    block.classList.add('fit-full', 'expanded');
    block.style.setProperty('--open-h', `${to}px`);
  } else if (block.classList.contains('expanded')) {
    // Pick the layout that fits the slot at its closed size, then shrink to it from the open size.
    const from = block.getBoundingClientRect().height;
    block.style.transition = 'none';
    block.classList.remove('expanded');
    fitBlock(block);
    block.classList.add('expanded');
    block.style.setProperty('--open-h', `${from}px`);
    void block.offsetWidth;
    block.style.transition = '';
    block.classList.remove('expanded');
    block.style.removeProperty('--open-h');
  }
}

// ---------- Moodle ----------

const MOODLE = 'https://moodle.uni-kassel.de/course/view.php?id=';
const KEY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 8h7M12.5 8v3M14.5 8v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
// The course's Moodle page; a key mark (with its words, not only an icon) when the lecturer gives out an enrolment key.
function moodleLink(course) {
  if (!course.moodle) return null;
  const a = h('a', { class: `moodle-link${course.moodle.key ? ' needs-key' : ''}`, href: MOODLE + course.moodle.id, target: '_blank', rel: 'noopener' }, 'Moodle');
  if (course.moodle.key) {
    const key = h('span', { class: 'key' });
    key.innerHTML = KEY_ICON;
    key.append(h('span', {}, t('moodleKey')));
    a.append(key);
  }
  return a;
}

// All Moodle courses of the selected classes in one place, one tap each.
function moodlePanel(entries) {
  const seen = new Set();
  const rows = [];
  for (const e of entries) {
    const m = e.course.moodle;
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    rows.push(h('li', {}, moodleLink(e.course), h('span', {}, nameOf(e.course))));
  }
  if (!rows.length) return [];
  return [h('section', { class: 'moodle-panel', 'aria-labelledby': 'moodle-title' }, h('h2', { id: 'moodle-title' }, t('moodleTitle')), h('p', {}, t('moodleIntro')), h('ul', {}, rows))];
}

// One line per thing worth checking (campus changes, cancelled dates, short periods, missing rooms,
// online classes). Everything is written out, nothing waits for a hover.
const campusName = (id) => t(`campus_${id}`);
const slotOf = (s) => `${dayShort(s.day)} ${timeRange(s)}`;
function warningText(w) {
  const name = w.course ? nameOf(w.course) : '';
  switch (w.kind) {
    case 'campus':
      return t(w.gap ? 'warn_campus' : 'warn_campus0', {
        day: dayName(w.day),
        a: nameOf(w.from.course),
        b: nameOf(w.to.course),
        from: campusName(w.fromCampus),
        to: campusName(w.toCampus),
        end: w.from.series.end,
        start: w.to.series.start,
        gap: w.gap,
      });
    case 'cancelled':
      return t('warn_cancelled', { name, slot: slotOf(w.series), dates: w.dates.map(shortDate).join(', ') });
    case 'period':
    case 'late':
    case 'early':
      return t(`warn_${w.kind}`, { name, slot: slotOf(w.series), from: formatDate(w.from), to: formatDate(w.to) });
    case 'noRoom':
      return t('warn_noRoom', { name, slot: slotOf(w.series) });
    case 'roomNote':
      return t('warn_roomNote', { name, slot: slotOf(w.series), room: roomName(w.room), noted: roomName(w.noted) });
    default:
      return t('warn_online', { name });
  }
}
function warningsPanel(entries) {
  const warnings = scheduleWarnings(entries, semester ?? semesterShape(data.courses));
  if (!warnings.length) return [];
  return [
    h(
      'section',
      { class: 'warn-panel', 'aria-labelledby': 'warn-title' },
      h('h2', { id: 'warn-title' }, t('warningsTitle')),
      h(
        'ul',
        { class: 'warn-list' },
        warnings.map((w) => h('li', { class: `warn-${w.kind}` }, h('span', { class: 'warn-kind' }, t(`warnKind_${w.kind}`)), h('span', {}, warningText(w)))),
      ),
    ),
  ];
}

// Exam dates from eCampus (data.exams, Master Computer Science only for now). Exams of the selected modules
// come first; the full list folds out below, including modules that only have an exam this semester.
function examItem(e) {
  const mod = e.moduleId ? moduleById(e.moduleId) : null;
  const name = mod ? nameOf(mod) : lang === 'de' ? e.moduleTitle : e.moduleTitleEn ?? e.moduleTitle;
  return e.dates.map((d) =>
    h(
      'li',
      { class: `exam-${e.kind}` },
      h('span', { class: 'date-chip' }, formatDate(d.date)),
      h(
        'span',
        { class: 'date-what' },
        h('strong', {}, `${t(`examKind_${e.kind}`)}: ${name}`),
        h('span', {}, [d.start && d.end ? `${dayShort(d.day)} ${d.start}-${d.end}` : dayShort(d.day), d.room ? roomName(d.room) : null].filter(Boolean).join(', ')),
        ...e.remarks.map((r) => h('span', { class: 'exam-remark', title: remarkTitle(r) }, remark(r).text)),
        d.enrollUntil ? h('span', { class: 'exam-enroll' }, t('examEnrollUntil', { date: formatDate(d.enrollUntil) })) : null,
        mod ? null : h('span', { class: 'exam-only' }, t('examOnly')),
        h('a', { href: e.url, target: '_blank', rel: 'noopener' }, 'eCampus'),
      ),
    ),
  );
}
// Hidden until the user asks for it (2026-10-19: "keep the exams, add them later"); the data is scraped already.
const SHOW_EXAMS = false;
function examsPanel() {
  if (!SHOW_EXAMS || !data.exams?.length) return [];
  const mine = data.exams.filter((e) => e.moduleId && state.modules[e.moduleId]);
  return [
    h(
      'section',
      { class: 'exams-panel', 'aria-labelledby': 'exams-title' },
      h('h2', { id: 'exams-title' }, t('examsTitle')),
      mine.length ? h('ul', { class: 'important-dates' }, mine.flatMap(examItem)) : h('p', {}, t('examsNoneSelected')),
      h('details', {}, h('summary', {}, t('examsAll', { n: data.exams.length })), h('ul', { class: 'important-dates' }, data.exams.flatMap(examItem))),
    ),
  ];
}

function renderOtherDates(entries) {
  // Single dates shown in the grid are listed here as well, with their full dates.
  const rest = entries.filter((e) => !e.grid || isSingleDate(e.series));
  const box = $('other-dates');
  // Upcoming dated notes (kick-offs, first sessions, deadlines) of the selected courses, soonest first.
  const courses = [...new Map(entries.map((e) => [e.course.id, e.course])).values()];
  const dated = courses
    .flatMap((c) => courseNotes(c).filter((n) => n.date && !noteOver(n)).map((n) => ({ c, n })))
    .sort((a, b) => a.n.date.localeCompare(b.n.date));
  // Shown as a flagged panel: each row leads with the date, then what happens and for which course.
  const datedBox = dated.length
    ? [
        h(
          'section',
          { class: 'dates-panel', 'aria-labelledby': 'dates-title' },
          h('h2', { id: 'dates-title' }, h('span', { class: 'mark', 'aria-hidden': 'true' }, '!'), t('importantDates')),
          h(
            'ul',
            { class: 'important-dates' },
            dated.map(({ c, n }) =>
              h(
                'li',
                { class: `note-${n.kind}` },
                h('span', { class: 'date-chip' }, formatDate(n.date)),
                h(
                  'span',
                  { class: 'date-what' },
                  h('strong', {}, `${t(`note_${n.kind}`)}: ${nameOf(c)}`),
                  h('span', {}, [n.time, n.room ? roomName(n.room) : null].filter(Boolean).join(', ')),
                  n.kind === 'first' && n.text ? h('span', { title: remarkTitle(n.text) }, remark(n.text).text) : null,
                ),
              ),
            ),
          ),
        ),
      ]
    : [];
  const warnBox = [...warningsPanel(entries), ...examsPanel(), ...moodlePanel(entries)];
  if (!rest.length) {
    box.replaceChildren(...warnBox, ...datedBox);
    return;
  }
  rest.sort((a, b) => (a.series.startDate ?? '9').localeCompare(b.series.startDate ?? '9'));
  box.replaceChildren(
    ...warnBox,
    ...datedBox,
    h('h2', {}, t('otherDates')),
    h(
      'ul',
      {},
      rest.map((e) =>
        h(
          'li',
          {},
          h('strong', {}, nameOf(e.course)),
          ` (${typeOf(e.course)}): ${describeSeries(e.series)}`,
          roomOf(e.series) ? `, ${roomName(roomOf(e.series))}` : '',
          isTba(e.course) ? h('span', { class: 'tba-note' }, t(tbaKey('tbaNote'))) : null,
        ),
      ),
    ),
  );
}

// ---------- ready-made programs ----------

// Programs per theme, cached for the current free days, target and kept modules.
const programCache = new Map();
function themePrograms(theme, keep, target) {
  const key = JSON.stringify([theme.id, freeDays(), target, keep]);
  if (!programCache.has(key)) {
    if (programCache.size > 64) programCache.clear();
    const favor = themeModules(data, theme);
    const popular = data.popular ?? [];
    // A fixed plan is shown as it is; free days and kept modules do not change it.
    const programs = theme.plan
      ? [fixedProgram(data, theme.plan, { favor, shape: semester })]
      : suggestPrograms(data, { freeDays: freeDays(), target, keep, favor, popular, goal: theme.goal ?? 'balanced', count: 8, seed: 1, shape: semester });
    // An interest program should actually contain something from that interest.
    const relevant = theme.kind === 'interest' ? programs.filter((p) => p.favoredCount > 0) : programs;
    programCache.set(key, { favor, programs: relevant });
  }
  return programCache.get(key);
}

function renderSuggestions() {
  const target = Number(state.target) || 30;
  const selectedEcts = totalEcts(data, state).sum;
  // Kept modules that already fill the target leave nothing to suggest, so programs start from scratch.
  const full = ui.keepSelected && Object.keys(state.modules).length > 0 && selectedEcts >= target;
  const keep = ui.keepSelected && !full ? state.modules : {};
  const keptCount = Object.keys(keep).length;
  const notice = $('suggest-notice');
  notice.hidden = !full;
  notice.textContent = full ? t('keepFull', { ects: selectedEcts, target }) : '';
  const days = freeDays().map(dayName);
  $('suggest-intro').textContent =
    t('suggestIntro', { target }) +
    (days.length ? t('suggestFree', { days: listJoin(days) }) : '') +
    (keptCount ? t('suggestKept', { n: keptCount }) : '');

  const group = (kind, title) =>
    h(
      'section',
      { class: 'theme-group' },
      h('h2', {}, title),
      h('ul', { class: 'program-grid' }, programThemes(data).filter((th) => th.kind === kind).map((th) => programCard(th, keep, target))),
    );
  $('suggestions').replaceChildren(group('interest', t('interests')), group('goal', t('goals')));
}

function programCard(theme, keep, target) {
  const [title, description] = theme.text?.[lang] ?? theme.text?.en ?? t('themes')[theme.id];
  const { favor, programs } = themePrograms(theme, keep, target);
  // Jobs the path leads to, so a student can see what a theme is for at a glance.
  const careers = theme.careers?.[lang] ?? theme.careers?.en ?? [];
  const head = h(
    'header',
    { class: 'program-head' },
    h('h3', {}, title),
    h('p', {}, description),
    careers.length ? h('p', { class: 'careers' }, h('span', { class: 'careers-label' }, t('careersLabel')), careers.map((c) => h('span', { class: 'career' }, c))) : null,
  );
  if (!programs.length) {
    // Name the actual reason: the free days rule out the whole area, or the kept modules leave no room.
    const fitting = favor.map(moduleById).filter((m) => fitsFreeDays(m));
    const reason = favor.length && !fitting.length && freeDays().length ? 'noThemeModule' : Object.keys(keep).length ? 'noProgramKeep' : 'noProgram';
    return h('li', { class: 'program empty' }, head, h('p', { class: 'empty-note' }, t(reason)));
  }
  const index = (ui.variant[theme.id] ?? 0) % programs.length;
  const program = programs[index];
  const mods = Object.keys(program.modules).map(moduleById).filter(Boolean);
  const all = selectedEntries(data, { modules: program.modules });
  // The small week shows today's phase when the program's classes change during the semester.
  const phases = selectionPhases(all, semester);
  const today = phases.length > 1 ? phases[phaseIndexAt(phases, berlinNow().date)] : null;
  const entries = phaseEntries(all, today ?? ALL_DATES, semester);
  const covers = program.newlyCovered.map((id) => categoryShort(categoryById(id)));
  const free = program.freeWeekdays.map(dayShort);

  const week = h(
    'div',
    { class: 'mini-week', 'aria-hidden': 'true' },
    WEEKDAYS.map((d) => {
      const col = h('div', { class: 'mini-col' });
      for (const e of entries.filter((x) => x.grid && x.series.day === d)) {
        const top = ((toMinutes(e.series.start) - 8 * 60) / (12 * 60)) * 100;
        const hgt = ((toMinutes(e.series.end) - toMinutes(e.series.start)) / (12 * 60)) * 100;
        col.append(h('i', { style: `top:${top}%;height:${hgt}%;--mod-color:${moduleColor(e.module.id)}` }));
      }
      return h('div', { class: `mini-day${program.freeWeekdays.includes(d) ? ' free' : ''}` }, dayShort(d), col);
    }),
  );

  const facts = [`${program.ects} ECTS`, free.length ? t('freeList', { days: free.join(', ') }) : t('noFreeDay')];
  if (theme.kind === 'interest' && !theme.plan) facts.push(t('themeModules', { n: program.favoredCount }));
  if (today) facts.push(t('programPhases', { dates: listJoin(phases.slice(1).map((p) => shortDate(p.first))) }));

  return h(
    'li',
    { class: theme.plan ? 'program own-plan' : 'program' },
    head,
    h('p', { class: 'program-facts' }, facts.map((f) => h('span', {}, f))),
    week,
    h(
      'ul',
      { class: 'program-modules' },
      mods.map((m) => {
        const label = m.pickOne ? [nameOf(m), ...chosenNames(m, program.modules)].join(': ') : nameOf(m);
        const classes = [program.added.includes(m.id) ? '' : 'kept', favor.includes(m.id) ? 'on-theme' : ''].filter(Boolean).join(' ');
        return h(
          'li',
          { class: classes, style: `--mod-color:${moduleColor(m.id)}` },
          h('span', { class: 'swatch' }),
          h('span', { class: 'nm', title: label }, label),
          h('span', { class: 'ec' }, m.ects != null ? String(m.ects) : '?'),
        );
      }),
    ),
    covers.length ? h('p', { class: 'covers' }, t('covers', { list: listJoin(covers) })) : null,
    program.unscheduled.length
      ? h('p', { class: 'unscheduled' }, t('unscheduledNote', { list: listJoin(program.unscheduled.map((id) => nameOf(moduleById(id)))) }))
      : null,
    h(
      'div',
      { class: 'program-actions' },
      h('button', { type: 'button', class: 'primary', onclick: () => applyProgram(program) }, t('useProgram')),
      programs.length > 1
        ? h(
            'button',
            {
              type: 'button',
              class: 'quiet',
              onclick: () => {
                ui.variant[theme.id] = index + 1;
                renderSuggestions();
              },
            },
            `${t('another')} (${index + 1}/${programs.length})`,
          )
        : null,
    ),
  );
}

// ---------- next semesters ----------

function loadPlan() {
  try {
    return JSON.parse(localStorage.getItem(PLAN_KEY)) ?? {};
  } catch {
    return {};
  }
}
let plan = loadPlan();
const planId = (m) => m.number ?? m.code ?? m.name;
const planFor = (key) => plan[key] ?? [];

function togglePlan(key, m) {
  const id = planId(m);
  const ids = new Set(planFor(key));
  if (ids.has(id)) ids.delete(id);
  else {
    ids.add(id);
    // A module is taken once: planning it here drops it from the plans of later semesters.
    for (const k of Object.keys(plan)) if (k !== key) plan = { ...plan, [k]: planFor(k).filter((x) => x !== id) };
  }
  plan = { ...plan, [key]: [...ids] };
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {}
  render();
}

// The semester shown first is the next one: the current one is already in the week view.
function termKey() {
  const current = periodKey(data.period);
  if (ui.termKey === undefined) ui.termKey = current ? semesterRange(current, 2)[1] : null;
  return ui.termKey;
}

const areaName = (a) => (lang === 'de' ? a.nameDe ?? a.name : a.name);
const offeringName = (m) => (lang === 'de' ? m.nameDe ?? m.name : m.name);
const offeringAlt = (m) => (lang === 'de' && m.nameDe && m.name !== m.nameDe ? m.name : null);

// A German handbook field in the interface language, with the German original kept beneath.
function handbookText(m, field) {
  const text = m[field];
  if (!text) return null;
  const translated = lang === 'de' ? null : m.en?.[lang]?.[field] ?? m.en?.en?.[field];
  if (!translated || translated === text) return h('div', { class: 'term-text' }, text);
  return h(
    'div',
    { class: 'term-text' },
    translated,
    h('details', { class: 'term-orig' }, h('summary', {}, t('germanOriginal')), h('div', { lang: 'de' }, text)),
  );
}

// The handbook's course-type abbreviations that appear in a module, spelled out. VLmP is left out on purpose:
// its meaning could not be confirmed.
const COURSE_TYPE_ABBR = ['VL', 'V', 'Ü', 'Pr', 'S', 'SE', 'SWS'];
function courseTypeLegend(text) {
  if (lang === 'de' || !text) return null;
  const found = COURSE_TYPE_ABBR.filter((a) => new RegExp(`(^|[^A-Za-zÄÖÜäöü])${a}(?![A-Za-zÄÖÜäöü])`).test(text));
  return found.length ? h('div', { class: 'term-raw' }, found.map((a) => `${a} = ${t(`abbr_${a}`)}`).join(', ')) : null;
}

// "Every summer", "Every 4 semesters, from SoSe 2026", "Not stated".
function termRule(m) {
  if (m.term === 'both') return t('termEvery');
  if (m.term === 'unknown') return t('termUnknown');
  if (m.every === 2) return t(m.term === 'winter' ? 'termWinter' : 'termSummer');
  return t('termCycle', { n: m.every, from: semesterLabel(m.from) });
}

// For a module without dates this semester: its handbook entry, when the handbook plans it for another semester
// only, and the next semester it is planned for.
function laterOffering(mod) {
  const current = periodKey(data.period);
  const offering = mod.code && current ? data.offerings?.modules.find((m) => m.code === mod.code) : null;
  if (!offering || offeredIn(offering, current) !== false) return null;
  return { offering, next: nextOfferings(offering, current, TERMS_AHEAD + 3)[0] ?? null };
}

// Listed by the study planner but without any date this semester.
const isDateless = (mod) => mod.courseIds.every((id) => !courseById(id)?.groups.length);

// Modules with no dates this semester that the handbook places in another semester.
const laterModules = () => (data.offerings ? data.modules.filter((m) => isDateless(m) && laterOffering(m)) : []);

// "Hide summer semester courses (10)" in winter, "Hide winter semester courses" in summer; only where it hides something.
function renderHideLater() {
  const n = laterModules().length;
  $('hide-later-row').hidden = !n;
  if (!n) return;
  $('hide-later').checked = ui.hideLater;
  const other = periodKey(data.period)?.[0] === 'S' ? 'hideWinter' : 'hideSummer';
  $('hide-later-label').textContent = t(other, { n });
}

// Chosen in the week view (this semester's module with the same handbook code).
const chosenNow = (m) => {
  const here = siteModule(m);
  return Boolean(here && state.modules[here.id]);
};

// The earlier semester in which the student already has this module (planned, or chosen in the week view), if any.
const takenIn = (m, key) => takenBefore(planId(m), key, { plan, current: periodKey(data.period), nowChosen: chosenNow(m) });

// Every semester the student has the module in: the current one when chosen in the week view, then planned ones.
const mySemesters = (m) => {
  const current = periodKey(data.period);
  return [...(chosenNow(m) && current ? [current] : []), ...Object.keys(plan).filter((k) => planFor(k).includes(planId(m)))];
};

// This semester's module on the site with the same handbook code, if any.
const siteModule = (m) => (m.code ? data.modules.find((x) => x.code === m.code) : null);

function renderOfferings() {
  const o = data.offerings;
  const current = periodKey(data.period);
  const key = termKey();
  const range = current ? semesterRange(current, TERMS_AHEAD + 1) : [];
  const pick = (k) => () => {
    ui.termKey = k;
    render();
  };
  // Each stop counts what the current area and search leave for that semester.
  const countIn = (k) => filterOfferings(o, { key: k, area: ui.termArea, query: ui.termQuery }).filter((m) => offeredIn(m, k)).length;
  $('term-picker').replaceChildren(
    h(
      'ol',
      { class: 'term-rail' },
      range.map((k) =>
        h(
          'li',
          { class: `stop season-${k[0]}` },
          h(
            'button',
            { type: 'button', 'aria-pressed': String(k === key), 'aria-label': `${semesterLabel(k)}: ${t('termCount', { n: countIn(k) })}`, onclick: pick(k) },
            h('span', { class: 'stop-season' }, seasonName(k), k === current ? h('span', { class: 'stop-now' }, t('termNow')) : null),
            h('span', { class: 'stop-year' }, yearLabel(k)),
            h('span', { class: 'stop-count' }, t('termCount', { n: countIn(k) })),
          ),
        ),
      ),
    ),
    h('button', { type: 'button', class: 'rail-all', 'aria-pressed': String(key === null), onclick: pick(null) }, t('termAll')),
  );
  const tops = o.areas.filter((a) => !a.parent && o.modules.filter((m) => m.areas.includes(a.id)).length <= o.modules.length / 2);
  const area = $('term-area');
  area.replaceChildren(h('option', { value: '' }, t('termAllAreas')), ...tops.map((a) => h('option', { value: a.id, selected: a.id === ui.termArea }, areaName(a))));

  const list = filterOfferings(o, { key, area: ui.termArea, query: ui.termQuery });
  const sure = list.filter((m) => !key || offeredIn(m, key));
  const intro = key
    ? t(key === current ? 'termIntroNow' : 'termIntro', { term: semesterLabel(key), n: sure.length, total: o.modules.length })
    : t('termIntroAll', { total: o.modules.length });
  const link = h('a', { href: o.source, target: '_blank', rel: 'noopener' }, t('termSource'));
  $('term-intro').replaceChildren(intro, ' ', t('termPlanNote'), ' ', link, '.');

  const planned = key ? o.modules.filter((m) => (key === current ? chosenNow(m) : planFor(key).includes(planId(m)))) : [];
  const planBox = $('term-plan');
  planBox.hidden = !planned.length;
  if (planned.length) {
    const ects = planned.reduce((n, m) => n + (m.ects ?? 0), 0);
    planBox.replaceChildren(
      h('strong', {}, t('termPlanTitle', { term: semesterLabel(key), n: planned.length, ects })),
      h(
        'ul',
        { class: 'plan-chips' },
        planned.map((m) =>
          h(
            'li',
            {},
            h('span', {}, m.code ?? offeringName(m)),
            h(
              'button',
              {
                type: 'button',
                'aria-label': t('termRemove', { name: offeringName(m) }),
                title: offeringName(m),
                onclick: () => (key === current ? toggleModule(siteModule(m).id) : togglePlan(key, m)),
              },
              '×',
            ),
          ),
        ),
      ),
    );
  }

  // One group per area, in handbook order; a module sits in its first non-catch-all area.
  const groups = new Map();
  for (const m of list) {
    const id = primaryArea(m, o);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(m);
  }
  const order = o.areas.map((a) => a.id);
  const sections = [...groups]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([id, mods]) => {
      const a = o.areas.find((x) => x.id === id);
      const parent = a?.parent ? o.areas.find((x) => x.id === a.parent) : null;
      const title = parent ? `${areaName(parent)} > ${areaName(a)}` : a ? areaName(a) : '';
      return h(
        'section',
        { class: 'term-group' },
        h('h2', {}, title, h('span', { class: 'section-count' }, String(mods.length))),
        h('ul', { class: 'term-items' }, mods.map((m) => offeringCard(m, key, current))),
      );
    });
  // A search also names matches that run in other semesters, one tap away.
  const shown = new Set(list);
  const elsewhere = key && ui.termQuery.trim() ? filterOfferings(o, { area: ui.termArea, query: ui.termQuery }).filter((m) => !shown.has(m)) : [];
  const others = elsewhere.length
    ? h(
        'p',
        { class: 'term-elsewhere' },
        t('termElsewhere'),
        ' ',
        elsewhere.flatMap((m, i) => {
          const next = current ? nextOfferings(m, current, TERMS_AHEAD + 3)[0] : null;
          return [
            i ? ', ' : '',
            next
              ? h('button', { type: 'button', class: 'linkish', onclick: () => { ui.termKey = next; render(); } }, `${offeringName(m)} (${semesterLabel(next)})`)
              : offeringName(m),
          ];
        }),
      )
    : null;
  $('term-list').replaceChildren(...(sections.length ? sections : [h('p', { class: 'empty-note' }, t('termNone'))]), ...(others ? [others] : []));
}

function offeringCard(m, key, current) {
  const id = planId(m);
  const open = ui.termOpen.has(id);
  const here = siteModule(m);
  const status = key ? offeredIn(m, key) : null;
  const next = current ? nextOfferings(m, current, TERMS_AHEAD + 3) : [];
  // This semester's plan is the week view selection.
  const inPlan = key && (key === current ? chosenNow(m) : planFor(key).includes(id));
  const taken = takenIn(m, key);
  const mine = mySemesters(m);
  const o = data.offerings;
  const subjects = mainSubjects(m, o).map((sid) => o.areas.find((a) => a.id === sid));
  const alt = offeringAlt(m);
  const toggle = () => {
    if (ui.termOpen.has(id)) ui.termOpen.delete(id);
    else ui.termOpen.add(id);
    renderOfferings();
  };

  const head = h(
    'div',
    { class: 'module-head' },
    h(
      'div',
      { class: 'info', onclick: toggle },
      h('div', { class: 'module-title' }, offeringName(m)),
      alt ? h('div', { class: 'module-alt', lang: lang === 'de' ? 'en' : 'de' }, alt) : null,
      h('div', { class: 'term-when' }, rhythm(m, key, current), h('span', { class: 'term-rule' }, termRule(m))),
      h(
        'div',
        { class: 'module-meta' },
        m.code ? h('span', { class: 'tag code', title: t('handbookCode') }, m.code) : null,
        h('span', { class: 'tag ects' }, m.ects != null ? `${m.ects} ECTS` : t('ectsMissing')),

        !key && next.length ? h('span', { class: 'tag' }, t('termNext', { term: semesterLabel(next[0]) })) : null,
        m.languages?.length ? h('span', { class: 'tag lang' }, m.languages.map((c) => t(`lang_${c}`)).join(' + ')) : null,

        !key && mine.length ? h('span', { class: 'tag req-tag' }, t('termMine', { list: mine.map(semesterLabel).join(', ') })) : null,
        subjects.slice(0, 2).map((a) => h('span', { class: 'tag', title: areaName(a) }, shortSubject(a))),
      ),
    ),
    // Already planned in an earlier semester (or chosen this semester): shown as done, one tap from that semester.
    taken
      ? h(
          'button',
          {
            type: 'button',
            class: 'taken-link',
            title: t('termTakenHint'),
            onclick: () => {
              ui.termKey = taken;
              render();
            },
          },
          h('span', { 'aria-hidden': 'true' }, '\u2713 '),
          t('termTakenIn', { term: semesterLabel(taken) }),
        )
      : // This semester: add to or remove from the week view, where the module has courses.
        key && key === current
        ? here
          ? h('button', { type: 'button', class: `toggle${inPlan ? ' on' : ''}`, 'aria-pressed': String(inPlan), onclick: () => toggleModule(here.id) }, inPlan ? t('termChosen') : t('add'))
          : null
        : key && status !== false
      ? h('button', { type: 'button', class: `toggle${inPlan ? ' on' : ''}`, 'aria-pressed': String(Boolean(inPlan)), onclick: () => togglePlan(key, m) }, inPlan ? t('termUnplan') : t('termPlan'))
      : null,
  );
  const cls = `module term-card${inPlan ? ' planned' : ''}${taken ? ' taken' : ''}`;
  if (!open) return h('li', { class: cls }, head);

  const row = (label, value) => (value ? [h('dt', {}, label), h('dd', {}, value)] : []);
  const body = h(
    'div',
    { class: 'module-body' },
    h(
      'dl',
      { class: 'term-facts' },
      // The handbook's own words only where our reading of them is not the plain yearly rule.
      row(t('termFreq'), [termRule(m), m.frequency && (m.every > 2 || m.term === 'unknown') ? h('span', { class: 'term-raw', lang: 'en' }, ` (${t('termHandbookSays')}: "${m.frequency}")`) : null]),
      row(t('termNextList'), next.length ? next.map(semesterLabel).join(', ') : null),
      row(t('termCourseTypes'), [handbookText(m, 'courseTypes'), courseTypeLegend(m.courseTypes)]),
      row(t('termCourses'), handbookText(m, 'courses')),
      row(t('termLecturers'), handbookText(m, m.lecturers ? 'lecturers' : 'responsible')),
      row(t('termPrereq'), handbookText(m, 'prerequisites')),
      row(t('termExam'), handbookText(m, 'exam')),
      row(t('termWorkload'), handbookText(m, 'workload')),
      row(t('termSubjects'), subjects.length ? subjects.map(areaName).join(', ') : null),
      row(t('termContent'), handbookText(m, 'content')),
    ),
    h(
      'p',
      { class: 'term-links' },
      h('a', { href: m.url, target: '_blank', rel: 'noopener' }, t('termOpenHandbook')),
      here ? h('button', { type: 'button', class: 'quiet', onclick: () => focusModule(here.id) }, t('termGoThisSemester')) : null,
    ),
  );
  return h('li', { class: cls }, head, body);
}

// The module's rhythm over the semesters of the rail: filled where the handbook plans it, hollow where not,
// dashed where it does not say. The chosen semester is ringed.
function rhythm(m, key, current) {
  const range = current ? semesterRange(current, TERMS_AHEAD + 1) : [];
  const on = range.filter((k) => offeredIn(m, k));
  const mine = mySemesters(m);
  const label = m.term === 'unknown' ? t('termUnknown') : on.length ? t('termRhythm', { list: listJoin(on.map(semesterLabel)) }) : t('termRhythmNone');
  return h(
    'span',
    { class: 'rhythm', role: 'img', 'aria-label': label, title: label },
    range.map((k) => {
      const state = offeredIn(m, k);
      const have = mine.includes(k);
      return h(
        'i',
        { class: `pip season-${k[0]} ${state === null ? 'unknown' : state ? 'on' : 'off'}${k === key ? ' chosen' : ''}${have ? ' mine' : ''}`, 'aria-hidden': 'true' },
        have ? '\u2713' : state === null ? '?' : seasonLetter(k),
      );
    }),
  );
}

const seasonName = (k) => t(k[0] === 'W' ? 'seasonWinter' : 'seasonSummer');
const seasonLetter = (k) => t(k[0] === 'W' ? 'seasonWinterShort' : 'seasonSummerShort');
// 'W2026' -> '2026/27', 'S2027' -> '2027'.
const yearLabel = (k) => (k[0] === 'W' ? `${k.slice(1)}/${String(Number(k.slice(1)) + 1).slice(-2)}` : k.slice(1));

// "Main Subject Software Development (SD)" -> "SD".
const shortSubject = (a) => /\(([^)]+)\)\s*$/.exec(a.name)?.[1] ?? areaName(a);

// ---------- misc ----------

function focusModule(moduleId) {
  if (!ui.listOpen) setListOpen(true);
  if (isMobile()) ui.mview = 'list';
  ui.open.add(moduleId);
  const mod = moduleById(moduleId);
  if (mod) ui.expanded.add(mod.section ?? 'all');
  ui.query = '';
  ui.category = '';
  $('search').value = '';
  render();
  const el = document.getElementById(`mod-${moduleId}`);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
}

// ---------- friends ----------

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
let friends = readJson(FRIENDS_KEY, []);
const saveFriends = () => writeJson(FRIENDS_KEY, friends);

// One color per person, in list order ("me" first). Green stays free for the shared free hours.
const PERSON_COLORS = ['#2a5bd7', '#c2255c', '#d9480f', '#0b7285', '#8a3ab9', '#8d5b2c', '#5f3dc4', '#e67700'];
const personColor = (i) => PERSON_COLORS[i % PERSON_COLORS.length];
const FREE_MINUTES = [30, 60, 90, 120];

const programBySlug = (slug) => programs.find((p) => p.slug === slug) ?? (slug === PROGRAM && data ? { slug, name: data.program, nameEn: data.programEn } : null);
const programLabel = (slug) => {
  const p = programBySlug(slug);
  return p ? programName(p) : slug;
};

// Programs this browser holds a selection for; the open program from the live state.
function savedSelections() {
  const slugs = [PROGRAM, ...programs.map((p) => p.slug).filter((s) => s !== PROGRAM)];
  const out = [];
  for (const slug of slugs) {
    const modules = slug === PROGRAM ? state.modules : readJson(storageKey(slug), null)?.modules;
    if (modules && Object.keys(modules).length) out.push({ slug, modules });
  }
  return out;
}

// What the student shares and compares as their own: the programs ticked in the share box, else the open
// program, else the one opened last, else any program with a selection.
function myParts(saved = savedSelections()) {
  const chosen = readJson(MINE_KEY, []);
  const ticked = saved.filter((s) => chosen.includes(s.slug));
  if (ticked.length) return ticked;
  const fallback = saved.find((s) => s.slug === PROGRAM) ?? saved.find((s) => s.slug === LAST_PROGRAM) ?? saved[0];
  return fallback ? [fallback] : [];
}

// Other programs' data, fetched once when a friend's timetable needs it: null while loading, false if missing.
const programData = new Map();
function programDataOf(slug) {
  if (slug === PROGRAM) return data;
  if (!programData.has(slug)) {
    programData.set(slug, null);
    fetch(PUBLISHED ? `../${slug}/data/${slug}.json` : `data/${slug}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(
        (d) => programData.set(slug, d),
        () => programData.set(slug, false),
      )
      .then(() => ui.view === 'friends' && renderFriends());
  }
  return programData.get(slug);
}

// A person's weekly meetings over all their programs, for the week of today (Berlin time).
function personWeek(parts) {
  const busy = [];
  const missing = [];
  let loading = false;
  for (const part of parts) {
    const d = programDataOf(part.slug);
    if (d === null) loading = true;
    else if (d === false) missing.push(part.slug);
    else busy.push(...weekBusy(d, part.modules, berlinNow().date, semester).map((b) => ({ ...b, slug: part.slug })));
  }
  return { busy, missing, loading };
}

// The share link for a name and programs: the phone's share sheet (WhatsApp and so on), else the clipboard.
// Returns false when nothing was sent (the share sheet was dismissed).
async function sendShareLink(name, parts) {
  // The link opens on the sender's first program; the friend's own program is found from their browser.
  const base = new URL(programUrl(parts[0].slug), location.href);
  base.hash = '';
  const url = await shareLink(base.href, { name, parts });
  if (isMobile() && navigator.share) {
    try {
      await navigator.share({ title: t('title'), text: t('shareText', { name }), url });
      return true;
    } catch (err) {
      if (err?.name === 'AbortError') return false;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast(t('shareCopied'));
  } catch {
    prompt(t('shareManual'), url);
  }
  return true;
}

// Share dialog: the name friends see, the programs that go into the link (old trial selections can be
// deleted here), and the button that sends the link.
function openShareDialog() {
  $('share-dialog')?.remove();
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  const name = h('input', { id: 'share-name', type: 'text', maxlength: '30', autocomplete: 'given-name', spellcheck: 'false', value: readJson(NAME_KEY, '') });
  const list = h('ul', { class: 'share-list' });
  const programsBox = h('fieldset', { class: 'share-programs' }, h('legend', {}, t('sharePrograms')), list, h('p', { class: 'share-programs-hint' }, t('shareProgramsHint')));
  const status = h('p', { class: 'fb-status', role: 'status', 'aria-live': 'polite' });
  const send = h('button', { type: 'submit', class: 'primary' }, t(isMobile() && navigator.share ? 'shareSend' : 'shareCopy'));

  const renderList = () => {
    const saved = savedSelections();
    const mine = new Set(myParts(saved).map((p) => p.slug));
    programsBox.hidden = !saved.length;
    list.replaceChildren(
      ...saved.map((s) => {
        const label = programLabel(s.slug);
        return h(
          'li',
          { class: mine.has(s.slug) ? 'on' : null },
          h(
            'label',
            { class: 'check' },
            h('input', {
              type: 'checkbox',
              checked: mine.has(s.slug),
              onchange: (ev) => {
                const next = new Set(mine);
                if (ev.target.checked) next.add(s.slug);
                else next.delete(s.slug);
                writeJson(MINE_KEY, [...next]);
                renderList();
              },
            }),
            h('span', { class: 'share-program' }, label, h('small', {}, t('modulesCount', { n: Object.keys(s.modules).length }))),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'quiet share-delete',
              'aria-label': t('deleteProgram', { program: label }),
              title: t('deleteProgram', { program: label }),
              onclick: () => {
                if (!confirm(t('confirmDeleteProgram', { program: label, n: Object.keys(s.modules).length }))) return;
                if (s.slug === PROGRAM) {
                  state.modules = {};
                  ui.open.clear();
                  saveState();
                } else {
                  try {
                    localStorage.removeItem(storageKey(s.slug));
                  } catch {}
                }
                writeJson(MINE_KEY, readJson(MINE_KEY, []).filter((x) => x !== s.slug));
                renderList();
                render();
              },
            },
            t('delete'),
          ),
        );
      }),
    );
    if (!saved.length) status.textContent = t('shareEmpty');
  };

  const form = h(
    'form',
    { method: 'dialog', novalidate: true },
    h('div', { class: 'fb-head' }, h('h2', { id: 'share-title' }, t('shareOpen')), h('button', { type: 'button', class: 'quiet fb-close', 'aria-label': t('fbClose'), onclick: close }, '×')),
    h('p', { class: 'fb-intro' }, t('shareHint')),
    h('label', { class: 'fb-field' }, h('span', {}, t('shareName')), name, h('small', {}, t('shareNamePlaceholder'))),
    programsBox,
    status,
    h('div', { class: 'fb-actions' }, h('button', { type: 'button', class: 'quiet', onclick: close }, t('fbCancel')), send),
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const who = name.value.replace(/\s+/g, ' ').trim();
    const parts = myParts();
    status.textContent = !who ? t('shareNeedName') : !parts.length ? t('shareEmpty') : '';
    if (!who) name.focus();
    if (status.textContent) return;
    writeJson(NAME_KEY, who);
    send.disabled = true;
    const sent = await sendShareLink(who, parts);
    send.disabled = false;
    if (sent) close();
  });
  const dialog = h('dialog', { id: 'share-dialog', class: 'feedback-dialog share-dialog', 'aria-labelledby': 'share-title' }, form);
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    close();
  });
  renderList();
  document.body.append(dialog);
  dialog.showModal();
  if (!name.value) name.focus();
}

// A link opened from a friend: keep the friend, then show the comparison from the student's own program.
// Returns true when the page is leaving for that program.
async function receiveShare(text) {
  history.replaceState(null, '', location.pathname + location.search);
  const payload = await decodeShare(text);
  if (!payload) {
    showToast(t('shareBroken'));
    return false;
  }
  const own = readJson(NAME_KEY, '');
  if (own && own.toLowerCase() === payload.name.toLowerCase()) {
    showToast(t('shareOwn'));
    return false;
  }
  const added = addFriend(friends, payload);
  friends = added.friends;
  saveFriends();
  const message = t(added.updated ? 'friendUpdated' : 'friendAdded', { name: payload.name });
  // The link opens on the sender's program. A student with a selection in another program goes back to it.
  const home = LAST_PROGRAM && LAST_PROGRAM !== PROGRAM && !Object.keys(state.modules).length && readJson(storageKey(LAST_PROGRAM), null)?.modules;
  if (home && Object.keys(home).length) {
    try {
      sessionStorage.setItem('ders-programi:toast', message);
    } catch {}
    location.replace(`${programUrl(LAST_PROGRAM)}#friends`);
    return true;
  }
  showToast(message);
  return false;
}

function renderFriends() {
  // "Me" is the point of view, so it has no colour of its own and cannot be switched off.
  const people = [{ id: 'me', name: t('me'), parts: myParts(), hidden: false }, ...friends].map((p, i) => ({
    ...p,
    color: i ? personColor(i - 1) : 'var(--ink-2)',
    week: personWeek(p.parts),
  }));

  const setHidden = (person, hidden) => {
    friends = friends.map((f) => (f.id === person.id ? { ...f, hidden } : f));
    saveFriends();
    renderFriends();
  };
  const remove = (person) => {
    if (!confirm(t('confirmRemoveFriend', { name: person.name }))) return;
    friends = friends.filter((f) => f.id !== person.id);
    saveFriends();
    render();
  };
  $('people').replaceChildren(
    ...people.map((p) => {
      const programsText = p.parts.length ? p.parts.map((x) => programLabel(x.slug)).join(', ') : t('meNoCourses');
      return h(
        'li',
        { class: `person${p.hidden ? ' off' : ''}`, style: `--person:${p.color}` },
        h('span', { class: 'swatch', 'aria-hidden': 'true' }),
        h(
          'span',
          { class: 'person-text' },
          h('span', { class: 'person-name' }, p.name),
          h('span', { class: 'person-programs', title: programsText }, p.week.missing.length ? t('friendMissing') : p.week.loading ? t('friendLoading') : programsText),
        ),
        // Takes the person out of the comparison and back, without forgetting them.
        p.id === 'me'
          ? null
          : h(
              'button',
              { type: 'button', class: 'person-toggle', 'aria-pressed': String(!p.hidden), 'aria-label': t(p.hidden ? 'compareAdd' : 'compareRemove', { name: p.name }), onclick: () => setHidden(p, !p.hidden) },
              t(p.hidden ? 'compareAddShort' : 'compareRemoveShort'),
            ),
        p.id === 'me' ? null : h('button', { type: 'button', class: 'quiet person-remove', 'aria-label': t('removeFriend', { name: p.name }), title: t('removeFriend', { name: p.name }), onclick: () => remove(p) }, '×'),
      );
    }),
    ...(friends.length ? [] : [h('li', { class: 'people-empty' }, h('span', {}, t('friendsEmpty')))]),
  );

  const others = people.slice(1).filter((p) => !p.hidden);
  renderCompare(people[0], others, [people[0], ...others].some((p) => p.week.loading));
}

// The comparison week, seen from the student: their own classes as grey blocks across the day, and per friend
// (one lane each, in the friend's color) the hours both of them are free. Green behind: everyone is free.
function renderCompare(me, others, loading) {
  const cal = $('friends-calendar');
  cal.setAttribute('aria-label', t('tabFriends'));
  const days = [...WEEKDAYS];
  let first = 8;
  let last = 20;
  for (const b of [me, ...others].flatMap((p) => p.week.busy)) {
    if (!days.includes(b.day)) days.push(b.day);
    first = Math.min(first, Math.floor(b.start / 60));
    last = Math.max(last, Math.ceil(b.end / 60));
  }
  days.sort((a, b) => a - b);
  const range = { days, from: first * 60, to: last * 60, min: ui.freeMin };
  const pairs = loading ? [] : others.map((f) => commonFree([me.week.busy, f.week.busy], range));
  const everyone = !loading && others.length > 1 ? commonFree([me.week.busy, ...others.map((f) => f.week.busy)], range) : {};
  const HOUR_PX = 44;
  cal.style.setProperty('--hour', `${HOUR_PX}px`);
  cal.style.setProperty('--days', String(days.length));
  const y = (minutes) => ((minutes - first * 60) / 60) * HOUR_PX;
  const height = (last - first) * HOUR_PX;
  const span = (s, e) => `top:${y(s)}px;height:${Math.max(16, y(e) - y(s) - 2)}px`;
  const nodes = [h('div', { class: 'cal-head' }, '')];
  for (const d of days) nodes.push(h('div', { class: 'cal-head' }, dayName(d)));
  const times = h('div', { class: 'cal-times', style: `height:${height}px` });
  for (let hr = first; hr < last; hr++) times.append(h('span', { style: `top:${y(hr * 60)}px` }, `${String(hr).padStart(2, '0')}:00`));
  nodes.push(times);
  const lanes = Math.max(1, others.length);
  for (const d of days) {
    const col = h('div', { class: 'cal-day', style: `height:${height}px` });
    for (const [s, e] of everyone[d] ?? []) {
      const label = `${t('freeEveryone')} ${clock(s)}-${clock(e)}`;
      col.append(h('div', { class: 'free-band', style: span(s, e), title: label }, h('span', {}, t('freeEveryone'))));
    }
    for (const b of me.week.busy.filter((x) => x.day === d)) {
      const name = lang === 'de' ? b.title : b.titleEn ?? b.title;
      const label = `${clock(b.start)}-${clock(b.end)} ${name}`;
      col.append(h('div', { class: 'mine', style: span(b.start, b.end), title: label }, h('span', {}, name)));
    }
    others.forEach((f, lane) => {
      for (const [s, e] of pairs[lane]?.[d] ?? []) {
        const label = t('freeWith', { name: f.name, time: `${clock(s)}-${clock(e)}` });
        col.append(
          h(
            'div',
            { class: 'match', title: label, style: `${span(s, e)};left:calc(${(lane * 100) / lanes}% + 2px);width:calc(${100 / lanes}% - 4px);--person:${f.color}` },
            h('b', {}, f.name),
            h('span', { class: 'match-time' }, `${clock(s)}-${clock(e)}`),
          ),
        );
      }
    });
    nodes.push(col);
  }
  if (loading) nodes.push(h('div', { class: 'cal-empty' }, t('friendLoading')));
  cal.replaceChildren(...nodes);
}

function exportIcs() {
  const ics = buildIcs(selectedEntries(data, state));
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = h('a', { href: url, download: 'ders-programi.ics' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindControls() {
  $('lang').replaceChildren(...Object.entries(LANGS).map(([code, label]) => h('option', { value: code }, label)));
  $('lang').addEventListener('change', (ev) => setLang(ev.target.value));
  $('toggle-list').addEventListener('click', () => setListOpen(!ui.listOpen));
  $('search').addEventListener('input', (ev) => {
    ui.query = ev.target.value;
    renderModuleList(findConflicts(selectedEntries(data, state)));
  });
  $('hide-later').addEventListener('change', (ev) => {
    ui.hideLater = ev.target.checked;
    try {
      localStorage.setItem(HIDE_LATER_KEY, ui.hideLater ? '1' : '0');
    } catch {}
    render();
  });
  $('ects-target').addEventListener('change', (ev) => {
    const v = Number(ev.target.value);
    if (v > 0) state.target = v;
    commit();
  });
  $('tab-week').addEventListener('click', () => setView('week'));
  for (const btn of document.querySelectorAll('#mobile-nav button')) {
    btn.addEventListener('click', () => setMobileView(btn.dataset.mview));
  }
  $('filters-toggle').addEventListener('click', () => {
    ui.filtersOpen = !ui.filtersOpen;
    renderFilterToggle();
  });
  $('tab-suggest').addEventListener('click', () => setView('suggest'));
  $('tab-terms').addEventListener('click', () => setView('terms'));
  $('tab-friends').addEventListener('click', () => setView('friends'));
  $('share-open').addEventListener('click', openShareDialog);
  $('free-min').addEventListener('change', (ev) => {
    ui.freeMin = Number(ev.target.value);
    renderFriends();
  });
  $('term-search').addEventListener('input', (ev) => {
    ui.termQuery = ev.target.value;
    renderOfferings();
  });
  $('term-area').addEventListener('change', (ev) => {
    ui.termArea = ev.target.value;
    renderOfferings();
  });
  $('keep-selected').addEventListener('change', (ev) => {
    ui.keepSelected = ev.target.checked;
    render();
  });
  $('export-ics').addEventListener('click', exportIcs);
  $('feedback-foot').addEventListener('click', reportGeneral);
  noteVisit();
  $('news').addEventListener('click', () => openNews({ h, t, lang, program: PROGRAM, onClose: showNewsDot }));
  $('clear').addEventListener('click', () => {
    if (!Object.keys(state.modules).length) return;
    if (!confirm(t('confirmClear'))) return;
    state = { ...emptyState(), target: state.target, freeDays: freeDays() };
    ui.open.clear();
    commit();
  });
}

async function init() {
  bindControls();
  applyStaticText();
  // Block widths change with the window; re-fit their text when the calendar resizes.
  // The hour height follows the window height and the layout (grid or list) its width, so a window
  // resize re-renders the week.
  let fitFrame = 0;
  let lastSize = '';
  window.addEventListener('resize', () => {
    const size = `${window.innerWidth}x${window.innerHeight}`;
    if (size === lastSize) return;
    lastSize = size;
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => ui.lastCalendar && ui.view === 'week' && renderCalendar(ui.lastCalendar.entries, ui.lastCalendar.conflicts));
  });
  // Block widths can also change without a window resize (e.g. fonts loading); re-fit the text then.
  new ResizeObserver(() => {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(fitBlocks);
  }).observe($('calendar'));
  // Phones: section heads pin right under the pinned search block, whatever its height.
  new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty('--search-h', `${Math.round(entry.borderBoxSize[0].blockSize)}px`);
  }).observe(document.querySelector('.controls'));
  try {
    const [res, index] = await Promise.all([fetch(`data/${PROGRAM}.json`), fetch('data/programs.json').catch(() => null)]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    if (index?.ok) {
      const idx = await index.json();
      programs = idx.programs ?? [];
      if (idx.semester) semester = { ...idx.semester, breaks: new Set(idx.semester.breaks) };
    }
  } catch (err) {
    $('subtitle').textContent = t('loadError', { error: err.message });
    return;
  }
  // Requirements and ready-made programs exist only where the program has rules for them (Master Informatik).
  data.categories ??= [];
  document.body.classList.toggle('no-req', !data.categories.length);
  $('tab-suggest').hidden = !data.themes;
  document.querySelector('#mobile-nav [data-mview="suggest"]').hidden = !data.themes;
  if (!data.themes && ui.mview === 'suggest') ui.mview = 'week';
  $('tab-terms').hidden = !data.offerings;
  document.querySelector('#mobile-nav [data-mview="terms"]').hidden = !data.offerings;
  if (!data.offerings && ui.mview === 'terms') ui.mview = 'week';
  // A shared link like /msc-computer-science/#terms opens the next-semesters view directly.
  if (data.offerings && location.hash === '#terms') {
    ui.view = 'terms';
    ui.mview = 'terms';
    for (const [tab, view] of [['tab-week', 'week'], ['tab-suggest', 'suggest'], ['tab-terms', 'terms']]) $(tab).setAttribute('aria-selected', String(view === 'terms'));
    $('view-week').hidden = true;
    $('view-terms').hidden = false;
  }
  // Phones: the dock's labels shrink when four or more views share it.
  $('mobile-nav').classList.toggle('crowded', document.querySelectorAll('#mobile-nav button:not([hidden])').length > 3);
  // A friend's link (#share=...) adds them; #friends opens the comparison (also after coming back from a friend's link).
  const shared = shareFromHash(location.hash);
  // A share link opened while the page is already open changes only the hash; load it like a fresh visit.
  window.addEventListener('hashchange', () => shareFromHash(location.hash) && location.reload());
  if (shared && (await receiveShare(shared))) return;
  try {
    const message = sessionStorage.getItem('ders-programi:toast');
    sessionStorage.removeItem('ders-programi:toast');
    if (message) showToast(message);
  } catch {}
  if (shared || location.hash === '#friends') {
    if (location.hash === '#friends') history.replaceState(null, '', location.pathname + location.search);
    ui.view = 'friends';
    ui.mview = 'friends';
    for (const [tab, view] of [['tab-week', 'week'], ['tab-suggest', 'suggest'], ['tab-terms', 'terms'], ['tab-friends', 'friends']]) $(tab).setAttribute('aria-selected', String(view === 'friends'));
    $('view-week').hidden = true;
    $('view-terms').hidden = true;
    $('view-friends').hidden = false;
  }
  // Drop selections for modules that no longer exist after a re-scrape.
  const known = new Set(data.modules.map((m) => m.id));
  for (const id of Object.keys(state.modules)) if (!known.has(id)) delete state.modules[id];
  for (const id of Object.keys(state.modules)) ui.open.add(id);
  semester ??= semesterShape(data.courses);
  applyStaticText();
  render();
}

init();
