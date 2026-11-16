import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AllowPendingPassword, CurrentUser, Public } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() @MinLength(3, { message: 'Enter your email or enrollment number.' })
  identifier: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  password: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(1, { message: 'Enter your current password.' })
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'Choose a new password of at least 8 characters.' })
  @MaxLength(72, { message: 'Keep the new password under 72 characters.' })
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.identifier, dto.password);
  }

  @Get('me')
  @AllowPendingPassword()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user);
  }

  @Post('change-password')
  @AllowPendingPassword()
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }
}
