import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NEWS, newsFor, noteVisit, unseen } from '../site/js/news.js';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
beforeEach(() => store.clear());
const KEY = 'ders-programi:news-read';

test('news entries: unique ids, newest first, every language with a title and a text', () => {
  assert.equal(new Set(NEWS.map((n) => n.id)).size, NEWS.length);
  for (let i = 1; i < NEWS.length; i++) assert.ok(NEWS[i - 1].date >= NEWS[i].date, NEWS[i].id);
  for (const n of NEWS) for (const lang of ['tr', 'en', 'de']) assert.ok(n[lang]?.title && n[lang]?.text, `${n.id} ${lang}`);
});

test('program news shows only on its programs; general news everywhere', () => {
  const cs = newsFor('msc-computer-science').map((n) => n.id);
  const bsc = newsFor('bsc-informatik').map((n) => n.id);
  assert.ok(cs.includes('2026-10-19-exams'));
  assert.ok(!bsc.includes('2026-10-19-exams'));
  assert.ok(bsc.includes('2026-10-21-map') && cs.includes('2026-10-21-map'));
});

test('a first visit shows no dot; unread entries of the page do', () => {
  assert.deepEqual(unseen('bsc-informatik'), []);
  noteVisit();
  assert.deepEqual(unseen('bsc-informatik'), []);
  // Read everything except the CS exam entry: a CS page has one unread, a Bachelor page none.
  store.set(KEY, JSON.stringify(NEWS.map((n) => n.id).filter((id) => id !== '2026-10-19-exams')));
  assert.deepEqual(unseen('msc-computer-science').map((n) => n.id), ['2026-10-19-exams']);
  assert.deepEqual(unseen('bsc-informatik'), []);
});
