// Minimal HTTP session for HISinOne: keeps cookies across requests and rate-limits.
const BASE = 'https://ecampus.uni-kassel.de';

export class Session {
  constructor({ delayMs = 300 } = {}) {
    this.cookies = new Map();
    this.delayMs = delayMs;
    this.last = 0;
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  storeCookies(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  async throttle() {
    const wait = this.last + this.delayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
  }

  async post(url, fields) {
    await this.throttle();
    const body = new URLSearchParams(fields);
    const res = await fetch(new URL(url, BASE).href, {
      method: 'POST',
      redirect: 'manual',
      body,
      headers: { cookie: this.cookieHeader(), 'accept-language': 'de-DE,de', 'content-type': 'application/x-www-form-urlencoded' },
    });
    this.storeCookies(res);
    if (res.status >= 300 && res.status < 400) return this.get(new URL(res.headers.get('location'), new URL(url, BASE)).href);
    if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`);
    return { url, html: await res.text() };
  }

  // GET following redirects manually so cookies set on each hop are kept.
  async get(url, { retries = 3 } = {}) {
    let target = new URL(url, BASE).href;
    for (let hop = 0; hop < 10; hop++) {
      await this.throttle();
      let res;
      try {
        res = await fetch(target, {
          redirect: 'manual',
          headers: { cookie: this.cookieHeader(), 'accept-language': 'de-DE,de' },
        });
      } catch (err) {
        if (retries <= 0) throw err;
        retries--;
        hop--;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      this.storeCookies(res);
      if (res.status >= 300 && res.status < 400) {
        target = new URL(res.headers.get('location'), target).href;
        continue;
      }
      if (!res.ok) throw new Error(`GET ${target} -> ${res.status}`);
      return { url: target, html: await res.text() };
    }
    throw new Error(`Too many redirects for ${url}`);
  }
}

// Submit a JSF form: collects every field of the form, adds the clicked button.
export function formFields($, formId) {
  const form = $(`form[id='${formId}']`);
  const fields = [];
  form.find('input').each((i, e) => {
    const $e = $(e);
    const name = $e.attr('name');
    const type = ($e.attr('type') || 'text').toLowerCase();
    if (!name || ['submit', 'button', 'image', 'file'].includes(type)) return;
    if ((type === 'checkbox' || type === 'radio') && $e.attr('checked') === undefined) return;
    fields.push([name, $e.attr('value') ?? '']);
  });
  form.find('select').each((i, e) => {
    const $e = $(e);
    const name = $e.attr('name');
    if (!name) return;
    const sel = $e.find('option[selected]').first();
    fields.push([name, (sel.length ? sel : $e.find('option').first()).attr('value') ?? '']);
  });
  return { action: form.attr('action'), fields };
}

export { BASE };
