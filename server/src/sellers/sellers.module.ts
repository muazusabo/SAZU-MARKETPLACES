import { Module } from '@nestjs/common';
import { SellerAccountController } from './seller-account.controller';
import { SellerAccountService } from './seller-account.service';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

// SellerAccountController must come first so `/sellers/me` is not captured by `/sellers/:slug`.
@Module({
  controllers: [SellerAccountController, SellersController],
  providers: [SellersService, SellerAccountService],
  exports: [SellersService, SellerAccountService],
})
export class SellersModule {}
