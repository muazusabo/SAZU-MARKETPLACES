/**
 * Real-browser QA helpers (headless Chromium via puppeteer-core).
 * Config (env): WEB_URL, API_URL, API_LOG (path to the API's log, where development emails are printed),
 * CHROME_PATH (optional: use your own Chrome instead of the bundled one), SHOTS_DIR.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
export const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
export const API_LOG = process.env.API_LOG ?? '/tmp/api.log';
export const SHOTS = process.env.SHOTS_DIR ?? '/tmp/qa-shots';
mkdirSync(SHOTS, { recursive: true });

export async function launch() {
  let executablePath = process.env.CHROME_PATH;
  let args = ['--no-sandbox'];
  if (!executablePath) {
    const { default: chromium } = await import('@sparticuz/chromium');
    executablePath = await chromium.executablePath();
    // The bundled build is tuned for AWS Lambda (single process). Several isolated profiles need normal multi-process mode.
    args = [...chromium.args.filter((a) => !['--single-process', '--no-zygote'].includes(a)), '--no-sandbox'];
  }
  return puppeteer.launch({ executablePath, args, headless: 'shell' });
}

/** A separate browser profile (cookies and storage) per person, like four people on four phones. */
export async function newSession(browser, { width = 1280, height = 900 } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  return { context, page, problems };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(fn, { timeout = 15000, every = 300, what = 'condition' } = {}) {
  const end = Date.now() + timeout; let last; let lastError = '';
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { lastError = e.message.split('\n')[0]; /* keep trying */ } await sleep(every); }
  throw new Error(`Timed out waiting for ${what}${lastError ? ` (last error: ${lastError})` : ''}`);
}

/** Finds the control tied to a visible label (matching on the label's text) and returns its element id. */
export async function idForLabel(page, text) {
  return page.evaluate((t) => {
    const labels = [...document.querySelectorAll('label')];
    const l = labels.find((x) => x.textContent.trim().startsWith(t));
    if (!l) return null;
    if (l.htmlFor) return l.htmlFor;
    const inner = l.querySelector('input,select,textarea');
    if (inner) { if (!inner.id) inner.id = `qa-${Math.random().toString(36).slice(2)}`; return inner.id; }
    return null;
  }, text);
}
export async function fill(page, label, value) {
  const id = await waitFor(() => idForLabel(page, label), { what: `field "${label}"` });
  await page.click(`[id="${id}"]`, { clickCount: 3 }).catch(() => undefined);
  await page.$eval(`[id="${id}"]`, (el) => { el.value = ''; });
  await page.type(`[id="${id}"]`, value);
}
export async function choose(page, label, valueOrText) {
  const id = await waitFor(() => idForLabel(page, label), { what: `select "${label}"` });
  const value = await page.evaluate((i, v) => { const s = document.getElementById(i); const o = [...s.options].find((x) => x.value === v || x.textContent.trim() === v); return o ? o.value : null; }, id, valueOrText);
  if (value === null) throw new Error(`Option "${valueOrText}" not found in "${label}"`);
  await page.select(`[id="${id}"]`, value);
}
export async function clickLabelText(page, text) {
  const ok = await page.evaluate((t) => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim().startsWith(t)); if (!l) return false; l.click(); return true; }, text);
  if (!ok) throw new Error(`Label "${text}" not found`);
}
/** Clicks the first visible button/link whose text matches exactly (or starts with, when partial). */
export async function clickText(page, text, { selector = 'button, a', partial = false } = {}) {
  const found = await waitFor(() => page.evaluate((sel, t, p) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled; });
    const el = els.find((e) => { const x = (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim(); return p ? x.includes(t) : x === t; });
    if (!el) return false; el.setAttribute('data-qa-click', '1'); return true;
  }, selector, text, partial), { what: `"${text}"` });
  if (found) {
    await page.click('[data-qa-click="1"]');
    // the click may navigate and detach the element: clearing the marker is best-effort
    await page.$eval('[data-qa-click="1"]', (e) => e.removeAttribute('data-qa-click')).catch(() => undefined);
  }
}
export const bodyText = (page) => page.evaluate(() => document.body.innerText);
export const hasText = async (page, t) => (await bodyText(page)).includes(t);
export const waitText = (page, t, timeout = 15000) => waitFor(() => hasText(page, t), { timeout, what: `text "${t}"` });
export const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

/** Development mail is printed to the API log: read the newest verification code for an address. */
export function verificationCode(email) {
  const log = readFileSync(API_LOG, 'utf8');
  const blocks = log.split('DEV MAIL').filter((b) => b.includes(`To: ${email}`) && b.includes('verification code:'));
  const m = blocks.at(-1)?.match(/verification code:\s*\n\n(\d{8})/i);
  if (!m) throw new Error(`No verification code found for ${email}`);
  return m[1];
}

export async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* no body */ }
  return { status: r.status, data: j && j.data !== undefined ? j.data : j };
}

export const PAYMENT_WORDS = /\b(check ?out|pay now|buy now|add to cart|credit card|card number|cvv|paystack|flutterwave|stripe)\b/i;
/** The server folder: set API_DIR, or it is found next to the client (`../server`, or `../api` in the original monorepo layout). */
function serverDir() {
  if (process.env.API_DIR) return process.env.API_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  return [resolve(here, '../../server'), resolve(here, '../../api')].find((d) => existsSync(resolve(d, 'dist/cli'))) ?? resolve(here, '../../server');
}
export function runCli(script, args) {
  return execFileSync('node', [script, ...args], { cwd: serverDir(), env: process.env, encoding: 'utf8' }).trim();
}

/** Clicks the button with this exact text inside the list item that contains `cardText` (other list items may repeat the text). */
export async function clickInCard(page, cardText, buttonText) {
  const ok = await waitFor(() => page.evaluate((c, b) => {
    const btn = [...document.querySelectorAll('li button, li a')].find((x) => x.textContent.trim() === b && x.closest('li')?.textContent.includes(c));
    if (!btn) return false; btn.setAttribute('data-qa-click', '1'); return true;
  }, cardText, buttonText), { what: `"${buttonText}" in the card for "${cardText}"` });
  if (ok) { await page.click('[data-qa-click="1"]'); await page.$eval('[data-qa-click="1"]', (e) => e.removeAttribute('data-qa-click')).catch(() => undefined); }
}
