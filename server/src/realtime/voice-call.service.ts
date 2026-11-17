import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { RealtimeService, userRoom } from './realtime.service';

type CallResult = { ok: true; callId: string } | { ok: false; error: string };
type VoiceSignal =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'ice'; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } };

interface VoiceCall {
  id: string;
  conversationId: string;
  callerId: string;
  callerSocketId: string;
  calleeId: string;
  calleeSocketId: string | null;
  callerName: string;
  calleeName: string;
  status: 'ringing' | 'active';
  signalCounts: Map<string, { startedAt: number; count: number }>;
  timer: NodeJS.Timeout;
}

@Injectable()
export class VoiceCallService {
  private readonly calls = new Map<string, VoiceCall>();
  private readonly activeByUser = new Map<string, string>();
  private readonly startsByUser = new Map<string, { minute: number; count: number }>();

  constructor(private readonly db: DatabaseService, private readonly realtime: RealtimeService) {}

  async initiate(userId: string, socketId: string, emailVerified: boolean, conversationId: string): Promise<CallResult> {
    if (!emailVerified) return { ok: false, error: 'Confirm your email before starting a voice call.' };
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    const starts = this.startsByUser.get(userId);
    if (starts?.minute === minute && starts.count >= 5) return { ok: false, error: 'You’ve started too many calls. Wait a minute and try again.' };
    if (this.activeByUser.has(userId)) return { ok: false, error: 'Finish your current call before starting another.' };

    const { rows } = await this.db.query<{
      other_id: string; caller_name: string; callee_name: string; blocked: boolean;
    }>(
      `SELECT CASE WHEN c.buyer_id = $2 THEN c.seller_id ELSE c.buyer_id END AS other_id,
              CASE WHEN c.seller_id = $2 THEN COALESCE(sp.shop_name, seller_profile.display_name) ELSE buyer_profile.display_name END AS caller_name,
              CASE WHEN c.buyer_id = $2 THEN COALESCE(sp.shop_name, seller_profile.display_name) ELSE buyer_profile.display_name END AS callee_name,
              EXISTS (SELECT 1 FROM user_blocks b WHERE
                (b.blocker_id = c.buyer_id AND b.blocked_id = c.seller_id)
                OR (b.blocker_id = c.seller_id AND b.blocked_id = c.buyer_id)) AS blocked
       FROM conversations c
       JOIN profiles buyer_profile ON buyer_profile.user_id = c.buyer_id
       JOIN profiles seller_profile ON seller_profile.user_id = c.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = c.seller_id
       WHERE c.id = $1 AND ($2 = c.buyer_id OR $2 = c.seller_id)`,
      [conversationId, userId],
    );
    const participant = rows[0];
    if (!participant) return { ok: false, error: 'Conversation not found.' };
    if (participant.blocked) return { ok: false, error: 'Voice calls are unavailable in this conversation.' };
    const otherId = participant.other_id;
    if (this.activeByUser.has(otherId)) return { ok: false, error: 'The other person is already on a call.' };
    const server = this.realtime.server;
    if (!server || (await server.in(userRoom(otherId)).fetchSockets()).length === 0) {
      return { ok: false, error: 'The other person is not online to answer a call.' };
    }

    const callId = randomUUID();
    const callerName = participant.caller_name;
    const calleeName = participant.callee_name;
    const timer = setTimeout(() => this.finish(callId, 'timeout'), 30_000);
    timer.unref?.();
    const call: VoiceCall = {
      id: callId, conversationId, callerId: userId, callerSocketId: socketId, calleeId: otherId,
      callerName, calleeName, calleeSocketId: null, status: 'ringing', signalCounts: new Map(), timer,
    };
    this.calls.set(callId, call);
    this.activeByUser.set(userId, callId);
    this.activeByUser.set(otherId, callId);
    if (starts?.minute === minute) starts.count += 1;
    else this.startsByUser.set(userId, { minute, count: 1 });
    server.to(userRoom(otherId)).emit('call:incoming', { callId, conversationId, callerName });
    server.to(socketId).emit('call:outgoing', { callId, conversationId, calleeName });
    return { ok: true, callId };
  }

  accept(userId: string, socketId: string, callId: string): CallResult {
    const call = this.calls.get(callId);
    if (!call || call.status !== 'ringing' || call.calleeId !== userId) return { ok: false, error: 'This call is no longer available.' };
    clearTimeout(call.timer);
    call.status = 'active';
    call.calleeSocketId = socketId;
    const server = this.realtime.server;
    server?.to(call.callerSocketId).emit('call:accepted', { callId, conversationId: call.conversationId, peerName: call.calleeName });
    server?.to(userRoom(call.calleeId)).except(socketId).emit('call:answered_elsewhere', { callId });
    return { ok: true, callId };
  }

