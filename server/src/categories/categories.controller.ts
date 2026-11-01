import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Public()
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Active category tree with counts of publicly visible listings' })
  list() { return this.categories.tree(); }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'One category with subcategories and its specification fields' })
  one(@Param('slug') slug: string) { return this.categories.bySlug(slug.toLowerCase().slice(0, 80)); }
}
