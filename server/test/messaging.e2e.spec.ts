import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

jest.setTimeout(30_000); // setup hashes passwords (argon2) and can be slow on busy machines

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://sazu:sazu_dev_password@localhost:5432/sazu_test';
process.env.DATABASE_URL = TEST_DB;
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.THROTTLE_AUTH_LIMIT = '100000';
process.env.THROTTLE_VERIFY_LIMIT = '100000';
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_WRITE_LIMIT = '100000';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'sazu-msg-'));

import runner from 'node-pg-migrate';
import { Pool } from 'pg';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailMessage, MailService } from '../src/mail/mail.service';
import { SellerAccountService } from '../src/sellers/seller-account.service';

const PASSWORD = 'correct-horse-battery';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Messaging, notifications, blocking, reports and realtime (real PostgreSQL + real WebSockets)', () => {
  let app: INestApplication; let pool: Pool; let sellers: SellerAccountService; let jwt: JwtService; let port: number;
  const outbox: MailMessage[] = [];
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const ids: Record<string, string> = {};
  const sockets: Socket[] = [];

  async function user(email: string, name = email.split('@')[0]!, verify = true): Promise<string> {
    await api().post('/api/v1/auth/register').send({ fullName: `${name} Person`, displayName: `User ${name}`, email, password: PASSWORD, acceptTerms: true }).expect(202);
    if (verify) {
      const code = [...outbox].reverse().find((m) => m.to === email)!.text.match(/verification code:\s*\n\n(\d{8})/i)![1];
      await api().post('/api/v1/auth/verify-email').send({ email, code }).expect(204);
    }
    const res = await api().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    ids[email] = res.body.data.user.id;
    return res.body.data.accessToken;
  }
  let seller: string; let sellerUserId: string; let sellerId: string; let buyer: string; let buyerUserId: string;
  async function product(title = 'Samsung Galaxy A14'): Promise<string> {
    const r = await pool.query(
      `INSERT INTO products (seller_id, category_id, slug, title, description, price_kobo, status, availability, published_at)
       VALUES ($1, (SELECT id FROM categories WHERE slug = 'electronics'), $2, $3, 'A nice item in good condition.', 12500000, 'published', 'available', now()) RETURNING id`,
      [sellerId, title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 7), title]);
    return r.rows[0].id;
  }
  const startConvo = (t: string, productId: string) => api().post('/api/v1/conversations').set(auth(t)).send({ productId });
  const send = (t: string, convo: string, body: string) => api().post(`/api/v1/conversations/${convo}/messages`).set(auth(t)).send({ body });
  const setSetting = (k: string, v: unknown) => pool.query('UPDATE platform_settings SET value = $2::jsonb WHERE key = $1', [k, JSON.stringify(v)]);
  let convo: string;

  function connect(token: string | undefined, origin = 'http://localhost:3000'): Promise<{ socket: Socket; outcome: 'ready' | 'auth_error' | 'connect_error' }> {
    return new Promise((resolve) => {
      const socket = io(`http://localhost:${port}`, { transports: ['websocket'], auth: token === undefined ? {} : { token }, extraHeaders: { Origin: origin }, reconnection: false, forceNew: true });
      sockets.push(socket);
      socket.on('ready', () => resolve({ socket, outcome: 'ready' }));
      socket.on('auth_error', () => resolve({ socket, outcome: 'auth_error' }));
      socket.on('connect_error', () => resolve({ socket, outcome: 'connect_error' }));
    });
  }
  const nextEvent = <T = unknown>(socket: Socket, event: string, ms = 2500): Promise<T | 'timeout'> =>
    new Promise((resolve) => { const t = setTimeout(() => resolve('timeout'), ms); socket.once(event, (p: T) => { clearTimeout(t); resolve(p); }); });

  beforeAll(async () => {
    await runner({ databaseUrl: TEST_DB, dir: join(__dirname, '../migrations'), direction: 'up', migrationsTable: 'pgmigrations', count: Infinity, log: () => undefined });
    pool = new Pool({ connectionString: TEST_DB });
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService).useValue({ send: async (m: MailMessage) => void outbox.push(m) }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    sellers = app.get(SellerAccountService); jwt = app.get(JwtService);
  });
  afterAll(async () => { sockets.forEach((s) => s.close()); await app.close(); await pool.end(); });
  afterEach(() => { sockets.splice(0).forEach((s) => s.close()); });
  beforeEach(async () => {
    outbox.length = 0;
    await pool.query('TRUNCATE users CASCADE');
    await pool.query('UPDATE categories SET is_active = true');
    await pool.query(`INSERT INTO platform_settings (key, value) VALUES ('max_new_conversations_per_day','30'),('max_wishlist_items','200'),('seller_approval_required','true'),
      ('max_messages_per_minute','20'),('max_reports_per_day','20')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    seller = await user('seller@example.com', 'seller'); sellerUserId = ids['seller@example.com']!;
    sellerId = (await api().post('/api/v1/sellers/apply').set(auth(seller)).send({ shopName: 'Aisha Tech', categorySlugs: ['electronics'] }).expect(201)).body.data.id;
    await sellers.review(sellerId, 'approve');
    buyer = await user('buyer@example.com', 'buyer'); buyerUserId = ids['buyer@example.com']!;
    convo = (await startConvo(buyer, await product()).expect(200)).body.data.id;
    await pool.query('DELETE FROM notifications'); // start each test with a clean slate (setup approved the seller)
  });

  describe('unread counts and read receipts', () => {
    it('counts unread messages per conversation and in total, and clears them when read', async () => {
      await send(buyer, convo, 'Hello').expect(201); await send(buyer, convo, 'Is it available?').expect(201);
      expect((await api().get('/api/v1/conversations').set(auth(seller))).body.data[0].unreadCount).toBe(2);
      expect((await api().get('/api/v1/conversations/unread-count').set(auth(seller))).body.data.count).toBe(2);
      expect((await api().get('/api/v1/conversations').set(auth(buyer))).body.data[0].unreadCount).toBe(0); // own messages are never "unread"
      expect((await api().get('/api/v1/seller/dashboard').set(auth(seller))).body.data.unreadMessages).toBe(2);
      const r = await api().post(`/api/v1/conversations/${convo}/read`).set(auth(seller)).expect(200);
      expect(r.body.data.unreadMessages).toBe(0);
      expect((await api().get('/api/v1/conversations/unread-count').set(auth(seller))).body.data.count).toBe(0);
      await send(buyer, convo, 'One more').expect(201);
      expect((await api().get(`/api/v1/conversations/${convo}`).set(auth(seller))).body.data.unreadCount).toBe(1);
    });
    it('shows read receipts on a sender’s own messages only', async () => {
      await send(buyer, convo, 'Hi there').expect(201); await send(seller, convo, 'Hello!').expect(201);
      let msgs = (await api().get(`/api/v1/conversations/${convo}/messages`).set(auth(buyer))).body.data;
      expect(msgs.map((m: { mine: boolean; read: boolean | null }) => [m.mine, m.read])).toEqual([[true, false], [false, null]]);
      await api().post(`/api/v1/conversations/${convo}/read`).set(auth(seller)).expect(200);
      msgs = (await api().get(`/api/v1/conversations/${convo}/messages`).set(auth(buyer))).body.data;
      expect(msgs[0].read).toBe(true); expect(msgs[1].read).toBeNull();
      await send(buyer, convo, 'Later message').expect(201);
      msgs = (await api().get(`/api/v1/conversations/${convo}/messages`).set(auth(buyer))).body.data;
      expect(msgs.filter((m: { mine: boolean }) => m.mine).map((m: { read: boolean }) => m.read)).toEqual([true, false]);
    });
    it('only participants can mark a conversation read', async () => {
      const outsider = await user('outsider@example.com');
      await api().post(`/api/v1/conversations/${convo}/read`).set(auth(outsider)).expect(404);
      await api().post(`/api/v1/conversations/${convo}/read`).expect(401);
    });
  });

  describe('notifications', () => {
    it('notifies only the recipient, links to the conversation, and never notifies the sender', async () => {
      await send(buyer, convo, 'Hello, is it available?').expect(201);
      const n = (await api().get('/api/v1/notifications').set(auth(seller)).expect(200)).body;
      expect(n.data).toHaveLength(1);
      expect(n.data[0]).toMatchObject({ type: 'new_message', title: 'New message from User buyer', body: 'Hello, is it available?', link: `/messages/${convo}`, read: false });
      expect(n.meta.unreadCount).toBe(1);
      expect((await api().get('/api/v1/notifications').set(auth(buyer))).body.data).toEqual([]);
      await send(seller, convo, 'Yes it is').expect(201);
      const b = (await api().get('/api/v1/notifications').set(auth(buyer))).body.data;
      expect(b[0].title).toBe('New message from Aisha Tech'); // sellers appear under their shop name
    });
    it('folds many messages into one unread notification, and starts a new one after it is read', async () => {
      for (const t of ['one', 'two', 'three']) await send(buyer, convo, t).expect(201);
      let list = (await api().get('/api/v1/notifications').set(auth(seller))).body.data;
      expect(list).toHaveLength(1); expect(list[0].data.count).toBe(3); expect(list[0].body).toBe('three');
      await api().post(`/api/v1/conversations/${convo}/read`).set(auth(seller)).expect(200); // reading clears it
      expect((await api().get('/api/v1/notifications').set(auth(seller))).body.meta.unreadCount).toBe(0);
      await send(buyer, convo, 'four').expect(201);
      list = (await api().get('/api/v1/notifications').set(auth(seller))).body.data;
      expect(list).toHaveLength(2); expect(list[0]).toMatchObject({ read: false, body: 'four' });
    });
    it('marks one or all as read, paginates, and keeps notifications private', async () => {
      const second = await startConvo(buyer, await product('Second phone')).expect(200);
      await send(buyer, convo, 'a'); await send(buyer, second.body.data.id, 'b');
      const list = (await api().get('/api/v1/notifications?pageSize=1').set(auth(seller))).body;
      expect(list.meta).toMatchObject({ total: 2, totalPages: 2, unreadCount: 2 });
      const id = list.data[0].id;
      const outsider = await user('outsider@example.com');
      await api().patch(`/api/v1/notifications/${id}/read`).set(auth(outsider)).expect(404);
      await api().patch(`/api/v1/notifications/${id}/read`).set(auth(seller)).expect(204);
      await api().patch(`/api/v1/notifications/${id}/read`).set(auth(seller)).expect(204); // idempotent
      expect((await api().get('/api/v1/notifications/unread-count').set(auth(seller))).body.data.count).toBe(1);
      await api().post('/api/v1/notifications/read-all').set(auth(seller)).expect(204);
      expect((await api().get('/api/v1/notifications/unread-count').set(auth(seller))).body.data.count).toBe(0);
      await api().patch('/api/v1/notifications/not-a-uuid/read').set(auth(seller)).expect(400);
      await api().get('/api/v1/notifications').expect(401);
      expect((await api().get('/api/v1/notifications').set(auth(outsider))).body.data).toEqual([]);
    });
    it('only ever links to same-site paths (database constraint)', async () => {
      await expect(pool.query(`INSERT INTO notifications (user_id, type, title, link) VALUES ($1, 'moderation_action', 't', 'https://evil.example')`, [buyerUserId])).rejects.toThrow();
      await expect(pool.query(`INSERT INTO notifications (user_id, type, title, link) VALUES ($1, 'moderation_action', 't', '//evil.example')`, [buyerUserId])).rejects.toThrow();
      await pool.query(`INSERT INTO notifications (user_id, type, title, link) VALUES ($1, 'moderation_action', 't', '/dashboard')`, [buyerUserId]);
    });
    it('tells sellers about application decisions with the reason', async () => {
      const t = await user('newshop@example.com');
      const app1 = (await api().post('/api/v1/sellers/apply').set(auth(t)).send({ shopName: 'Fresh Shop', categorySlugs: ['electronics'] }).expect(201)).body.data.id;
      await sellers.review(app1, 'reject', 'Please add a clearer description.');
      await sellers.review(app1, 'approve').catch(() => undefined); // rejected -> cannot approve directly
      await api().post('/api/v1/sellers/me/submit').set(auth(t)).expect(200);
      await sellers.review(app1, 'approve');
      await sellers.review(app1, 'suspend', 'Counterfeit reports.');
      await sellers.review(app1, 'reinstate');
      const types = (await api().get('/api/v1/notifications?pageSize=10').set(auth(t))).body.data.map((n: { type: string }) => n.type);
      expect(types).toEqual(['seller_reinstated', 'seller_suspended', 'seller_approved', 'seller_rejected']);
      const rejected = (await api().get('/api/v1/notifications?pageSize=10').set(auth(t))).body.data.find((n: { type: string }) => n.type === 'seller_rejected');
      expect(rejected).toMatchObject({ body: 'Please add a clearer description.', link: '/dashboard/settings' });
    });
  });

  describe('blocking', () => {
    it('stops messaging both ways and tells nobody who blocked whom', async () => {
      await send(buyer, convo, 'Before the block').expect(201);
      await api().post(`/api/v1/conversations/${convo}/block`).set(auth(seller)).expect(204);
      await api().post(`/api/v1/conversations/${convo}/block`).set(auth(seller)).expect(204); // idempotent
      expect((await send(buyer, convo, 'Can you hear me?').expect(403)).body.message).toBe('You can’t send messages in this conversation.');
      expect((await send(seller, convo, 'I changed my mind').expect(403)).body.message).toMatch(/You’ve blocked this person/);
      const asSeller = (await api().get(`/api/v1/conversations/${convo}`).set(auth(seller))).body.data;
      const asBuyer = (await api().get(`/api/v1/conversations/${convo}`).set(auth(buyer))).body.data;
      expect(asSeller).toMatchObject({ blockedByMe: true, canSend: false });
      expect(asBuyer).toMatchObject({ blockedByMe: false, canSend: false }); // no hint that the seller is the blocker
      expect((await api().get(`/api/v1/conversations/${convo}/messages`).set(auth(buyer))).body.data).toHaveLength(1); // history stays readable
      expect((await pool.query(`SELECT count(*)::int AS n FROM messages`)).rows[0].n).toBe(1);
    });
    it('blocks new conversations in both directions and unblocking restores messaging', async () => {
      const other = await product('Another listing');
      await api().post(`/api/v1/conversations/${convo}/block`).set(auth(buyer)).expect(204);
      expect((await startConvo(buyer, other).expect(403)).body.message).toMatch(/You’ve blocked this seller/);
      await api().post(`/api/v1/conversations/${convo}/block`).set(auth(seller)).expect(204);
      await api().delete(`/api/v1/conversations/${convo}/block`).set(auth(buyer)).expect(204);
      expect((await startConvo(buyer, other).expect(403)).body.message).toBe('You can’t message this seller.'); // seller still blocks the buyer
      await api().delete(`/api/v1/conversations/${convo}/block`).set(auth(seller)).expect(204);
      await startConvo(buyer, other).expect(200);
      await send(buyer, convo, 'Back to normal').expect(201);
    });
    it('only participants can block or unblock', async () => {
      const outsider = await user('outsider@example.com');
      await api().post(`/api/v1/conversations/${convo}/block`).set(auth(outsider)).expect(404);
      await api().delete(`/api/v1/conversations/${convo}/block`).set(auth(outsider)).expect(404);
      expect((await pool.query('SELECT count(*)::int AS n FROM user_blocks')).rows[0].n).toBe(0);
    });
  });

  describe('reports', () => {
    let productId: string;
    const report = (t: string | null, body: object) => { const r = api().post('/api/v1/reports').send(body); return t ? r.set(auth(t)) : r; };
    beforeEach(async () => { productId = (await pool.query('SELECT product_id FROM conversations WHERE id = $1', [convo])).rows[0].product_id; });

    it('requires a signed-in user with a verified email', async () => {
      await report(null, { targetType: 'product', targetId: productId, reason: 'scam' }).expect(401);
      const unverified = await user('unverified@example.com', 'unverified', false);
      await report(unverified, { targetType: 'product', targetId: productId, reason: 'scam' }).expect(403);
    });
    it('files reports for a listing, seller, conversation and person, and exposes nothing about the reported party', async () => {
      const cases = [
        { targetType: 'product', targetId: productId, reason: 'counterfeit', details: 'Looks fake.' },
        { targetType: 'seller', targetId: sellerId, reason: 'scam' },
        { targetType: 'conversation', targetId: convo, reason: 'harassment' },
        { targetType: 'user', targetId: sellerUserId, reason: 'spam' },
      ];
      for (const c of cases) {
        const r = await report(buyer, c).expect(201);
        expect(Object.keys(r.body.data).sort()).toEqual(['createdAt', 'id', 'status']);
        expect(r.body.data.status).toBe('open');
      }
      expect((await pool.query('SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1', [buyerUserId])).rows[0].n).toBe(4);
    });
    it('rejects duplicate open reports but allows a new one after resolution', async () => {
      const body = { targetType: 'product', targetId: productId, reason: 'misleading' };
      await report(buyer, body).expect(201);
      expect((await report(buyer, body).expect(409)).body.message).toMatch(/already reported/);
      await pool.query(`UPDATE reports SET status = 'resolved'`);
      await report(buyer, body).expect(201);
    });
    it('validates input and targets', async () => {
      await report(buyer, { targetType: 'product', targetId: productId, reason: 'because' }).expect(400);
      await report(buyer, { targetType: 'planet', targetId: productId, reason: 'scam' }).expect(400);
      await report(buyer, { targetType: 'product', targetId: 'nope', reason: 'scam' }).expect(400);
      await report(buyer, { targetType: 'product', targetId: productId, reason: 'scam', details: 'x'.repeat(1001) }).expect(400);
      await report(buyer, { targetType: 'product', targetId: productId, reason: 'scam', reporterId: 'x' }).expect(400);
      await report(buyer, { targetType: 'product', targetId: '3b241101-e2bb-4255-8caf-4136c566a962', reason: 'scam' }).expect(404);
      await pool.query(`UPDATE products SET status = 'draft'`);
      await report(buyer, { targetType: 'product', targetId: productId, reason: 'scam' }).expect(404); // can't report what isn't public
    });
    it('blocks self-reports and probing of strangers', async () => {
      await report(seller, { targetType: 'product', targetId: productId, reason: 'scam' }).expect(400);
      await report(seller, { targetType: 'seller', targetId: sellerId, reason: 'scam' }).expect(400);
      await report(buyer, { targetType: 'user', targetId: buyerUserId, reason: 'spam' }).expect(400);
      const stranger = await user('stranger@example.com');
      await report(stranger, { targetType: 'conversation', targetId: convo, reason: 'spam' }).expect(404);
      await report(stranger, { targetType: 'user', targetId: sellerUserId, reason: 'spam' }).expect(404); // no shared conversation
      await report(stranger, { targetType: 'user', targetId: '3b241101-e2bb-4255-8caf-4136c566a962', reason: 'spam' }).expect(404);
    });
    it('limits how many reports one person can file per day', async () => {
      await setSetting('max_reports_per_day', 2);
      await report(buyer, { targetType: 'product', targetId: productId, reason: 'scam' }).expect(201);
      await report(buyer, { targetType: 'seller', targetId: sellerId, reason: 'scam' }).expect(201);
      await report(buyer, { targetType: 'conversation', targetId: convo, reason: 'spam' }).expect(429);
    });
  });

  describe('spam protection', () => {
    it('limits messages per minute per user, without affecting other people', async () => {
      await setSetting('max_messages_per_minute', 3);
      for (let i = 0; i < 3; i++) await send(buyer, convo, `msg ${i}`).expect(201);
      expect((await send(buyer, convo, 'msg 4').expect(429)).body.message).toMatch(/too quickly/);
      await send(seller, convo, 'The seller is unaffected').expect(201);
    });
    it('stops the same long message being blasted to many different conversations', async () => {
      await setSetting('max_messages_per_minute', 1000);
      const blast = 'Hello, please check out my shop for cheap phones!!';
      const convos: string[] = [];
      for (let i = 0; i < 7; i++) convos.push((await startConvo(buyer, await product(`Item ${i}`)).expect(200)).body.data.id);
      for (let i = 0; i < 6; i++) await send(buyer, convos[i]!, blast).expect(201);
      expect((await send(buyer, convos[6]!, blast).expect(429)).body.message).toMatch(/looks like spam/);
      await send(buyer, convos[6]!, 'A personal message about your phone').expect(201);
      await send(buyer, convos[0]!, 'ok').expect(201); // short replies are never flagged
    });
  });

  describe('real-time delivery over authenticated WebSockets', () => {
    const tokenFor = (userId: string, expiresIn = 600) => jwt.signAsync({ sub: userId }, { algorithm: 'HS256', expiresIn });

    it('refuses connections without valid credentials', async () => {
      expect((await connect(undefined)).outcome).toBe('auth_error');
      expect((await connect('not-a-token')).outcome).toBe('auth_error');
      const forged = Buffer.from('{"alg":"none"}').toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: buyerUserId })).toString('base64url') + '.';
      expect((await connect(forged)).outcome).toBe('auth_error');
      expect((await connect(await jwt.signAsync({ sub: buyerUserId }, { secret: 'a-completely-different-secret-value-1234', algorithm: 'HS256' }))).outcome).toBe('auth_error');
      expect((await connect(await tokenFor(buyerUserId, 1).then(async (t) => { await wait(1500); return t; }))).outcome).toBe('auth_error'); // expired
    });
    it('refuses accounts that are no longer active and unknown origins', async () => {
      const t = await tokenFor(buyerUserId);
      expect((await connect(t, 'http://evil.example')).outcome).toBe('connect_error');
      await pool.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [buyerUserId]);
      expect((await connect(t)).outcome).toBe('auth_error');
    });
    it('pushes new messages to the recipient and the sender’s other tabs, and to nobody else', async () => {
      const stranger = await user('stranger@example.com');
      const sellerSock = (await connect(await tokenFor(sellerUserId))).socket;
      const buyerTab1 = (await connect(await tokenFor(buyerUserId))).socket;
      const buyerTab2 = (await connect(await tokenFor(buyerUserId))).socket;
      const strangerSock = (await connect(await tokenFor(ids['stranger@example.com']!))).socket;
      const toSeller = nextEvent<{ conversationId: string; message: { body: string; mine: boolean } }>(sellerSock, 'message:new');
      const toTab2 = nextEvent<{ message: { mine: boolean } }>(buyerTab2, 'message:new');
      const toStranger = nextEvent(strangerSock, 'message:new', 800);
      await send(buyer, convo, 'Live hello').expect(201);
      expect(await toSeller).toMatchObject({ conversationId: convo, message: { body: 'Live hello', mine: false } });
      expect(await toTab2).toMatchObject({ message: { mine: true } });
      expect(await toStranger).toBe('timeout');
      void stranger; void buyerTab1;
    });
    it('pushes notifications and read receipts', async () => {
      const sellerSock = (await connect(await tokenFor(sellerUserId))).socket;
      const buyerSock = (await connect(await tokenFor(buyerUserId))).socket;
      const note = nextEvent<{ type: string; link: string; read: boolean }>(sellerSock, 'notification:new');
      await send(buyer, convo, 'Ping').expect(201);
      expect(await note).toMatchObject({ type: 'new_message', link: `/messages/${convo}`, read: false });
      const receipt = nextEvent<{ conversationId: string }>(buyerSock, 'conversation:read');
      await api().post(`/api/v1/conversations/${convo}/read`).set(auth(seller)).expect(200);
      expect(await receipt).toEqual({ conversationId: convo });
    });
    it('does not deliver anything to a blocked sender’s failed attempts', async () => {
      const sellerSock = (await connect(await tokenFor(sellerUserId))).socket;
      await api().post(`/api/v1/conversations/${convo}/block`).set(auth(seller)).expect(204);
      const nothing = nextEvent(sellerSock, 'message:new', 700);
      await send(buyer, convo, 'You will never see this').expect(403);
      expect(await nothing).toBe('timeout');
    });
    it('closes a connection exactly when its token expires', async () => {
      const { socket, outcome } = await connect(await tokenFor(buyerUserId, 2));
      expect(outcome).toBe('ready');
      const expired = nextEvent(socket, 'auth_expired', 4000);
      const closed = new Promise<string>((resolve) => socket.once('disconnect', (reason) => resolve(reason)));
      expect(await expired).not.toBe('timeout');
      expect(await closed).toBe('io server disconnect');
    });
    it('caps simultaneous connections per account', async () => {
      const t = await tokenFor(buyerUserId);
      for (let i = 0; i < 8; i++) expect((await connect(t)).outcome).toBe('ready');
      expect((await connect(t)).outcome).toBe('auth_error');
    });
  });
});
