// What's new: the site's changes for students, newest first, in a dialog opened from the header. An entry
// with `programs` shows only on those programs' pages; one without shows everywhere. The button carries
// a dot while the page has entries the visitor has not seen in the dialog. Add an entry at the top for
// each change students can see; ids must be unique and stay unchanged.

export const NEWS = [
  {
    id: '2026-10-29-german',
    date: '2026-10-29',
    tr: { title: 'Ücretsiz Almanca kursları', text: 'Dil Merkezi\'nin (ISZ) ücretsiz Almanca kursları artık her programda, listenin sonundaki "German Courses (ISZ)" bölümünde. A1\'den C1\'e kadar seviyeler ve akademik Almanca kursları takvimine eklenebilir. Kayıt ISZ\'den yapılır.' },
    en: { title: 'Free German courses', text: 'The free German courses of the Language Centre (ISZ) are now in every program, in the "German Courses (ISZ)" section at the end of the list. Levels A1 to C1 and academic German courses can go into your timetable. You register with the ISZ.' },
    de: { title: 'Kostenfreie Deutschkurse', text: 'Die kostenfreien Deutschkurse des Sprachenzentrums (ISZ) stehen jetzt in jedem Studiengang, im Abschnitt „Deutschkurse (ISZ)" am Ende der Liste. Niveaus A1 bis C1 und Kurse zur Wissenschaftssprache lassen sich in den Stundenplan legen. Die Anmeldung läuft über das ISZ.' },
  },
  {
    id: '2026-10-21-map',
    date: '2026-10-21',
    tr: { title: 'Kampüs haritası takvimde', text: 'Bilgisayarda takvimdeki bir dersin üzerine gel: "Binayı haritada göster" binayı kampüs haritasında işaretli açar. Altında hangi katta olduğu ve haritada hangi numarayı arayacağın yazar.' },
    en: { title: 'Campus map in the calendar', text: 'On a computer, point at a class in the calendar: "Show the building on the map" opens the campus map with the building marked. Below it you see the floor and the number to search for on the map.' },
    de: { title: 'Campusplan im Kalender', text: 'Zeig am Computer im Kalender auf eine Veranstaltung: „Gebäude auf dem Plan zeigen" öffnet den Campusplan mit markiertem Gebäude. Darunter stehen die Etage und die Nummer, nach der du im Plan suchst.' },
  },
  {
    id: '2026-10-21-wide',
    date: '2026-10-21',
    tr: { title: 'Sıkışan dersler açılınca genişliyor', text: 'Aynı saatte yan yana duran derslerin üzerine gelince ders günün tüm genişliğine açılır, böylece adı ve odası rahatça okunur.' },
    en: { title: 'Squeezed classes open wide', text: 'Classes that sit side by side at the same time now take the whole day\'s width when you point at them, so their name and room are easy to read.' },
    de: { title: 'Gedrängte Veranstaltungen öffnen sich breit', text: 'Veranstaltungen, die zur selben Zeit nebeneinander stehen, nehmen beim Draufzeigen die ganze Tagesbreite ein, so sind Titel und Raum gut lesbar.' },
  },
  {
    id: '2026-10-19-phone',
    date: '2026-10-19',
    tr: { title: 'Telefon görünümü', text: 'Telefonda ekranın altındaki menüden Dersler, Haftam ve Hazır programlar arasında geçebilirsin. Haftan gün gün liste olarak görünür.' },
    en: { title: 'Phone layout', text: 'On a phone, the bar at the bottom switches between Courses, My week and Ready-made programs. Your week shows as a list, day by day.' },
    de: { title: 'Handy-Ansicht', text: 'Am Handy wechselst du über die Leiste unten zwischen Veranstaltungen, Meine Woche und fertigen Plänen. Deine Woche erscheint als Liste, Tag für Tag.' },
  },
  {
    id: '2026-10-19-terms',
    programs: ['msc-computer-science'],
    date: '2026-10-19',
    tr: { title: 'Gelecek dönemler', text: 'Hangi modülün hangi dönemde açıldığını gör ve sonraki dönemlerini şimdiden planla. Bilgi modül el kitabından gelir; kesin tarihler daha sonra eCampus\'ta çıkar.' },
    en: { title: 'Next semesters', text: 'See which semester each module runs in and plan your next semesters now. This comes from the module handbook; exact dates come out later in eCampus.' },
    de: { title: 'Nächste Semester', text: 'Sieh, in welchem Semester jedes Modul angeboten wird, und plane deine nächsten Semester schon jetzt. Die Angaben stammen aus dem Modulhandbuch; genaue Termine erscheinen später in eCampus.' },
  },
  {
    id: '2026-10-19-ready',
    programs: ['msc-computer-science'],
    date: '2026-10-19',
    tr: { title: 'Kariyer yoluna göre hazır programlar', text: 'Hazır programlar artık yapay zeka, veri bilimi, güvenlik gibi yollara göre. Birini seç, açık derslerle hafta önüne gelsin.' },
    en: { title: 'Ready-made programs by career path', text: 'Ready-made programs now follow paths such as AI, data science and security. Pick one and get a week built from open classes.' },
    de: { title: 'Fertige Pläne nach Berufsweg', text: 'Die fertigen Pläne folgen jetzt Wegen wie KI, Data Science und Security. Wähle einen und erhalte eine Woche aus angebotenen Veranstaltungen.' },
  },
  {
    id: '2026-10-19-exams',
    programs: ['msc-computer-science'],
    date: '2026-10-19',
    tr: { title: 'Sınav tarihleri', text: 'Haftam görünümünün yanında, seçtiğin modüllerin sınav tarihleri önce gelecek şekilde listelenir.' },
    en: { title: 'Exam dates', text: 'Beside My week, the exam dates are listed, those of your chosen modules first.' },
    de: { title: 'Prüfungstermine', text: 'Neben Meine Woche stehen die Prüfungstermine, die deiner gewählten Module zuerst.' },
  },
  {
    id: '2026-10-16-all',
    date: '2026-10-16',
    tr: { title: 'Bütün bölümler', text: 'Üniversitenin bütün Bachelor, Master ve Lehramt bölümleri sitede. Ana sayfada fakülteye göre ara.' },
    en: { title: 'All study programs', text: 'All Bachelor, Master and Lehramt programs of the university are on the site. Search them by faculty on the start page.' },
    de: { title: 'Alle Studiengänge', text: 'Alle Bachelor-, Master- und Lehramtsstudiengänge der Universität sind auf der Seite. Such sie auf der Startseite nach Fachbereich.' },
  },
];

