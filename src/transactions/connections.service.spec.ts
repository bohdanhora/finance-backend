import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/app.controller';
import { ConnectionsService } from './connections.service';

const request = {
    userId: '507f1f77bcf86cd799439011',
} as AuthenticatedRequest;

type Update = {
    $set?: Record<string, unknown>;
    $unset?: Record<string, unknown>;
};

const createService = (
    secret: string | undefined,
    stored: Record<string, unknown> = {},
) => {
    const model = {
        findOne: jest.fn(() => ({
            select: jest.fn().mockResolvedValue(stored),
        })),
        updateOne: jest.fn((_filter: unknown, update: Update) => {
            Object.assign(stored, update.$set);
            Object.keys(update.$unset || {}).forEach((field) => {
                stored[field] = undefined;
            });
            return Promise.resolve({});
        }),
    };
    const config = { get: jest.fn().mockReturnValue(secret) };

    return {
        service: new ConnectionsService(model as never, config as never),
        stored,
    };
};

describe('ConnectionsService', () => {
    it('keeps the monobank token encrypted and hands it back to the owner', async () => {
        const { service, stored } = createService('secret');

        await service.setMonobankToken({ token: ' uToken123 ' }, request);

        expect(JSON.stringify(stored)).not.toContain('uToken123');
        await expect(service.getConnections(request)).resolves.toEqual({
            assistant: null,
            monobankToken: 'uToken123',
        });
    });

    it('forgets the token once it is removed', async () => {
        const { service } = createService('secret');

        await service.setMonobankToken({ token: 'uToken123' }, request);
        await service.clearMonobankToken(request);

        await expect(service.getConnections(request)).resolves.toEqual({
            assistant: null,
            monobankToken: null,
        });
    });

    it('treats a token sealed with another secret as missing', async () => {
        const first = createService('old secret');
        await first.service.setMonobankToken({ token: 'uToken123' }, request);

        const second = createService('new secret', first.stored);

        await expect(second.service.getConnections(request)).resolves.toEqual(
            expect.objectContaining({ monobankToken: null }),
        );
    });

    it('refuses to store a token when no secret is configured', async () => {
        const { service } = createService(undefined);

        await expect(
            service.setMonobankToken({ token: 'uToken123' }, request),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('saves the assistant choice without unknown providers or empty models', async () => {
        const { service } = createService('secret');

        const saved = await service.setAssistantPreferences(
            {
                provider: 'openai',
                models: {
                    openai: ' gpt-5 ',
                    anthropic: 'claude-opus-5',
                    google: '   ',
                    unknown: 'something',
                },
                baseUrl: ' https://api.example.com/v1 ',
            },
            request,
        );

        expect(saved.assistant).toEqual({
            provider: 'openai',
            models: { openai: 'gpt-5', anthropic: 'claude-opus-5' },
            baseUrl: 'https://api.example.com/v1',
        });
        await expect(service.getConnections(request)).resolves.toEqual({
            assistant: saved.assistant,
            monobankToken: null,
        });
    });
});
