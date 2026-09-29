import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { CurrentUser, Public } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user);
  }
}
