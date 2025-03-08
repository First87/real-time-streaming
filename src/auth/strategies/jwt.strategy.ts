import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Socket } from 'socket.io';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: (request) => {
        // ถ้าเป็น WebSocket request
        if (request instanceof Socket) {
          return request.handshake?.auth?.token || 
                 request.handshake?.headers?.authorization?.split(' ')[1];
        }
        // ถ้าเป็น HTTP request
        return ExtractJwt.fromAuthHeaderAsBearerToken()(request);
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key',
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, email: payload.email };
  }
} 