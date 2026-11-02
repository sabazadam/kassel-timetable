// Builds dist/ for Cloudflare (Workers static assets): each study program under its own path
// (/msc-informatik/, /bsc-elektrotechnik/, ...) and a program picker on the bare domain.
// Programs come from site/data/programs.json, written by the scraper. Usage: node deploy/build.js
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../site', import.meta.url));
const DIST = fileURLToPath(new URL('../dist', import.meta.url));

const { period, programs } = JSON.parse(await readFile(`${SITE}/data/programs.json`, 'utf8'));
if (!programs.length) throw new Error('site/data/programs.json lists no programs');

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
const dataFiles = (await readdir(`${SITE}/data`)).filter((f) => f.endsWith('.json'));
for (const p of programs) {
  // The app is the same for every program; each copy carries only its own data plus the program index.
  await cp(SITE, `${DIST}/${p.slug}`, {
    recursive: true,
    filter: (src) => !src.startsWith(`${SITE}/data/`) || src.endsWith(`/${p.slug}.json`) || src.endsWith('/programs.json'),
  });
}
// The home page and the legal pages use the same self-hosted fonts as the app.
await cp(`${SITE}/fonts`, `${DIST}/fonts`, { recursive: true });
// Old program paths whose PO was replaced by a renamed successor keep working: they forward to it.
const MOVED = { 'msc-informatik': 'msc-computer-science' };
for (const [from, to] of Object.entries(MOVED)) {
  if (!programs.some((p) => p.slug === to) || programs.some((p) => p.slug === from)) continue;
  await mkdir(`${DIST}/${from}`, { recursive: true });
  await writeFile(
    `${DIST}/${from}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>Moved</title><meta http-equiv="refresh" content="0; url=/${to}/"><link rel="canonical" href="/${to}/"><script>location.replace('/${to}/' + location.search + location.hash)</script><a href="/${to}/">/${to}/</a>\n`,
  );
}
const missing = programs.filter((p) => !dataFiles.includes(`${p.slug}.json`));
if (missing.length) throw new Error(`No data file for ${missing.map((p) => p.slug).join(', ')}`);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Home page: a program finder. One-line rows in a two-column grid per faculty, a faculty index,
// degree filters with counts, and "continue" for the program opened last (the app stores its slug).
const DEGREE_ORDER = ['bachelor', 'master', 'lehramt'];
const facultyCode = (f) => /^FB \d+/.exec(f ?? '')?.[0] ?? (f ? 'KHK' : '');
const facultyRest = (f) => (f ?? '').replace(/^FB \d+\s*/, '');
// "Bachelor Psychology (2021)" -> name "Psychology", year "2021"; the badge carries the degree.
const split = (name) => {
  const m = /^(?:Bachelor|Master|Teacher Training|Lehramt(?: an)?)\s+(.*?)(?:\s+\((\d{4})\))?$/.exec(name) ?? /^(.*?)(?:\s+\((\d{4})\))?$/.exec(name);
  return { title: m[1], year: m[2] ?? '' };
};
const faculties = [...new Set(programs.map((p) => p.faculty ?? ''))];
const counts = Object.fromEntries(DEGREE_ORDER.map((d) => [d, programs.filter((p) => p.degree === d).length]));

const row = (p) => {
  const en = split(p.nameEn ?? p.name);
  const de = split(p.name);
  const same = en.title === de.title;
  return (
    `<li data-deg="${p.degree}"><a href="/${esc(p.slug)}/" data-slug="${esc(p.slug)}">` +
    `<span class="deg deg-${p.degree}" data-deg-label="${p.degree}"></span>` +
    `<span class="names"><span class="pri" lang="en">${esc(en.title)}</span><span class="pri" lang="de">${esc(de.title)}</span>` +
    (same ? '' : `<span class="sec" lang="de">${esc(de.title)}</span>`) +
    `</span><span class="year">${esc(en.year || de.year)}</span></a></li>`
  );
};
const section = (faculty, i) => {
  const items = programs.filter((p) => (p.faculty ?? '') === faculty);
  items.sort((a, b) => DEGREE_ORDER.indexOf(a.degree) - DEGREE_ORDER.indexOf(b.degree));
  const en = items[0].facultyEn ?? faculty;
  return (
    `    <section id="f${i}" aria-labelledby="f${i}-h">\n` +
    `      <h2 id="f${i}-h"><span class="code">${esc(facultyCode(faculty))}</span>` +
    `<span lang="en">${esc(facultyRest(en))}</span><span lang="de">${esc(facultyRest(faculty))}</span></h2>\n` +
    `      <ul>\n${items.map((p) => `        ${row(p)}`).join('\n')}\n      </ul>\n    </section>`
  );
};
const railItem = (faculty, i) => {
  const en = programs.find((p) => (p.faculty ?? '') === faculty).facultyEn ?? faculty;
  return (
    `      <li><a href="#f${i}" data-sec="f${i}"><span class="code">${esc(facultyCode(faculty))}</span>` +
    `<span class="rail-name"><span lang="en">${esc(facultyRest(en))}</span><span lang="de">${esc(facultyRest(faculty))}</span></span>` +
    `<span class="n"></span></a></li>`
  );
};

