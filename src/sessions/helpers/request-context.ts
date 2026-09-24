import { Request } from 'express';
import type { SessionContext } from '../sessions.service';

const headerValue = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

export const requestContext = (request: Request): SessionContext => {
    const ip =
        headerValue(request.headers['x-forwarded-for'])
            ?.split(',')[0]
            ?.trim() ||
        request.ip ||
        request.socket?.remoteAddress ||
        '';

    return {
        userAgent: headerValue(request.headers['user-agent']) ?? '',
        ip: ip.replace(/^::ffff:/, ''),
    };
};
