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
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UseGuards } from '@nestjs/common';
import { User } from 'src/users/entities/user.entity';
import { WsException } from '@nestjs/websockets';
import { AIService } from './ai.service';

// เปลี่ยนชื่อ interface จาก User เป็น ChatUser
interface ChatUser {
  id: string;
  room: string;
  username: string;
  lastSeen: Date;
}

interface ChatMessage {
  username: string;
  message?: string;
  image?: string;
  file?: {
    name: string;
    type: string;
    size: number;
    data: string;
  };
  replyTo?: {
    username: string;
    message: string;
    timestamp: string;
  };
  timestamp: Date;
  readBy?: string[];
  edited?: boolean;
  isAI?: boolean;
}

interface Room {
  id: string;
  name: string;
  userCount: number;
  hasPassword?: boolean;
  password?: string;
}

// เพิ่ม interface สำหรับข้อความส่วนตัว
interface PrivateMessage {
  type: 'private';
  from: string;
  to: string;
  message: string;
  timestamp: Date;
}

// เพิ่ม interface สำหรับการแจ้งเตือน
interface Notification {
  type: 'privateMessage' | 'roomMessage';
  from: string;
  message: string;
  timestamp: Date;
}

// เพิ่ม interface สำหรับ AI Room
interface AIRoom {
  id: string;
  isAI: boolean;
}

