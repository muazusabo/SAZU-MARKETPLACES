import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';

/**
 * Rate limiting that works on a shared campus network.
 *  - Signed-in requests are counted per USER, not per IP (hundreds of students share one campus gateway address).
 *    This guard runs after authentication so the user is known.
 *  - Anonymous requests are counted per IP.
 *  - The web application's own server-side requests (server-rendered pages) carry a shared secret and are not limited,
 *    otherwise every visitor's page view would be counted against one IP: the web server's.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    return user?.id ? `user:${user.id}` : String(req.ip ?? 'unknown');
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const secret = process.env.INTERNAL_API_KEY;
    if (!secret) return false;
    const sent = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>().headers['x-internal-key'];
    if (!sent) return false;
    const a = Buffer.from(sent); const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
