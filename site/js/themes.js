// Ready-made program themes. Interest themes follow the university's own focus areas (Schwerpunkte)
// where the catalog has them (CIDA, SE, EI, IDG), plus title keywords; goal themes change the scoring.
// Area names differ between Master Informatik (2018: "CIDA Advanced Courses", "SE ...", "EI ...") and
// Master Computer Science (PO-2026: "Schwerpunkt ... (CIDA) > Advanced Courses", "(SW)", "(EInf)").

const segments = (m) => m.areas.flatMap((a) => a.split(' > '));
const titled = (m, re) => re.test(`${m.titleEn ?? ''} ${m.title}`);
const inArea = (m, re) => m.areas.some((a) => re.test(a));

export const THEMES = [
  {
    id: 'ai',
    kind: 'interest',
    match: (m) => segments(m).some((s) => s.startsWith('CIDA ')) || inArea(m, /\(CIDA\)/) || titled(m, /machine learning|deep learning/i),
  },
  {
    id: 'software',
    kind: 'interest',
    match: (m) => segments(m).some((s) => s.startsWith('SE ')) || inArea(m, /\(SW\)/) || titled(m, /crypt|security|sicherheit/i),
  },
  {
    id: 'energy',
    kind: 'interest',
    // EI also lists general informatics electives ("EI Wahlpflicht Informatik"); only the energy side counts here.
    match: (m) => segments(m).some((s) => s.startsWith('EI ') && !s.includes('Informatik')) || inArea(m, /\(EInf\) > Wahlpflichtmodule Energietechnik/) || titled(m, /energy|energie|grid/i),
  },
  {
    id: 'hardware',
    kind: 'interest',
    match: (m) => m.section === 'Technische Informatik' || inArea(m, /^Wahlpflicht Technische Informatik$/) || titled(m, /embedded|automation|control systems|microelectronic/i),
  },
  {
    id: 'human',
    kind: 'interest',
    match: (m) => segments(m).some((s) => s.includes('Design, Interaktion')) || titled(m, /human|ergonom|participat/i),
  },
  {
    id: 'theory',
    kind: 'interest',
    match: (m) => m.section === 'Theoretische Informatik' || inArea(m, /^Wahlpflicht Theoretische Informatik$/) || m.title === 'Vertiefung Mathematik' || titled(m, /complexity|verification/i),
  },
  { id: 'requirements', kind: 'goal', goal: 'requirements', match: () => false },
  { id: 'compact', kind: 'goal', goal: 'compact', match: () => false },
];

// Themes of a program: its own list from the data file (made from the module handbook with Grok:
// [{ id, modules: [moduleId], text: { tr: [title, description], en: [...], de: [...] }, careers?: { tr: [job], ... }, plan? }]) plus the goal themes,
// or the built-in list above for data files that only say themes: true.
export function programThemes(data) {
  if (!Array.isArray(data.themes)) return THEMES;
  // A theme with a plan is someone's fixed program (moduleId -> { courses }), shown as it is.
  const own = data.themes.map((th) => ({ id: th.id, kind: 'interest', modules: new Set(th.modules), text: th.text, careers: th.careers, ...(th.plan ? { plan: th.plan } : {}) }));
  return [...own, ...THEMES.filter((th) => th.kind === 'goal')];
}

// Module ids of a theme, leaving out admission requirements and ISZ German courses (they are not electives).
export function themeModules(data, theme) {
  const match = theme.modules ? (m) => theme.modules.has(m.id) : theme.match;
  return data.modules.filter((m) => m.section !== 'admission' && m.section !== 'german' && match(m)).map((m) => m.id);
}
