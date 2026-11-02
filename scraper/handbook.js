// Module handbook from moduldatenbank.uni-kassel.de: official module codes (PI-10, TeI-14, ...) and
// official English/German module names. Used to label eCampus modules; grouping still follows eCampus.
import { load } from 'cheerio';

const clean = (s) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// Returns [{ code, name, linkId }] in page order (a module listed in several areas appears once).
export function parseHandbook(html) {
  const $ = load(html);
  const out = new Map();
  $('.indented.module .text').each((i, el) => {
    const link = $(el).find('a[href]').first();
    const linkId = /[?&]id=(\d+)/.exec(link.attr('href') ?? '')?.[1];
    const name = clean(link.text());
    const code = clean($(el).clone().children().remove().end().text());
    if (!linkId || !name || out.has(linkId)) return;
    out.set(linkId, { code, name, linkId });
  });
  return [...out.values()];
}

// Joins the English and German pages on the shared module link id.
export function mergeHandbooks(english, german) {
  const de = new Map(german.map((m) => [m.linkId, m.name]));
  return english.map((m) => ({ code: m.code, nameEn: m.name, nameDe: de.get(m.linkId) ?? null }));
}

const norm = (s) =>
  (s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Finds the handbook entry for an eCampus module: German title, then our English translation,
// then the manual alias table (for spelling differences between the two systems).
export function matchHandbook(module, entries, aliases = {}) {
  const byDe = new Map(entries.filter((e) => e.nameDe).map((e) => [norm(e.nameDe), e]));
  const byEn = new Map(entries.map((e) => [norm(e.nameEn), e]));
  const byCode = new Map(entries.map((e) => [e.code, e]));
  if (aliases[module.title]) return byCode.get(aliases[module.title]) ?? null;
  return byDe.get(norm(module.title)) ?? byEn.get(norm(module.titleEn)) ?? null;
}
