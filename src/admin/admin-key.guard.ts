import { createHash, timingSafeEqual } from 'node:crypto';

import {
    Injectable,
    NotFoundException,
    UnauthorizedException,
    type CanActivate,
    type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

export const ADMIN_KEY_HEADER = 'x-admin-key';
export const MIN_ADMIN_KEY_LENGTH = 32;

const digest = (value: string): Buffer =>
    createHash('sha256').update(value).digest();

export const isAdminKeyValid = (
    provided: string | undefined,
    expected: string,
): boolean =>
    Boolean(provided) &&
    expected.length > 0 &&
    timingSafeEqual(digest(provided ?? ''), digest(expected));

@Injectable()
export class AdminKeyGuard implements CanActivate {
    private readonly apiKey: string;

    constructor(config: ConfigService) {
        this.apiKey = (config.get<string>('admin.apiKey') ?? '').trim();

        if (this.apiKey && this.apiKey.length < MIN_ADMIN_KEY_LENGTH) {
            throw new Error(
                `ADMIN_API_KEY must be at least ${MIN_ADMIN_KEY_LENGTH} characters`,
            );
        }
    }

    canActivate(context: ExecutionContext): boolean {
        if (!this.apiKey) {
            throw new NotFoundException();
        }

        const request = context.switchToHttp().getRequest<Request>();

        if (!isAdminKeyValid(request.header(ADMIN_KEY_HEADER), this.apiKey)) {
            throw new UnauthorizedException();
        }

        return true;
    }
}