// A week of five days with a few classes: what the site makes, drawn in the header.
const WEEK = [
  [0, 0, 2], [0, 4, 2], [1, 1, 2], [1, 5, 1.5], [2, 0, 2], [2, 3, 2], [3, 2, 2], [3, 6, 1.5], [4, 1, 3],
];
const week = WEEK.map(([d, h, len], i) => `<i style="--d:${d};--h:${h};--l:${len}"${i % 3 === 1 ? ' class="b"' : ''}></i>`).join('');

const ICON = `<svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"><rect x="1" y="2" width="14" height="13" rx="2" fill="currentColor"/><rect x="3" y="6" width="4" height="5" fill="#f3c94b"/><rect x="9" y="6" width="4" height="7" fill="#fff"/></svg>`;

const STRINGS = {
  tr: {
    title: 'Ders Programı', headline: 'Bölümünü seç, haftanı kur',
    lead: `Kassel Üniversitesi, ${period}. ${programs.length} program, eCampus'taki tüm dersleriyle.`,
    search: 'Program ara', placeholder: 'ör. Informatik, Physik, Lehramt Mathematik',
    all: 'Hepsi', bachelor: 'Bachelor', master: 'Master', lehramt: 'Öğretmenlik',
    none: 'Eşleşen program yok. Almanca adını dene, ör. Wirtschaftswissenschaften.',
    cont: 'Kaldığın yerden devam et', picked: '{n} modül seçili', faculties: 'Fakülteler', degree: 'Derece', language: 'Dil',
    enter: 'Enter ile aç', days: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'],
    project: "Bu bir öğrenci projesidir: Kassel Üniversitesi'ne yeni gelen ve ders seçiminde zorlanan öğrencilere yardım etmek için ücretsiz ve gönüllü olarak geliştiriliyor. Üniversitenin resmi sitesi değildir.",
    impressum: 'Impressum',
    privacy: 'Gizlilik',
  },
  en: {
    title: 'Timetable', headline: 'Pick your program, plan your week',
    lead: `University of Kassel, ${period}. ${programs.length} programs with every course from eCampus.`,
    search: 'Find a program', placeholder: 'e.g. Computer Science, Physics, Lehramt Mathematik',
    all: 'All', bachelor: 'Bachelor', master: 'Master', lehramt: 'Teacher training',
    none: 'No program matches. Try the German name, e.g. Wirtschaftswissenschaften.',
    cont: 'Continue where you left off', picked: '{n} modules picked', faculties: 'Faculties', degree: 'Degree', language: 'Language',
    enter: 'Press Enter to open', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    project: 'This is a student project, built for free and as volunteer work to help new students who find it hard to choose their courses. It is not an official site of the University of Kassel.',
    impressum: 'Impressum',
    privacy: 'Privacy',
  },
  de: {
    title: 'Stundenplan', headline: 'Studiengang wählen, Woche planen',
    lead: `Universität Kassel, ${period}. ${programs.length} Studiengänge mit allen Veranstaltungen aus eCampus.`,
    search: 'Studiengang suchen', placeholder: 'z. B. Informatik, Physik, Lehramt Mathematik',
    all: 'Alle', bachelor: 'Bachelor', master: 'Master', lehramt: 'Lehramt',
    none: 'Kein Studiengang gefunden. Versuche den deutschen Namen, z. B. Wirtschaftswissenschaften.',
    cont: 'Weiter, wo du aufgehört hast', picked: '{n} Module gewählt', faculties: 'Fachbereiche', degree: 'Abschluss', language: 'Sprache',
    enter: 'Mit Enter öffnen', days: ['Mo', 'Di', 'Mi', 'Do', 'Fr'],
    project: 'Dies ist ein studentisches Projekt: kostenlos und ehrenamtlich entwickelt, um neuen Studierenden zu helfen, denen die Kurswahl schwerfällt. Es ist kein offizielles Angebot der Universität Kassel.',
    impressum: 'Impressum',
    privacy: 'Datenschutz',
  },
};

