// Pure HTML parsers for HISinOne pages. No network access here, so they can be tested on fixtures.
import { load } from 'cheerio';

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

const DAYS = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 7 };

// "19.10.2026" -> "2026-10-19"
export function parseDate(s) {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(s ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Course catalog tree: returns every row as a flat list. The dotted row number ("1.10.11.2")
// encodes the hierarchy, so parents are found by prefix.
export function parseTree(html) {
  const $ = load(html);
  const nodes = [];
  $('tr').each((i, tr) => {
    const $tr = $(tr);
    const numCell = $tr.children('td.invisible');
    const nameEl = $tr.find('.treeElementName').first();
    if (!numCell.length || !nameEl.length) return;
    const num = clean(numCell.first().contents().first().text());
    const kind = nameEl.find('img').first().attr('alt') ?? null;
    const name = clean(nameEl.text());
    const href = nameEl.find('a[href*="unitId="]').attr('href') ?? '';
    const unitId = /unitId=(\d+)/.exec(href)?.[1] ?? null;
    const permalink = $tr.find('input#autologinRequestUrl').attr('value') ?? '';
    const path = permalink.includes('path=') ? decodeURIComponent(permalink.split('path=')[1].split('&')[0]) : null;
    nodes.push({ num, kind, name, unitId, path });
  });
  return nodes;
}

export function parentNum(num) {
  return num.includes('.') ? num.slice(0, num.lastIndexOf('.')) : null;
}

// Text of each <li> in a cell, or the whole cell text when it has no list.
function listItems($, $cell) {
  if (!$cell) return [];
  const items = $cell.find('li').map((k, li) => clean($(li).text())).get().filter(Boolean);
  if (items.length) return items;
  const text = clean($cell.text());
  return text ? [text] : [];
}

// "Grunddaten" label/value pairs from a detail page.
export function parseBasicData($, scope) {
  const data = {};
  (scope ?? $.root()).find('.labelItemLine').each((i, line) => {
    const label = clean($(line).children('label').first().text());
    const answer = $(line).children('.answer').first();
    const items = answer.find('li').map((k, li) => clean($(li).text())).get().filter(Boolean);
    const value = items.length ? items.join(', ') : clean(answer.text());
    if (label && !(label in data)) data[label] = value;
  });
  return data;
}

// Course (Veranstaltung) detail page: basic data plus parallel groups with their appointment series.
export function parseCourseDetail(html) {
  const $ = load(html);
  const basic = parseBasicData($);
  const groups = [];
  $('[id]')
    .filter((i, e) => /parallelGroupSchedule_\d+$/.test($(e).attr('id')))
    .each((i, g) => {
      const $g = $(g);
      const title = clean($g.find('h2, h3, legend, .box_title').first().text());
      const groupName = /\(([^()]*Parallelgruppe[^()]*)\)\s*$/.exec(title)?.[1] ?? `${i + 1}. Parallelgruppe`;
      // The heading also names the group's own kind: "Programmierung und Modellierung - Tutorium (2. Parallelgruppe)".
      const head = basic['Titel'] ? `${basic['Titel']} - ` : null;
      const kind = head && title.startsWith(head) ? title.slice(head.length).replace(/\s*\([^()]*Parallelgruppe[^()]*\)\s*$/, '').trim() || null : null;
      const table = $g.find('table[id$="appointmentSeriesTableTable"]').first();
      const headers = table.find('thead th').map((j, th) => clean($(th).text())).get();
      const col = (prefix) => headers.findIndex((h) => h.startsWith(prefix));
      const idx = {
        rhythm: col('Rhythmus'),
        day: col('Wochentag'),
        time: col('Von - Bis'),
        cancelled: col('Ausfalltermin'),
        dates: col('Startdatum'),
        note: col('Bemerkung'),
        instructors: col('Durchführende'),
        room: col('Raum'),
      };
      const series = [];
      table.find('tbody > tr').each((j, tr) => {
        const cells = $(tr).children('td');
        if (cells.length < headers.length) return;
        const cell = (k) => (k >= 0 ? cells.eq(k) : null);
        const text = (k) => clean(cell(k)?.text());
        // "10:00 - 12:00", also with a suffix: "10:00 - 12:00 c.t." / "s.t.".
        const [start, end] = text(idx.time).match(/\d{1,2}:\d{2}/g) ?? [];
        const dates = (text(idx.dates).match(/\d{2}\.\d{2}\.\d{4}/g) ?? []).map(parseDate);
        const cancelled = (cell(idx.cancelled)?.text().match(/\d{2}\.\d{2}\.\d{4}/g) ?? []).map(parseDate);
        const dayText = text(idx.day);
        series.push({
          rhythm: text(idx.rhythm),
          day: DAYS[dayText] ?? null,
          start: /^\d{1,2}:\d{2}$/.test(start ?? '') ? start.padStart(5, '0') : null,
          end: /^\d{1,2}:\d{2}$/.test(end ?? '') ? end.padStart(5, '0') : null,
          startDate: dates[0] ?? null,
          endDate: dates[1] ?? dates[0] ?? null,
          cancelled,
          note: text(idx.note),
          instructors: listItems($, cell(idx.instructors)),
          room: text(idx.room),
        });
      });
      // Each parallel group has its own basic data, so one course can have an English and a German group.
      const language = parseBasicData($, $g)['Lehrsprache'] || null;
      // eCampus sometimes lists a parallel group without any appointment; it has nothing to choose.
      if (series.length) groups.push({ name: groupName, ...(kind ? { kind } : {}), ...(language ? { language } : {}), series });
    });
  return {
    title: basic['Titel'] ?? null,
    number: basic['Nummer'] ?? null,
    type: basic['Veranstaltungsart'] ?? null,
    language: basic['Lehrsprache'] ?? null,
    responsible: basic['Verantwortliche/-r'] ?? null,
    groups,
  };
}

// Exam (Prüfung) or coursework (Studienleistung) detail page: one row per exam date. The room is often
// only given in the remarks ("Wiederholungsklausur<br>Labor 0642 im Fachgebiet"), so remark lines are kept apart.
export function parseExamDetail(html) {
  const $ = load(html);
  const basic = parseBasicData($);
  const remarkHtml = $('.labelItemLine')
    .filter((i, line) => clean($(line).children('label').first().text()) === 'Bemerkungen')
    .first()
    .children('.answer')
    .html();
  const remarks = (remarkHtml ?? '')
    .split(/<br\s*\/?>|<\/p>|<\/div>/i)
    .map((part) => clean(load(`<div>${part}</div>`)('div').text()))
    .filter(Boolean);
  const dates = [];
  const seen = new Set();
  $('table[id$="appointmentSeriesTableTable"]').each((i, table) => {
    const headers = $(table).find('thead th').map((j, th) => clean($(th).text())).get();
    const col = (prefix) => headers.findIndex((h) => h.startsWith(prefix));
    const idx = { day: col('Wochentag'), time: col('Von - Bis'), date: col('Prüfungsdatum'), from: col('Beginn der Anmeldefrist'), until: col('Ende der Anmeldefrist'), examiners: col('Prüfer'), room: col('Raum') };
    if (idx.date < 0) return;
    $(table)
      .find('tbody > tr')
      .each((j, tr) => {
        const cells = $(tr).children('td');
        if (cells.length < headers.length) return;
        const cell = (k) => (k >= 0 ? cells.eq(k) : null);
        const text = (k) => clean(cell(k)?.text());
        const [start, end] = text(idx.time).match(/\d{1,2}:\d{2}/g) ?? [];
        const row = {
          day: DAYS[text(idx.day)] ?? null,
          start: start ? start.padStart(5, '0') : null,
          end: end ? end.padStart(5, '0') : null,
          date: parseDate(text(idx.date)),
          enrollFrom: parseDate(text(idx.from)),
          enrollUntil: parseDate(text(idx.until)),
          examiners: listItems($, cell(idx.examiners)).map((n) => n.replace(/\s*\(Prüfer\/-in\)$/, '')),
          room: text(idx.room),
        };
        const key = JSON.stringify(row);
        if (row.date && !seen.has(key)) {
          seen.add(key);
          dates.push(row);
        }
      });
  });
  return {
    title: basic['Titel'] ?? null,
    number: basic['Nummer'] ?? null,
    kind: basic['Prüfungsart'] ?? null,
    remarks,
    dates,
  };
}

// eCampus sometimes sends a session collapsed panels: basic data without title, or a parallel group
// with only its heading. Such a page drops groups silently, so the scraper fetches it again.
export function isCompleteCoursePage(html) {
  const $ = load(html);
  if (!parseBasicData($)['Titel']) return false;
  return $('[id]')
    .filter((i, e) => /parallelGroupSchedule_\d+$/.test($(e).attr('id')))
    .toArray()
    .every((g) => $(g).find('[id$="basicDataFieldset"]').length > 0);
}

// Course page, tab "Inhalte": one {heading, text} per section (Inhalte, Literatur, Zu erbringende Prüfungsleistung, ...).
export function parseCourseContents(html) {
  const $ = load(html);
  return $('[id^="detailViewData:tabContainer:term-planning-container:"] .box_content > fieldset.fieldsetNoBorder')
    .filter((i, f) => $(f).children('legend').length > 0 && !$(f).find('fieldset').length)
    .map((i, f) => {
      const $f = $(f).clone();
      const heading = clean($f.children('legend').first().text());
      $f.children('legend').remove();
      return { heading, text: clean($f.text()) };
    })
    .get()
    .filter((s) => s.text);
}

// "6,0" -> 6
export function parseGermanNumber(s) {
  const n = Number.parseFloat((s ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Module page, tab "Zuordnungsspezifische Leistungsinformationen": credit points per curriculum.
// HISinOne calls the ECTS awarded on passing "Bonus" ("Belegpunkte" is a different value). Prefers the row that mentions the given study program.
export function parseModuleCredits(html, program) {
  const $ = load(html);
  let best = null;
  $('table').each((i, t) => {
    const headers = $(t).find('thead th').map((j, th) => clean($(th).text())).get();
    const credits = headers.indexOf('Bonus');
    const programs = headers.findIndex((h) => h.startsWith('Studiengänge'));
    if (credits < 0) return;
    $(t).find('tbody > tr').each((j, tr) => {
      const cells = $(tr).children('td');
      const value = parseGermanNumber(clean(cells.eq(credits).text()));
      if (value == null) return;
      const matches = programs >= 0 && clean(cells.eq(programs).text()).includes(program);
      if (!best || (matches && !best.matches)) best = { value, matches };
    });
  });
  return best?.value ?? null;
}

// Catalog row "Inform-1360-V1 Optimierung und Verifikation ... - Praktikum" -> number, title, type.
export function splitCourseName(name) {
  const m = /^(?:(\p{L}+-\d{3,4}-[\p{L}\d]+)\s+)?(.+?)(?: - ([^-]+))?$/u.exec((name ?? '').trim());
  if (!m) return { number: null, title: null, type: null };
  return { number: m[1] ?? null, title: m[2] || null, type: m[3]?.trim() ?? null };
}
