import { Injectable } from '@nestjs/common';

@Injectable()
export class VerificationService {
    private codes = new Map<string, string>();

    generateCode(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    createCode(email: string) {
        const code = this.generateCode();
        this.codes.set(email, code);
        return code;
    }

    verifyCode(email: string, inputCode: string) {
        const stored = this.codes.get(email);
        return stored === inputCode;
    }

    deleteCode(email: string) {
        this.codes.delete(email);
    }
}
