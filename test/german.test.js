import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addGermanCourses, loadGermanCourses, isGermanModule } from '../scraper/german.js';
import { selectedEntries, findConflicts, totalEcts } from '../site/js/schedule.js';

const semester = { start: '2026-10-20', end: '2027-02-10' };
const program = () => ({ sections: [{ id: 'a', name: 'A' }], modules: [{ id: 'm1', section: 'a', courseIds: ['1'] }], courses: [{ id: '1', groups: [] }], noteTranslations: { x: { en: 'x' } } });

test('German courses: free ones only, each a module with its course', async () => {
  const file = await loadGermanCourses();
  const data = addGermanCourses(program(), file, semester);
  assert.equal(data.sections.at(-1).id, 'german');
  const mods = data.modules.filter(isGermanModule);
  assert.equal(mods.length, 13);
  for (const m of mods) {
    assert.equal(m.section, 'german');
    const c = data.courses.find((x) => x.id === m.courseIds[0]);
    assert.ok(c, m.id);
    assert.equal(c.linkLabel, 'ISZ');
    for (const g of c.groups) for (const s of g.series) assert.ok(s.day >= 1 && s.day <= 5 && s.room && s.start < s.end);
  }
  // Fee-paying parallel courses and the resit are left out.
  assert.ok(!file.courses.some((c) => /fee|Gebühr|Resit/i.test(c.title)));
  // UNIcert II second group meets in two rooms.
  const b2 = data.courses.find((c) => c.id === 'isz-de-b2');
  assert.deepEqual(b2.groups[1].series.map((s) => s.room), ['Raum 1017 (Kurt-Wolters 5)', 'Raum 0107 (Nora-Platiel 5)']);
  // Notes are translated; the program's own translations stay.
  assert.equal(data.noteTranslations.x.en, 'x');
  assert.ok(data.noteTranslations[b2.groups[0].series[0].note].en.startsWith('Plus 3 extra'));
});

test('German courses: adding twice replaces, program data stays', async () => {
  const file = await loadGermanCourses();
  const once = addGermanCourses(program(), file, semester);
  const twice = addGermanCourses(structuredClone(once), file, semester);
  assert.deepEqual(twice, once);
  assert.equal(twice.modules[0].id, 'm1');
  assert.equal(twice.sections.filter((s) => s.id === 'german').length, 1);
});

test('German courses: two evening levels on the same days conflict, credits count', async () => {
  const data = addGermanCourses(program(), await loadGermanCourses(), semester);
  const state = { modules: { 'isz:isz-de-a11': {}, 'isz:isz-de-a12': {} } };
  assert.ok(findConflicts(selectedEntries(data, state)).size > 0);
  assert.equal(totalEcts(data, state).sum, 16);
});
