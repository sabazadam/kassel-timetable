// Translations of eCampus remarks ("Bemerkung"), which lecturers write in German. Keys are the remark
// text normalized with normalizeNote(). The scraper logs remarks that are missing here, so new ones can
// be added after the daily run; until then the site shows them in German, marked as untranslated.

import FB16_NOTES from './notes-fb16.json' with { type: 'json' };
import UNI_NOTES from './notes-uni.json' with { type: 'json' };
import GERMAN from './german-courses.json' with { type: 'json' };

export const normalizeNote = (text) => (text ?? '').replace(/​/g, '').replace(/\s+/g, ' ').trim();

// Remarks that are already English need no entry; they are detected by this list of common words.
export const looksEnglish = (text) => /\b(the|will|lectures|students|this|from|are)\b/i.test(text) && !/\b(der|die|das|und|bitte|findet)\b/.test(text);

const MOODLE_DIGLOG = {
  en: 'Information in the Moodle course "DigLogÜ (WS 26/27)".',
  tr: 'Bilgi Moodle kursunda: "DigLogÜ (WS 26/27)".',
};
const KICKOFF_DIGITAL = {
  en: 'Kick-off meeting on Thursday, 22.10.2026 at 14:00, room 0328. Information in the Moodle course "SemPDigi (WS 26/27)".',
  tr: 'Ön görüşme 22.10.2026 Perşembe saat 14:00, oda 0328. Bilgi Moodle kursunda: "SemPDigi (WS 26/27)".',
};
const KICKOFF_KNOWLEDGE = {
  en: 'Kick-off meeting on Monday, 19.10.2026 at 16:00 in room 0445/E.',
  tr: 'Ön görüşme 19.10.2026 Pazartesi saat 16:00, oda 0445/E.',
};
const FUSE_ONLY = {
  en: 'Room 2107, lab of the Computer Architecture and System Programming department. This lecture is for FUSE students only. Interested students can register by email: sps_plc_prog@uni-kassel.de.',
  tr: 'Oda 2107, Bilgisayar Mimarisi ve Sistem Programlama bölümünün laboratuvarı. Bu ders yalnızca FUSE öğrencileri içindir. İlgilenenler e-posta ile kayıt olabilir: sps_plc_prog@uni-kassel.de.',
};
const ENROLMENT_ERROR = {
  en: 'If you get the error "Keine Belegung zu dem gewünschten Termin möglich" (no registration possible for this date) when registering, write to us by email or tell us in the first session, so the course can be added to your study program in eCampus and we can add you to the Moodle course.',
  tr: 'Derse kayıt olurken "Keine Belegung zu dem gewünschten Termin möglich" (bu tarihe kayıt mümkün değil) hatasını alırsan, e-postayla ya da ilk derste bize haber ver. Böylece ders eCampus\'ta senin programına eklenir ve seni Moodle kursuna alırız.',
};

