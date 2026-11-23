import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';

const existingId = new Types.ObjectId();

type StoredUser = {
    _id: Types.ObjectId;
    name: string;
    email: string;
    password?: string;
    emailVerified?: boolean;
    save: jest.Mock;
};

const setup = ({
    existing,
    codeValid = true,
}: {
    existing?: Partial<StoredUser>;
    codeValid?: boolean;
} = {}) => {
    const stored: StoredUser | null = existing
        ? {
              _id: existingId,
              name: 'Old',
              email: 'me@finance.local',
              password: 'hash',
              save: jest.fn().mockResolvedValue(undefined),
              ...existing,
          }
        : null;

    const created: Record<string, unknown>[] = [];
    const userModel = {
        findOne: jest.fn(() => ({
            collation: jest.fn().mockResolvedValue(stored),
        })),
        create: jest.fn((data: Record<string, unknown>) => {
            created.push(data);
            return Promise.resolve({ _id: new Types.ObjectId(), ...data });
        }),
        deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    const finances = {
        create: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue(undefined),
    };
    const sessions = {
        start: jest.fn().mockResolvedValue({
            sessionId: 's1',
            userId: 'u1',
            refreshToken: 'r1',
        }),
        endAll: jest.fn().mockResolvedValue(0),
    };
    const resetTokens = { deleteMany: jest.fn().mockResolvedValue(undefined) };
    const jwt = { sign: jest.fn().mockReturnValue('access') };
    const mail = {
        sendEmailVerificationCode: jest.fn().mockResolvedValue(undefined),
    };
    const verification = {
        createCode: jest.fn().mockResolvedValue('123456'),
        verifyCode: jest.fn().mockResolvedValue(codeValid),
    };
    const config = { get: jest.fn().mockReturnValue('15m') };

    const service = new AuthService(
        userModel as never,
        finances as never,
        sessions as never,
        resetTokens as never,
        jwt as never,
        mail as never,
        verification as never,
        config as never,
    );

    return {
        service,
        stored,
        created,
        userModel,
        finances,
        sessions,
        mail,
        verification,
    };
};

const form = {
    name: 'New',
    email: ' Me@Finance.local ',
    password: 'secret1',
};

describe('AuthService registration', () => {
    it('creates an unconfirmed account, signs in right away and sends a code', async () => {
        const { service, created, mail } = setup();

        const result = await service.registration(form);

        expect(result).toMatchObject({
            accessToken: 'access',
            refreshToken: 'r1',
        });
        expect(created[0]).toMatchObject({
            email: 'me@finance.local',
            emailVerified: false,
        });
        await new Promise((resolve) => setImmediate(resolve));
        expect(mail.sendEmailVerificationCode).toHaveBeenCalledWith(
            'me@finance.local',
            '123456',
        );
    });

    it('tells a taken confirmed email apart from an unconfirmed one', async () => {
        const confirmed = setup({ existing: {} });
        await expect(
            confirmed.service.registration(form),
        ).rejects.toMatchObject({
            response: { code: 'EMAIL_TAKEN' },
        });

        const unconfirmed = setup({ existing: { emailVerified: false } });
        await expect(
            unconfirmed.service.registration(form),
        ).rejects.toMatchObject({
            response: { code: 'EMAIL_UNVERIFIED' },
        });
    });
});

describe('AuthService claimEmail', () => {
    it('replaces an unconfirmed account once the code proves the email', async () => {
        const { service, created, userModel, finances, sessions } = setup({
            existing: { emailVerified: false },
        });

        await service.claimEmail({ ...form, verificationCode: '123456' });

        expect(sessions.endAll).toHaveBeenCalledWith(
            existingId.toString(),
            'email-claimed',
        );
        expect(userModel.deleteOne).toHaveBeenCalledWith({ _id: existingId });
        expect(finances.deleteMany).toHaveBeenCalled();
        expect(created[0]).toMatchObject({ emailVerified: true });
    });

    it('never touches a confirmed account', async () => {
        const { service, userModel } = setup({ existing: {} });

        await expect(
            service.claimEmail({ ...form, verificationCode: '123456' }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(userModel.deleteOne).not.toHaveBeenCalled();
    });

    it('keeps the old account when the code is wrong', async () => {
        const { service, userModel } = setup({
            existing: { emailVerified: false },
            codeValid: false,
        });

        await expect(
            service.claimEmail({ ...form, verificationCode: '000000' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(userModel.deleteOne).not.toHaveBeenCalled();
    });
});

describe('AuthService email confirmation rules', () => {
    it('does not send a reset link to an unconfirmed email', async () => {
        const { service } = setup({ existing: { emailVerified: false } });

        await expect(
            service.forgotPassword({ email: 'me@finance.local' }),
        ).rejects.toMatchObject({ response: { code: 'EMAIL_UNVERIFIED' } });
    });

    it('lets google take over an unconfirmed account and drops its password and sessions', async () => {
        const { service, stored, sessions } = setup({
            existing: { emailVerified: false },
        });

        await service.validateOAuthLogin({
            email: 'me@finance.local',
            name: 'Me',
            picture: '',
        });

        expect(stored?.emailVerified).toBe(true);
        expect(stored?.password).toBeUndefined();
        expect(stored?.save).toHaveBeenCalled();
        expect(sessions.endAll).toHaveBeenCalledWith(
            existingId.toString(),
            'email-claimed',
        );
    });
});
