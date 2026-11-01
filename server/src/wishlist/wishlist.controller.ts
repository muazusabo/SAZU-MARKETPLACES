import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthUser } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators';
import { WishlistService } from './wishlist.service';

class WishlistQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48) pageSize?: number;
}
const uuid = () => new ParseUUIDPipe({ version: '4' });

/** Private to the signed-in user: nobody else can read or change another person's wishlist. */
@ApiTags('Wishlist')
@ApiBearerAuth()
@Controller({ path: 'wishlist', version: '1' })
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get() @ApiOperation({ summary: 'My saved products, including ones that are no longer available' })
  list(@CurrentUser() u: AuthUser, @Query() q: WishlistQuery) { return this.wishlist.list(u.id, q.page ?? 1, q.pageSize ?? 12); }

  @Get('ids') @ApiOperation({ summary: 'Ids of my saved products' })
  ids(@CurrentUser() u: AuthUser) { return this.wishlist.ids(u.id); }

  @Post(':productId') @HttpCode(204) @ApiOperation({ summary: 'Save a product (idempotent)' })
  async add(@CurrentUser() u: AuthUser, @Param('productId', uuid()) id: string) { await this.wishlist.add(u.id, id); }

  @Delete(':productId') @HttpCode(204) @ApiOperation({ summary: 'Remove a saved product (idempotent)' })
  async remove(@CurrentUser() u: AuthUser, @Param('productId', uuid()) id: string) { await this.wishlist.remove(u.id, id); }
}