const ENTRIES = [
  [
    'Wrap-up, die Termine werden in der Vorlesung und im moodle bekannt gegeben. 1. Wrap-up-Termin am Dienstag, den 17.11.2026',
    {
      en: 'Wrap-up sessions; dates are announced in the lecture and on Moodle. First wrap-up session on Tuesday, 17.11.2026.',
      tr: 'Tekrar (wrap-up) oturumları; tarihleri derste ve Moodle\'da duyurulur. İlk oturum 17.11.2026 Salı.',
    },
  ],
  ['Info über Moodle Kurs “DigLogÜ (WS 26/27)“', MOODLE_DIGLOG],
  ['Info über Moodle Kurs “DigLogÜ (WS 26/27)"', MOODLE_DIGLOG],
  [
    'Hörsaal-Tutorium, Info über Moodle Kurs “DigLogÜ (WS 26/27)“',
    { en: 'Tutorial in a lecture hall. ' + MOODLE_DIGLOG.en, tr: 'Amfide yapılan tutorial. ' + MOODLE_DIGLOG.tr },
  ],
  ['Weitere Termine als Onlineveranstaltung auf Moodle', { en: 'Further sessions are held online on Moodle.', tr: 'Sonraki oturumlar Moodle üzerinden çevrim içi yapılır.' }],
  ['Hörsaalübung', { en: 'Exercise in a lecture hall.', tr: 'Amfide yapılan alıştırma dersi.' }],
  ['Tutorium', { en: 'Tutorial.', tr: 'Tutorial (küçük grup dersi).' }],
  ['Vorbesprechung am Donnerstag, 22.10.2026 um 14.00 Uhr, Raum 0328. Info in Moodle “SemPDigi (WS 26/27)“', KICKOFF_DIGITAL],
  ['Vorbesprechung am Donnerstag, 22.10.2026 um 14.00 Uhr, Raum 0328. Info in Moodle “SemPDigi (WS 26/27“', KICKOFF_DIGITAL],
  [
    'Vorbesprechungstermin: Dienstag, 20.10. um 12:00-13:00 Uhr, Ort: 0307 (IES-Besprechungsraum) Interessierte melden sich bitte bei ies-sekretariat@uni-kassel.deNähere Informationen s. Moodle-Kurs',
    {
      en: 'Kick-off meeting: Tuesday, 20.10. from 12:00 to 13:00, room 0307 (IES meeting room). If interested, contact ies-sekretariat@uni-kassel.de. More information in the Moodle course.',
      tr: 'Ön görüşme: 20.10 Salı, 12:00-13:00, oda 0307 (IES toplantı odası). İlgilenenler ies-sekretariat@uni-kassel.de adresine yazsın. Ayrıntılar Moodle kursunda.',
    },
  ],
  ['Vorbesprechung Montag, 19.10.2026 um 16.00 Uhr in Raum 0445/E', KICKOFF_KNOWLEDGE],
  ['Vorbesprechung Montag, 19.10.2026, 16:00 Uhr in Raum 0445/E', KICKOFF_KNOWLEDGE],
  [
    'Die Anmeldung zur Lehrveranstaltung in EXA ist erforderlich bis zum 12.10.2026.',
    { en: 'Registration for this course in EXA is required by 12.10.2026.', tr: 'Bu derse EXA üzerinden 12.10.2026 tarihine kadar kayıt olmak gerekiyor.' },
  ],
  [
    'Die Anmeldung zur Lehrveranstaltung im eCampus ist erforderlich bis zum 12.10.2026.',
    { en: 'Registration for this course in eCampus is required by 12.10.2026.', tr: 'Bu derse eCampus üzerinden 12.10.2026 tarihine kadar kayıt olmak gerekiyor.' },
  ],
  [
    'Die Veranstaltung findet in Präsenz statt. (Inverted Classroom)',
    { en: 'The course is held in person (inverted classroom).', tr: 'Ders yüz yüze yapılır (ters yüz sınıf).' },
  ],
  ['Für die Teilnahme ist keine Anmeldung notwendig.', { en: 'No registration is needed to take part.', tr: 'Katılmak için kayıt gerekmiyor.' }],
  [
    'Raum 1147 im Fachgebiet Leistungselektronik von Prof. Friebe',
    { en: 'Room 1147 in Prof. Friebe\'s Power Electronics department.', tr: 'Oda 1147, Prof. Friebe\'nin Güç Elektroniği bölümünde.' },
  ],
  [
    'Die Vorbesprechung für „Seminar Intelligente Stromnetze (ETechn-3590-V2)“ für das Sommersemester findet am Dienstag, den 02.11.2026 von 14:45 bis 16 Uhr im Multifunktionsraum 1624 (WA) des Fachgebiets e²n statt. Anmeldung erforderlich bis Do, den 29.10.2026 per E-Mail beim ISN-Seminarleiter Herrn Erik Prade ( erik.prade@uni-kassel.de ).',
    {
      en: 'The kick-off meeting for "Seminar Smart Power Grids (ETechn-3590-V2)" for the summer semester is on Tuesday, 02.11.2026 from 14:45 to 16:00 in multi-purpose room 1624 (WA) of the e²n department. Registration required by Thursday, 29.10.2026 by email to the ISN seminar coordinator, Mr Erik Prade (erik.prade@uni-kassel.de).',
      tr: '"Akıllı Elektrik Şebekeleri Semineri (ETechn-3590-V2)" yaz dönemi ön görüşmesi 02.11.2026 Salı 14:45-16:00 arasında e²n bölümünün 1624 numaralı çok amaçlı odasında (WA). 29.10.2026 Perşembe\'ye kadar ISN seminer sorumlusu Erik Prade\'ye (erik.prade@uni-kassel.de) e-postayla kayıt gerekiyor.',
    },
  ],
  [
    'Die Veranstaltung wird in Präsenz im Raum 1147 im Fachgebiet angeboten.',
    { en: 'The course is held in person in room 1147 in the department.', tr: 'Ders yüz yüze, bölümdeki 1147 numaralı odada yapılır.' },
  ],
  [
    'Block, Vorbesprechung am 26. Oktober, 10:00 - 10:30 Uhr, Raum 1624, Wilhelmshöher Allee 73.',
    {
      en: 'Block course. Kick-off meeting on 26 October, 10:00 to 10:30, room 1624, Wilhelmshöher Allee 73.',
      tr: 'Blok ders. Ön görüşme 26 Ekim, 10:00-10:30, oda 1624, Wilhelmshöher Allee 73.',
    },
  ],
  [
    'Die Vorbesprechung findet 26. Oktober, 10:30 - 11:00 Uhr in Raum 1624, Wilhelmshöher Allee 73 statt.',
    {
      en: 'The kick-off meeting is on 26 October, 10:30 to 11:00, in room 1624, Wilhelmshöher Allee 73.',
      tr: 'Ön görüşme 26 Ekim, 10:30-11:00, oda 1624, Wilhelmshöher Allee 73.',
    },
  ],
  ['Raum im Fachgebiet', { en: 'Room in the department.', tr: 'Bölümdeki bir oda.' }],
  ['Raum 2413 im Fachgebiet', { en: 'Room 2413 in the department.', tr: 'Bölümdeki 2413 numaralı oda.' }],
  ['Raum 2404 im Fachgebiet', { en: 'Room 2404 in the department.', tr: 'Bölümdeki 2404 numaralı oda.' }],
  ['Raum 2107, Labor im Fachgebiet Rechnerarchitektur und SystemprogrammierungThis lecture is for FUSE-Students only. Students, who are interested can register via email: sps_plc_prog@uni-kassel.de.', FUSE_ONLY],
  ['Raum 2107, Labor im Fachgebiet Rechnerarchitektur und Systemprogrammierung This lecture is or Fuse-Students only. Students, who are interested, can register via email: sps_plc_prog@uni-kassel.de', FUSE_ONLY],
  ['Infos finden Sie im Moodle-Kurs.', { en: 'Information is in the Moodle course.', tr: 'Bilgiler Moodle kursunda.' }],
  ['Vorlesung, Raum 0445E im Fachgebiet', { en: 'Lecture, room 0445E in the department.', tr: 'Ders, bölümdeki 0445E numaralı oda.' }],
  ['Übung, Raum 0445E im Fachgebiet', { en: 'Exercise, room 0445E in the department.', tr: 'Alıştırma, bölümdeki 0445E numaralı oda.' }],
  ['Raum 0445/E im Fachgebiet', { en: 'Room 0445/E in the department.', tr: 'Bölümdeki 0445/E numaralı oda.' }],
  [
    'Der Termin wird in der ersten Vorlesung "Begriffliche Datenanalyse" bekannt gegeben.',
    { en: 'The date is announced in the first lecture of "Conceptual Data Analysis".', tr: 'Tarih, "Conceptual Data Analysis" dersinin ilk oturumunda duyurulur.' },
  ],
  [
    'Findet zusammen mit Seminar Automatisierung in Raum 0614, Mönchebergstr. 7, statt.Falls Sie bei der Belegung der Lehrveranstaltung die Fehlermeldung “Keine Belegung zu dem gewünschten Termin möglich” erhalten, melden Sie sich bitte per Email oder in der ersten Veranstaltung bei uns, damit die Veranstaltung im eCampus noch Ihrem Studiengang entsprechend hinzugefügt wird und wir Sie in den Moodle-Kurs aufnehmen können.',
    {
      en: 'Held together with the Automation seminar in room 0614, Mönchebergstr. 7. ' + ENROLMENT_ERROR.en,
      tr: 'Otomasyon semineriyle birlikte, Mönchebergstr. 7, oda 0614\'te yapılır. ' + ENROLMENT_ERROR.tr,
    },
  ],
  [
    'Raum 0303c im Fachgebiet. Die Studierenden müssen sich bitte im entsprechenden Moodle-Kurs eintragen. Teilnehmerzahl kann begrenzt werden.',
    {
      en: 'Room 0303c in the department. Students must enrol in the matching Moodle course. The number of participants may be limited.',
      tr: 'Bölümdeki 0303c numaralı oda. Öğrencilerin ilgili Moodle kursuna kaydolması gerekiyor. Katılımcı sayısı sınırlanabilir.',
    },
  ],
  ['Raum 0303c im Fachgebiet', { en: 'Room 0303c in the department.', tr: 'Bölümdeki 0303c numaralı oda.' }],
  [
    'Die Veranstaltung findet im Fachgebietsraum -1523 im Gebäude 4500 (Wilhelmshöher Allee 73) statt.',
    { en: 'The course takes place in department room -1523 in building 4500 (Wilhelmshöher Allee 73).', tr: 'Ders, 4500 numaralı binadaki (Wilhelmshöher Allee 73) -1523 numaralı bölüm odasında yapılır.' },
  ],
  ['Vorlesung, Raum 1411a im Fachgebiet', { en: 'Lecture, room 1411a in the department.', tr: 'Ders, bölümdeki 1411a numaralı oda.' }],
  ['Übung, Raum 1405 im Fachgebiet', { en: 'Exercise, room 1405 in the department.', tr: 'Alıştırma, bölümdeki 1405 numaralı oda.' }],
  ['Zeiten und Räume s. Vorlesung und Übung', { en: 'For times and rooms, see the lecture and the exercise.', tr: 'Saat ve odalar için derse ve alıştırmaya bak.' }],
  [
    'Der erste Termin findet in Hörsaal -1319 statt, ab 27.10.2026 Raum 0303c im Fachgebiet.',
    { en: 'The first session is in lecture hall -1319; from 27.10.2026 in room 0303c in the department.', tr: 'İlk ders -1319 numaralı amfide; 27.10.2026\'dan itibaren bölümdeki 0303c numaralı odada.' },
  ],
  [
    'online oder in Präsenz, die Zeitplanung erfolgt zu Beginn des Semesters über Moodle',
    { en: 'Online or in person; the schedule is set on Moodle at the start of the semester.', tr: 'Çevrim içi ya da yüz yüze; takvim dönem başında Moodle üzerinden belirlenir.' },
  ],
  [
    'Falls Sie bei der Belegung der Lehrveranstaltung die Fehlermeldung “Keine Belegung zu dem gewünschten Termin möglich” erhalten, melden Sie sich bitte per Email oder in der ersten Veranstaltung bei uns, damit die Veranstaltung im eCampus noch Ihrem Studiengang entsprechend hinzugefügt wird und wir Sie in den Moodle-Kurs aufnehmen können.',
    ENROLMENT_ERROR,
  ],
  [
    'Kick-Off Meeting am 15.10.2026, 16.00 - 17.30 Uhr in Raum 1411a im Fachgebiet.',
    { en: 'Kick-off meeting on 15.10.2026, 16:00 to 17:30, in room 1411a in the department.', tr: 'Ön görüşme 15.10.2026, 16:00-17:30, bölümdeki 1411a numaralı oda.' },
  ],
  [
    'Raum und Zeit nach VereinbarungBevor Sie sich in EXA für ein Projekt anmelden, suchen Sie sich bitte im Fachgebiet IES eine Betreuungsperson und klären das Thema der Arbeit ab. Parallel zu Ihrer EXA Anmeldung melden Sie sich bitte zusätzlich im IES-Fachgebietssekretariat per Mail (ies-sekretariat@uni-kassel.de) unter Angabe der IES-Betreuungsperson sowie Ihres Projekttitels an.',
    {
      en: 'Room and time by arrangement. Before registering for a project in EXA, find a supervisor in the IES department and agree on the topic. Along with your EXA registration, also register with the IES department office by email (ies-sekretariat@uni-kassel.de), naming your IES supervisor and your project title.',
      tr: 'Oda ve saat hocayla birlikte belirlenir. EXA\'da projeye kayıt olmadan önce IES bölümünden bir danışman bul ve konuyu netleştir. EXA kaydına ek olarak IES bölüm sekreterliğine (ies-sekretariat@uni-kassel.de) danışmanının adını ve proje başlığını yazarak e-postayla kayıt ol.',
    },
  ],
  [
    'Das Projekt findet auf Anfrage teilweise online und teilweise in Präsenz statt, der Präsenzanteil hängt von der Aufgabenstellung ab, keine festen Termine.',
    {
      en: 'On request, the project is partly online and partly in person; how much is in person depends on the task. There are no fixed dates.',
      tr: 'Proje talebe göre kısmen çevrim içi, kısmen yüz yüze yapılır; yüz yüze kısmın oranı konuya bağlı. Sabit tarih yok.',
    },
  ],
  [
    'Die Veranstaltung findet nach Vereinbarung teilweise online und teilweise in Präsenz statt, der Präsenzanteil hängt von der Aufgabenstellung ab, keine festen Termine.',
    {
      en: 'By arrangement, the course is partly online and partly in person; how much is in person depends on the task. There are no fixed dates.',
      tr: 'Ders hocayla anlaşarak kısmen çevrim içi, kısmen yüz yüze yapılır; yüz yüze kısmın oranı konuya bağlı. Sabit tarih yok.',
    },
  ],
  [
    'Erster Termin im Hörsaal 0425, mit Prüfung.',
    { en: 'First session in lecture hall 0425, with an exam.', tr: 'İlk ders 0425 amfisinde, sınav yapılacak.' },
  ],
  [
    'Ab 27.10.2026 Raum 0303c im Fachgebiet.',
    { en: 'From 27.10.2026 in room 0303c in the department.', tr: '27.10.2026\'dan itibaren bölümdeki 0303c odasında.' },
  ],
  [
    'Wiederholungsklausur',
    { en: 'Retake exam', tr: 'Tekrar sınavı (bütünleme)' },
  ],
  [
    'Labor 0642 im Fachgebiet',
    { en: 'Lab 0642 in the department', tr: 'Bölümdeki 0642 numaralı laboratuvar' },
  ],
  [
    'Ort: Wilhelmshöher Allee 71-73, Labor 0642 im Fachgebiet',
    { en: 'Place: Wilhelmshöher Allee 71-73, lab 0642 in the department', tr: 'Yer: Wilhelmshöher Allee 71-73, bölümdeki 0642 numaralı laboratuvar' },
  ],
  [
    'Ort: Hörsaal 5, Campus Center',
    { en: 'Place: lecture hall 5, Campus Center', tr: 'Yer: Campus Center, 5 numaralı amfi' },
  ],
  [
    'Termine nach Vereinbarung',
    { en: 'Dates by arrangement', tr: 'Tarihler hocayla birlikte belirlenir' },
  ],
  [
    'Raum 2307A',
    { en: 'Room 2307A', tr: 'Oda 2307A' },
  ],
  [
    'Raum 2107',
    { en: 'Room 2107', tr: 'Oda 2107' },
  ],
  [
    'Interessierte wenden sich bitte an Herrn Dr. Schwarz unter m.schwarz@uni-kassel.de',
    { en: 'If interested, contact Dr. Schwarz at m.schwarz@uni-kassel.de.', tr: 'İlgilenenler Dr. Schwarz\'a yazsın: m.schwarz@uni-kassel.de.' },
  ],
  [
    'Einführungstermin für alle.Alle folgenden Termine werden gruppenspezifisch zugeteilt.',
    { en: 'Introductory session for everyone. All later sessions are assigned per group.', tr: 'Herkes için tanıtım oturumu. Sonraki tüm oturumlar gruplara göre atanır.' },
  ],
  ['Raum 1411 im Fachgebiet', { en: 'Room 1411 in the department.', tr: 'Bölümdeki 1411 numaralı oda.' }],
  [
    'Vorlesung Labor 0303c im Fachgebiet IES bei Prof. Sick',
    { en: 'Lecture in lab 0303c, Prof. Sick\'s IES department.', tr: 'Ders, Prof. Sick\'in IES bölümündeki 0303c numaralı laboratuvarda.' },
  ],
];

// Remarks of the other FB 16 programs live in notes-fb16.json, those of the other faculties in
// notes-uni.json (German remark -> { en, tr }).
export const NOTE_TRANSLATIONS = Object.fromEntries([...ENTRIES, ...Object.entries(FB16_NOTES), ...Object.entries(UNI_NOTES), ...GERMAN.courses.filter((c) => c.note).map((c) => [c.note.de, { en: c.note.en, tr: c.note.tr }])].map(([de, tr]) => [normalizeNote(de), tr]));
