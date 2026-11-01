import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UsersService } from '../users/users.service';
import { RealtimeService, userRoom } from './realtime.service';

const MAX_SOCKETS_PER_USER = 8;

@WebSocketGateway({ path: '/socket.io' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(private readonly realtime: RealtimeService, private readonly jwt: JwtService, private readonly users: UsersService) {}

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
  }
}
