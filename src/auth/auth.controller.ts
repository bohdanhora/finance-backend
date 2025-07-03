import { Body, Controller, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegistrationDto } from './dtos/registration.dto';
import { LoginDto } from './dtos/login.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { AuthGuard } from 'src/guards/auth.guard';

interface RequestWithUserId extends Request {
    userId: string;
}

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('registration')
    async registration(@Body() registationData: RegistrationDto) {
        return this.authService.registration(registationData);
    }

    @Post('login')
    async login(@Body() loginData: LoginDto) {
        return this.authService.login(loginData);
    }

    @Post('refresh')
    async refreshTokens(@Body() refreshTokenData: RefreshTokenDto) {
        return this.authService.refreshTokens(refreshTokenData.refreshToken);
    }

    @UseGuards(AuthGuard)
    @Put('change-password')
    async changePassword(
        @Body() changePasswordData: ChangePasswordDto,
        @Req() req: RequestWithUserId,
    ) {
        return this.authService.changePassword(req.userId, changePasswordData);
    }

    @Post('forgot-password')
    async forgotPassword(@Body() forgotPasswordData: ForgotPasswordDto) {
        return this.authService.forgotPassword(forgotPasswordData);
    }

    @Put('reset-password')
    async resetPassword(@Body() resetPasswordData: ResetPasswordDto) {
        return this.authService.resetPassword(resetPasswordData);
    }
}
