import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { linkPlace, mapPlace, mapUrl, roomParts } from '../site/js/campus-map.js';
import { MAP_CAMPUS } from '../site/js/map-rooms.js';

test('a room the map has opens that room', () => {
  assert.deepEqual(mapPlace('Raum 1215 (Arnold-Bode 10)'), { b: 37, f: 101, l: 25141 });
  assert.deepEqual(mapPlace('Raum 1120 A (Kurt-Wolters 3)'), { b: 47, f: 119, l: 26005 });
  assert.deepEqual(mapPlace('Raum -1607 (WA-Neubau (Emilien))'), { b: 81, f: 183, l: 31953 });
});

test('a lecture hall is found by the room number in brackets, on the floor that number names', () => {
  assert.deepEqual(mapPlace('Hörsaal 1 (Raum -1139) (Moritzstr. 18 Campus Center)'), { b: 1, f: 9, l: 7723 });
  // Hörsaal 4 spans floors 1 and 2 on the map.
  assert.deepEqual(mapPlace('Hörsaal 4 (Raum 1127) (Moritzstr. 18 Campus Center)'), { b: 1, f: 5, l: 449 });
});

test('rooms of buildings known only by campus open the map building that has their lecture rooms', () => {
  assert.deepEqual(mapPlace('Raum 0401 (Arnold-Bode 2)'), { b: 35, f: 97, l: 24899 });
  assert.deepEqual(mapPlace('Raum 2004 (G.-Forster-Str. 4)'), { b: 21, f: 77, l: 24191 });
  assert.deepEqual(mapPlace('Raum 0282 (Heinr.-Plett-Str.)'), { b: 11, f: 39, l: 18645 });
  assert.deepEqual(mapPlace('Hörsaal -1319 (WA-altes Gebäude (WA 73))'), { b: 77, f: 173, l: 31339 });
});

test('a room the map lacks opens its building at the floor its number starts with', () => {
  assert.deepEqual(mapPlace('Raum 2403 (Möncheberg 7)'), { b: 19, f: 69 });
  assert.deepEqual(mapPlace('Raum 3206 (Nora-Platiel 1)'), { b: 33, f: 93 });
  assert.deepEqual(mapPlace('Raum -1030 (Kurt-Wolters 5)'), { b: 51, f: 125 });
  assert.deepEqual(mapPlace('Seminarraum Soziologie (Nora-Platiel 5)'), { b: 33, f: 93 });
});

test('a room the map lacks in a building known only by campus opens the campus', () => {
  assert.deepEqual(mapPlace('Raum 0212 (Nora-Platiel 3)'), { b: 5, f: 21 });
  assert.deepEqual(mapPlace('Raum 1140 (Henschelstraße 2)'), { b: 5, f: 21 });
  assert.deepEqual(mapPlace('Raum 2272 (Heinr.-Plett-Str.)'), { b: 15, f: 59 });
  assert.deepEqual(mapPlace('Sporthalle (Damaschkestraße 25)'), { b: 65, f: 163 });
});

test('a department room known by its department opens its building on the campus', () => {
  assert.deepEqual(mapPlace('Labor 0303c im Fachgebiet IES'), { b: 77, f: 175, l: 31215 });
  assert.deepEqual(mapPlace('2. Gruppe, Raum 0303c im Fachgebiet'), { b: 77, f: 175, l: 31215 });
  assert.deepEqual(linkPlace('Raum 0303c im Fachgebiet'), { b: 59, f: 151, l: 29197, building: true });
  // Without the department, or another department's room: no link.
  assert.equal(mapPlace('Raum 0303c'), null);
  assert.equal(mapPlace('Raum 1411 im Fachgebiet Verteilte Systeme'), null);
});

test('room parts: building in the last bracket, number with its letter', () => {
  assert.deepEqual(roomParts('Raum 1120 A (Kurt-Wolters 3)'), { building: 'Kurt-Wolters 3', number: '1120a' });
  assert.deepEqual(roomParts('Hörsaal 1 (Raum -1139) (Moritzstr. 18 Campus Center)'), { building: 'Moritzstr. 18 Campus Center', number: '-1139' });
  assert.deepEqual(roomParts('Raum 0445E (WA-altes Gebäude (WA 71))'), { building: 'WA-altes Gebäude (WA 71)', number: '0445e' });
});

test('places off the map get no link', () => {
  for (const room of ['', null, 'Senatssaal', 'Mariendorfer Str. 7, Kassel', 'Raum 1 (Virtuelles Gebäude)', 'Raum 1304']) {
    assert.equal(mapPlace(room), null, room);
    assert.equal(mapUrl(room, 'de'), null, room);
  }
});

test('the link opens the campus with the building marked, in German, else English', () => {
  // Wiso C (Haus 7220) on Holländischer Platz, Emilienstr. 41 (4600) and WA 73 (4300) on Wilhelmshöher Allee.
  assert.equal(mapUrl('Raum 1215 (Arnold-Bode 10)', 'de'), 'https://map.uni-kassel.de/?p=1&b=5&f=21&l=9019&lang=de');
  assert.equal(mapUrl('Raum -1607 (WA-Neubau (Emilien))', 'tr'), 'https://map.uni-kassel.de/?p=1&b=59&f=151&l=29207&lang=en');
  assert.deepEqual(linkPlace('Hörsaal -1319 (WA-altes Gebäude (WA 73))'), { b: 59, f: 151, l: 29197, building: true });
  // A room the map lacks still marks its building; a building known only by campus opens the campus.
  assert.deepEqual(linkPlace('Raum 2403 (Möncheberg 7)'), { b: 5, f: 21, l: 8985, building: true });
  assert.deepEqual(linkPlace('Raum 0212 (Nora-Platiel 3)'), { b: 5, f: 21 });
});

test('every room whose building the map has marks that building on the campus view', () => {
  const dir = new URL('../site/data/', import.meta.url);
  const rooms = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    for (const m of text.matchAll(/"room"\s*:\s*"((?:[^"\\]|\\.)+)"/g)) rooms.add(JSON.parse(`"${m[1]}"`));
  }
  const campuses = new Set([5, 15, 57, 59, 61, 65, 67, 69]);
  const unmarked = [...rooms].filter((r) => {
    const place = mapPlace(r);
    return place && !campuses.has(place.b) && !MAP_CAMPUS[place.b];
  });
  assert.deepEqual(unmarked, []);
});

test('every room in the data opens a place on the map, or knowingly none', () => {
  const dir = new URL('../site/data/', import.meta.url);
  const rooms = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    for (const m of text.matchAll(/"room"\s*:\s*"((?:[^"\\]|\\.)+)"/g)) rooms.add(JSON.parse(`"${m[1]}"`));
  }
  const unplaced = [...rooms].filter((r) => !mapPlace(r));
  // Only rooms without a building bracket, or in the virtual building.
  assert.deepEqual(unplaced.filter((r) => /\)\s*$/.test(r) && !/Virtuelles Gebäude/.test(r)), []);
});
