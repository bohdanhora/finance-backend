import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    RefreshToken,
    RefreshTokenSchema,
} from 'src/auth/schemas/refresh-token.schema';
import {
    ResetToken,
    ResetTokenSchema,
} from 'src/auth/schemas/reset-token.schema';
import { User, UserSchema } from 'src/auth/schemas/user.schema';
import { Session, SessionSchema } from 'src/sessions/session.schema';
import {
    AllTransactionsInfo,
    AllTransactionsInfoSchema,
} from 'src/transactions/schemas/all-info.schema';

import { AdminKeyGuard } from './admin-key.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Session.name, schema: SessionSchema },
            { name: RefreshToken.name, schema: RefreshTokenSchema },
            { name: ResetToken.name, schema: ResetTokenSchema },
            {
                name: AllTransactionsInfo.name,
                schema: AllTransactionsInfoSchema,
            },
        ]),
    ],
    controllers: [AdminController],
    providers: [AdminService, AdminKeyGuard],
})
export class AdminModule {}
