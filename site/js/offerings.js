// Which modules the module handbook plans for which semester (data.offerings, from scraper/offerings.js).
// Semesters are keys: 'S2027' = SoSe 2027, 'W2026' = WiSe 2026/27; as numbers summer = 2y, winter = 2y + 1.

export const semesterIndex = (key) => Number(key.slice(1)) * 2 + (key[0] === 'W' ? 1 : 0);
export const semesterKey = (index) => `${index % 2 ? 'W' : 'S'}${Math.floor(index / 2)}`;

// 'S2027' -> 'SoSe 2027', 'W2026' -> 'WiSe 2026/27'.
export function semesterLabel(key) {
  const year = Number(key.slice(1));
  return key[0] === 'W' ? `WiSe ${year}/${String(year + 1).slice(-2)}` : `SoSe ${year}`;
}

// 'Wintersemester 2026/27' or 'WiSe 2026/27' (data.period) -> 'W2026'; 'Sommersemester 2027' -> 'S2027'.
export function periodKey(period) {
  const m = /\b(Wi|So)(?:Se|ntersemester|mmersemester)\s*(\d{4})/i.exec(period ?? '');
  return m ? `${m[1][0].toUpperCase()}${m[2]}` : null;
}

// The current semester and the next `count - 1`.
export function semesterRange(current, count) {
  const start = semesterIndex(current);
  return Array.from({ length: count }, (_, i) => semesterKey(start + i));
}

// true / false, or null when the handbook gives no usable rule.
export function offeredIn(mod, key) {
  if (mod.term === 'both') return true;
  if (!mod.every) return null;
  const target = semesterIndex(key);
  // "annually in summer semester" has no start; any summer will do. "ab Sommersemester 2027" starts there.
  const from = mod.from ? semesterIndex(mod.from) : mod.term === 'winter' ? 1 : 0;
  if (mod.from && target < from) return false;
  return (((target - from) % mod.every) + mod.every) % mod.every === 0;
}

// The next semesters (from `current`, up to `limit` ahead) in which the module is planned.
export function nextOfferings(mod, current, limit = 6) {
  return semesterRange(current, limit).filter((key) => offeredIn(mod, key));
}

// Areas a module is listed under once, for grouping: the first area in handbook order, skipping the
// catch-all areas that list (nearly) every module ("5." any elective, "8.6" flexible main subject).
export function primaryArea(mod, offerings) {
  const catchAll = new Set(offerings.areas.filter((a) => isCatchAll(a, offerings)).map((a) => a.id));
  return mod.areas.find((id) => !catchAll.has(id)) ?? mod.areas[0];
}

// An area listing more than half of all modules is a catch-all.
function isCatchAll(area, offerings) {
  const n = offerings.modules.filter((m) => m.areas.includes(area.id)).length;
  return n > offerings.modules.length / 2;
}

// Main subjects (areas "8.x" with a parent of their own) the module counts for, as top-level area ids.
export function mainSubjects(mod, offerings) {
  const byId = new Map(offerings.areas.map((a) => [a.id, a]));
  const root = (id) => {
    let a = byId.get(id);
    while (a?.parent) a = byId.get(a.parent);
    return a;
  };
  const roots = mod.areas.map(root).filter((a) => a && offerings.areas.some((c) => c.parent === a.id) && !isCatchAll(a, offerings));
  return [...new Set(roots.map((a) => a.id))];
}

// Modules planned for `key`, filtered by area and a search text (name, German name, code).
export function filterOfferings(offerings, { key = null, area = '', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return offerings.modules.filter((m) => {
    if (key && offeredIn(m, key) === false) return false;
    if (area && !m.areas.some((id) => id === area || id.startsWith(`${area}.`))) return false;
    if (q && ![m.name, m.nameDe, m.code, m.number].some((s) => s?.toLowerCase().includes(q))) return false;
    return true;
  });
}

// The earliest semester before `key` in which the student already has the module: planned there
// (`plan`: { 'S2027': [id] }), or chosen in the week view when that semester is the current one (`nowChosen`).
// null when the module is free to plan in `key`.
export function takenBefore(id, key, { plan = {}, current = null, nowChosen = false } = {}) {
  if (!key) return null;
  const before = Object.keys(plan)
    .filter((k) => semesterIndex(k) < semesterIndex(key) && plan[k].includes(id))
    .concat(nowChosen && current && semesterIndex(current) < semesterIndex(key) ? [current] : []);
  return before.sort((a, b) => semesterIndex(a) - semesterIndex(b))[0] ?? null;
}
