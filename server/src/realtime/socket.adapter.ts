import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/** Applies the same origin allow-list as the REST API. Browsers always send Origin; non-browser clients still need a valid token. */
export class SocketAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly origins: string[]) { super(app); }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: true },
      maxHttpBufferSize: 1e4, // clients send nothing meaningful; keep payloads tiny
      allowRequest: (req: { headers: { origin?: string } }, cb: (err: string | null, ok: boolean) => void) => {
        const origin = req.headers.origin;
        cb(null, !origin || this.origins.includes(origin));
      },
    } as ServerOptions);
  }
}
