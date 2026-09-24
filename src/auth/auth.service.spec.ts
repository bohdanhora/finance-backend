import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

const userId = '507f1f77bcf86cd799439011';

const createService = (password?: string | null) => {
    const user = {
        name: 'Demo',
        email: 'demo@finance.local',
        registeredVia: password ? 'local' : 'google',
        password,
        save: jest.fn().mockResolvedValue(undefined),
    };
    const userModel = { findById: jest.fn().mockResolvedValue(user) };

    const service = new AuthService(
        userModel as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );

    return { service, user };
};

describe('AuthService passwords', () => {
    it('lets a google account create its first password without a current one', async () => {
        const { service, user } = createService(null);

        await expect(service.getAccount(userId)).resolves.toMatchObject({
            hasPassword: false,
        });
        await expect(
            service.changePassword(userId, { newPassword: 'secret1' }),
        ).resolves.toEqual({ message: 'Password created' });

        expect(user.save).toHaveBeenCalled();
        await expect(
            bcrypt.compare('secret1', user.password as string),
        ).resolves.toBe(true);
    });

    it('asks for the current password once one exists', async () => {
        const { service } = createService(await bcrypt.hash('secret1', 4));

        await expect(
            service.changePassword(userId, { newPassword: 'secret2' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.changePassword(userId, {
                oldPassword: 'wrong1',
                newPassword: 'secret2',
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('replaces the password when the current one matches', async () => {
        const { service, user } = createService(
            await bcrypt.hash('secret1', 4),
        );

        await expect(
            service.changePassword(userId, {
                oldPassword: 'secret1',
                newPassword: 'secret2',
            }),
        ).resolves.toEqual({ message: 'Password changed' });
        await expect(
            bcrypt.compare('secret2', user.password as string),
        ).resolves.toBe(true);
    });
});
