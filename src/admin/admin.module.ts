import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
