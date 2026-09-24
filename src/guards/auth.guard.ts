import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Types } from 'mongoose';
import { requestContext } from 'src/sessions/helpers/request-context';
import { SessionsService } from 'src/sessions/sessions.service';

interface AuthenticatedRequest extends Request {
    userId?: string;
    sessionId?: string;
}

type AccessPayload = { userId: string; sid?: string };

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        private sessionsService: SessionsService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const token = this.extractTokenFromHeader(request);

        if (!token) {
            throw new UnauthorizedException('Invalid Token');
        }

        let payload: AccessPayload;
        try {
            payload = this.jwtService.verify<AccessPayload>(token);
        } catch (error: unknown) {
            Logger.error(
                error instanceof Error
                    ? error.message
                    : 'Unknown error during token verification',
            );
            throw new UnauthorizedException('Invalid Token');
        }

        if (!payload.userId || !Types.ObjectId.isValid(payload.userId)) {
            throw new UnauthorizedException('Invalid userId in token');
        }

        if (payload.sid) {
            const alive = await this.sessionsService.touch(
                payload.sid,
                payload.userId,
                requestContext(request),
            );

            if (!alive) {
                throw new UnauthorizedException('Session ended');
            }
        }

        request.userId = payload.userId;
        request.sessionId = payload.sid;

        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        return request.headers.authorization?.split(' ')[1];
    }
}