  decline(userId: string, callId: string): CallResult {
    const call = this.calls.get(callId);
    if (!call || call.status !== 'ringing' || call.calleeId !== userId) return { ok: false, error: 'This call is no longer available.' };
    this.finish(callId, 'declined');
    return { ok: true, callId };
  }

  end(userId: string, callId: string): CallResult {
    const call = this.calls.get(callId);
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) return { ok: false, error: 'This call is no longer available.' };
    this.finish(callId, 'ended');
    return { ok: true, callId };
  }

  signal(userId: string, callId: string, value: unknown): CallResult {
    const call = this.calls.get(callId);
    if (!call || call.status !== 'active') return { ok: false, error: 'This call is no longer active.' };
    if (call.callerId !== userId && call.calleeId !== userId) return { ok: false, error: 'This call is no longer available.' };
    const signal = this.validateSignal(value);
    if (!signal) return { ok: false, error: 'Invalid call signal.' };
    const now = Date.now();
    const count = call.signalCounts.get(userId);
    if (count && now - count.startedAt < 60_000 && count.count >= 60) {
      return { ok: false, error: 'Too many call setup messages. Wait before continuing.' };
    }
    if (!count || now - count.startedAt >= 60_000) call.signalCounts.set(userId, { startedAt: now, count: 1 });
    else count.count += 1;
    const otherId = call.callerId === userId ? call.calleeId : call.callerId;
    this.realtime.emitToUser(otherId, 'call:signal', { callId, signal });
    return { ok: true, callId };
  }

  async disconnected(userId: string, socketId: string): Promise<void> {
    const activeCallId = this.activeByUser.get(userId);
    const activeCall = activeCallId ? this.calls.get(activeCallId) : undefined;
    if (activeCall && (activeCall.callerSocketId === socketId || activeCall.calleeSocketId === socketId)) {
      this.finish(activeCall.id, 'connection_lost');
      return;
    }
    const server = this.realtime.server;
    if (server && (await server.in(userRoom(userId)).fetchSockets()).length > 0) return;
    const callId = this.activeByUser.get(userId);
    if (callId) this.finish(callId, 'connection_lost');
  }

  private finish(callId: string, reason: 'timeout' | 'declined' | 'ended' | 'connection_lost'): void {
    const call = this.calls.get(callId);
    if (!call) return;
    clearTimeout(call.timer);
    this.calls.delete(callId);
    this.activeByUser.delete(call.callerId);
    this.activeByUser.delete(call.calleeId);
    this.realtime.emitToUser(call.callerId, 'call:ended', { callId, reason });
    this.realtime.emitToUser(call.calleeId, 'call:ended', { callId, reason });
  }

  private validateSignal(value: unknown): VoiceSignal | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const signal = value as Record<string, unknown>;
    if ((signal.type === 'offer' || signal.type === 'answer') && typeof signal.sdp === 'string'
      && signal.sdp.length <= 32_000 && signal.sdp.startsWith('v=0')) {
      return { type: signal.type, sdp: signal.sdp };
    }
    if (signal.type !== 'ice' || !signal.candidate || typeof signal.candidate !== 'object' || Array.isArray(signal.candidate)) return null;
    const candidate = signal.candidate as Record<string, unknown>;
    if (typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096) return null;
    if (candidate.sdpMid !== undefined && candidate.sdpMid !== null && (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 256)) return null;
    if (candidate.sdpMLineIndex !== undefined && candidate.sdpMLineIndex !== null
      && (typeof candidate.sdpMLineIndex !== 'number' || !Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0 || candidate.sdpMLineIndex > 255)) return null;
    if (candidate.usernameFragment !== undefined && candidate.usernameFragment !== null
      && (typeof candidate.usernameFragment !== 'string' || candidate.usernameFragment.length > 256)) return null;
    return {
      type: 'ice',
      candidate: {
        candidate: candidate.candidate,
        ...(candidate.sdpMid !== undefined ? { sdpMid: candidate.sdpMid as string | null } : {}),
        ...(candidate.sdpMLineIndex !== undefined ? { sdpMLineIndex: candidate.sdpMLineIndex as number | null } : {}),
        ...(candidate.usernameFragment !== undefined ? { usernameFragment: candidate.usernameFragment as string | null } : {}),
      },
    };
  }
}
