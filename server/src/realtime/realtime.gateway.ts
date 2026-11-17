import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { VoiceCallService } from './voice-call.service';
import { UsersService } from '../users/users.service';
import { RealtimeService, userRoom } from './realtime.service';

const MAX_SOCKETS_PER_USER = 8;

@WebSocketGateway({ path: '/socket.io' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly voiceCalls: VoiceCallService,
  ) {}

  afterInit(server: Server) { this.realtime.server = server; }

  /**
   * Authentication happens on connect: the access token from `handshake.auth.token` is verified (signature, expiry) and the
   * account must still be active. The connection is closed at the moment the token expires, so a socket can never outlive
   * its credential; the client then refreshes its token and reconnects.
   */
  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || token.length > 2000) throw new Error('missing token');
      const { sub, exp } = await this.jwt.verifyAsync<{ sub: string; exp: number }>(token, { algorithms: ['HS256'] });
      const user = await this.users.findAuthUser(sub);
      if (!user) throw new Error('inactive account');
      if ((await this.server.in(userRoom(user.id)).fetchSockets()).length >= MAX_SOCKETS_PER_USER) {
        socket.emit('auth_error', { reason: 'too_many_connections' });
        socket.disconnect(true);
        return;
      }
      socket.data.userId = user.id;
      socket.data.emailVerified = user.emailVerified;
      await socket.join(userRoom(user.id));
      socket.data.timer = setTimeout(() => { socket.emit('auth_expired'); socket.disconnect(true); }, Math.max(0, exp * 1000 - Date.now()));
      socket.emit('ready', { userId: user.id });
    } catch {
      socket.emit('auth_error', { reason: 'unauthorized' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    if (socket.data?.timer) clearTimeout(socket.data.timer as NodeJS.Timeout);
    if (typeof socket.data?.userId === 'string') {
      void this.voiceCalls.disconnected(socket.data.userId, socket.id).catch((error: Error) => this.logger.error(`Voice call cleanup failed: ${error.message}`));
    }
  }

  @SubscribeMessage('call:initiate')
  initiateCall(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    if (!payload || typeof payload !== 'object' || typeof (payload as Record<string, unknown>).conversationId !== 'string'
      || !this.isUuidV4((payload as Record<string, string>).conversationId)) {
      return { ok: false, error: 'Invalid conversation id.' };
    }
    return this.voiceCalls.initiate(socket.data.userId, socket.id, socket.data.emailVerified === true, (payload as Record<string, string>).conversationId);
  }

  @SubscribeMessage('call:accept')
  acceptCall(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    const callId = this.callId(payload);
    return callId ? this.voiceCalls.accept(socket.data.userId, socket.id, callId) : { ok: false, error: 'Invalid call id.' };
  }

  @SubscribeMessage('call:decline')
  declineCall(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    const callId = this.callId(payload);
    return callId ? this.voiceCalls.decline(socket.data.userId, callId) : { ok: false, error: 'Invalid call id.' };
  }

  @SubscribeMessage('call:end')
  endCall(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    const callId = this.callId(payload);
    return callId ? this.voiceCalls.end(socket.data.userId, callId) : { ok: false, error: 'Invalid call id.' };
  }

  @SubscribeMessage('call:signal')
  relayCallSignal(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Invalid call signal.' };
    const data = payload as Record<string, unknown>;
    const callId = this.callId(data);
    return callId ? this.voiceCalls.signal(socket.data.userId, callId, data.signal) : { ok: false, error: 'Invalid call id.' };
  }

  private callId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const callId = (payload as Record<string, unknown>).callId;
    return typeof callId === 'string' && this.isUuidV4(callId) ? callId : null;
  }

  private isUuidV4(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
