// Fetches the rooms of every floor of the campus map (map.uni-kassel.de, by mapongo) into
// scraper/map-structures.json, for site/js/map-rooms.js (see scraper/map-rooms.js). Run by hand:
// `npm run map-scrape`. The map blocks an address after a burst of requests (403), so this waits
// between floors, backs off on 403, and keeps what it fetched: a rerun only fetches missing floors.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = 'https://map.uni-kassel.de/api';
const OUT = new URL('./map-structures.json', import.meta.url);
const DELAY_MS = 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (kassel-timetable; campus map links)' } });
    if (res.ok) return res.json();
    if (res.status !== 403 && res.status !== 429) throw new Error(`${url} -> ${res.status}`);
    const wait = 60_000 * 2 ** attempt;
    console.log(`${res.status} on ${url}, waiting ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error(`${url}: still blocked`);
}

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { buildings: [], teaching: [], floors: {} };
const save = () => writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);

const buildings = await getJson(`${BASE}/project/1/buildings`);
await sleep(DELAY_MS);
const floors = await getJson(`${BASE}/project/1/floors`);
// A building's number is in the model files of its floors: 7220_1.dae is a floor of Wiso C (7220).
const numbers = new Map();
for (const f of floors) {
  const n = /^(\d{4})_/.exec(f.default_geometry_file ?? '')?.[1];
  if (n && !numbers.has(f.building_id)) numbers.set(f.building_id, n);
}
out.buildings = buildings.map((b) => ({ id: b.id, title: b.title_de.trim(), campus: b.campus, campusId: b.campus_id, number: numbers.get(b.id) }));
await sleep(DELAY_MS);
// Places the map files as lecture halls (20177) or seminar rooms (20179).
const categories = await getJson(`${BASE}/project/1/categories`);
out.teaching = categories
  .filter((c) => c.id === 20177 || c.id === 20179)
  .flatMap((c) => Object.values(c.structures).flatMap((floor) => Object.values(floor).flat()))
  .sort((a, b) => a - b);
// The buildings marked on the campus views: the categories under Campusübersicht (28401), as
// [title, campus, campus floor, place].
const overview = new Set([28401]);
// Children can come before their parents in the list.
for (let size = 0; size !== overview.size; ) {
  size = overview.size;
  for (const c of categories) if (overview.has(c.parent_id)) overview.add(c.id);
}
out.campusPlaces = categories
  .filter((c) => overview.has(c.parent_id))
  .flatMap((c) => Object.entries(c.structures ?? {}).flatMap(([b, byFloor]) => Object.entries(byFloor).flatMap(([f, ids]) => ids.map((id) => [c.title_de.trim(), Number(b), Number(f), id]))));
save();

for (const [i, floor] of floors.entries()) {
  if (out.floors[floor.id]) continue;
  await sleep(DELAY_MS);
  const structures = await getJson(`${BASE}/floor/${floor.id}/structures`);
  out.floors[floor.id] = {
    building: floor.building_id,
    level: floor.abbreviation_de,
    title: floor.title_de,
    // Model parts ("7220_1_air") are no places.
    places: structures.filter((s) => !/^\d{4}_/.test(s.title_de)).map((s) => ({ id: s.id, title: s.title_de })),
  };
  save();
  console.log(`${i + 1}/${floors.length} floor ${floor.id}: ${out.floors[floor.id].places.length} places`);
}
console.log('done');
