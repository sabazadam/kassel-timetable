// POST /api/feedback: a student reports a data mistake (wrong time, room, missing course, ...).
// Abuse guards, in order: honeypot, input checks, per-sender rate limit (Workers binding), Turnstile,
// per-sender and global daily caps (D1). Accepted reports are stored in D1 and sent to Telegram.

export const CATEGORIES = ['time', 'room', 'missing', 'translation', 'idea', 'other'];
export const LIMITS = { message: 1000, contact: 100, context: 300, perSenderPerDay: 10, globalPerDay: 300 };
const SLUG = /^[a-z0-9-]{1,80}$/;
const COURSE_ID = /^[A-Za-z0-9:_-]{1,40}$/;
// Matrix user ID as Element shows it (@name:server); the leading @ and the server part are optional.
const MATRIX_ID = /^@?[a-z0-9._=\/+-]{1,64}(:[a-z0-9.-]{1,60}(:\d{1,5})?)?$/i;
const SITE = 'https://spacedevelopers.net';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '');

// Checks the request body; returns { report } or { error } with a short machine-readable code.
export function validate(body) {
  if (!body || typeof body !== 'object') return { error: 'bad_request' };
  if (body.website) return { error: 'spam' };
  const program = clean(body.program, 80);
  if (!SLUG.test(program)) return { error: 'bad_program' };
  if (!CATEGORIES.includes(body.category)) return { error: 'bad_category' };
  const courseId = body.courseId == null || body.courseId === '' ? null : clean(String(body.courseId), 40);
  // Module ids are eCampus ids or "t:<title>"; checked against the published data later.
  const moduleId = clean(body.moduleId, 200) || null;
  if (courseId !== null && !COURSE_ID.test(courseId)) return { error: 'bad_course' };
  if (typeof body.message === 'string' && body.message.trim().length > LIMITS.message) return { error: 'too_long' };
  const message = clean(body.message, LIMITS.message);
  if (message.length < 5) return { error: 'too_short' };
  const contact = clean(body.contact, LIMITS.contact);
  if (contact && !MATRIX_ID.test(contact)) return { error: 'bad_contact' };
  const lang = ['tr', 'en', 'de'].includes(body.lang) ? body.lang : null;
  return {
    report: {
      program,
      courseId,
      moduleId,
      category: body.category,
      message,
      contact: contact ? (contact.startsWith('@') ? contact : `@${contact}`) : null,
      lang,
      context: clean(body.context, LIMITS.context) || null,
      dataVersion: clean(body.dataVersion, 40) || null,
    },
  };
}

export async function hashIp(ip, salt) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${ip}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(token, ip, env, fetchFn) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await res.json().catch(() => ({}));
  return out.success === true;
}

// The program and course must exist in the published data; titles are taken from there, not from the client.
async function lookupCourse(env, report) {
  const res = await env.ASSETS.fetch(new Request(`${SITE}/${report.program}/data/${report.program}.json`));
  if (!res.ok) return null;
  const data = await res.json();
  const course = report.courseId ? data.courses?.find((c) => c.id === report.courseId) : null;
  if (report.courseId && !course) return null;
  const mod = report.moduleId
    ? data.modules?.find((m) => m.id === report.moduleId)
    : course && data.modules?.find((m) => m.courseIds?.includes(course.id));
  if (report.moduleId && !mod) return null;
  return {
    programName: data.programEn ?? data.program ?? null,
    courseTitle: course ? course.titleEn ?? course.title : null, moduleTitle: mod ? mod.titleEn ?? mod.title : null,
  };
}

const CATEGORY_LABEL = { time: 'Wrong time/date', room: 'Wrong room', missing: 'Missing course', translation: 'Wrong translation', idea: 'Suggestion', other: 'Other' };

export function telegramText(r, id) {
  const lines = [
    `Feedback #${id}: ${CATEGORY_LABEL[r.category]}`,
    `Program: ${r.programName ? `${r.programName} (${r.program})` : r.program}`,
    r.courseId ? `Course: ${r.courseTitle ?? '?'} (${r.courseId})` : null,
    r.moduleTitle ? `Module: ${r.moduleTitle}` : null,
    r.context ? `Shown: ${r.context}` : null,
    '',
    r.message,
    '',
    r.contact ? `Element: ${r.contact}` : 'No contact given',
    `${SITE}/${r.program}/`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

async function notify(env, text, fetchFn) {
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT) return;
  await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT, text, disable_web_page_preview: true }),
  });
}

export async function handleFeedback(request, env, ctx, { fetchFn = fetch, now = () => new Date() } = {}) {
  if (request.method !== 'POST') return json(405, { error: 'method' });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 8192) return json(413, { error: 'too_long' });
  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const { report, error } = validate(body);
  // The honeypot answers like a success so a bot learns nothing.
  if (error === 'spam') return json(200, { ok: true });
  if (error) return json(400, { error });

  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const ipHash = await hashIp(ip, env.IP_SALT ?? '');
  const { success } = await env.FEEDBACK_LIMIT.limit({ key: ipHash });
  if (!success) return json(429, { error: 'rate_limited' });
  if (!(await verifyTurnstile(body.turnstile, ip, env, fetchFn))) return json(403, { error: 'captcha' });

  const since = new Date(now().getTime() - 86400e3).toISOString();
  const counts = await env.DB.prepare(
    'SELECT COUNT(*) AS total, SUM(CASE WHEN ip_hash = ?1 THEN 1 ELSE 0 END) AS mine FROM feedback WHERE created_at > ?2',
  )
    .bind(ipHash, since)
    .first();
  if ((counts?.mine ?? 0) >= LIMITS.perSenderPerDay) return json(429, { error: 'daily_limit' });
  if ((counts?.total ?? 0) >= LIMITS.globalPerDay) return json(503, { error: 'busy' });

  const found = await lookupCourse(env, report);
  if (!found) return json(400, { error: report.courseId ? 'bad_course' : report.moduleId ? 'bad_module' : 'bad_program' });
  const r = { ...report, ...found };
  const row = await env.DB.prepare(
    `INSERT INTO feedback (created_at, program, course_id, course_title, module_title, category, message, contact, lang, context, data_version, ip_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) RETURNING id`,
  )
    .bind(now().toISOString(), r.program, r.courseId, r.courseTitle, r.moduleTitle, r.category, r.message, r.contact, r.lang, r.context, r.dataVersion, ipHash)
    .first();
  ctx.waitUntil(notify(env, telegramText(r, row.id), fetchFn).catch(() => {}));
  return json(200, { ok: true, id: row.id });
}
