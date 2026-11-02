import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compulsoryModules, compulsoryPlan, findConflicts, selectedEntries } from '../site/js/schedule.js';

const weekly = (day, start, end) => ({ rhythm: 'wöchentlich', day, start, end, startDate: '2026-10-19', endDate: '2027-02-08', cancelled: [], room: 'R' });
const data = {
  categories: [
    { id: 'P', group: 'area', count: 3, compulsory: true },
    { id: 'W', group: 'area', count: 1 },
  ],
  modules: [
    { id: 'a', categories: ['P'], courseIds: ['ca'] },
    { id: 'b', categories: ['P'], courseIds: ['cb'] },
    { id: 'c', categories: ['P'], courseIds: ['cc'] },
    { id: 'guess', categories: ['P'], unlisted: true, courseIds: ['ca'] },
    { id: 'e', categories: ['W'], courseIds: ['ce'] },
  ],
  courses: [
    { id: 'ca', groups: [{ series: [weekly(1, '10:00', '12:00')] }] },
    // Two parallel groups: Monday 10-12 clashes with a, Tuesday does not.
    { id: 'cb', groups: [{ series: [weekly(1, '10:00', '12:00')] }, { series: [weekly(2, '10:00', '12:00')] }] },
    { id: 'cc', groups: [] },
    { id: 'ce', groups: [{ series: [weekly(3, '10:00', '12:00')] }] },
  ],
};

test('compulsory modules come from compulsory categories only, never from guessed (unlisted) placements', () => {
  assert.deepEqual(compulsoryModules(data).map((m) => m.id), ['a', 'b', 'c']);
  assert.deepEqual(compulsoryModules({ ...data, categories: [{ id: 'P' }] }), []);
});

test('compulsoryPlan adds the offered ones, picks the parallel group that avoids a clash, names the rest', () => {
  const plan = compulsoryPlan(data, { modules: {} });
  assert.deepEqual(plan.added.sort(), ['a', 'b']);
  assert.deepEqual(plan.notOffered, ['c']);
  assert.equal(plan.clashes, 0);
  assert.equal(plan.modules.b.courses.cb.group, 1);
  assert.equal(findConflicts(selectedEntries(data, { modules: plan.modules })).size, 0);
  // Already chosen modules stay as they are.
  const again = compulsoryPlan(data, { modules: { a: { courses: {} } } });
  assert.deepEqual(again.added, ['b']);
  assert.deepEqual(again.chosen, ['a']);
});

test('msc-ece: the five compulsory first-semester modules, without the unlisted duplicate, clash-free', () => {
  const ece = JSON.parse(readFileSync(new URL('../site/data/msc-ece.json', import.meta.url)));
  const cat = ece.categories.find((c) => c.id === 'Pflichtmodule');
  assert.equal(cat.compulsory, true);
  assert.equal(cat.semester, 1);
  const plan = compulsoryPlan(ece, { modules: {} });
  assert.equal(plan.added.length, 5);
  assert.ok(!plan.added.includes('t:Introduction to Digital Communications'));
  assert.equal(findConflicts(selectedEntries(ece, { modules: plan.modules })).size, 0);
});
