import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAdvertisementsController, PublicAdvertisementsController } from './advertisements.controller';
import { AdvertisementsService } from './advertisements.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminAdvertisementsController, PublicAdvertisementsController],
  providers: [AdvertisementsService],
})
export class AdvertisementsModule {}
