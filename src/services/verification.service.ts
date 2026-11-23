import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'crypto';
import { Model } from 'mongoose';
import { EmailCode } from 'src/auth/schemas/email-code.schema';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class VerificationService {
    constructor(
        @InjectModel(EmailCode.name) private EmailCodeModel: Model<EmailCode>,
    ) {}

    async createCode(email: string): Promise<string> {
        const now = Date.now();
        const existing = await this.EmailCodeModel.findOne({ email });

        if (existing && now - existing.sentAt.getTime() < RESEND_AFTER_MS) {
            throw new HttpException(
                {
                    message:
                        'Please wait a minute before requesting a new code',
                    code: 'CODE_RECENTLY_SENT',
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const code = randomInt(100000, 1000000).toString();
        await this.EmailCodeModel.updateOne(
            { email },
            {
                $set: {
                    code,
                    sentAt: new Date(now),
                    expiresAt: new Date(now + CODE_TTL_MS),
                    attempts: 0,
                },
            },
            { upsert: true },
        );

        return code;
    }

    async verifyCode(email: string, inputCode: string): Promise<boolean> {
        const entry = await this.EmailCodeModel.findOne({ email });
        if (!entry) return false;

        if (
            entry.expiresAt.getTime() < Date.now() ||
            entry.attempts >= MAX_ATTEMPTS
        ) {
            await this.EmailCodeModel.deleteOne({ email });
            return false;
        }

        if (entry.code !== inputCode.trim()) {
            await this.EmailCodeModel.updateOne(
                { email },
                { $inc: { attempts: 1 } },
            );
            return false;
        }

        await this.EmailCodeModel.deleteOne({ email });
        return true;
    }
}
