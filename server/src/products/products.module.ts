import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductReviewsController } from './product-reviews.controller';
import { ProductsService } from './products.service';
import { SellerProductsController } from './seller-products.controller';
import { SellerProductsService } from './seller-products.service';

@Module({
  controllers: [ProductsController, ProductReviewsController, SellerProductsController],
  providers: [ProductsService, SellerProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
