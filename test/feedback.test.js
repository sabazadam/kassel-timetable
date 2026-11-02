import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, handleFeedback, telegramText, LIMITS } from '../worker/feedback.js';

const DATA = {
  program: 'Master Computer Science (PO-2026)',
  programEn: 'Master Computer Science (2026)',
  courses: [{ id: '70206', title: 'Begriffliche Datenanalyse', titleEn: 'Formal Concept Analysis' }],
  modules: [{ id: 'm1', title: 'Datenanalyse', titleEn: 'Data Analysis', courseIds: ['70206'] }],
};

const good = (extra = {}) => ({
  program: 'msc-computer-science',
  courseId: '70206',
  category: 'room',
  message: 'Room changed to 0425',
  contact: '@kerem:matrix.org',
  lang: 'tr',
  turnstile: 'token',
  ...extra,
});

// In-memory stand-ins for the D1, rate limit and assets bindings.
function fakeEnv({ limited = false, rows = [] } = {}) {
  const inserted = [];
  return {
    inserted,
    TURNSTILE_SECRET: 's',
    TELEGRAM_TOKEN: 't',
    TELEGRAM_CHAT: '1',
    IP_SALT: 'salt',
    FEEDBACK_LIMIT: { limit: async () => ({ success: !limited }) },
    ASSETS: {
      fetch: async (req) =>
        new URL(req.url).pathname === '/msc-computer-science/data/msc-computer-science.json'
          ? new Response(JSON.stringify(DATA))
          : new Response('nope', { status: 404 }),
    },
    DB: {
      prepare(sql) {
        return {
          bind: (...args) => ({
            first: async () => {
              if (sql.startsWith('SELECT')) {
                const [hash, since] = args;
                const recent = rows.filter((r) => r.created_at > since);
                return { total: recent.length, mine: recent.filter((r) => r.ip_hash === hash).length };
              }
              inserted.push(args);
              return { id: inserted.length };
            },
          }),
        };
      },
    },
  };
}

function fakeFetch({ captcha = true } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('turnstile')) return new Response(JSON.stringify({ success: captcha }));
    return new Response('{}');
  };
  fn.calls = calls;
  return fn;
}

const post = (body, headers = {}) =>
  new Request('https://spacedevelopers.net/api/feedback', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '1.2.3.4', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function send(body, envOpts, fetchOpts) {
  const env = fakeEnv(envOpts);
  const fetchFn = fakeFetch(fetchOpts);
  const waits = [];
  const res = await handleFeedback(post(body), env, { waitUntil: (p) => waits.push(p) }, { fetchFn });
  await Promise.all(waits);
  return { res, out: await res.json(), env, fetchFn };
}

test('validate accepts a full report and normalises the Matrix ID', () => {
  const { report } = validate(good({ contact: 'kerem:matrix.org' }));
  assert.equal(report.contact, '@kerem:matrix.org');
  assert.equal(report.courseId, '70206');
});

test('validate rejects bad input', () => {
  assert.equal(validate(good({ category: 'x' })).error, 'bad_category');
  assert.equal(validate(good({ program: '../etc' })).error, 'bad_program');
  assert.equal(validate(good({ message: 'hi' })).error, 'too_short');
  assert.equal(validate(good({ message: 'x'.repeat(LIMITS.message + 1) })).error, 'too_long');
  assert.equal(validate(good({ contact: 'not a matrix id!' })).error, 'bad_contact');
  assert.equal(validate(good({ courseId: 'a b' })).error, 'bad_course');
  assert.equal(validate(good({ website: 'http://spam' })).error, 'spam');
});

test('validate allows a general report without course or contact', () => {
  const { report } = validate(good({ courseId: null, contact: '', category: 'missing' }));
  assert.equal(report.courseId, null);
  assert.equal(report.contact, null);
});

test('a valid report is stored with titles from the data and sent to Telegram', async () => {
  const { res, out, env, fetchFn } = await send(good());
  assert.equal(res.status, 200);
  assert.equal(out.id, 1);
  const row = env.inserted[0];
  assert.equal(row[3], 'Formal Concept Analysis');
  assert.equal(row[4], 'Data Analysis');
  assert.notEqual(row[11], '1.2.3.4');
  assert.equal(row[11].length, 64);
  const tg = fetchFn.calls.find((c) => c.url.includes('api.telegram.org'));
  const text = JSON.parse(tg.init.body).text;
  assert.match(text, /Formal Concept Analysis \(70206\)/);
  assert.match(text, /Program: Master Computer Science \(2026\) \(msc-computer-science\)/);
});

test('honeypot looks like success but stores nothing', async () => {
  const { res, env, fetchFn } = await send(good({ website: 'x' }));
  assert.equal(res.status, 200);
  assert.equal(env.inserted.length, 0);
  assert.equal(fetchFn.calls.length, 0);
});

test('rate limit, captcha and daily caps refuse the report', async () => {
  assert.equal((await send(good(), { limited: true })).res.status, 429);
  assert.equal((await send(good(), {}, { captcha: false })).res.status, 403);
  const { hashIp } = await import('../worker/feedback.js');
  const me = await hashIp('1.2.3.4', 'salt');
  const fresh = new Date().toISOString();
  const mine = Array.from({ length: LIMITS.perSenderPerDay }, () => ({ ip_hash: me, created_at: fresh }));
  assert.equal((await send(good(), { rows: mine })).out.error, 'daily_limit');
  const others = Array.from({ length: LIMITS.globalPerDay }, () => ({ ip_hash: 'other', created_at: fresh }));
  assert.equal((await send(good(), { rows: others })).res.status, 503);
  const old = mine.map((r) => ({ ...r, created_at: '2020-01-01T00:00:00.000Z' }));
  assert.equal((await send(good(), { rows: old })).res.status, 200);
});

test('a whole-module report keeps the module title', async () => {
  const { res, env } = await send(good({ courseId: null, moduleId: 'm1' }));
  assert.equal(res.status, 200);
  assert.equal(env.inserted[0][3], null);
  assert.equal(env.inserted[0][4], 'Data Analysis');
  assert.equal((await send(good({ courseId: null, moduleId: 'nope' }))).out.error, 'bad_module');
});

test('unknown program or course is refused', async () => {
  assert.equal((await send(good({ courseId: '99999' }))).out.error, 'bad_course');
  assert.equal((await send(good({ program: 'msc-nope', courseId: null }))).out.error, 'bad_program');
});

test('broken JSON and wrong method are refused', async () => {
  assert.equal((await send('{oops')).res.status, 400);
  const res = await handleFeedback(new Request('https://x/api/feedback'), fakeEnv(), {}, {});
  assert.equal(res.status, 405);
});

test('telegram text names the contact or says there is none', () => {
  const base = { category: 'time', program: 'p', courseId: null, message: 'Hello there' };
  assert.match(telegramText({ ...base, contact: '@a:b' }, 3), /Element: @a:b/);
  assert.match(telegramText(base, 3), /No contact given/);
});
