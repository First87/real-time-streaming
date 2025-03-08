import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    // ตรวจสอบว่ามี email หรือ username ซ้ำหรือไม่
    const existingUser = await this.usersRepository.findOne({
      where: [
        { email: registerDto.email },
        { username: registerDto.username }
      ]
    });

    if (existingUser) {
      throw new ConflictException('Email or username already exists');
    }

    // เข้ารหัส password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    
    // สร้าง user ใหม่
    const user = this.usersRepository.create({
      ...registerDto,
      password: hashedPassword,
    });

    // บันทึกลงฐานข้อมูล
    await this.usersRepository.save(user);
    
    // ส่งข้อมูลกลับโดยไม่มี password
    const { password, ...result } = user;
    return result;
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    const { password: _, ...result } = user;
    return result;
  }

  async login(user: Partial<User>) {
    const payload = {
      email: user.email,
      sub: user.id,
      username: user.username,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    };
  }
} 