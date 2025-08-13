import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(
        configService: ConfigService,
        private authService: AuthService,
    ) {
        super({
            clientID: configService.get<string>('google.clientId')!,
            clientSecret: configService.get<string>('google.clientSecret')!,
            callbackURL: configService.get<string>('google.callbackUrl')!,
            scope: ['email', 'profile'],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
    ) {
        const { emails, name, photos } = profile;

        if (!emails?.[0]?.value) {
            return done(
                new UnauthorizedException('Google account has no email'),
                false,
            );
        }

        const user = await this.authService.validateOAuthLogin({
            email: emails[0].value,
            name: name?.givenName || '',
            picture: photos?.[0]?.value || '',
        });

        done(null, user);
    }
}
