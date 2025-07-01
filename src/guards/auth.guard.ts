import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Observable } from 'rxjs';

interface AuthenticatedRequest extends Request {
    userId?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private jwtService: JwtService) {}

    canActivate(
        context: ExecutionContext,
    ): boolean | Promise<boolean> | Observable<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const token = this.extractTokenFromHeader(request);

        if (!token) {
            throw new UnauthorizedException('Invalid Token');
        }

        try {
            const payload = this.jwtService.verify<{ userId: string }>(token);
            request.userId = payload.userId;
        } catch (error: unknown) {
            if (error instanceof Error) {
                Logger.error(error.message);
            } else {
                Logger.error('Unknown error during token verification');
            }
            throw new UnauthorizedException('Invalid Token');
        }

        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        return request.headers.authorization?.split(' ')[1];
    }
}
