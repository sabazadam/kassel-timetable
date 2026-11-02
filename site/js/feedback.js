// Feedback form: a dialog that sends a data-mistake report to /api/feedback (worker/feedback.js).
// Turnstile (Cloudflare's bot check) is loaded only when the form opens, so normal visits load nothing extra.

const SITE_KEY = '0x4AAAAAAFe1jgqjvioufAkD';
// Cloudflare's always-pass test key, so the form also works on a local server.
const TEST_KEY = '1x00000000000000000000AA';
const CATEGORIES = ['time', 'room', 'missing', 'translation', 'idea', 'other'];
const MAX_MESSAGE = 1000;

let turnstileReady = null;
function loadTurnstile() {
  turnstileReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => {
      turnstileReady = null;
      reject(new Error('turnstile'));
    };
    document.head.append(s);
  });
  return turnstileReady;
}

// Opens the form. target: { program, lang, dataVersion } plus, from a module card, { moduleId, moduleTitle, color,
// courses: [{ id, label, title, context }] }; without a module it is a general report (e.g. a missing course).
// h is the app's element builder, t its translator.
export function openFeedback(target, { h, t }) {
  document.getElementById('feedback-dialog')?.remove();
  let token = '';
  let widget = null;

  const forModule = Boolean(target.moduleTitle);
  const courses = target.courses ?? [];
  const chip = (name, value, label, checked) =>
    h('label', { class: 'fb-chip' }, h('input', { type: 'radio', name, value, checked }), h('span', {}, label));
  const radios = CATEGORIES.map((c) => chip('fb-cat', c, t(`fbCat_${c}`), c === (target.category ?? (forModule ? 'time' : 'missing'))));
  // Which course of the module: one course needs no question; several get a chip each plus "whole module".
  const which =
    courses.length > 1
      ? h('fieldset', { class: 'fb-chips' }, h('legend', {}, t('fbWhich')), courses.map((c, i) => chip('fb-course', c.id, c.label, i === 0)), chip('fb-course', '', t('fbWholeModule'), false))
      : null;
  const shown = h('span', { class: 'fb-shown' });
  const showContext = () => {
    const id = courses.length > 1 ? form.querySelector('input[name="fb-course"]:checked')?.value : courses[0]?.id;
    shown.textContent = courses.find((c) => c.id === id)?.context ?? '';
  };
  const message = h('textarea', { id: 'fb-message', rows: '4', maxlength: String(MAX_MESSAGE), required: true, placeholder: t('fbMessageHint') });
  // The counter appears only near the limit.
  const counter = h('span', { class: 'fb-count', hidden: true });
  message.addEventListener('input', () => {
    counter.hidden = message.value.length < MAX_MESSAGE * 0.8;
    counter.textContent = `${message.value.length} / ${MAX_MESSAGE}`;
  });
  const contact = h('input', { id: 'fb-contact', type: 'text', autocomplete: 'off', spellcheck: 'false', maxlength: '100', placeholder: '@name:matrix.org' });
  // Honeypot: hidden from people, filled in by naive bots.
  const trap = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'fb-trap', 'aria-hidden': 'true' });
  const captcha = h('div', { class: 'fb-captcha' });
  const status = h('p', { class: 'fb-status', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { type: 'submit', class: 'primary' }, t('fbSend'));
  const close = () => {
    if (widget !== null) window.turnstile?.remove(widget);
    dialog.close();
    dialog.remove();
  };

  const about = forModule
    ? h('div', { class: 'fb-about', style: target.color ? `--fb-color: ${target.color}` : null }, h('strong', {}, target.moduleTitle), shown)
    : h('p', { class: 'fb-intro' }, t('fbGeneralIntro'));

  const form = h(
    'form',
    { method: 'dialog', novalidate: true },
    h('div', { class: 'fb-head' }, h('h2', { id: 'fb-title' }, t(target.title ?? 'fbTitle')), h('button', { type: 'button', class: 'quiet fb-close', 'aria-label': t('fbClose'), onclick: close }, '×')),
    about,
    which,
    h('fieldset', { class: 'fb-chips' }, h('legend', {}, t(target.title ? 'fbTopic' : 'fbWhat')), radios),
    h('label', { class: 'fb-field', for: 'fb-message' }, h('span', {}, t('fbMessage')), message, counter),
    h('label', { class: 'fb-field', for: 'fb-contact' }, h('span', {}, t('fbContact')), contact, h('small', {}, t('fbContactNote'))),
    trap,
    captcha,
    status,
    h('div', { class: 'fb-actions' }, h('button', { type: 'button', class: 'quiet', onclick: close }, t('fbCancel')), submit),
    h('p', { class: 'fb-privacy' }, t('fbPrivacy'), ' ', h('a', { href: '/datenschutz/', target: '_blank' }, t('privacy'))),
  );
  const dialog = h('dialog', { id: 'feedback-dialog', class: 'feedback-dialog', 'aria-labelledby': 'fb-title' }, form);
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    close();
  });
  form.addEventListener('change', (ev) => ev.target.name === 'fb-course' && showContext());
  showContext();
  document.body.append(dialog);
  dialog.showModal();
  // On touch screens the keyboard would cover the form; focus the text only where typing is cheap.
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) message.focus();

  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  loadTurnstile()
    .then((ts) => {
      widget = ts.render(captcha, {
        sitekey: local ? TEST_KEY : SITE_KEY,
        action: 'feedback',
        appearance: 'interaction-only',
        language: target.lang,
        callback: (v) => (token = v),
        'expired-callback': () => (token = ''),
        'error-callback': () => (token = ''),
      });
    })
    .catch(() => (status.textContent = t('fbErr_captchaLoad')));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = message.value.trim();
    if (text.length < 5) {
      status.textContent = t('fbErr_too_short');
      message.focus();
      return;
    }
    if (!token) {
      status.textContent = t('fbWaitCaptcha');
      return;
    }
    submit.disabled = true;
    status.textContent = t('fbSending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          program: target.program,
          courseId: (courses.length > 1 ? form.querySelector('input[name="fb-course"]:checked')?.value : courses[0]?.id) || null,
          moduleId: target.moduleId ?? null,
          category: form.querySelector('input[name="fb-cat"]:checked')?.value ?? 'other',
          message: text,
          contact: contact.value.trim(),
          lang: target.lang,
          context: shown.textContent || null,
          dataVersion: target.dataVersion ?? null,
          website: trap.value,
          turnstile: token,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok) {
        form.replaceChildren(
          h('div', { class: 'fb-head' }, h('h2', { id: 'fb-title' }, t('fbThanksTitle')), h('button', { type: 'button', class: 'quiet fb-close', 'aria-label': t('fbClose'), onclick: close }, '×')),
          h('p', {}, t(contact.value.trim() ? 'fbThanksContact' : 'fbThanks')),
          h('div', { class: 'fb-actions' }, h('button', { type: 'button', class: 'primary', onclick: close }, t('fbClose'))),
        );
        return;
      }
      status.textContent = t(`fbErr_${out.error}`) === `fbErr_${out.error}` ? t('fbErr_generic') : t(`fbErr_${out.error}`);
    } catch {
      status.textContent = t('fbErr_network');
    }
    // A Turnstile token works once; get a fresh one for the next try.
    token = '';
    if (widget !== null) window.turnstile?.reset(widget);
    submit.disabled = false;
  });
}
