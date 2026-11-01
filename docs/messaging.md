# Messaging, notifications, safety (Phase 6)

## Real-time delivery (Socket.IO)
- Connect to the API origin with `auth: { token: <access token> }` (path `/socket.io`). The server verifies the signature and expiry, loads the account (it must still be active), and joins the connection to a private `user:<id>` room.
- **Sockets are receive-only.** Clients send nothing; sending a message, marking read, blocking, and everything else uses the REST API where authorization lives. A socket can only ever receive events for its own user.
- Events: `ready`; `message:new { conversationId, message }` (sent to the recipient with `mine:false` and to the sender's other tabs with `mine:true`); `notification:new`; `conversation:read { conversationId }` (read receipt); `auth_error` and `auth_expired` (then the server disconnects).
- The connection is closed at the exact moment its access token expires. The web client then refreshes its token and reconnects with exponential backoff (max 6 attempts). At most 8 sockets per account.
- Origin allow-list: the same `CORS_ORIGINS` list as the REST API (connections with a foreign `Origin` are refused). Non-browser clients carry no origin but still need a valid token.
- Authenticated fallback: when the socket is down, the web app polls (4 s in a thread, 15 s for the inbox); when connected it only polls slowly as a safety net.
- **Deployment:** the API must run as a long-lived Node process, and any reverse proxy or load balancer must pass WebSocket upgrades (`Upgrade`/`Connection` headers). With more than one API instance you need a shared Socket.IO adapter (for example Redis) so an event reaches the instance holding the recipient's socket; this is not configured yet (a single instance works as is).

## Unread counts and read receipts
Read state is `conversation_participants.last_read_message_id` (id-based, not time-based, so a message committed late can never be silently marked read). `GET /conversations` and `GET /conversations/:id` include `unreadCount`; `GET /conversations/unread-count` gives the header badge total; `POST /conversations/:id/read` marks everything read, clears the related notification and pushes a receipt to the other person. Messages you sent carry `read` (seen by the other person); messages you received carry `null`.

## Notifications
Persisted in `notifications` (never frontend-only). Endpoints: `GET /notifications` (paged, `meta.unreadCount`), `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`. Everything is scoped to the owner. `link` is constrained by the database to a same-site relative path.
- Emitted now: new message (one unread notification per conversation that updates with a counter instead of piling up), seller application approved / rejected / suspended / reinstated (with the reviewer's reason).
- Defined but emitted later: `listing_approved`, `listing_rejected`, `moderation_action`, `report_update` (Phase 7, when the admin endpoints exist). `listing_expiring` needs a scheduled job and is planned with deployment work (Phase 9).
- Retention: delete read notifications older than 90 days on a schedule (`DELETE FROM notifications WHERE read_at < now() - interval '90 days'`).

## Blocking
`POST` / `DELETE /conversations/:id/block`. A block applies in both directions: neither person can send in the conversation or start new ones with the other (existing history stays readable). Only the blocker is told they blocked; the other person only sees "You can't send messages in this conversation." The `canSend` flag is deliberately a single value.

## Reports
`POST /reports { targetType: product|seller|user|conversation, targetId, reason, details? }` (verified email required). The reporter must be able to legitimately see the target: public listings and approved storefronts, a conversation they are in, or a person they share a conversation with. You cannot report yourself, your own listing or shop. One open report per reporter and target (409), `max_reports_per_day` (default 20, then 429). Reports are confidential from the reported party. **Reporting a conversation lets moderators read it** (the web form says so). `target_id` is polymorphic and has no foreign key; the service validates it. Moderators review reports in the admin dashboard (see `docs/admin.md`).

## Spam limits (runtime settings)
`max_messages_per_minute` (20, per user), `max_new_conversations_per_day` (30), `max_reports_per_day` (20), plus per-IP request throttling (`THROTTLE_WRITE_LIMIT`), and a check that blocks the same 20+ character message being sent to 6 or more different conversations within 10 minutes. Short replies are never flagged.

## Not yet implemented
Redis (or similar) adapter for multi-instance sockets; moderator tools for reports and the notifications that follow them (Phase 7); a settings screen for the limits above (Phase 7); an inbox view of blocked people (unblock is available inside each conversation); `listing_expiring` notifications and retention jobs (Phase 9); typing indicators and attachments (not planned).
