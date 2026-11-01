import { Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../auth/decorators';
import { ListProductsQuery } from './dto/list-products.dto';
import { ProductsService } from './products.service';

const CACHE = 'public, max-age=15, stale-while-revalidate=30';
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

@ApiTags('Products')
@Public()
@Controller({ version: '1' })
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Search, filter, sort and paginate publicly visible listings' })
  list(@Query() q: ListProductsQuery) { return this.products.list(q); }

  @Get('products/:slug')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'Public product details (no private seller data)' })
  one(@Param('slug') slug: string) {
    return this.products.bySlug(SLUG.test(slug) ? slug : '-');
  }

  @Post('products/:slug/views')
  @HttpCode(204)
  @Throttle({ default: { limit: Number(process.env.THROTTLE_WRITE_LIMIT ?? 60), ttl: 60_000 } })
  @ApiOperation({ summary: 'Record a (de-duplicated) listing view' })
  async view(@Param('slug') slug: string, @Req() req: Request) {
    if (SLUG.test(slug)) await this.products.recordView(slug, req.ip ?? '', req.headers['user-agent'] ?? '');
  }

  @Get('sitemap')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Slugs of public listings and storefronts (for sitemap.xml)' })
  sitemap() { return this.products.sitemap(); }
}
