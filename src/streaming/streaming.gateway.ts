import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface User {
  id: string;
  room: string;
  username: string;
  lastSeen: Date;
}

@WebSocketGateway()
export class StreamingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private users: User[] = [];

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.users = this.users.filter((user) => user.id !== client.id); // Remove disconnected user
    this.sendRoomUsersForDisconnected(client.id); // Notify others in the room
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() { room, username }: { room: string; username: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(room);
    this.users.push({ id: client.id, room, username, lastSeen: new Date() });
    console.log(`Client ${client.id} joined room: ${room}`);

    // Notify all users in the room about the new user
    this.server.to(room).emit('userCreated', { username, id: client.id });

    // Send list of users in the room
    this.sendRoomUsers(room);
  }

  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() { room, message }: { room: string; message: string },
    @ConnectedSocket() client: Socket,
  ): void {
    console.log(
      `Received message from client ${client.id} for room ${room}: ${message}`,
    );

    // Update last seen time
    this.updateLastSeen(client.id);

    // Find the user to get their username
    const user = this.users.find((user) => user.id === client.id);

    // Broadcast message to the room
    if (user) {
      this.server
        .to(room)
        .emit('message', { username: user.username, message });
    }
  }

  @SubscribeMessage('getRoomUsers')
  handleGetRoomUsers(
    @MessageBody() { room }: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.sendRoomUsers(room);
  }

  private sendRoomUsers(room: string) {
    const usersInRoom = this.users.filter((user) => user.room === room);
    this.server.to(room).emit('roomUsers', { room, users: usersInRoom });
  }

  private sendRoomUsersForDisconnected(disconnectedId: string) {
    const user = this.users.find((user) => user.id === disconnectedId);
    if (user) {
      const room = user.room;
      this.sendRoomUsers(room);
    }
  }

  private updateLastSeen(clientId: string): void {
    const user = this.users.find((user) => user.id === clientId);
    if (user) {
      user.lastSeen = new Date();
    }
  }
}
