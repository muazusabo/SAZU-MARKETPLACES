import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PRODUCT_FROM_SQL, VISIBLE_PRODUCT_SQL } from '../products/visibility';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';

const LISTING_STATE_SQL = `CASE WHEN p.id IS NULL OR p.status <> 'published' OR sp.status IS DISTINCT FROM 'approved'
  OR (p.expires_at IS NOT NULL AND p.expires_at <= now()) THEN 'removed' ELSE p.availability END`;
const OTHER_SQL = `CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END`;

/** Everything a participant sees about a conversation. Always scoped to `me` via the participants join. */
const CONVERSATION_SELECT = `
  SELECT c.id, c.created_at, c.last_message_at, (c.buyer_id = $1) AS i_am_buyer,
         op.display_name AS other_name, op.avatar_path AS other_avatar, sp.shop_name, sp.avatar_path AS shop_avatar,
         p.id AS product_id, p.slug AS product_slug, p.title AS product_title, p.price_kobo, ${LISTING_STATE_SQL} AS listing_state,
         COALESCE(img.thumb_path, img.storage_path) AS image_path,
         lm.body AS last_body, lm.sender_id AS last_sender, lm.created_at AS last_at,
         (SELECT count(*)::int FROM messages um WHERE um.conversation_id = c.id AND um.sender_id <> $1
            AND um.id > COALESCE(me.last_read_message_id, 0)) AS unread_count,
         EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = $1 AND b.blocked_id = ${OTHER_SQL}) AS blocked_by_me,
         EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = ${OTHER_SQL} AND b.blocked_id = $1) AS blocked_me
  FROM conversations c
  JOIN conversation_participants me ON me.conversation_id = c.id AND me.user_id = $1
  JOIN profiles op ON op.user_id = ${OTHER_SQL}
  LEFT JOIN seller_profiles sp ON sp.user_id = c.seller_id
  LEFT JOIN products p ON p.id = c.product_id
  LEFT JOIN LATERAL (SELECT storage_path, thumb_path FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.created_at LIMIT 1) img ON true
  LEFT JOIN LATERAL (SELECT body, sender_id, created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) lm ON true`;

interface Participation { other_id: string; my_name: string }

@Injectable()
export class ConversationsService {
  constructor(
    private readonly db: DatabaseService, private readonly settings: SettingsService, private readonly storage: StorageService,
    private readonly realtime: RealtimeService, private readonly notifications: NotificationsService,
  ) {}

  private present(r: Record<string, unknown>, userId: string) {
    const iAmBuyer = r.i_am_buyer as boolean;
    // Buyers see the seller's shop name, sellers see the buyer's public display name. Never emails or phone numbers.
    const name = iAmBuyer ? ((r.shop_name as string | null) ?? (r.other_name as string)) : (r.other_name as string);
    const avatar = iAmBuyer ? ((r.shop_avatar as string | null) ?? (r.other_avatar as string | null)) : (r.other_avatar as string | null);
    const state = r.product_id ? (r.listing_state as string) : 'removed';
    return {
      id: r.id, role: iAmBuyer ? 'buyer' : 'seller', createdAt: r.created_at, lastMessageAt: r.last_message_at,
      counterpart: { name, avatarUrl: this.storage.publicUrl(avatar) },
      product: r.product_id ? {
        slug: r.product_slug, title: r.product_title, priceKobo: Number(r.price_kobo), imageUrl: this.storage.publicUrl(r.image_path as string | null),
        state, href: state === 'removed' ? null : `/product/${r.product_slug}`,
      } : null,
      lastMessage: r.last_body ? { body: r.last_body, mine: r.last_sender === userId, createdAt: r.last_at } : null,
      unreadCount: r.unread_count,
      blockedByMe: r.blocked_by_me,
      // Deliberately one flag: a blocked person is not told who blocked whom.
      canSend: !r.blocked_by_me && !r.blocked_me,
    };
  }

