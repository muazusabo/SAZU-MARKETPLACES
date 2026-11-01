/**
 * Temporary operator tool until the admin dashboard (Phase 7).
 *   npm run admin:seller -w apps/api -- <shop-slug|email> approve
 *   npm run admin:seller -w apps/api -- <shop-slug|email> reject "Reason shown to the seller"
 *   ... suspend "reason" | reinstate
 */
import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SellerAccountService } from '../sellers/seller-account.service';

async function main() {
  const [ident, decision, ...rest] = process.argv.slice(2);
  if (!ident || !['approve', 'reject', 'suspend', 'reinstate'].includes(decision ?? '')) {
    console.error('Usage: seller-review <shop-slug|email> <approve|reject|suspend|reinstate> [reason]');
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const svc = app.get(SellerAccountService);
    const id = await svc.findIdBySlugOrEmail(ident);
    if (!id) throw new Error(`No seller found for "${ident}"`);
    const r = await svc.review(id, decision as 'approve', rest.join(' ') || undefined);
    console.log(`Seller ${ident} is now ${r.status}`);
  } finally { await app.close(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
