import { Module } from '@nestjs/common';
import { StreamingGateway } from './streaming/streaming.gateway';

@Module({
  imports: [],
  controllers: [],
  providers: [StreamingGateway],
})
export class AppModule {}