@WebSocketGateway({
  cors: true,
  namespace: '/',
})
@UseGuards(WsJwtGuard)
export class StreamingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private users: ChatUser[] = [];
  private chatHistory: { [key: string]: ChatMessage[] } = {};
  private rooms: Map<string, Room> = new Map();
  private connectedSockets: Map<string, boolean> = new Map();
  // เพิ่ม property สำหรับเก็บข้อความส่วนตัว
  private privateMessages: { [key: string]: PrivateMessage[] } = {};
  // เพิ่ม AI rooms
  private aiRooms: Set<string> = new Set(['ai-chat', 'bot-help']);

  constructor(
    private jwtService: JwtService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private aiService: AIService,
  ) {
    // สร้างห้อง Default เมื่อเริ่มต้น server
    this.createDefaultRooms();
  }

  private createDefaultRooms() {
    const defaultRooms = [
      { id: 'general', name: 'General Chat' },
      { id: 'random', name: 'Random Talk' },
      { id: 'ai-chat', name: 'AI Assistant' },
      { id: 'bot-help', name: 'Bot Help Center' }
    ];

    defaultRooms.forEach(room => {
      this.rooms.set(room.id, {
        id: room.id,
        name: room.name,
        userCount: 0,
      });
      
      // เพิ่ม AI rooms เริ่มต้น
      if (room.id === 'ai-chat' || room.id === 'bot-help') {
        this.aiRooms.add(room.id);
      }
    });
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    
    // ตรวจสอบว่าเป็นการเชื่อมต่อใหม่หรือไม่
    const reconnectData = client.handshake.auth.reconnect;
    if (reconnectData) {
      console.log('Reconnecting with data:', reconnectData);
      this.handleReconnection(client, reconnectData);
      return;
    }

    // อัพเดทสถานะการเชื่อมต่อ
    this.connectedSockets.set(client.id, true);

    // ตรวจสอบว่ามี user อยู่แล้วหรือไม่
    this.getUserFromToken(client).then(user => {
      if (user) {
        const existingUser = this.users.find(u => u.username === user.username);
        if (existingUser) {
          console.log(`Updating existing user ${user.username} with new client ID ${client.id}`);
          existingUser.id = client.id;
          existingUser.lastSeen = new Date();
          this.sendRoomUsers(existingUser.room);
        }
      }
    }).catch(error => {
      console.error('Error checking user on connection:', error);
    });
  }

  private async handleReconnection(client: Socket, reconnectData: any) {
    try {
      const user = await this.getUserFromToken(client);
      if (!user) {
        console.log('Reconnection failed: User not found');
        return;
      }

      const roomId = reconnectData.roomId;
      const password = reconnectData.password;

      console.log(`Attempting to reconnect user ${user.username} to room ${roomId}`);

      // ตรวจสอบห้องและรหัสผ่าน
      const room = this.rooms.get(roomId);
      if (!room) {
        console.log('Reconnection failed: Room not found');
        return;
      }

      if (room.hasPassword && room.password !== password) {
        console.log('Reconnection failed: Invalid password');
        return;
      }

      // เข้าร่วมห้องอีกครั้ง
      await client.join(roomId);
      
      const chatUser: ChatUser = {
        id: client.id,
        room: roomId,
        username: user.username,
        lastSeen: new Date(),
      };
      
      // ลบผู้ใช้เก่าออกก่อนเพิ่มใหม่
      this.users = this.users.filter(u => !(u.username === user.username && u.room === roomId));
      this.users.push(chatUser);

      // อัพเดทจำนวนผู้ใช้ในห้อง
      const roomUsers = this.users.filter(u => u.room === roomId);
      room.userCount = roomUsers.length;

      console.log(`Reconnection successful: ${user.username} joined room ${roomId}`);

      // ส่งการอัพเดท
      this.server.emit('roomsList', Array.from(this.rooms.values()).map(r => ({
        id: r.id,
        name: r.name,
        userCount: r.userCount,
        hasPassword: r.hasPassword
      })));
      
      // แจ้งเตือนการเชื่อมต่อใหม่
      this.sendNotificationToRoom(roomId, `${user.username} has reconnected.`);
      this.sendRoomUsers(roomId);
      this.sendChatHistory(roomId, client);

      // ส่งผลการเชื่อมต่อกลับไปยัง client
      client.emit('reconnectResult', {
        success: true,
        roomId: roomId,
        username: user.username
      });

    } catch (error) {
      console.error('Error handling reconnection:', error);
      client.emit('reconnectResult', {
        success: false,
        message: 'Failed to reconnect'
      });
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      console.log(`Client disconnected: ${client.id}`);
      
      // อัพเดทสถานะการเชื่อมต่อ
      this.connectedSockets.delete(client.id);

      // หา user จาก client.id
      const user = this.users.find(u => u.id === client.id);
      if (user) {
        // อัพเดท lastSeen
        user.lastSeen = new Date();
        
        // ส่งการอัพเดทสถานะผู้ใช้
        this.sendRoomUsers(user.room);
        
        // ตั้งเวลาลบผู้ใช้ถ้าไม่มีการเชื่อมต่อกลับมาภายใน 1 นาที
        setTimeout(() => {
          const currentUser = this.users.find(u => u.username === user.username);
          if (currentUser && !this.connectedSockets.has(currentUser.id)) {
            console.log(`Removing inactive user ${currentUser.username}`);
            
            // ลบผู้ใช้ออกจากรายการ
            this.users = this.users.filter(u => u.username !== currentUser.username);

            // อัพเดทจำนวนผู้ใช้ในห้อง
            const room = this.rooms.get(currentUser.room);
            if (room) {
              const roomUsers = this.users.filter(u => u.room === currentUser.room);
              room.userCount = roomUsers.length;
              this.rooms.set(currentUser.room, room);
            }

            // แจ้งเตือนผู้ใช้อื่นในห้อง
            this.server.to(currentUser.room).emit('userLeft', {
              username: currentUser.username
            });

            // ส่งรายการผู้ใช้ที่อัพเดทแล้ว
            this.sendRoomUsers(currentUser.room);
            // ส่งรายการห้องที่อัพเดทแล้ว
            this.server.emit('roomsList', Array.from(this.rooms.values()));
          }
        }, 60000); // รอ 1 นาที
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() { roomId, password }: { roomId: string; password?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      console.log(`Attempting to join room ${roomId} with client ${client.id}`);
      
      const user = await this.getUserFromToken(client);
      if (!user) {
        console.log('Join room failed: User not found');
        client.emit('joinRoomResult', { 
          success: false, 
          message: 'Unauthorized' 
        });
        return;
      }

      const room = this.rooms.get(roomId);
      if (!room) {
        console.log('Join room failed: Room not found');
        client.emit('joinRoomResult', { 
          success: false, 
          message: 'Room not found' 
        });
        return;
      }

      // ตรวจสอบว่าผู้ใช้อยู่ในห้องอยู่แล้วหรือไม่
      const existingUser = this.users.find(u => 
        u.username === user.username && 
        u.room === roomId
      );

      if (existingUser) {
        console.log(`User ${user.username} already in room ${roomId}, updating connection`);
        existingUser.id = client.id;
        existingUser.lastSeen = new Date();
        this.connectedSockets.set(client.id, true);
        
        // Join socket to room
        await client.join(roomId);

        client.emit('joinRoomResult', { 
          success: true, 
          message: 'Reconnected to room',
          roomId: roomId,
          username: user.username
        });

        this.sendRoomUsers(roomId);
        this.sendChatHistory(roomId, client);
        return;
      }

      // ตรวจสอบรหัสผ่าน
      if (room.hasPassword) {
        if (!password) {
          console.log('Join room failed: Password required');
          client.emit('joinRoomResult', { 
            success: false, 
            message: 'Password required' 
          });
          return;
        }
        if (room.password !== password) {
          console.log('Join room failed: Invalid password');
          client.emit('joinRoomResult', { 
            success: false, 
            message: 'Invalid room password' 
          });
          return;
        }
      }

      // Leave previous rooms
      const prevRooms = Array.from(client.rooms);
      for (const prevRoom of prevRooms) {
        if (prevRoom !== client.id) {
          const prevRoomData = this.rooms.get(prevRoom);
          if (prevRoomData) {
            this.users = this.users.filter(u => !(u.username === user.username && u.room === prevRoom));
            const prevRoomUsers = this.users.filter(u => u.room === prevRoom);
            prevRoomData.userCount = prevRoomUsers.length;
            client.leave(prevRoom);
          }
        }
      }

      // Join new room
      await client.join(roomId);
      
      // Add user to room users list
      const chatUser: ChatUser = {
        id: client.id,
        room: roomId,
        username: user.username,
        lastSeen: new Date(),
      };
      
      // Remove any existing entries for this user in this room
      this.users = this.users.filter(u => !(u.username === user.username && u.room === roomId));
      this.users.push(chatUser);
      
      // Update connected sockets map
      this.connectedSockets.set(client.id, true);

      // อัพเดทจำนวนผู้ใช้ในห้องใหม่
      const roomUsers = this.users.filter(u => u.room === roomId);
      room.userCount = roomUsers.length;

      console.log(`User ${user.username} successfully joined room ${roomId}`);

      // Send success response
      client.emit('joinRoomResult', { 
        success: true, 
        message: 'Joined room successfully',
        roomId: roomId,
        username: user.username
      });

      // Send updates
      this.server.emit('roomsList', Array.from(this.rooms.values()).map(r => ({
        id: r.id,
        name: r.name,
        userCount: r.userCount,
        hasPassword: r.hasPassword
      })));
      
      this.sendNotificationToRoom(roomId, `${user.username} has joined the room.`);
      this.sendRoomUsers(roomId);
      this.sendChatHistory(roomId, client);

    } catch (error) {
      console.error('Error joining room:', error);
      client.emit('joinRoomResult', { 
        success: false, 
        message: error.message || 'Failed to join room' 
      });
    }
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: { roomId: string; message: string; file?: any },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      console.log(`Handling message for room ${data.roomId} from client ${client.id}`);
      
      const user = await this.getUserFromToken(client);
      if (!user) {
        console.log('Message failed: User not found');
        throw new WsException('Unauthorized');
      }

      // ตรวจสอบว่าผู้ใช้อยู่ในห้องจริงๆ
      const chatUser = this.users.find(u => 
        u.username === user.username && 
        u.room === data.roomId
      );

      if (!chatUser) {
        console.log(`Message failed: User ${user.username} not found in room ${data.roomId}`);
        console.log('Current users in room:', this.users.filter(u => u.room === data.roomId));
        
        // ลองเข้าร่วมห้องใหม่
        await client.join(data.roomId);
        
        // เพิ่มผู้ใช้เข้าห้อง
        const newChatUser: ChatUser = {
          id: client.id,
          room: data.roomId,
          username: user.username,
          lastSeen: new Date(),
        };
        
        this.users.push(newChatUser);
        this.connectedSockets.set(client.id, true);
        
        console.log(`Auto-joined user ${user.username} to room ${data.roomId}`);
      } else if (chatUser.id !== client.id) {
        // อัพเดท client.id ถ้ามีการเปลี่ยนแปลง
        console.log(`Updating client ID for user ${user.username} from ${chatUser.id} to ${client.id}`);
        chatUser.id = client.id;
        this.connectedSockets.set(client.id, true);
        
        // เข้าร่วมห้องด้วย socket ใหม่
        await client.join(data.roomId);
      }

      // อัพเดท lastSeen
      chatUser.lastSeen = new Date();

      const message: ChatMessage = {
        username: user.username,
        message: data.message,
        timestamp: new Date(),
      };

      if (data.file) {
        message.file = data.file;
      }

      // เก็บข้อความในประวัติ
      if (!this.chatHistory[data.roomId]) {
        this.chatHistory[data.roomId] = [];
      }
      this.chatHistory[data.roomId].push(message);

      console.log(`Sending message to room ${data.roomId} from ${user.username}: ${data.message}`);

      // ส่งข้อความไปยังทุกคนในห้อง
      this.server.to(data.roomId).emit('message', message);

      // อัพเดทรายการผู้ใช้ในห้อง
      this.sendRoomUsers(data.roomId);

      // ตรวจสอบว่าเป็น AI room หรือไม่
      if (this.aiRooms.has(data.roomId)) {
        // แสดง typing indicator สำหรับ AI
        this.server.to(data.roomId).emit('typing', {
          username: 'AI Assistant',
          isTyping: true
        });

        // สร้าง delay เพื่อจำลองการพิมพ์ของ AI
        setTimeout(async () => {
          // ใช้ AIService ในการประมวลผลข้อความ
          const aiResponse: ChatMessage = {
            username: 'AI Assistant',
            message: await this.aiService.processMessage(data.message, client.id),
            timestamp: new Date(),
            isAI: true
          };

          // เก็บ AI response ในประวัติ
          this.chatHistory[data.roomId].push(aiResponse);

          // หยุดแสดง typing indicator
          this.server.to(data.roomId).emit('typing', {
            username: 'AI Assistant',
            isTyping: false
          });

          // ส่ง AI response
          this.server.to(data.roomId).emit('message', aiResponse);
        }, Math.random() * 1000 + 500); // delay 0.5-1.5 วินาที
      }

    } catch (error) {
      console.error('Error handling message:', error);
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('getRoomUsers')
  handleGetRoomUsers(
    @MessageBody() { roomId }: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.sendRoomUsers(roomId);
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const user = await this.getUserFromToken(client);
      if (!user) {
        throw new WsException('Unauthorized');
      }

      // ลบผู้ใช้ออกจากห้อง
      this.users = this.users.filter(u => !(u.id === client.id && u.room === data.roomId));

      // อัพเดทจำนวนผู้ใช้ในห้อง
      const room = this.rooms.get(data.roomId);
      if (room) {
        const roomUsers = this.users.filter(u => u.room === data.roomId);
        room.userCount = roomUsers.length;
        this.rooms.set(data.roomId, room);
      }

      // แจ้งเตือนผู้ใช้อื่นในห้อง
      this.server.to(data.roomId).emit('userLeft', {
        username: user.username
      });

      // ส่งรายการผู้ใช้ที่อัพเดทแล้ว
      this.sendRoomUsers(data.roomId);
      
      // ออกจากห้อง
      client.leave(data.roomId);

      // ส่งรายการห้องที่อัพเดทแล้ว
      this.server.emit('roomsList', Array.from(this.rooms.values()));

    } catch (error) {
      console.error('Error leaving room:', error);
    }
  }

  private sendRoomUsers(roomId: string) {
    const usersInRoom = this.users.filter(user => user.room === roomId);
    const usersWithStatus = usersInRoom.map(user => ({
      id: user.id,
      username: user.username,
      active: this.connectedSockets.has(user.id),
      lastSeen: user.lastSeen.toISOString()
    }));

    console.log(`Sending users for room ${roomId}:`, usersWithStatus);
    this.server.to(roomId).emit('roomUsers', { users: usersWithStatus });
  }

  private sendChatHistory(roomId: string, client: Socket): void {
    const messages = this.chatHistory[roomId] || [];
    // กรองข้อความที่มีรูปขนาดใหญ่เกินไปออก
    const filteredMessages = messages.map(msg => ({
        ...msg,
        image: msg.image ? msg.image : undefined
    }));
    client.emit('chatHistory', filteredMessages);
  }

  private updateLastSeen(clientId: string): void {
    const user = this.users.find(u => u.id === clientId);
    if (user) {
      user.lastSeen = new Date();
      this.sendRoomUsers(user.room); // อัพเดทสถานะผู้ใช้ในห้อง
    }
  }

  private sendNotificationToRoom(roomId: string, message: string): void {
    // ตรวจสอบว่าเป็นการแจ้งเตือนปกติ (ไม่ใช่ข้อความส่วนตัว)
    if (!message.includes('private message')) {
      console.log(`Sending notification to room ${roomId}: ${message}`);
      this.server.to(roomId).emit('notification', { 
        type: 'roomMessage',
        message 
      });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() { roomId }: { roomId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      const user = await this.getUserFromToken(client);
      if (!user) {
        throw new WsException('Unauthorized');
      }

      // ตรวจสอบว่าผู้ใช้อยู่ในห้องนั้นจริงๆ
      const isInRoom = this.users.some(u => u.id === client.id && u.room === roomId);
      if (!isInRoom) {
        return;
      }

      console.log(`User ${user.username} is typing in room ${roomId}`);
      this.server.to(roomId).emit('typing', { username: user.username });
    } catch (error) {
      console.error('Error handling typing:', error);
    }
  }

  // Helper function to get username by client id
  private getUsernameByClientId(clientId: string): string {
    const user = this.users.find((user) => user.id === clientId);
    return user ? user.username : 'Unknown';
  }

  private async getUserFromToken(client: Socket) {
    try {
      const user = client['user'];
      if (!user) {
        return null;
      }

      // ค้นหา user จาก id ที่อยู่ใน token
      const dbUser = await this.usersRepository.findOne({
        where: { id: user.sub }
      });

      if (!dbUser) {
        return null;
      }

      return {
        id: dbUser.id,
        email: dbUser.email,
        username: user.username || dbUser.username, // ใช้ username จาก token หรือ database
      };
    } catch (error) {
      console.error('Error getting user from token:', error);
      return null;
    }
  }

  @SubscribeMessage('createRoom')
  handleCreateRoom(
    @MessageBody() data: { name: string; password?: string; isAIRoom?: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = Math.random().toString(36).substr(2, 9);
    const room: Room = {
      id: roomId,
      name: data.name,
      userCount: 0,
      hasPassword: !!data.password,
      password: data.password
    };
    
    this.rooms.set(roomId, room);
    
    // ส่งข้อมูลห้องกลับไป (ไม่รวมรหัสผ่าน)
    const publicRoomInfo = {
      id: room.id,
      name: room.name,
      userCount: room.userCount,
      hasPassword: room.hasPassword,
      isAIRoom: data.isAIRoom
    };
    
    // Emit to the creator
    client.emit('roomCreated', publicRoomInfo);
    
    // Broadcast updated rooms list to all clients (ไม่ส่งรหัสผ่าน)
    this.server.emit('roomsList', Array.from(this.rooms.values()).map(r => ({
      id: r.id,
      name: r.name,
      userCount: r.userCount,
      hasPassword: r.hasPassword
    })));
  }

  @SubscribeMessage('getRooms')
  handleGetRooms(@ConnectedSocket() client: Socket) {
    client.emit('roomsList', Array.from(this.rooms.values()));
  }

  @SubscribeMessage('messageRead')
  async handleMessageRead(
    @MessageBody() { roomId, messageTimestamp }: { roomId: string; messageTimestamp: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const user = await this.getUserFromToken(client);
      if (!user) {
        throw new WsException('Unauthorized');
      }

      // หาข้อความที่ถูกอ่าน
      const messages = this.chatHistory[roomId] || [];
      const message = messages.find(
        msg => msg.timestamp.toISOString() === messageTimestamp
      );

      if (message) {
        if (!message.readBy) {
          message.readBy = [];
        }
        // เพิ่มผู้อ่านถ้ายังไม่มีในรายการ
        if (!message.readBy.includes(user.username)) {
          message.readBy.push(user.username);
          // แจ้งทุกคนในห้องว่ามีคนอ่านข้อความ
          this.server.to(roomId).emit('messageReadUpdate', {
            messageTimestamp,
            readBy: message.readBy
          });
        }
      }
    } catch (error) {
      console.error('Error handling message read:', error);
    }
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @MessageBody() { roomId, messageTimestamp }: { roomId: string; messageTimestamp: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const user = await this.getUserFromToken(client);
      if (!user) {
        throw new WsException('Unauthorized');
      }

      const messages = this.chatHistory[roomId] || [];
      const messageIndex = messages.findIndex(
        msg => msg.timestamp.toISOString() === messageTimestamp && msg.username === user.username
      );

      if (messageIndex !== -1) {
        messages.splice(messageIndex, 1);
        this.server.to(roomId).emit('messageDeleted', { messageTimestamp });
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(
    @MessageBody() data: { roomId: string; messageTimestamp: string; newMessage: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const user = await this.getUserFromToken(client);
      if (!user) {
        throw new WsException('Unauthorized');
      }

      const messages = this.chatHistory[data.roomId] || [];
      const message = messages.find(
        msg => msg.timestamp.toISOString() === data.messageTimestamp && msg.username === user.username
      );

      if (message) {
        message.message = data.newMessage;
        message.edited = true;
        this.server.to(data.roomId).emit('messageEdited', {
          messageTimestamp: data.messageTimestamp,
          newMessage: data.newMessage
        });
      }
    } catch (error) {
      console.error('Error editing message:', error);
    }
  }

  // เพิ่ม method สำหรับส่งข้อความส่วนตัว
  @SubscribeMessage('privateMessage')
  async handlePrivateMessage(
    @MessageBody() data: { to: string; message: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      console.log('Handling private message:', data);
      
      const sender = await this.getUserFromToken(client);
      if (!sender) {
        console.log('Unauthorized sender');
        throw new WsException('Unauthorized');
      }

      console.log('Sender:', sender);

      // หา socket id ของผู้รับ
      const recipient = this.users.find(u => u.username === data.to);
      console.log('Found recipient:', recipient);
      
      if (!recipient) {
        console.log('Recipient not found:', data.to);
        client.emit('privateMessageError', { message: 'User not found or offline' });
        return;
      }

      // ตรวจสอบว่าผู้รับออนไลน์อยู่หรือไม่
      const isRecipientOnline = this.connectedSockets.has(recipient.id);
      console.log('Recipient online status:', isRecipientOnline);

      const message: PrivateMessage = {
        type: 'private',
        from: sender.username,
        to: data.to,
        message: data.message,
        timestamp: new Date(),
      };

      // เก็บประวัติข้อความ
      const chatKey = [sender.username, data.to].sort().join(':');
      if (!this.privateMessages[chatKey]) {
        this.privateMessages[chatKey] = [];
      }
      this.privateMessages[chatKey].push(message);

      console.log('Sending private message to recipient:', recipient.id);
      
      // ส่งข้อความไปยังผู้ส่ง
      client.emit('privateMessage', {
        ...message,
        isSent: true
      });

      // ส่งข้อความไปยังผู้รับ
      this.server.to(recipient.id).emit('privateMessage', {
        ...message,
        isSent: false
      });

      // ส่งการแจ้งเตือนให้ผู้รับ
      this.server.to(recipient.id).emit('notification', {
        type: 'privateMessage',
        from: sender.username,
        message: 'New private message'
      });

      console.log('Private message sent successfully');

    } catch (error) {
      console.error('Error sending private message:', error);
      client.emit('privateMessageError', { message: error.message });
    }
  }

  // เพิ่ม method สำหรับดึงประวัติแชทส่วนตัว
  @SubscribeMessage('getPrivateMessages')
  async handleGetPrivateMessages(
    @MessageBody() data: { withUser: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      console.log('Getting private messages with user:', data.withUser);
      
      const user = await this.getUserFromToken(client);
      if (!user) {
        console.log('Unauthorized user trying to get private messages');
        throw new WsException('Unauthorized');
      }

      const chatKey = [user.username, data.withUser].sort().join(':');
      console.log('Chat key:', chatKey);
      
      const messages = this.privateMessages[chatKey] || [];
      console.log('Found messages:', messages.length);

      // ส่งข้อความกลับไปยังผู้ขอ
      client.emit('privateMessageHistory', {
        withUser: data.withUser,
        messages: messages
      });

      console.log('Private message history sent successfully');

    } catch (error) {
      console.error('Error getting private messages:', error);
      client.emit('privateMessageError', { message: error.message });
    }
  }
}
