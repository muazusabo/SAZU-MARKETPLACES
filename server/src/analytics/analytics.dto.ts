import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class VisitorHeartbeatDto {
  @ApiProperty({ format: 'uuid', description: 'Random browser identifier used only for aggregate visitor counts.' })
  @IsUUID('4')
  visitorId!: string;
}
