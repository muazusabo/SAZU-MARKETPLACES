import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../products/products.module';
import { SellersModule } from '../sellers/sellers.module';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminManagementController } from './admin-management.controller';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminModerationService } from './admin-moderation.service';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [ProductsModule, SellersModule, AuthModule],
  controllers: [AdminModerationController, AdminManagementController],
  providers: [AdminModerationService, AdminUsersService, AdminCatalogService],
})
export class AdminModule {}