  private async blocks(a: string, b: string): Promise<{ byMe: boolean; byThem: boolean }> {
    const { rows } = await this.db.query<{ blocker_id: string }>(
      'SELECT blocker_id FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [a, b]);
    return { byMe: rows.some((r) => r.blocker_id === a), byThem: rows.some((r) => r.blocker_id === b) };
  }

  /** Participation check and the facts needed to act. 404 (not 403) for non-participants so ids can't be probed. */
  private async participation(userId: string, conversationId: string): Promise<Participation> {
    const { rows } = await this.db.query<Participation>(
      `SELECT CASE WHEN c.buyer_id = $2 THEN c.seller_id ELSE c.buyer_id END AS other_id,
              CASE WHEN c.seller_id = $2 THEN COALESCE(sp.shop_name, pr.display_name) ELSE pr.display_name END AS my_name
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $2
       JOIN profiles pr ON pr.user_id = $2 LEFT JOIN seller_profiles sp ON sp.user_id = $2
       WHERE c.id = $1`, [conversationId, userId]);
    if (!rows[0]) throw new NotFoundException('Conversation not found.');
    return rows[0];
  }

  private pushMessage(senderId: string, otherId: string, conversationId: string, m: { id: string; body: string; createdAt: Date }) {
    this.realtime.emitToUser(otherId, 'message:new', { conversationId, message: { ...m, mine: false } });
    this.realtime.emitToUser(senderId, 'message:new', { conversationId, message: { ...m, mine: true } }); // keeps the sender's other tabs in sync
  }

  /**
   * Start (or reopen) the conversation for this buyer, seller and listing. Rules are enforced here, never in the browser:
   * the listing must be public and still accept enquiries, nobody can message themselves, and blocks apply in both directions.
   */
  async start(userId: string, productId: string, interested: boolean) {
    const { rows } = await this.db.query<{ id: string; title: string; seller_user_id: string; availability: string }>(
      `SELECT p.id, p.title, p.availability, s.user_id AS seller_user_id ${PRODUCT_FROM_SQL} WHERE p.id = $1 AND ${VISIBLE_PRODUCT_SQL}`, [productId]);
    const p = rows[0];
    if (!p) throw new NotFoundException('This listing is no longer available.');
    if (p.seller_user_id === userId) throw new BadRequestException('This is your own listing. Buyers will message you here once they’re interested.');
    if (p.availability === 'sold') throw new ConflictException('This item has been sold, so new messages can’t be started.');
    if (p.availability === 'unavailable') throw new ConflictException('The seller has marked this listing as unavailable, so new messages can’t be started.');
    const blocked = await this.blocks(userId, p.seller_user_id);
    if (blocked.byMe) throw new ForbiddenException('You’ve blocked this seller. Unblock them from your messages to contact them again.');
    if (blocked.byThem) throw new ForbiddenException('You can’t message this seller.');

    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM conversations WHERE buyer_id = $1 AND seller_id = $2 AND product_id = $3', [userId, p.seller_user_id, p.id]);
    let id = existing.rows[0]?.id;
    let created = false;
    if (!id) {
      const cap = await this.settings.get('max_new_conversations_per_day');
      const today = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM conversations WHERE buyer_id = $1 AND created_at > now() - interval '24 hours'`, [userId]);
      if (today.rows[0]!.n >= cap) throw new HttpException('You’ve started a lot of conversations today. Please wait before contacting more sellers.', HttpStatus.TOO_MANY_REQUESTS);
      id = await this.db.transaction(async (c) => {
        const ins = await c.query<{ id: string }>(
          `INSERT INTO conversations (buyer_id, seller_id, product_id) VALUES ($1, $2, $3)
           ON CONFLICT (buyer_id, seller_id, product_id) DO NOTHING RETURNING id`, [userId, p.seller_user_id, p.id]);
        if (ins.rows[0]) {
          created = true;
          await c.query(`INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES ($1, $2, 'buyer'), ($1, $3, 'seller')`, [ins.rows[0].id, userId, p.seller_user_id]);
          return ins.rows[0].id;
        }
        const race = await c.query<{ id: string }>('SELECT id FROM conversations WHERE buyer_id = $1 AND seller_id = $2 AND product_id = $3', [userId, p.seller_user_id, p.id]);
        return race.rows[0]!.id; // lost a race with a parallel click: reuse theirs
      });
    }
    if (interested) {
      const body = `Hi! I’m interested in “${p.title.slice(0, 100)}”. Is it still available?`;
      // Idempotent: only when the conversation is still empty. The row lock makes parallel clicks queue up.
      const intro = await this.db.transaction(async (c) => {
        await c.query('SELECT 1 FROM conversations WHERE id = $1 FOR UPDATE', [id]);
        const r = await c.query<{ id: string; created_at: Date }>(
          `INSERT INTO messages (conversation_id, sender_id, body)
           SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = $1) RETURNING id::text AS id, created_at`, [id, userId, body]);
        if (r.rows[0]) await c.query('UPDATE conversations SET last_message_at = $2 WHERE id = $1', [id, r.rows[0].created_at]);
        return r.rows[0];
      });
      if (intro) {
        const who = await this.participation(userId, id);
        this.pushMessage(userId, p.seller_user_id, id, { id: intro.id, body, createdAt: intro.created_at });
        await this.notifications.notifyNewMessage(p.seller_user_id, id, who.my_name, body);
      }
    }
    return { id, created, productSlug: (await this.db.query<{ slug: string }>('SELECT slug FROM products WHERE id = $1', [p.id])).rows[0]!.slug };
  }

  async list(userId: string, page: number, pageSize: number) {
    const { rows } = await this.db.query<Record<string, unknown>>(
      `${CONVERSATION_SELECT} ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id LIMIT $2 OFFSET $3`, [userId, pageSize, (page - 1) * pageSize]);
    const total = (await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM conversation_participants WHERE user_id = $1', [userId])).rows[0]!.n;
    return { data: rows.map((r) => this.present(r, userId)), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async get(userId: string, conversationId: string) {
    const { rows } = await this.db.query<Record<string, unknown>>(`${CONVERSATION_SELECT} WHERE c.id = $2`, [userId, conversationId]);
    if (!rows[0]) throw new NotFoundException('Conversation not found.');
    return this.present(rows[0], userId);
  }

  /** Total unread messages across all my conversations (for the header badge). */
  async unreadTotal(userId: string): Promise<number> {
    const r = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM messages m JOIN conversation_participants p ON p.conversation_id = m.conversation_id AND p.user_id = $1
       WHERE m.sender_id <> $1 AND m.id > COALESCE(p.last_read_message_id, 0)`, [userId]);
    return r.rows[0]!.n;
  }

