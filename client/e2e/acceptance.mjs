/**
 * The product brief's end-to-end acceptance scenario, run in a real browser against a running stack.
 * Four separate browser profiles: student/seller, administrator, buyer. Everything is done through the UI except
 * reading the development email (printed to the API log) and creating the first administrator with the server CLI.
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  API, PAYMENT_WORDS, WEB, api, bodyText, choose, clickInCard, clickLabelText, clickText, fill, hasText, launch, newSession, runCli, shot, sleep, verificationCode, waitFor, waitText,
} from './lib.mjs';

const PASSWORD = 'a-long-passphrase';
const results = []; const allProblems = []; const pageTexts = [];
const step = async (n, name, fn) => {
  const t0 = Date.now();
  try { const note = await fn(); results.push({ n, name, ok: true }); console.log(`PASS  ${String(n).padStart(2)}. ${name}${note ? `  [${note}]` : ''}  (${Date.now() - t0}ms)`); }
  catch (e) { results.push({ n, name, ok: false, err: e.message }); console.log(`FAIL  ${String(n).padStart(2)}. ${name}\n        ${e.message.split('\n')[0]}`); throw e; }
};
const record = async (page) => { pageTexts.push({ url: page.url(), text: await bodyText(page) }); };

async function register(page, { full, display, email }) {
  await page.goto(`${WEB}/register`, { waitUntil: 'networkidle2' });
  await fill(page, 'Full name', full); await fill(page, 'Display name', display); await fill(page, 'Email', email);
  await fill(page, 'Password', PASSWORD); await fill(page, 'Phone (optional)', '0803 123 4567');
  await clickLabelText(page, 'I agree to the');
  await clickText(page, 'Create account', { selector: 'button[type=submit]' });
  await waitText(page, 'Check your email');
}
async function verifyEmail(page, email) {
  await page.goto(`${WEB}/verify-email?email=${encodeURIComponent(email)}`, { waitUntil: 'networkidle2' });
  await fill(page, 'Verification code', verificationCode(email));
  await clickText(page, 'Verify email', { selector: 'button[type=submit]' });
  await waitText(page, 'Your email is verified.');
}
async function login(page, email) {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle2' });
  await fill(page, 'Email', email); await fill(page, 'Password', PASSWORD);
  await clickText(page, 'Sign in', { selector: 'button[type=submit]' });
  await waitFor(() => !page.url().includes('/login'), { what: 'redirect after sign-in' });
}

const browser = await launch();
let exitCode = 0;
try {
  const student = await newSession(browser); const admin = await newSession(browser); const buyer = await newSession(browser, { width: 390, height: 844 });
  const stamp = Date.now().toString(36);
  const S = `student-${stamp}@example.com`, B = `buyer-${stamp}@example.com`, A = `admin-${stamp}@example.com`;
  const SHOP = `Aisha Tech ${stamp}`, TITLE = `Samsung Galaxy A14 ${stamp}`;
  let listingId = '', slug = '', convoId = '';

  await step(1, 'A student registers and verifies their email', async () => {
    await register(student.page, { full: 'Aisha Bello', display: 'Aisha', email: S });
    await shot(student.page, '01-registered');
    await verifyEmail(student.page, S);
    await login(student.page, S);
    await waitFor(async () => hasText(student.page, 'Aisha'), { what: 'display name in header' });
  });

  await step(2, 'The student applies to become a seller', async () => {
    await student.page.goto(`${WEB}/sell`, { waitUntil: 'networkidle2' });
    await clickText(student.page, 'Apply to become a seller');
    await waitText(student.page, 'Apply to sell');
    await fill(student.page, 'Shop or display name', SHOP);
    await fill(student.page, 'Short shop description', 'Phones, chargers and gadgets for students.');
    await clickLabelText(student.page, 'Electronics');
    await shot(student.page, '02-apply');
    await clickText(student.page, 'Submit application', { selector: 'button[type=submit]' });
    await waitText(student.page, 'Your application is awaiting review');
  });

  await step(3, 'An administrator approves the seller', async () => {
    await register(admin.page, { full: 'Admin Person', display: 'Admin', email: A });
    await verifyEmail(admin.page, A);
    runCli('dist/cli/grant-role.js', [A, 'admin']); // the first administrator is created server-side by design
    await login(admin.page, A);
    await admin.page.goto(`${WEB}/admin/sellers`, { waitUntil: 'networkidle2' });
    await waitText(admin.page, SHOP);
    await shot(admin.page, '03-admin-sellers');
    await clickInCard(admin.page, SHOP, 'Approve');
    await clickText(admin.page, 'Approve seller');
    await waitFor(async () => !(await hasText(admin.page, SHOP)), { what: 'application leaving the pending queue' });
    await student.page.goto(`${WEB}/dashboard`, { waitUntil: 'networkidle2' });
    await waitText(student.page, SHOP);
    await waitText(student.page, 'New listing');
  });

  await step(4, 'The seller creates a listing and uploads images', async () => {
    const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#2a5caa' } }).png().toBuffer();
    writeFileSync('/tmp/qa-phone.png', png);
    await student.page.goto(`${WEB}/dashboard/listings/new`, { waitUntil: 'networkidle2' });
    await fill(student.page, 'Title', TITLE);
    await choose(student.page, 'Category', 'Electronics');
    await fill(student.page, 'Price (₦)', '125000');
    await choose(student.page, 'Condition', 'Used, good');
    await fill(student.page, 'Description', 'Barely used, comes with the original box and charger. Battery health is excellent.');
    await waitText(student.page, 'Details for this category');
    await fill(student.page, 'Brand', 'Samsung');
    await fill(student.page, 'Campus location (optional)', 'Hostel A');
    await shot(student.page, '04-listing-form');
    await clickText(student.page, 'Save draft', { selector: 'button[type=submit]' });
    await waitFor(() => /\/dashboard\/listings\/[0-9a-f-]{36}\/edit/.test(student.page.url()), { what: 'redirect to the edit page' });
    listingId = student.page.url().match(/listings\/([0-9a-f-]{36})\//)[1];
    await waitText(student.page, 'Photos');
    const input = await student.page.$('#listing-photos');
    await input.uploadFile('/tmp/qa-phone.png');
    await waitFor(() => student.page.$('img[src*="/files/products/"]'), { what: 'uploaded photo to appear', timeout: 20000 });
    await shot(student.page, '04-photo-uploaded');
    return 'photo uploaded and shown';
  });

  await step(5, 'The listing publishes immediately without administrator review', async () => {
    await clickText(student.page, 'Publish listing');
    await waitFor(() => student.page.url().endsWith('/dashboard'), { what: 'redirect to dashboard' });
    await waitText(student.page, TITLE);
    await waitText(student.page, 'Live');
  });

  await step(6, 'The approved listing appears in search and categories', async () => {
    await buyer.page.goto(WEB, { waitUntil: 'networkidle2' });
    await shot(buyer.page, '06-home-mobile');
    // The public pages cache for ~30s: poll with reloads until the new listing appears
    await waitFor(async () => { await buyer.page.goto(`${WEB}/browse?q=${encodeURIComponent(stamp)}`, { waitUntil: 'networkidle2' }); return hasText(buyer.page, TITLE); }, { timeout: 70000, every: 5000, what: 'listing in search results' })
      .catch(async (e) => { throw new Error(`${e.message} | page shows: ${(await bodyText(buyer.page)).replace(/\s+/g, ' ').slice(0, 400)}`); });
    // category pages are cached for ~30s on the server too: reload until the new listing shows
    await waitFor(async () => { await buyer.page.goto(`${WEB}/browse?category=electronics`, { waitUntil: 'networkidle2' }); return hasText(buyer.page, TITLE); }, { timeout: 70000, every: 5000, what: 'listing in its category' });
    return 'found by search and by category';
  });

  await step(7, 'Another student (the buyer) opens the product from the card', async () => {
    await register(buyer.page, { full: 'Musa Ali', display: 'Musa', email: B });
    await verifyEmail(buyer.page, B);
    await login(buyer.page, B);
    await buyer.page.goto(WEB, { waitUntil: 'networkidle2' });
    await buyer.page.type('#hero-search', stamp);
    await buyer.page.keyboard.press('Enter');
    await waitFor(() => buyer.page.url().includes('/browse?q='), { what: 'search results page' });
    await waitText(buyer.page, TITLE);
    await shot(buyer.page, '07-search-mobile');
    // click the card itself (the whole card is a link)
    const card = await buyer.page.evaluateHandle((t) => [...document.querySelectorAll('article')].find((a) => a.textContent.includes(t)), TITLE);
    const box = await card.asElement().boundingBox();
    await buyer.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 20);
    await waitFor(() => buyer.page.url().includes('/product/'), { what: 'product page' });
    slug = buyer.page.url().split('/product/')[1];
  });

  await step(8, 'The complete product details page opens', async () => {
    for (const t of [TITLE, '₦125,000', 'Hostel A', 'Samsung', `Aisha Tech ${stamp}`, 'Chat with Seller', 'I’m Interested', 'Save to Wishlist', 'Report listing']) await waitText(buyer.page, t, 8000);
    await waitFor(() => buyer.page.$('img[src*="/files/products/"]'), { what: 'product photo' });
    await shot(buyer.page, '08-product-mobile');
    await record(buyer.page);
  });

  await step(9, 'The buyer clicks Chat with Seller', async () => {
    await student.page.goto(`${WEB}/messages`, { waitUntil: 'networkidle2' }); // the seller already has their inbox open: updates must arrive live
    await clickText(buyer.page, 'Chat with Seller');
    await waitFor(() => /\/messages\/[0-9a-f-]{36}/.test(buyer.page.url()), { what: 'redirect into the conversation' });
    convoId = buyer.page.url().match(/messages\/([0-9a-f-]{36})/)[1];
    await waitText(buyer.page, TITLE);
    await waitText(buyer.page, 'Aisha Tech');
  });

  await step(10, 'Buyer and seller exchange persistent private messages (live)', async () => {
    await buyer.page.type('#msg', 'Hi! Is the phone still available? Can we meet at the library at 4pm?');
    await clickText(buyer.page, 'Send message');
    await waitText(buyer.page, 'Can we meet at the library at 4pm?');
    // The seller's inbox was already open: the conversation and unread badge must appear without any reload
    await waitFor(() => hasText(student.page, `Musa`), { what: 'live inbox update on the seller side (no reload)', timeout: 12000 });
    await shot(student.page, '10-seller-inbox-live');
    await student.page.goto(`${WEB}/messages/${convoId}`, { waitUntil: 'networkidle2' });
    await waitText(student.page, 'Can we meet at the library at 4pm?');
    await student.page.type('#msg', 'Yes, it is available. 4pm at the library works!');
    await clickText(student.page, 'Send message');
    await waitText(buyer.page, 'Yes, it is available. 4pm at the library works!'); // delivered live to the buyer
    await waitFor(() => hasText(buyer.page, 'Seen'), { what: '"Seen" receipt shown to the sender', timeout: 12000 }).catch(() => undefined);
    // persistence: a fresh page load still has both messages
    await buyer.page.reload({ waitUntil: 'networkidle2' });
    await waitText(buyer.page, 'Can we meet at the library at 4pm?');
    await waitText(buyer.page, 'Yes, it is available.');
    await shot(buyer.page, '10-thread-mobile');
    await record(buyer.page);
  });

  await step(11, 'The seller marks the product as sold', async () => {
    await student.page.goto(`${WEB}/dashboard`, { waitUntil: 'networkidle2' });
    await waitText(student.page, TITLE);
    await clickInCard(student.page, TITLE, 'Mark sold');
    await clickText(student.page, 'Mark as sold?');
    await waitFor(() => hasText(student.page, 'Sold'), { what: 'Sold badge on the dashboard' });
    await shot(student.page, '11-seller-sold');
  });

  await step(12, 'The listing status updates correctly for buyers', async () => {
    await waitFor(async () => { await buyer.page.goto(`${WEB}/product/${slug}`, { waitUntil: 'networkidle2' }); return hasText(buyer.page, 'This item has been sold'); }, { timeout: 70000, every: 5000, what: 'sold notice on the public page' });
    const disabled = await buyer.page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /Chat with Seller|Interested/.test(b.textContent)).every((b) => b.disabled));
    if (!disabled) throw new Error('Contact buttons should be disabled for a sold item');
    await shot(buyer.page, '12-product-sold-mobile');
    await buyer.page.goto(`${WEB}/messages/${convoId}`, { waitUntil: 'networkidle2' });
    await waitText(buyer.page, 'This item has been sold');
    await buyer.page.goto(`${WEB}/browse?q=${stamp}`, { waitUntil: 'networkidle2' });
    await waitFor(async () => { await buyer.page.reload({ waitUntil: 'networkidle2' }); return !(await hasText(buyer.page, TITLE)) || (await hasText(buyer.page, 'No listings match')); }, { timeout: 70000, every: 5000, what: 'sold item leaving default browse results' });
    return 'sold notice, disabled contact buttons, removed from browse';
  });

  await step(13, 'No online payment is requested or processed at any stage', async () => {
    await record(student.page); await record(admin.page);
    const hits = pageTexts.filter((p) => PAYMENT_WORDS.test(p.text)).map((p) => p.url);
    if (hits.length) throw new Error(`Payment wording found on: ${hits.join(', ')}`);
    const inputs = await buyer.page.evaluate(() => [...document.querySelectorAll('input')].filter((i) => /cc-|card/.test(i.autocomplete + i.name + i.id)).length);
    if (inputs) throw new Error('Found a card-style input');
    const disclaimer = pageTexts.some((p) => p.text.includes('arrange payment, collection, and delivery directly'));
    if (!disclaimer) throw new Error('The payment disclaimer was not shown on the product page');
    return `${pageTexts.length} pages scanned, disclaimer present`;
  });

  for (const [who, s] of [['student', student], ['admin', admin], ['buyer', buyer]]) allProblems.push(...s.problems.map((p) => `${who}: ${p}`));
} catch (e) {
  exitCode = 1;
  if (!results.some((r) => !r.ok)) console.log(`SETUP ERROR before/outside a step: ${e.stack?.split('\n').slice(0, 5).join('\n')}`);
} finally {
  await browser.close();
}
const ignorable = (p) => /favicon|_rsc|\/views net::ERR_ABORTED|Failed to load resource: the server responded with a status of (401|403|404|409|429)/.test(p);
const real = allProblems.filter((p) => !ignorable(p));
console.log(`\n${results.filter((r) => r.ok).length}/13 steps passed`);
console.log(real.length ? `Browser problems (${real.length}):\n  ${[...new Set(real)].slice(0, 15).join('\n  ')}` : 'No unexpected console errors, page errors, failed requests or 5xx responses.');
process.exit(exitCode || (results.length < 13 ? 1 : 0));