// The entries of a program's page.
export const newsFor = (program) => NEWS.filter((n) => !n.programs || n.programs.includes(program));

// Seen entries are kept as ids, so reading one program's news leaves another's unread.
const SEEN_KEY = 'ders-programi:news-read';
const readIds = () => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw === null ? null : new Set(JSON.parse(raw));
  } catch {
    return null;
  }
};
const saveRead = (ids) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage blocked: no dot, the dialog still works.
  }
};

// The page's entries the visitor has not seen. Nothing on a first visit, so newcomers get no dot for old news.
export function unseen(program) {
  const read = readIds();
  return read ? newsFor(program).filter((n) => !read.has(n.id)) : [];
}

// On a first visit, all news so far counts as seen; what is added later gets the dot.
export function noteVisit() {
  if (readIds() === null) saveRead(NEWS.map((n) => n.id));
}

// Opens the dialog with the program's entries; those unseen until now are marked new. h, t, lang: the app's.
export function openNews({ h, t, lang, program, onClose }) {
  document.getElementById('news-dialog')?.remove();
  const fresh = new Set(unseen(program).map((n) => n.id));
  saveRead(new Set([...(readIds() ?? []), ...newsFor(program).map((n) => n.id)]));
  const close = () => {
    dialog.close();
    dialog.remove();
    onClose?.();
  };
  const dateText = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short' });
  const form = h(
    'form',
    { method: 'dialog' },
    h('div', { class: 'fb-head' }, h('h2', { id: 'news-title' }, t('newsTitle')), h('button', { type: 'button', class: 'quiet fb-close', 'aria-label': t('fbClose'), onclick: close }, '×')),
    h(
      'ol',
      { class: 'news-list' },
      newsFor(program).map((n) => {
        const text = n[lang] ?? n.en;
        const isNew = fresh.has(n.id);
        return h(
          'li',
          { class: isNew ? 'news-item fresh' : 'news-item' },
          h('time', { datetime: n.date }, dateText(n.date)),
          h('div', {}, h('h3', {}, text.title, isNew ? h('span', { class: 'news-new' }, t('newsNew')) : null), h('p', {}, text.text)),
        );
      }),
    ),
  );
  const dialog = h('dialog', { id: 'news-dialog', class: 'feedback-dialog news-dialog', 'aria-labelledby': 'news-title' }, form);
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
}