await writeFile(
  `${DIST}/index.html`,
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Timetable Planner</title>
  <meta name="description" content="Weekly timetable planner for the study programs of the University of Kassel, ${esc(period)}.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3E%3Crect x=%271%27 y=%272%27 width=%2714%27 height=%2713%27 rx=%272%27 fill=%27%231b2436%27/%3E%3Crect x=%273%27 y=%276%27 width=%274%27 height=%275%27 fill=%27%23f3c94b%27/%3E%3Crect x=%279%27 y=%276%27 width=%274%27 height=%277%27 fill=%27white%27/%3E%3C/svg%3E">
  <link rel="stylesheet" href="/fonts/fonts.css">
  <style>
    :root {
      --paper: #f3f5f8; --sheet: #fff; --ink: #1b2436; --ink-2: #4a5468; --rule: #d8dde6; --hover: #fdf4d8;
      --signal: #f3c94b; --band: #1b2436; --band-ink: #f4f6fa; --band-2: #b9c2d3; --focus: #2a5bd7;
      --b: #2a5bd7; --m: #16653e; --l: #8a3ab9;
      color-scheme: light;
    }
    @media (prefers-color-scheme: dark) {
      :root { --paper: #10141c; --sheet: #171c26; --ink: #e8ebf1; --ink-2: #aab3c3; --rule: #2c3442; --hover: #2a2716;
        --signal: #e9bd3c; --band: #0d1119; --band-ink: #e8ebf1; --band-2: #93a0b6; --focus: #7fa2ff;
        --b: #7fa2ff; --m: #5cc48a; --l: #c99bea; color-scheme: dark; }
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 64px; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.45 "Atkinson Hyperlegible Next", system-ui, sans-serif; }
    [hidden] { display: none !important; }
    a { color: inherit; }
    :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    /* Language: names and labels exist in English and German; Turkish uses the English names. */
    html:not([data-lang="de"]) [lang="de"].pri, html:not([data-lang="de"]) h2 [lang="de"], html:not([data-lang="de"]) .rail-name [lang="de"] { display: none; }
    html[data-lang="de"] [lang="en"], html[data-lang="de"] .sec { display: none; }

    /* Header band: the one bold element. Title, search and filters on the left, a sketched week on the right. */
    .band { background: var(--band); color: var(--band-ink); }
    .band-in { max-width: 1180px; margin: 0 auto; padding: 18px 16px 22px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 48px; }
    @media (min-width: 900px) { .band-in { grid-template-columns: minmax(0, 1fr) 300px; padding: 22px 24px 28px; } }
    .top { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
    .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--band-ink); }
    .langs { display: flex; gap: 2px; background: rgba(255,255,255,.08); padding: 3px; border-radius: 8px; }
    .langs button { font: inherit; font-size: 13px; font-weight: 700; color: var(--band-2); background: none; border: 0; padding: 4px 9px; border-radius: 6px; cursor: pointer; }
    .langs button[aria-pressed="true"] { background: var(--band-ink); color: var(--band); }
    h1 { font-size: clamp(26px, 4.2vw, 40px); line-height: 1.08; letter-spacing: -0.01em; margin: 0 0 8px; font-weight: 800; }
    .lead { margin: 0 0 18px; color: var(--band-2); max-width: 60ch; }
    .search { position: relative; }
    .search input { width: 100%; font: inherit; font-size: 17px; padding: 14px 44px 14px 16px; border-radius: 12px; border: 2px solid transparent; background: var(--sheet); color: var(--ink); }
    .search input:focus { outline: none; border-color: var(--signal); }
    .search kbd { position: absolute; right: 12px; top: 50%; translate: 0 -50%; font: 700 12px/1 inherit; color: var(--ink-2); border: 1px solid var(--rule); border-radius: 5px; padding: 4px 7px; background: var(--paper); }
    .search input:focus + kbd { display: none; }
    @media (hover: none) { .search kbd { display: none; } .search input { padding-right: 16px; } }
    .hint { font-size: 13px; color: var(--band-2); margin: 6px 0 0; min-height: 1.4em; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .chips button { font: inherit; font-size: 14px; font-weight: 600; color: var(--band-ink); background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 6px 12px; cursor: pointer; }
    .chips button[aria-pressed="true"] { background: var(--signal); border-color: var(--signal); color: #1b2436; }
    .chips .c { font-variant-numeric: tabular-nums; opacity: .75; margin-left: 4px; }
    .continue { display: flex; align-items: center; gap: 12px; margin-top: 16px; padding: 10px 14px; border-radius: 12px; background: rgba(243,201,75,.14); border: 1px solid rgba(243,201,75,.45); color: var(--band-ink); text-decoration: none; max-width: 640px; }
    .continue:hover { background: rgba(243,201,75,.22); }
    .continue small { display: block; color: var(--band-2); font-size: 13px; }
    .continue b { font-weight: 700; }
    .continue::after { content: ""; margin-left: auto; width: 9px; height: 9px; border-right: 2px solid currentColor; border-top: 2px solid currentColor; rotate: 45deg; flex: none; }
    /* Sketched week: five day columns, classes as blocks. Decorative, desktop only. */
    .week { display: none; }
    @media (min-width: 900px) {
      .week { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; align-self: end; position: relative; height: 220px;
        --row: 26px; }
      .week span { font-size: 12px; font-weight: 700; color: var(--band-2); text-align: center; }
      .week .cols { position: absolute; inset: 22px 0 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
      .week .cols b { border-radius: 6px; background: repeating-linear-gradient(to bottom, rgba(255,255,255,.06) 0 1px, transparent 1px var(--row)); }
      .week i { position: absolute; left: calc(var(--d) * (100% + 6px) / 5); width: calc((100% - 24px) / 5); top: calc(22px + var(--h) * var(--row)); height: calc(var(--l) * var(--row) - 3px);
        border-radius: 6px; background: var(--signal); box-shadow: inset 3px 0 0 rgba(0,0,0,.18); }
      .week i.b { background: #eef2f8; }
    }

    /* Body: faculty index on the left (a scrolling strip on phones), program rows on the right. */
    .wrap { max-width: 1180px; margin: 0 auto; padding: 0 16px 56px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 32px; }
    @media (min-width: 900px) { .wrap { grid-template-columns: 220px minmax(0, 1fr); padding: 0 24px 64px; } }
    .rail { position: sticky; top: 0; z-index: 2; background: var(--paper); margin: 0 -16px; padding: 8px 16px; border-bottom: 1px solid var(--rule); }
    .rail h2 { display: none; }
    .rail ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
    .rail a { display: flex; align-items: baseline; gap: 6px; padding: 6px 10px; border-radius: 8px; text-decoration: none; white-space: nowrap; font-size: 14px; color: var(--ink-2); }
    .rail a:hover { background: var(--sheet); color: var(--ink); }
    .rail a.on { background: var(--sheet); color: var(--ink); box-shadow: inset 3px 0 0 var(--signal); }
    .rail .code { font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
    .rail .rail-name { display: none; }
    .rail .n { font-size: 12px; font-variant-numeric: tabular-nums; }
    .rail a.empty { opacity: .4; }
    @media (min-width: 900px) {
      .rail { top: 0; align-self: start; margin: 0; padding: 24px 0 0; border: 0; max-height: 100vh; overflow-y: auto; }
      .rail h2 { display: block; font-size: 13px; color: var(--ink-2); margin: 0 0 8px 10px; }
      .rail ul { flex-direction: column; gap: 1px; overflow: visible; }
      .rail a { white-space: normal; display: grid; grid-template-columns: 44px 1fr auto; padding: 6px 10px; line-height: 1.25; }
      .rail .rail-name { display: block; }
      html { scroll-padding-top: 16px; }
    }

    main { padding-top: 8px; min-width: 0; }
    section { padding-top: 18px; }
    section h2 { display: flex; align-items: baseline; gap: 10px; font-size: 18px; margin: 0 0 10px; }
    section h2 .code { color: var(--ink-2); font-size: 14px; font-variant-numeric: tabular-nums; }
    section li { min-width: 0; }
    section ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 6px; }
    section a { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 48px; padding: 8px 12px; border-radius: 10px; background: var(--sheet); border: 1px solid var(--rule); text-decoration: none; }
    section a:hover { background: var(--hover); border-color: var(--signal); }
    section a.last { border-color: var(--signal); box-shadow: inset 3px 0 0 var(--signal); }
    .deg { font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 5px; border: 1.5px solid currentColor; min-width: 66px; text-align: center; }
    .deg-bachelor { color: var(--b); } .deg-master { color: var(--m); } .deg-lehramt { color: var(--l); }
    .names { display: grid; min-width: 0; }
    .pri { font-weight: 600; line-height: 1.25; }
    .sec { font-size: 13px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .year { font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
    .none { margin: 28px 0; color: var(--ink-2); }
    .foot { max-width: 1180px; margin: 0 auto; padding: 16px 16px 32px; border-top: 1px solid var(--rule); display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 18px; font-size: 13px; color: var(--ink-2); }
    @media (min-width: 900px) { .foot { padding: 18px 24px 36px; } }
    .foot p { margin: 0; flex: 1 1 320px; max-width: 80ch; }
    .foot a { font-weight: 600; color: var(--ink); }
  </style>
</head>
<body>
  <header class="band">
    <div class="band-in">
      <div class="top">
        <span class="brand">${ICON}<span data-t="title">Timetable</span></span>
        <div class="langs" role="group" data-t-aria="language" aria-label="Language">
          <button type="button" data-lang="tr">TR</button><button type="button" data-lang="en">EN</button><button type="button" data-lang="de">DE</button>
        </div>
      </div>
      <div>
        <h1 data-t="headline">Pick your program, plan your week</h1>
        <p class="lead" data-t="lead"></p>
        <div class="search">
          <label for="q" class="sr" data-t="search" hidden>Find a program</label>
          <input id="q" type="search" autocomplete="off" data-t-ph="placeholder" data-t-aria="search">
          <kbd aria-hidden="true">/</kbd>
        </div>
        <p class="hint" id="hint" aria-live="polite"></p>
        <div class="chips" role="group" data-t-aria="degree">
          <button type="button" data-deg="" aria-pressed="true"><span data-t="all">All</span><span class="c">${programs.length}</span></button>
          ${DEGREE_ORDER.filter((d) => counts[d]).map((d) => `<button type="button" data-deg="${d}" aria-pressed="false"><span data-t="${d}"></span><span class="c">${counts[d]}</span></button>`).join('')}
        </div>
        <a class="continue" id="continue" hidden><span><small data-t="cont"></small><b id="cont-name"></b> <small id="cont-picked"></small></span></a>
      </div>
      <div class="week" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<span data-day="${i}"></span>`).join('')}<div class="cols"><b></b><b></b><b></b><b></b><b></b></div>${week}</div>
    </div>
  </header>
  <div class="wrap">
    <nav class="rail" aria-labelledby="rail-h">
      <h2 id="rail-h" data-t="faculties">Faculties</h2>
      <ul>
${faculties.map(railItem).join('\n')}
      </ul>
    </nav>
    <main>
      <p class="none" id="none" data-t="none" hidden></p>
${faculties.map(section).join('\n')}
    </main>
  </div>
  <footer class="foot">
    <p data-t="project"></p>
    <a href="/impressum/" data-t="impressum">Impressum</a>
    <a href="/datenschutz/" data-t="privacy">Datenschutz</a>
  </footer>
  <script>
    const STRINGS = ${JSON.stringify(STRINGS)};
    const NAMES = ${JSON.stringify(Object.fromEntries(programs.map((p) => [p.slug, { en: p.nameEn ?? p.name, de: p.name }])))};
    const LANG_KEY = 'ders-programi:lang';
    const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
    const pick = () => {
      const saved = store.get(LANG_KEY);
      if (STRINGS[saved]) return saved;
      for (const l of navigator.languages ?? [navigator.language]) { const b = String(l).slice(0, 2).toLowerCase(); if (STRINGS[b]) return b; }
      return 'en';
    };
    let lang = pick();
    let degree = '';
    const q = document.getElementById('q');
    const rows = [...document.querySelectorAll('main li')];
    const sections = [...document.querySelectorAll('main section')];
    // Search text: both names, faculty in both languages, and the degree in every language.
    for (const li of rows) {
      const deg = li.dataset.deg;
      li.dataset.text = (li.textContent + ' ' + li.closest('section').querySelector('h2 .code').textContent + ' ' + deg + ' ' + Object.values(STRINGS).map((s) => s[deg]).join(' ')).toLowerCase();
    }

    function applyLang() {
      const s = STRINGS[lang];
      document.documentElement.lang = lang;
      document.documentElement.dataset.lang = lang;
      document.title = s.title;
      for (const el of document.querySelectorAll('[data-t]')) el.textContent = s[el.dataset.t];
      for (const el of document.querySelectorAll('[data-t-ph]')) el.placeholder = s[el.dataset.tPh];
      for (const el of document.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', s[el.dataset.tAria]);
      for (const el of document.querySelectorAll('[data-deg-label]')) el.textContent = s[el.dataset.degLabel];
      for (const el of document.querySelectorAll('[data-day]')) el.textContent = s.days[el.dataset.day];
      for (const b of document.querySelectorAll('.langs button')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
      showContinue();
      filter();
    }

    function filter() {
      const words = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
      let shown = [];
      for (const li of rows) {
        li.hidden = (degree && li.dataset.deg !== degree) || !words.every((w) => li.dataset.text.includes(w));
        if (!li.hidden) shown.push(li);
      }
      for (const sec of sections) {
        const n = sec.querySelectorAll('li:not([hidden])').length;
        sec.hidden = !n;
        const link = document.querySelector('.rail a[data-sec="' + sec.id + '"]');
        link.querySelector('.n').textContent = n;
        link.classList.toggle('empty', !n);
      }
      document.getElementById('none').hidden = shown.length > 0;
      // One match: Enter opens it.
      document.getElementById('hint').textContent = words.length && shown.length === 1 ? STRINGS[lang].enter : '';
      return shown;
    }

    // The app stores the program opened last; its saved plan tells how many modules are picked.
    function showContinue() {
      const slug = store.get('ders-programi:last');
      const box = document.getElementById('continue');
      if (!slug || !NAMES[slug]) return;
      const link = document.querySelector('main a[data-slug="' + slug + '"]');
      link?.classList.add('last');
      let picked = 0;
      try { picked = Object.keys(JSON.parse(store.get(slug === 'msc-informatik' ? 'ders-programi:v1' : 'ders-programi:v1:' + slug) || '{}').modules ?? {}).length; } catch {}
      box.href = '/' + slug + '/';
      document.getElementById('cont-name').textContent = NAMES[slug][lang === 'de' ? 'de' : 'en'];
      document.getElementById('cont-picked').textContent = picked ? STRINGS[lang].picked.replace('{n}', picked) : '';
      box.hidden = false;
    }

    q.addEventListener('input', filter);
    q.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const shown = filter();
      if (shown.length === 1) location.href = shown[0].querySelector('a').href;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== q && !e.metaKey && !e.ctrlKey) { e.preventDefault(); q.focus(); }
    });
    for (const b of document.querySelectorAll('.chips button')) {
      b.addEventListener('click', () => {
        degree = b.dataset.deg;
        for (const o of document.querySelectorAll('.chips button')) o.setAttribute('aria-pressed', String(o === b));
        filter();
      });
    }
    for (const b of document.querySelectorAll('.langs button')) {
      b.addEventListener('click', () => { lang = b.dataset.lang; store.set(LANG_KEY, lang); applyLang(); });
    }
    // The faculty in view is marked in the index.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        for (const a of document.querySelectorAll('.rail a')) a.classList.toggle('on', a.dataset.sec === e.target.id);
      }
    }, { rootMargin: '-20% 0px -70% 0px' });
    for (const s of sections) io.observe(s);
    applyLang();
  </script>
</body>
</html>
`,
);
// Legal pages (/impressum/, /datenschutz/): who runs the site, what it is and what data it touches.
// Each page exists in three languages and follows the same language choice as the app (German without script).
const OPERATOR = { name: 'Kerem Bozdag', email: 'mr.kerembozdag@gmail.com' };
const LEGAL_UI = {
  tr: { back: 'Tüm bölümler', contact: 'İletişim', name: 'Sorumlu', email: 'E-posta', impressum: 'Impressum', privacy: 'Gizlilik' },
  en: { back: 'All programs', contact: 'Contact', name: 'Responsible', email: 'Email', impressum: 'Impressum', privacy: 'Privacy' },
  de: { back: 'Alle Studiengänge', contact: 'Kontakt', name: 'Verantwortlich', email: 'E-Mail', impressum: 'Impressum', privacy: 'Datenschutz' },
};
// Sections: [heading, paragraphs]; the heading "contact" stands for the operator's contact lines.
const LEGAL = {
  impressum: {
    tr: {
      title: 'Impressum',
      sections: [
        ['Proje hakkında', [
          STRINGS.tr.project,
          "Siteye para, reklam veya kayıt gerekmez. Ders bilgileri Kassel Üniversitesi'nin herkese açık eCampus ve modül el kitabı sayfalarından alınır.",
          'Bilgiler özenle hazırlanır ama hata olabilir. Bağlayıcı olan eCampus, ilgili sınav yönetmeliği (Prüfungsordnung) ve modül el kitabıdır.',
        ]],
        ['contact'],
      ],
    },
    en: {
      title: 'Impressum',
      sections: [
        ['About this project', [
          STRINGS.en.project,
          'The site needs no money, ads or account. Course data comes from the public eCampus and module handbook pages of the University of Kassel.',
          'The data is prepared with care, but it can contain mistakes. eCampus, the examination regulations (Prüfungsordnung) and the module handbook are binding.',
        ]],
        ['contact'],
      ],
    },
    de: {
      title: 'Impressum',
      sections: [
        ['Über das Projekt', [
          STRINGS.de.project,
          'Die Seite ist kostenlos, werbefrei und ohne Anmeldung nutzbar. Die Veranstaltungsdaten stammen aus den öffentlichen Seiten von eCampus und der Moduldatenbank der Universität Kassel.',
          'Die Angaben werden sorgfältig zusammengestellt, aber ohne Gewähr. Verbindlich sind eCampus, die jeweilige Prüfungsordnung und das Modulhandbuch.',
        ]],
        ['contact'],
      ],
    },
  },
  datenschutz: {
    tr: {
      title: 'Gizlilik',
      sections: [
        ['Kısaca', ['Hesap yok, çerez (cookie) yok, takip veya reklam yok. Site başka şirketlerden içerik yüklemez; yazı tipleri de bu sunucudan gelir. Tek istisna: hata bildirim formunu açtığında Cloudflare Turnstile bot kontrolü yüklenir.']],
        ['contact'],
        ['Tarayıcında saklananlar', [
          "Seçtiğin modüller, planların, dil ve bazı görünüm ayarları yalnızca tarayıcının yerel belleğinde (localStorage) saklanır. Bu bilgiler bize gönderilmez. Tarayıcıdan bu sitenin verilerini silerek istediğin zaman kaldırabilirsin.",
          'Takvim dışa aktarma (.ics) dosyası da tamamen tarayıcında oluşturulur.',
        ]],
        ['Barındırma (Cloudflare)', [
          'Site Cloudflare, Inc. (ABD) üzerinden yayınlanır. Bir sayfayı açtığında Cloudflare, sayfayı iletmek ve saldırılara karşı korumak için IP adresi, zaman ve istenen adres gibi teknik bağlantı verilerini işler. Hukuki dayanak: GDPR Madde 6(1)(f), güvenli ve çalışan bir site için meşru menfaat. Bu erişim verilerini biz ayrıca analiz etmiyoruz. Ayrıntılar: cloudflare.com/privacypolicy',
        ]],
        ['Sitedeki ders bilgileri', [
          "Site, ders sorumlularının adlarını Kassel Üniversitesi'nin herkese açık ders kataloğunda (eCampus) yazdığı şekilde gösterir. Adının değiştirilmesini veya kaldırılmasını isteyen öğretim görevlileri e-posta ile yazabilir.",
        ]],
        ['Dış bağlantılar', ['eCampus, Moodle veya Zoom bağlantılarına tıkladığında o sitelerin kendi gizlilik kuralları geçerli olur.']],
        ['E-posta ile iletişim', ['Bize e-posta yazarsan adresin ve mesajın yalnızca cevap vermek için kullanılır.']],
        ['Hata bildirimi', [
          'Hata bildirim formuyla gönderdiğin mesaj, seçtiğin kategori, ilgili ders, sitenin o derste gösterdiği bilgi ve (yazdıysan) Element kullanıcı adın, verideki hatayı düzeltmek ve gerekirse sana dönmek için saklanır. Kötüye kullanımı sınırlamak için IP adresinin yalnızca tuzlanmış bir özeti (hash) tutulur, IP adresinin kendisi saklanmaz. Bildirimler Cloudflare D1 veritabanında tutulur ve bize Telegram üzerinden iletilir; en geç 12 ay sonra silinir. Hukuki dayanak: GDPR Madde 6(1)(f), doğru ders bilgisi sunmaktaki meşru menfaat.',
          'Formu açtığında, botları ayırt etmek için Cloudflare Turnstile yüklenir. Turnstile tarayıcı ve bağlantı verilerini işler ama çerez kullanmaz. Ayrıntılar: cloudflare.com/turnstile-privacy-policy',
        ]],
        ['Hakların', [
          "GDPR Madde 15-21'e göre bilgi alma, düzeltme, silme, işlemeyi kısıtlama ve itiraz hakların var. Ayrıca bir veri koruma denetim makamına şikâyette bulunabilirsin; Hessen'de bu makam Hessischer Beauftragter für Datenschutz und Informationsfreiheit'tır.",
        ]],
      ],
    },
    en: {
      title: 'Privacy',
      sections: [
        ['In short', ['No account, no cookies, no tracking, no ads. The site loads nothing from other companies; even the fonts come from this server. One exception: when you open the mistake report form, the Cloudflare Turnstile bot check is loaded.']],
        ['contact'],
        ['What your browser stores', [
          'Your picked modules, plans, language and a few view settings are kept only in your browser\'s local storage (localStorage). They are never sent to us. You can remove them at any time by clearing this site\'s data in your browser.',
          'The calendar export (.ics) file is also made entirely in your browser.',
        ]],
        ['Hosting (Cloudflare)', [
          'The site is served through Cloudflare, Inc. (USA). When you open a page, Cloudflare processes technical connection data such as IP address, time and requested address to deliver the page and protect it from attacks. Legal basis: Art. 6(1)(f) GDPR, the legitimate interest in a secure, working site. We do not analyse this access data ourselves. Details: cloudflare.com/privacypolicy',
        ]],
        ['Course data on this site', [
          'The site shows the names of people responsible for courses as they appear in the public course catalogue (eCampus) of the University of Kassel. Teaching staff who want their name changed or removed can send an email.',
        ]],
        ['External links', ['When you follow a link to eCampus, Moodle or Zoom, the privacy rules of that site apply.']],
        ['Contact by email', ['If you email us, your address and message are used only to reply.']],
        ['Mistake reports', [
          'When you send the report form, your message, the chosen category, the course, what the site showed for it and (if given) your Element username are stored to fix the data and, if needed, to get back to you. To limit abuse, only a salted hash of your IP address is kept, never the address itself. Reports are stored in a Cloudflare D1 database, forwarded to us via Telegram and deleted after 12 months at the latest. Legal basis: Art. 6(1)(f) GDPR, the legitimate interest in correct course data.',
          'When you open the form, Cloudflare Turnstile is loaded to tell people from bots. Turnstile processes browser and connection data but sets no cookies. Details: cloudflare.com/turnstile-privacy-policy',
        ]],
        ['Your rights', [
          'Under Art. 15-21 GDPR you have the right to access, correction, deletion, restriction of processing and objection. You can also complain to a data protection supervisory authority; in Hesse this is the Hessischer Beauftragter für Datenschutz und Informationsfreiheit.',
        ]],
      ],
    },
    de: {
      title: 'Datenschutz',
      sections: [
        ['Kurz gesagt', ['Keine Konten, keine Cookies, kein Tracking, keine Werbung. Die Seite lädt keine Inhalte von Dritten; auch die Schriften liegen auf diesem Server. Einzige Ausnahme: Beim Öffnen des Formulars für Fehlermeldungen wird die Bot-Prüfung Cloudflare Turnstile geladen.']],
        ['contact'],
        ['Speicherung in deinem Browser', [
          'Deine Modulauswahl, Pläne, die Sprache und einige Ansichtseinstellungen werden nur im lokalen Speicher (localStorage) deines Browsers abgelegt. Sie werden nicht an uns übertragen. Du kannst sie jederzeit entfernen, indem du die Websitedaten dieser Seite im Browser löschst.',
          'Auch die Kalenderdatei (.ics) wird vollständig in deinem Browser erzeugt.',
        ]],
        ['Hosting (Cloudflare)', [
          'Die Seite wird über Cloudflare, Inc. (USA) ausgeliefert. Beim Aufruf verarbeitet Cloudflare technisch notwendige Verbindungsdaten wie IP-Adresse, Zeitpunkt und angefragte Adresse, um die Seite auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren und funktionierenden Angebot). Wir selbst werten diese Zugriffsdaten nicht aus. Mehr dazu: cloudflare.com/privacypolicy',
        ]],
        ['Veranstaltungsdaten auf dieser Seite', [
          'Die Seite zeigt die Namen der Verantwortlichen von Lehrveranstaltungen so, wie sie im öffentlichen Vorlesungsverzeichnis (eCampus) der Universität Kassel stehen. Lehrende, die eine Änderung oder Entfernung ihres Namens wünschen, können sich per E-Mail melden.',
        ]],
        ['Externe Links', ['Wenn du einem Link zu eCampus, Moodle oder Zoom folgst, gelten die Datenschutzbestimmungen der jeweiligen Seite.']],
        ['Kontakt per E-Mail', ['Wenn du uns schreibst, verwenden wir deine Adresse und Nachricht nur, um zu antworten.']],
        ['Fehlermeldungen', [
          'Wenn du das Formular für Fehlermeldungen absendest, speichern wir deine Nachricht, die gewählte Kategorie, die betroffene Veranstaltung, die dazu angezeigten Angaben und (falls angegeben) deinen Element-Benutzernamen, um die Daten zu korrigieren und dich bei Bedarf zu kontaktieren. Zum Schutz vor Missbrauch wird nur ein gesalzener Hash deiner IP-Adresse gespeichert, nie die Adresse selbst. Die Meldungen liegen in einer Cloudflare-D1-Datenbank, werden uns per Telegram weitergeleitet und spätestens nach 12 Monaten gelöscht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an korrekten Veranstaltungsdaten).',
          'Beim Öffnen des Formulars wird Cloudflare Turnstile geladen, um Menschen von Bots zu unterscheiden. Turnstile verarbeitet Browser- und Verbindungsdaten, setzt aber keine Cookies. Mehr dazu: cloudflare.com/turnstile-privacy-policy',
        ]],
        ['Deine Rechte', [
          'Du hast nach Art. 15 bis 21 DSGVO das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Widerspruch. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, in Hessen beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.',
        ]],
      ],
    },
  },
};
const legalArticle = (page, lang) => {
  const { title, sections } = LEGAL[page][lang];
  const ui = LEGAL_UI[lang];
  const body = sections.map(([h, ps]) => {
    if (h === 'contact') {
      return (
        `      <h2>${esc(ui.contact)}</h2>\n      <dl><dt>${esc(ui.name)}</dt><dd>${esc(OPERATOR.name)}</dd>` +
        `<dt>${esc(ui.email)}</dt><dd><a href="mailto:${esc(OPERATOR.email)}">${esc(OPERATOR.email)}</a></dd></dl>`
      );
    }
    return `      <h2>${esc(h)}</h2>\n${ps.map((p) => `      <p>${esc(p)}</p>`).join('\n')}`;
  });
  const other = page === 'impressum' ? ['datenschutz', ui.privacy] : ['impressum', ui.impressum];
  return (
    `    <article lang="${lang}"${lang === 'de' ? '' : ' hidden'}>\n      <a class="back" href="/">${esc(ui.back)}</a>\n      <h1>${esc(title)}</h1>\n` +
    `${body.join('\n')}\n      <p class="other"><a href="/${other[0]}/">${esc(other[1])}</a></p>\n    </article>`
  );
};
for (const page of Object.keys(LEGAL)) {
  const langs = Object.keys(LEGAL[page]);
  await mkdir(`${DIST}/${page}`, { recursive: true });
  await writeFile(
    `${DIST}/${page}/index.html`,
    `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(LEGAL[page].de.title)}</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3E%3Crect x=%271%27 y=%272%27 width=%2714%27 height=%2713%27 rx=%272%27 fill=%27%231b2436%27/%3E%3Crect x=%273%27 y=%276%27 width=%274%27 height=%275%27 fill=%27%23f3c94b%27/%3E%3Crect x=%279%27 y=%276%27 width=%274%27 height=%277%27 fill=%27white%27/%3E%3C/svg%3E">
  <link rel="stylesheet" href="/fonts/fonts.css">
  <style>
    :root { --paper: #f3f5f8; --sheet: #fff; --ink: #1b2436; --ink-2: #4a5468; --rule: #d8dde6; --signal: #f3c94b; --focus: #2a5bd7; color-scheme: light; }
    @media (prefers-color-scheme: dark) {
      :root { --paper: #10141c; --sheet: #171c26; --ink: #e8ebf1; --ink-2: #aab3c3; --rule: #2c3442; --signal: #e9bd3c; --focus: #7fa2ff; color-scheme: dark; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.55 "Atkinson Hyperlegible Next", system-ui, sans-serif; }
    [hidden] { display: none !important; }
    a { color: inherit; }
    :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    main { max-width: 720px; margin: 0 auto; padding: 20px 16px 48px; }
    .langs { display: flex; justify-content: flex-end; gap: 2px; }
    .langs button { font: inherit; font-size: 13px; font-weight: 700; color: var(--ink-2); background: none; border: 0; padding: 4px 9px; border-radius: 6px; cursor: pointer; }
    .langs button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
    .back { font-size: 14px; font-weight: 600; }
    h1 { font-size: 32px; line-height: 1.1; margin: 14px 0 20px; font-weight: 800; }
    h2 { font-size: 17px; margin: 24px 0 8px; padding-top: 14px; border-top: 1px solid var(--rule); }
    p { margin: 0 0 10px; max-width: 65ch; }
    .other { margin-top: 28px; font-size: 14px; font-weight: 600; }
    article p:first-of-type { padding: 12px 14px; background: var(--sheet); border-left: 3px solid var(--signal); border-radius: 6px; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
    dt { color: var(--ink-2); }
    dd { margin: 0; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <div class="langs" role="group" aria-label="Language">
      <button type="button" data-lang="tr">TR</button><button type="button" data-lang="en">EN</button><button type="button" data-lang="de">DE</button>
    </div>
${langs.map((l) => legalArticle(page, l)).join('\n')}
  </main>
  <script>
    const LANGS = ${JSON.stringify(langs)};
    const LANG_KEY = 'ders-programi:lang';
    const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
    const pick = () => {
      const saved = store.get(LANG_KEY);
      if (LANGS.includes(saved)) return saved;
      for (const l of navigator.languages ?? [navigator.language]) { const b = String(l).slice(0, 2).toLowerCase(); if (LANGS.includes(b)) return b; }
      return 'de';
    };
    function show(lang) {
      document.documentElement.lang = lang;
      for (const a of document.querySelectorAll('article')) a.hidden = a.lang !== lang;
      for (const b of document.querySelectorAll('.langs button')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    }
    for (const b of document.querySelectorAll('.langs button')) {
      b.addEventListener('click', () => { store.set(LANG_KEY, b.dataset.lang); show(b.dataset.lang); });
    }
    show(pick());
  </script>
</body>
</html>
`,
  );
}
// Data and code change with every publish; browsers revalidate instead of using a stale copy.
await writeFile(`${DIST}/_headers`, `/*\n  Cache-Control: no-cache\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);
console.log(`Built ${DIST}: ${programs.map((p) => p.slug).join(', ')}`);
