import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { SellersService } from './sellers.service';

@ApiTags('Sellers')
@Public()
@Controller({ path: 'sellers', version: '1' })
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Public seller storefront (approved sellers or pending sellers with approved listings)' })
  one(@Param('slug') slug: string) {
    return this.sellers.storefront(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : '-');
  }
}
