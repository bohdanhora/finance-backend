import {
    Body,
    Controller,
    Get,
    Post,
    Put,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegistrationDto } from './dtos/registration.dto';
import { LoginDto } from './dtos/login.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { AuthGuard } from 'src/guards/auth.guard';
import { LogoutDto } from './dtos/logout.dto';
import { GoogleAuthGuard } from 'src/guards/google-auth.guard';
import { UserDocument } from './schemas/user.schema';

interface RequestWithUserId extends Request {
    userId: string;
}

interface RequestWithUser extends Request {
    user: UserDocument;
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

    @Post('logout')
    async logout(@Body() logoutData: LogoutDto) {
        return this.authService.logout(logoutData);
    }

    @Get('google')
    @UseGuards(GoogleAuthGuard)
    async googleAuth() {}

    @Get('google/redirect')
    @UseGuards(GoogleAuthGuard)
    async googleRedirect(@Req() req: RequestWithUser) {
        const tokens = await this.authService.generateUserTokens(req.user);
        return {
            message: 'Login via Google successful',
            user: req.user,
            ...tokens,
        };
    }
}
