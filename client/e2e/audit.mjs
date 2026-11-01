/**
 * Real-browser audit of every screen at phone, tablet and desktop sizes:
 * horizontal overflow, console/page errors, 5xx responses, missing h1/title/lang, and WCAG accessibility violations (axe-core).
 * It creates its own data through the API (and the server CLI for the first admin), then logs in through the UI as each role.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { API, WEB, api, clickText, fill, launch, newSession, runCli, shot, sleep, verificationCode, waitFor } from './lib.mjs';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const PASSWORD = 'a-long-passphrase';
const VIEWPORTS = [{ name: 'phone', width: 375, height: 812 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1280, height: 800 }];
const stamp = Date.now().toString(36);

async function account(email, name) {
  await api('/auth/register', { method: 'POST', body: { fullName: `${name} Person`, displayName: name, email, password: PASSWORD, acceptTerms: true } });
  await api('/auth/verify-email', { method: 'POST', body: { email, code: verificationCode(email) } });
  const r = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  return { email, token: r.data.accessToken, id: r.data.user.id };
}
async function uiLogin(page, email) {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle2' });
  await fill(page, 'Email', email); await fill(page, 'Password', PASSWORD);
  await clickText(page, 'Sign in', { selector: 'button[type=submit]' });
  await waitFor(() => !page.url().includes('/login'), { what: 'sign-in redirect' });
}

// ---------- data ----------
const admin = await account(`aud-admin-${stamp}@example.com`, 'Adaeze'); runCli('dist/cli/grant-role.js', [admin.email, 'admin']);
const seller = await account(`aud-seller-${stamp}@example.com`, 'Aisha'); const buyer = await account(`aud-buyer-${stamp}@example.com`, 'Musa');
const shop = (await api('/sellers/apply', { method: 'POST', token: seller.token, body: { shopName: `Audit Shop ${stamp}`, description: 'Gadgets and chargers for students.', categorySlugs: ['electronics'] } })).data;
await api(`/admin/sellers/${shop.id}/review`, { method: 'PATCH', token: admin.token, body: { decision: 'approve' } });
const png = await sharp({ create: { width: 1000, height: 750, channels: 3, background: '#2a5caa' } }).png().toBuffer();
async function listing(title, publish) {
  const p = (await api('/products', { method: 'POST', token: seller.token, body: { title, description: 'Barely used, comes with the original box and charger. Battery health is excellent.', categorySlug: 'electronics', priceKobo: 12500000, condition: 'used_good', campusLocation: 'Hostel A', attributes: { brand: 'Samsung' } } })).data;
  const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'a.png'); fd.append('altText', 'Front of the phone');
  await fetch(`${API}/products/${p.id}/images`, { method: 'POST', headers: { authorization: `Bearer ${seller.token}` }, body: fd });
  await api(`/products/${p.id}/submit`, { method: 'POST', token: seller.token });
  if (publish) await api(`/admin/products/${p.id}/review`, { method: 'PATCH', token: admin.token, body: { decision: 'approve' } });
  return p;
}
const live = await listing(`Samsung Galaxy A14 ${stamp}`, true); const pending = await listing(`Pending phone ${stamp}`, false);
const convo = (await api('/conversations', { method: 'POST', token: buyer.token, body: { productId: live.id, interested: true } })).data;
await api(`/conversations/${convo.id}/messages`, { method: 'POST', token: seller.token, body: { body: 'Yes, still available. Library at 4pm?' } });
await api(`/wishlist/${live.id}`, { method: 'POST', token: buyer.token });
const report = (await api('/reports', { method: 'POST', token: buyer.token, body: { targetType: 'conversation', targetId: convo.id, reason: 'spam' } })).data;
const adminUserId = admin.id;

const PUBLIC = ['/', '/browse', `/browse?q=${stamp}`, '/categories', '/sell', '/login', '/register', '/forgot-password', '/help', '/safety', '/contact', '/terms', '/privacy', '/about', `/product/${live.slug}`, `/seller/${shop.slug}`, '/this-page-does-not-exist'];
const BUYER = ['/account', '/wishlist', '/messages', `/messages/${convo.id}`, '/notifications'];
const SELLER = ['/dashboard', '/dashboard/listings/new', `/dashboard/listings/${live.id}/edit`, `/dashboard/listings/${live.id}/preview`, '/dashboard/settings'];
const ADMIN = ['/admin', '/admin/sellers', '/admin/listings', `/admin/listings/${pending.id}`, '/admin/reports', `/admin/reports/${report.id}`, '/admin/users', `/admin/users/${adminUserId}`, '/admin/categories', '/admin/settings', '/admin/audit'];
await sleep(1500);

// ---------- audit ----------
const browser = await launch();
const findings = []; let pagesChecked = 0;
const noise = (p) => /favicon|_rsc|\/views net::ERR_ABORTED|status of (401|403|404|409|429)|ERR_ABORTED/.test(p);

async function auditPage(session, path, vp, label) {
  const { page, problems } = session;
  problems.length = 0;
  await page.setViewport({ width: vp.width, height: vp.height });
  await page.goto(WEB + path, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => undefined);
  await page.waitForSelector('h1', { timeout: 15000 }).catch(() => undefined);
  await sleep(1200);
  const info = await page.evaluate(() => {
    const vw = window.innerWidth; const wide = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && !el.closest('[class*="overflow-x-auto"], [class*="overflow-y-auto"], pre')) { wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} (${Math.round(r.right)}px)`); if (wide.length > 3) break; }
    }
    return { h1: document.querySelectorAll('h1').length, title: document.title, lang: document.documentElement.lang, overflow: document.documentElement.scrollWidth > vw + 1, wide };
  });
  await page.evaluate(axeSource);
  const axe = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }));
  const add = (kind, detail, impact = 'minor') => findings.push({ role: label, path: path.replace(/[0-9a-f-]{36}/g, ':id'), vp: vp.name, kind, detail, impact });
  if (info.overflow) add('overflow', info.wide.join('; ') || 'page is wider than the screen', 'serious');
  if (info.h1 !== 1 && !path.includes('does-not-exist')) add('heading', `${info.h1} <h1> elements`, 'moderate');
  if (!info.title) add('title', 'empty document title', 'moderate');
  if (!info.lang) add('lang', 'html lang missing', 'serious');
  for (const v of axe.violations) add(`axe:${v.id}`, `${v.help} (${v.nodes.length}x, e.g. ${v.nodes[0].target.join(' ')})`, v.impact ?? 'minor');
  for (const p of problems.filter((x) => !noise(x))) add('browser', p.slice(0, 200), 'moderate');
  if (vp.name === 'phone' && ['/', `/product/${live.slug}`, '/dashboard', '/messages/:id', '/admin'].includes(path.replace(/[0-9a-f-]{36}/g, ':id'))) await shot(page, `audit-${label}-${path.replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}-phone`);
  pagesChecked++;
}

for (const [label, who, paths] of [['visitor', null, PUBLIC], ['buyer', buyer, BUYER], ['seller', seller, SELLER], ['admin', admin, ADMIN]]) {
  const session = await newSession(browser);
  if (who) await uiLogin(session.page, who.email);
  for (const path of paths) for (const vp of VIEWPORTS) {
    try { await auditPage(session, path, vp, label); } catch (e) { findings.push({ role: label, path, vp: vp.name, kind: 'audit-error', detail: e.message.slice(0, 160), impact: 'moderate' }); }
  }
  await session.context.close();
  console.log(`audited ${label}: ${paths.length} pages x ${VIEWPORTS.length} sizes`);
}
await browser.close();

// ---------- report ----------
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const groups = new Map();
for (const f of findings) { const k = `${f.kind}|${f.detail.split(' (')[0]}`; const g = groups.get(k) ?? { ...f, count: 0, where: new Set() }; g.count++; g.where.add(`${f.role}:${f.path}`); groups.set(k, g); }
const rows = [...groups.values()].sort((a, b) => order[a.impact] - order[b.impact] || b.count - a.count);
writeFileSync('/tmp/qa-audit.json', JSON.stringify({ pagesChecked, findings }, null, 1));
console.log(`\n${pagesChecked} page views checked (${PUBLIC.length + BUYER.length + SELLER.length + ADMIN.length} screens x ${VIEWPORTS.length} sizes). ${findings.length} findings in ${rows.length} groups.\n`);
for (const r of rows) console.log(`[${r.impact.toUpperCase()}] ${r.kind}: ${r.detail}\n    on ${r.where.size} screen(s): ${[...r.where].slice(0, 4).join(', ')}${r.where.size > 4 ? ' …' : ''}`);
if (!rows.length) console.log('No findings.');
process.exit(0);
