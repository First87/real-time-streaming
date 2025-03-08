import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();
      const token = this.extractToken(client);

      if (!token) {
        throw new WsException('Unauthorized');
      }

      const payload = this.jwtService.verify(token);
      
      // Verify that payload contains required fields
      if (!payload.sub || !payload.email || !payload.username) {
        throw new WsException('Invalid token payload');
      }

      // Attach user to socket
      client['user'] = payload;

      return true;
    } catch (err) {
      console.error('WsJwtGuard error:', err);
      throw new WsException('Unauthorized');
    }
  }

  private extractToken(client: Socket): string | undefined {
    return client.handshake?.auth?.token;
  }
} 