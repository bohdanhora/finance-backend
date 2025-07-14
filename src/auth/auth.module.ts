import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import {
    RefreshToken,
    RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import { ResetToken, ResetTokenSchema } from './schemas/reset-token.schema';
import { MailService } from 'src/services/mail.service';
import {
    AllTransactionsInfo,
    AllTransactionsInfoSchema,
} from 'src/transactions/schemas/all-info.schema';

import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from './strategies/google.strategy';
import { VerificationService } from 'src/services/verification.service';

@Module({
    imports: [
        PassportModule,
        MongooseModule.forFeature([
            {
                name: User.name,
                schema: UserSchema,
            },
            {
                name: RefreshToken.name,
                schema: RefreshTokenSchema,
            },
            {
                name: ResetToken.name,
                schema: ResetTokenSchema,
            },
            {
                name: AllTransactionsInfo.name,
                schema: AllTransactionsInfoSchema,
            },
        ]),
    ],
    controllers: [AuthController],
    providers: [AuthService, MailService, GoogleStrategy, VerificationService],
})
export class AuthModule {}
