// Teaching language of a course: eCampus "Lehrsprache" per parallel group, checked against the language of
// the course description (tab "Inhalte"). When neither says anything, or they disagree, the language is unknown
// and the site asks students to write to the lecturer.

// "deutsch" -> "de", "englisch" -> "en", "deutsch/englisch" -> "de-en"; anything else is unknown.
export function normalizeLanguage(s) {
  const t = (s ?? '').toLowerCase();
  const de = /deutsch|german/.test(t);
  const en = /englisch|english/.test(t);
  if (de && en) return 'de-en';
  if (de) return 'de';
  if (en) return 'en';
  return null;
}

const DE_WORDS = new Set('der die das und ist nicht mit sie wird werden für eine ein einer auf zu den dem im des sich von bei auch oder wir als nach über sowie zur zum'.split(' '));
const EN_WORDS = new Set('the and is are of to in for with this will be students you course we on an as by from which these their our can'.split(' '));

// Language of a free text by common short words; null when the text is too short or mixed.
export function textLanguage(text) {
  let de = 0;
  let en = 0;
  for (const w of (text ?? '').toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (DE_WORDS.has(w)) de++;
    if (EN_WORDS.has(w)) en++;
  }
  if (de >= 3 && de >= 3 * en) return 'de';
  if (en >= 3 && en >= 3 * de) return 'en';
  return null;
}

// Course-level verdict plus one code per group (same order as course.groups).
//   code: de | en | de-en (bilingual) | mixed (groups differ) | null (unknown)
//   source: ecampus | description | null
//   conflict: eCampus and the description disagree (code is null then)
export function courseLanguage(course, sections) {
  const described = textLanguage(sections.map((s) => s.text).join(' '));
  const own = course.groups.length ? course.groups.map((g) => normalizeLanguage(g.language)) : [normalizeLanguage(course.language)];
  const known = [...new Set(own.filter(Boolean))];
  let result;
  if (!known.length) result = described ? { code: described, source: 'description' } : { code: null, source: null };
  else if (known.length === 1 && described && known[0] !== 'de-en' && described !== known[0]) result = { code: null, source: null, conflict: { ecampus: known[0], description: described } };
  else result = { code: known.length === 1 ? known[0] : 'mixed', source: 'ecampus' };
  // A group without its own entry takes the course verdict only when that is not a mix of groups.
  const fallback = result.code === 'mixed' ? null : result.code;
  const groups = course.groups.map((g, i) => (result.conflict ? null : (own[i] ?? fallback)));
  return { ...result, groups };
}
