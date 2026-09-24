import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    RefreshToken,
    RefreshTokenSchema,
} from 'src/auth/schemas/refresh-token.schema';
import { Session, SessionSchema } from './session.schema';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Global()
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Session.name, schema: SessionSchema },
            { name: RefreshToken.name, schema: RefreshTokenSchema },
        ]),
    ],
    controllers: [SessionsController],
    providers: [SessionsService],
    exports: [SessionsService],
})
export class SessionsModule {}
