// Writes site/js/map-rooms.js: for each room of the timetable data, the room on the campus map
// (from scraper/map-structures.json, fetched by scraper/campus-map.js). Run: `npm run map-rooms`.
//
// A room is looked up by its number in its map building, preferring the floor its number starts with.
// eCampus buildings that campus-map.js only knows by campus (Arnold-Bode 2, …) are looked up among the
// lecture halls and seminar rooms of that campus, as one map building that has nearly all their rooms,
// so a number that happens to exist elsewhere on campus does not move a room. Prints what it inferred.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { roomParts, buildingPlace, floorOf } from '../site/js/campus-map.js';
import { CLASS_ROOMS } from '../site/js/note-rooms.js';

const map = JSON.parse(readFileSync(new URL('./map-structures.json', import.meta.url), 'utf8'));
const OUT = new URL('../site/js/map-rooms.js', import.meta.url);
const SHARE = 0.8;

// Map places by building and room number: "Hörsaal 4 - Raum 1127", "Raum 0103a", "WC barrierefrei R. 0404".
export const placeNumber = (title) => /(?:Raum|Hörsaal|R\.)\s*(-?\d{4}[a-z]?)(?![\da-z])/i.exec(title)?.[1]?.toLowerCase();
const index = new Map();
for (const [f, floor] of Object.entries(map.floors)) {
  for (const place of floor.places) {
    const number = placeNumber(place.title);
    if (!number) continue;
    const key = `${floor.building}|${number}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ b: floor.building, f: Number(f), level: floor.level, id: place.id, title: place.title });
  }
}

// Rooms of the timetable: scraped rooms and the rooms read from remarks.
const rooms = new Set(Object.values(CLASS_ROOMS).filter(Boolean));
const dataDir = new URL('../site/data/', import.meta.url);
for (const file of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
  const text = readFileSync(new URL(file, dataDir), 'utf8');
  for (const m of text.matchAll(/"room"\s*:\s*"((?:[^"\\]|\\.)+)"/g)) rooms.add(JSON.parse(`"${m[1]}"`));
}

const found = {};
const missing = [];
const pairs = new Set();
for (const room of rooms) {
  const { building, number } = roomParts(room);
  if (building && number) pairs.add(`${building}|${number}`);
}
const title = (id) => map.buildings.find((b) => b.id === id)?.title ?? id;
const teaching = new Set(map.teaching);
// The place of a room in the given map buildings, preferring the floor its number starts with; null
// when there is none or it is in more than one building.
function lookup(buildings, number, onlyTeaching) {
  const matches = buildings.flatMap((b) => index.get(`${b}|${number}`) ?? []).filter((m) => !onlyTeaching || teaching.has(m.id));
  const onFloor = matches.filter((m) => m.level === String(floorOf(number)));
  const pick = onFloor.length ? onFloor : matches;
  return pick.length && new Set(pick.map((m) => m.b)).size === 1 ? pick[0] : null;
}

// eCampus buildings that stand for several map buildings: each room by itself.
const SPREAD = new Set(['Heinr.-Plett-Str.', 'WA-altes Gebäude (WA 73)', 'Wilhelmshöher Allee']);
const byBuilding = new Map();
for (const pair of pairs) {
  const [building, number] = pair.split('|');
  if (!byBuilding.has(building)) byBuilding.set(building, []);
  byBuilding.get(building).push(number);
}
for (const [building, numbers] of [...byBuilding].sort()) {
  const place = buildingPlace(building);
  if (!place) continue;
  const take = (number, m) => (m ? (found[`${building}|${number}`] = [m.b, m.f, m.id]) : missing.push(`${building}|${number}`));
  if (place.floors) {
    for (const number of numbers) take(number, lookup([place.b], number, false));
    continue;
  }
  // Known only by campus: look among the campus's lecture halls and seminar rooms.
  const campus = map.buildings.filter((b) => b.campusId === place.b).map((b) => b.id);
  if (SPREAD.has(building)) {
    for (const number of numbers) take(number, lookup(campus, number, true));
    continue;
  }
  // One address is one building: the map building that has (nearly) all its rooms.
  const fits = campus
    .map((b) => ({ b, rooms: numbers.filter((n) => lookup([b], n, true)) }))
    .filter((c) => c.rooms.length >= 2 && c.rooms.length / numbers.length >= SHARE);
  if (fits.length !== 1) {
    console.log(`not inferred: ${building} (${numbers.join(', ')})`);
    numbers.forEach((n) => missing.push(`${building}|${n}`));
    continue;
  }
  const [{ b, rooms: inB }] = fits;
  console.log(`inferred: ${building} -> ${title(b)} (${inB.length}/${numbers.length} rooms)`);
  for (const number of numbers) take(number, inB.includes(number) ? lookup([b], number, true) : null);
}
console.log(`${Object.keys(found).length} of ${pairs.size} rooms found; not found:`);
console.log(missing.join('\n'));

// Where each map building is marked on its campus view: the campus place named by the building's number
// ("Haus 7220", "4600"), else the one with the building's name ("Wiso A"), else the only one whose name
// starts the building's ("AVZ I" for "AVZ I HPS 40").
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
const spots = [];
for (const [f, floor] of Object.entries(map.floors)) {
  if (!map.buildings.find((b) => b.id === floor.building)?.campus) continue;
  for (const place of floor.places) spots.push([place.title.trim(), floor.building, Number(f), place.id]);
}
spots.push(...map.campusPlaces);
const onCampus = {};
for (const b of map.buildings.filter((x) => !x.campus)) {
  const here = spots.filter((s) => s[1] === b.campusId);
  const pick =
    here.find((s) => b.number && new RegExp(`\\b${b.number}\\b`).test(s[0])) ??
    here.find((s) => norm(s[0]) === norm(b.title)) ??
    (([one, ...more]) => (one && more.every((s) => s[3] === one[3]) ? one : undefined))(here.filter((s) => b.title.startsWith(`${s[0]} `)));
  if (pick) onCampus[b.id] = pick.slice(1);
  else console.log(`not on its campus view: ${b.title} (${b.number ?? 'no number'})`);
}

const lines = (o) =>
  Object.keys(o)
    .sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b))
    .map((k) => ` ${JSON.stringify(k)}: ${JSON.stringify(o[k])},`)
    .join('\n');
writeFileSync(
  OUT,
  `// Generated by scraper/map-rooms.js from the campus map's data.

// Rooms: eCampus building and room number (as roomParts() in campus-map.js reads them) to
// [map building, floor, room].
export const MAP_ROOMS = {
${lines(found)}
};

// Map buildings as marked on their campus view: map building to [campus, campus floor, place].
export const MAP_CAMPUS = {
${lines(onCampus)}
};
`,
);
