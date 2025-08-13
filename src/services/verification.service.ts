import { Injectable } from '@nestjs/common';

interface CodeEntry {
    code: string;
    expiresAt: Date;
}

@Injectable()
export class VerificationService {
    private codes = new Map<string, CodeEntry>();

    private readonly CODE_TTL_MS = 5 * 60 * 1000;

    generateCode(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    createCode(email: string) {
        const code = this.generateCode();
        const expiresAt = new Date(Date.now() + this.CODE_TTL_MS);
        this.codes.set(email, { code, expiresAt });
        return code;
    }

    verifyCode(email: string, inputCode: string): boolean {
        const entry = this.codes.get(email);
        if (!entry) return false;

        const now = new Date();
        if (now > entry.expiresAt) {
            this.codes.delete(email);
            return false;
        }

        const isValid = entry.code === inputCode;

        if (isValid) {
            this.codes.delete(email);
        }

        return isValid;
    }

    deleteCode(email: string) {
        this.codes.delete(email);
    }
}
