import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { VoiceCallService } from './voice-call.service';

@Global()
@Module({ providers: [RealtimeService, VoiceCallService, RealtimeGateway], exports: [RealtimeService, VoiceCallService] })
export class RealtimeModule {}
