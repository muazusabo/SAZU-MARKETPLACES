import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Server-to-client pushes only. Clients never send events: every action (sending a message, marking read, blocking)
 * goes through the REST API, where authentication and authorization are enforced. Sockets just deliver updates.
 */
@Injectable()
export class RealtimeService {
  server?: Server;

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }
}
