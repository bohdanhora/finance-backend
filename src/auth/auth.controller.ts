import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegistrationDto } from './dtos/registration.dto';
import { LoginDto } from './dtos/login.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';

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

    //TODO: change password

    //TODO: forgot password

    //TODO: reset password
}
