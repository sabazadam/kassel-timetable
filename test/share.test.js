import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addFriend, clock, commonFree, decodeShare, encodeShare, freeIntervals, shareFromHash, shareLink, weekBusy } from '../site/js/share.js';

const load = (slug) => JSON.parse(readFileSync(new URL(`../site/data/${slug}.json`, import.meta.url), 'utf8'));

test('a share link round-trips name and programs', async () => {
  const payload = { name: '  Ali   Veli ', parts: [{ slug: 'bsc-informatik', modules: { m1: { courses: { c1: { on: true, group: 1, off: [2] } } } } }, { slug: 'bsc-psychologie', modules: {} }] };
  const link = await shareLink('https://spacedevelopers.net/bsc-informatik/', payload);
  assert.match(link, /^https:\/\/spacedevelopers\.net\/bsc-informatik\/#share=z[A-Za-z0-9_-]+$/);
  const back = await decodeShare(shareFromHash(new URL(link).hash));
  assert.deepEqual(back, { name: 'Ali Veli', parts: payload.parts });
});

test('decodeShare rejects broken and foreign payloads', async () => {
  assert.equal(await decodeShare('zzzz'), null);
  assert.equal(await decodeShare('xabc'), null);
  const plain = (obj) => `j${Buffer.from(JSON.stringify(obj)).toString('base64url')}`;
  assert.equal(await decodeShare(plain({ v: 1, n: 'A', p: [['../../etc', {}]] })), null);
  assert.equal(await decodeShare(plain({ v: 1, n: '', p: [['bsc-informatik', {}]] })), null);
  assert.equal(await decodeShare(plain({ v: 2, n: 'A', p: [['bsc-informatik', {}]] })), null);
  assert.deepEqual(await decodeShare(plain({ v: 1, n: 'A', p: [['bsc-informatik', {}], ['bad slug', {}]] })), { name: 'A', parts: [{ slug: 'bsc-informatik', modules: {} }] });
  assert.equal(shareFromHash('#terms'), null);
});

test('freeIntervals and commonFree find the gaps everyone has', () => {
  assert.deepEqual(freeIntervals([{ start: 600, end: 720 }, { start: 700, end: 780 }], 480, 1200), [[480, 600], [780, 1200]]);
  const ali = [{ day: 1, start: 8 * 60, end: 10 * 60 }, { day: 1, start: 14 * 60, end: 16 * 60 }];
  const ayse = [{ day: 1, start: 12 * 60, end: 13 * 60 + 30 }, { day: 2, start: 8 * 60, end: 20 * 60 }];
  const free = commonFree([ali, ayse], { days: [1, 2], min: 60 });
  // 13:30-14:00 is only 30 minutes, so it drops out.
  assert.deepEqual(free, { 1: [[600, 720], [960, 1200]], 2: [] });
  assert.equal(clock(605), '10:05');
});

test('weekBusy lists the weekly meetings of a real selection', () => {
  const data = load('bsc-informatik');
  // The first module with a weekly meeting in its first course.
  const mod = data.modules.find((m) => !m.pickOne && m.courseIds.some((id) => data.courses.find((c) => c.id === id)?.groups[0]?.series.some((s) => s.rhythm === 'wöchentlich' && s.start)));
  const busy = weekBusy(data, { [mod.id]: { courses: {} } }, '2026-11-02');
  assert.ok(busy.length > 0);
  for (const b of busy) {
    assert.ok(b.day >= 1 && b.day <= 7 && b.start < b.end);
    assert.ok(mod.courseIds.includes(b.courseId));
  }
  assert.deepEqual(weekBusy(data, {}, '2026-11-02'), []);
});

test('addFriend replaces a friend who sends a new link', () => {
  const first = addFriend([], { name: 'Ali', parts: [{ slug: 'bsc-informatik', modules: {} }] }, 1);
  assert.equal(first.updated, false);
  const again = addFriend(first.friends, { name: 'ali', parts: [{ slug: 'bsc-physik', modules: {} }] }, 2);
  assert.equal(again.updated, true);
  assert.equal(again.friends.length, 1);
  assert.equal(again.friends[0].id, first.friend.id);
  assert.equal(again.friends[0].parts[0].slug, 'bsc-physik');
  assert.equal(addFriend(again.friends, { name: 'Ayşe', parts: [] }, 3).friends.length, 2);
});

test('sharedCourses finds common courses and the meetings taken together', async () => {
  const { sharedCourses } = await import('../site/js/share.js');
  const b = (courseId, day, start, end) => ({ courseId, day, start, end, title: courseId, titleEn: courseId });
  const me = [b('dl', 1, 720, 840), b('dl', 2, 480, 600), b('rl', 3, 600, 720), b('ml', 4, 480, 600)];
  const friend = [b('ml', 4, 480, 600), b('dl', 1, 720, 840), b('dl', 2, 600, 720), b('x', 5, 480, 600)];
  const out = sharedCourses(me, friend);
  assert.deepEqual(out.map((c) => c.courseId), ['dl', 'ml']);
  assert.deepEqual(out[0].together, [{ day: 1, start: 720, end: 840 }]);
  assert.equal(out[0].theirs.length, 2);
  assert.deepEqual(out[1].together, [{ day: 4, start: 480, end: 600 }]);
  assert.deepEqual(sharedCourses(me, []), []);
});
