import { Module } from '@nestjs/common';
import { StreamingGateway } from './streaming.gateway';
import { AIService } from './ai.service';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [StreamingGateway, AIService],
  exports: [StreamingGateway, AIService],
})
export class StreamingModule {} 