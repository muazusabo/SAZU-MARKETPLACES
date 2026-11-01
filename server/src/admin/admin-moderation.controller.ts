import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.constants';
import { CurrentUser, Roles } from '../auth/decorators';
import { ReviewSellerDto } from '../sellers/dto/seller.dto';
import { AdminModerationService } from './admin-moderation.service';
import { AdminProductsQuery, AdminReportsQuery, AdminSellersQuery, PageQuery, ReviewListingDto, UpdateReportDto, VerifiedDto } from './dto/admin.dto';

const uuid = () => new ParseUUIDPipe({ version: '4' });

/** Moderators and administrators. Role checks run on the server for every route (the RolesGuard), not just in the UI. */
@ApiTags('Admin: moderation')
@ApiBearerAuth()
@Roles('admin', 'moderator')
@Controller({ path: 'admin', version: '1' })
export class AdminModerationController {
  constructor(private readonly svc: AdminModerationService) {}

  @Get('overview') @ApiOperation({ summary: 'Live platform metrics and recent administrative activity' })
  overview() { return this.svc.overview(); }

  @Get('sellers/applications') @ApiOperation({ summary: 'Seller applications (pending by default, oldest first)' })
  applications(@Query() q: AdminSellersQuery) { return this.svc.sellerApplications(q.status, q.page, q.pageSize); }

  @Patch('sellers/:id/review') @ApiOperation({ summary: 'Approve, reject (reason required), suspend (reason required) or reinstate a seller' })
  reviewSeller(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: ReviewSellerDto) { return this.svc.reviewSeller(u.id, id, dto.decision, dto.note); }

  @Patch('sellers/:id/verified') @Roles('admin') @ApiOperation({ summary: 'Confirm or remove the “Verified seller” badge (administrators only)' })
  verified(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: VerifiedDto) { return this.svc.setSellerVerified(u.id, id, dto.verified, dto.note); }

  // Declared before ':id' so "pending" is not read as an id.
  @Get('products/pending') @ApiOperation({ summary: 'Listings awaiting review, oldest first' })
  pending(@Query() q: PageQuery) { return this.svc.listings('pending_review', undefined, q.page, q.pageSize); }

  @Get('products') @ApiOperation({ summary: 'Search listings in any status' })
  products(@Query() q: AdminProductsQuery) { return this.svc.listings(q.status ?? 'all', q.q, q.page, q.pageSize); }

  @Get('products/:id') @ApiOperation({ summary: 'Inspect one listing (any status): details, photos, moderation history' })
  product(@Param('id', uuid()) id: string) { return this.svc.listing(id); }

  @Patch('products/:id/review') @ApiOperation({ summary: 'Approve, reject, remove or restore a listing' })
  reviewProduct(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: ReviewListingDto) { return this.svc.reviewListing(u.id, id, dto.decision, dto.reason); }

  @Get('reports') @ApiOperation({ summary: 'User reports (open and under review by default, oldest first)' })
  reports(@Query() q: AdminReportsQuery) { return this.svc.reports(q.status, q.targetType, q.page, q.pageSize); }

  @Get('reports/:id') @ApiOperation({ summary: 'One report; conversation reports include the transcript (access is audit-logged)' })
  report(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) { return this.svc.report(u.id, id); }

  @Patch('reports/:id') @ApiOperation({ summary: 'Mark a report as reviewing, resolved or dismissed (note required to close)' })
  updateReport(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body() dto: UpdateReportDto) { return this.svc.updateReport(u.id, id, dto.status, dto.note); }
}
