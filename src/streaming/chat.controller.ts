import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class ChatController {
  @Get('roomchat')
  getChatRoom(@Res() res: Response) {
    return res.sendFile(join(__dirname, '..', '..', 'public', 'index.html'));
  }

  // เพิ่ม route สำหรับหน้า login
  @Get('login')
  getLoginPage(@Res() res: Response) {
    return res.sendFile(join(__dirname, '..', '..', 'public', 'login.html'));
  }

  // เพิ่ม route สำหรับหน้า rooms
  @Get('rooms')
  getRoomsPage(@Res() res: Response) {
    return res.sendFile(join(__dirname, '..', '..', 'public', 'rooms.html'));
  }

  // เพิ่ม route สำหรับหน้า chat
  @Get('chat')
  getChatPage(@Res() res: Response) {
    return res.sendFile(join(__dirname, '..', '..', 'public', 'chat.html'));
  }
}