  async messages(userId: string, conversationId: string, before: number | undefined, limit: number) {
    const who = await this.participation(userId, conversationId);
    const [{ rows }, other] = await Promise.all([
      this.db.query<{ id: string; sender_id: string; body: string; created_at: Date }>(
        // Columns are qualified (m.id) on purpose: an unqualified ORDER BY id would sort by the text alias, not the number.
        `SELECT m.id::text AS id, m.sender_id, m.body, m.created_at FROM messages m
         WHERE m.conversation_id = $1 AND ($2::bigint IS NULL OR m.id < $2) ORDER BY m.id DESC LIMIT $3`, [conversationId, before ?? null, limit + 1]),
      this.db.query<{ last: string | null }>('SELECT last_read_message_id::text AS last FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2', [conversationId, who.other_id]),
    ]);
    const otherRead = BigInt(other.rows[0]?.last ?? 0);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse(); // oldest first for display
    return {
      // `read` (seen by the other person) is only meaningful for my own messages.
      data: page.map((m) => ({ id: m.id, mine: m.sender_id === userId, body: m.body, createdAt: m.created_at, read: m.sender_id === userId ? BigInt(m.id) <= otherRead : null })),
      meta: { hasMore, nextBefore: hasMore ? page[0]!.id : null },
    };
  }

  /** The sender is always the authenticated user; the client cannot choose it. */
  async send(userId: string, conversationId: string, body: string) {
    const who = await this.participation(userId, conversationId);
    if (!body) throw new BadRequestException('Write a message first.');
    const blocked = await this.blocks(userId, who.other_id);
    if (blocked.byMe) throw new ForbiddenException('You’ve blocked this person. Unblock them to send messages.');
    if (blocked.byThem) throw new ForbiddenException('You can’t send messages in this conversation.');
    await this.assertNotSpamming(userId, body);

    const m = await this.db.transaction(async (c) => {
      const r = await c.query<{ id: string; created_at: Date }>(
        'INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id::text AS id, created_at', [conversationId, userId, body]);
      await c.query('UPDATE conversations SET last_message_at = $2 WHERE id = $1', [conversationId, r.rows[0]!.created_at]);
      return r.rows[0]!;
    });
    this.pushMessage(userId, who.other_id, conversationId, { id: m.id, body, createdAt: m.created_at });
    await this.notifications.notifyNewMessage(who.other_id, conversationId, who.my_name, body);
    return { id: m.id, mine: true, body, createdAt: m.created_at, read: false };
  }

  /** Per-minute cap, plus a check for the same long message blasted to many different conversations. */
  private async assertNotSpamming(userId: string, body: string): Promise<void> {
    const perMinute = await this.settings.get('max_messages_per_minute');
    const recent = await this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM messages WHERE sender_id = $1 AND created_at > now() - interval '1 minute'`, [userId]);
    if (recent.rows[0]!.n >= perMinute) throw new HttpException('You’re sending messages too quickly. Wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
    if (body.length >= 20) {
      const dup = await this.db.query<{ n: number }>(
        `SELECT count(DISTINCT conversation_id)::int AS n FROM messages WHERE sender_id = $1 AND body = $2 AND created_at > now() - interval '10 minutes'`, [userId, body]);
      if (dup.rows[0]!.n >= 6) throw new HttpException('That message looks like spam because you’ve sent it to many people. Please personalise it.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Marks everything up to now as read, clears the matching notification, and tells the other person (read receipts). */
  async markRead(userId: string, conversationId: string) {
    const who = await this.participation(userId, conversationId);
    await this.db.query(
      `UPDATE conversation_participants
       SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), (SELECT COALESCE(max(id), 0) FROM messages WHERE conversation_id = $1)), last_read_at = now()
       WHERE conversation_id = $1 AND user_id = $2`, [conversationId, userId]);
    await this.db.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND type = 'new_message' AND read_at IS NULL AND data ->> 'conversationId' = $2`, [userId, conversationId]);
    this.realtime.emitToUser(who.other_id, 'conversation:read', { conversationId });
    return { unreadMessages: await this.unreadTotal(userId) };
  }

  async block(userId: string, conversationId: string): Promise<void> {
    const who = await this.participation(userId, conversationId);
    await this.db.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, who.other_id]);
  }

  async unblock(userId: string, conversationId: string): Promise<void> {
    const who = await this.participation(userId, conversationId);
    await this.db.query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [userId, who.other_id]);
  }
}
