// Builds an iCalendar (RFC 5545) file from selected schedule entries. Pure, no DOM.
import { roomOf } from './schedule.js';

const TZ = 'Europe/Berlin';

// Standard CET/CEST definition so calendar apps place events in Kassel local time.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export const escapeText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 octets are folded with CRLF + space (RFC 5545 section 3.1).
export function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (iso) => iso.replace(/-/g, '');
const compactTime = (hhmm) => hhmm.replace(':', '') + '00';
const localStamp = (iso, hhmm) => `${compactDate(iso)}T${compactTime(hhmm)}`;

function eventLines(entry, stamp) {
  const { course, series, module } = entry;
  if (!series.startDate || !series.start || !series.end) return [];
  const recurring = series.rhythm === 'wöchentlich' || series.rhythm === '14-täglich';
  const lines = [
    'BEGIN:VEVENT',
    `UID:${entry.key.replace(/:/g, '-')}@ders-programi`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${TZ}:${localStamp(series.startDate, series.start)}`,
    `DTEND;TZID=${TZ}:${localStamp(series.startDate, series.end)}`,
    `SUMMARY:${escapeText(`${course.titleEn ?? course.title} (${course.typeEn ?? course.type ?? ''})`.replace(' ()', ''))}`,
  ];
  const room = roomOf(series);
  if (room) lines.push(`LOCATION:${escapeText(room)}`);
  const germanTitle = course.titleEn && course.titleEn !== course.title ? course.title : null;
  const desc = [module.titleEn ?? module.title, germanTitle, course.number, series.note, series.instructors?.join(', '), course.url]
    .filter(Boolean)
    .join('\n');
  lines.push(`DESCRIPTION:${escapeText(desc)}`);
  if (recurring && series.endDate) {
    const interval = series.rhythm === '14-täglich' ? ';INTERVAL=2' : '';
    // UNTIL in UTC; end of the last day is safe for any start time.
    lines.push(`RRULE:FREQ=WEEKLY${interval};UNTIL=${compactDate(series.endDate)}T235959Z`);
    for (const d of series.cancelled ?? []) lines.push(`EXDATE;TZID=${TZ}:${localStamp(d, series.start)}`);
  }
  lines.push('END:VEVENT');
  return lines;
}

// entries: from selectedEntries(). now: Date used for DTSTAMP (injectable for tests).
export function buildIcs(entries, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ders-programi//Uni Kassel//DE', 'CALSCALE:GREGORIAN', ...VTIMEZONE];
  for (const e of entries) lines.push(...eventLines(e, stamp));
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
