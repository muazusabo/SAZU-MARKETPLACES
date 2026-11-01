import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, WRITE_THROTTLE } from '../auth/auth.constants';
import { CurrentUser, RequireVerifiedEmail } from '../auth/decorators';
import { ProductReviewDto } from './dto/product-review.dto';
import { ProductsService } from './products.service';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

@ApiTags('Product reviews')
@ApiBearerAuth()
@Controller({ path: 'products', version: '1' })
export class ProductReviewsController {
  constructor(private readonly products: ProductsService) {}

  @Post(':slug/reviews')
  @HttpCode(201)
  @RequireVerifiedEmail()
  @Throttle(WRITE_THROTTLE)
  @ApiOperation({ summary: 'Leave one listing review as a signed-in, email-verified user' })
  review(@Param('slug') slug: string, @CurrentUser() user: AuthUser, @Body() dto: ProductReviewDto) {
    return this.products.createReview(SLUG.test(slug) ? slug : '-', user, dto);
  }
}
