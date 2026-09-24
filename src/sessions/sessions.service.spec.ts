import 'reflect-metadata';
import { Types } from 'mongoose';
import { describeDevice } from './helpers/user-agent';
import { SessionEndReason, SessionMethod } from './session.schema';
import { SessionsService, hashToken } from './sessions.service';

type Doc = Record<string, any>;

const same = (a: unknown, b: unknown) => {
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }
    if (a instanceof Types.ObjectId !== b instanceof Types.ObjectId) {
        return false;
    }
    return String(a) === String(b);
};

const matchesValue = (value: unknown, condition: unknown): boolean => {
    if (
        condition &&
        typeof condition === 'object' &&
        !(condition instanceof Date) &&
        !(condition instanceof Types.ObjectId)
    ) {
        return Object.entries(condition).every(([operator, expected]) => {
            switch (operator) {
                case '$exists':
                    return (value !== undefined) === expected;
                case '$gt':
                    return (
                        value !== undefined &&
                        (value as Date) > (expected as Date)
                    );
                case '$gte':
                    return (
                        value !== undefined &&
                        (value as Date) >= (expected as Date)
                    );
                case '$lte':
                    return (
                        value !== undefined &&
                        (value as Date) <= (expected as Date)
                    );
                case '$ne':
                    return !same(value, expected);
                default:
                    throw new Error(`Unsupported operator ${operator}`);
            }
        });
    }
    return value !== undefined && same(value, condition);
};

const matches = (doc: Doc, filter: Doc): boolean =>
    Object.entries(filter).every(([key, condition]) =>
        key === '$or'
            ? (condition as Doc[]).some((branch) => matches(doc, branch))
            : matchesValue(doc[key], condition),
    );

const query = <T>(value: T) => ({
    lean: () => Promise.resolve(value),
    sort: () => query(value),
    then: (
        resolve: (value: T) => unknown,
        reject?: (error: unknown) => unknown,
    ) => Promise.resolve(value).then(resolve, reject),
});

const createModel = (docs: Doc[]) => ({
    docs,
    create: jest.fn((fields: Doc) => {
        const doc = { _id: new Types.ObjectId(), ...fields };
        docs.push(doc);
        return Promise.resolve(doc);
    }),
    findOne: jest.fn((filter: Doc) =>
        query(docs.find((doc) => matches(doc, filter)) ?? null),
    ),
    find: jest.fn((filter: Doc) =>
        query(docs.filter((doc) => matches(doc, filter))),
    ),
    updateOne: jest.fn((filter: Doc, update: { $set: Doc }) => {
        const doc = docs.find((item) => matches(item, filter));
        if (doc) Object.assign(doc, update.$set);
        return Promise.resolve({ modifiedCount: doc ? 1 : 0 });
    }),
    updateMany: jest.fn((filter: Doc, update: { $set: Doc }) => {
        const found = docs.filter((item) => matches(item, filter));
        found.forEach((doc) => Object.assign(doc, update.$set));
        return Promise.resolve({ modifiedCount: found.length });
    }),
    deleteOne: jest.fn((filter: Doc) => {
        const index = docs.findIndex((doc) => matches(doc, filter));
        if (index >= 0) docs.splice(index, 1);
        return Promise.resolve({ deletedCount: index >= 0 ? 1 : 0 });
    }),
    deleteMany: jest.fn((filter: Doc) => {
        const before = docs.length;
        const kept = docs.filter((doc) => !matches(doc, filter));
        docs.splice(0, docs.length, ...kept);
        return Promise.resolve({ deletedCount: before - kept.length });
    }),
    findOneAndDelete: jest.fn((filter: Doc) => {
        const index = docs.findIndex((doc) => matches(doc, filter));
        return Promise.resolve(index >= 0 ? docs.splice(index, 1)[0] : null);
    }),
});

const userId = '507f1f77bcf86cd799439011';
const chrome =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const createService = (legacy: Doc[] = []) => {
    const sessions = createModel([]);
    const legacyTokens = createModel(legacy);
    const config = { get: () => 3 };

    return {
        sessions,
        legacyTokens,
        service: new SessionsService(
            sessions as never,
            legacyTokens as never,
            config as never,
        ),
    };
};

describe('describeDevice', () => {
    it('names the browser, system and kind of device', () => {
        expect(describeDevice(chrome)).toEqual({
            browser: 'Chrome 140',
            os: 'Windows',
            deviceType: 'desktop',
        });
        expect(describeDevice(iphone)).toEqual({
            browser: 'Safari 18',
            os: 'iOS 18',
            deviceType: 'mobile',
        });
        expect(
            describeDevice(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
            ).browser,
        ).toBe('Edge 140');
        expect(describeDevice('')).toEqual({
            browser: 'Unknown browser',
            os: 'Unknown system',
            deviceType: 'desktop',
        });
    });
});

describe('SessionsService', () => {
    it('keeps every sign-in as its own session and stores only a hash of the token', async () => {
        const { service, sessions } = createService();

        const laptop = await service.start(userId, SessionMethod.PASSWORD, {
            userAgent: chrome,
            ip: '10.0.0.1',
        });
        const phone = await service.start(userId, SessionMethod.GOOGLE, {
            userAgent: iphone,
        });

        expect(laptop.sessionId).not.toBe(phone.sessionId);
        expect(sessions.docs[0].tokenHash).toBe(hashToken(laptop.refreshToken));
        expect(JSON.stringify(sessions.docs)).not.toContain(
            laptop.refreshToken,
        );

        const { active, recent } = await service.list(userId, laptop.sessionId);

        expect(active).toHaveLength(2);
        expect(recent).toHaveLength(0);
        expect(active.find((item) => item.current)).toEqual(
            expect.objectContaining({
                id: laptop.sessionId,
                browser: 'Chrome 140',
                ip: '10.0.0.1',
                method: SessionMethod.PASSWORD,
            }),
        );
    });

    it('rotates the refresh token and lets the previous one through only for a short while', async () => {
        const { service, sessions } = createService();
        const first = await service.start(userId, SessionMethod.PASSWORD);

        const second = await service.rotate(first.refreshToken);
        expect(second?.sessionId).toBe(first.sessionId);
        expect(second?.refreshToken).not.toBe(first.refreshToken);

        const raced = await service.rotate(first.refreshToken);
        expect(raced?.sessionId).toBe(first.sessionId);

        sessions.docs[0].rotatedAt = new Date(Date.now() - 5 * 60 * 1000);
        expect(await service.rotate(first.refreshToken)).toBeNull();
        expect(await service.rotate('made-up')).toBeNull();
    });

    it('turns a refresh token from before sessions existed into a session', async () => {
        const { service, legacyTokens } = createService([
            {
                _id: new Types.ObjectId(),
                token: 'old-uuid',
                userId: new Types.ObjectId(userId),
                expiryDate: new Date(Date.now() + 60_000),
            },
        ]);

        const adopted = await service.rotate('old-uuid', { userAgent: chrome });

        expect(adopted?.userId).toBe(userId);
        expect(legacyTokens.docs).toHaveLength(0);
        expect(await service.rotate('old-uuid')).toBeNull();
    });

    it('ends a session so its access token stops working, then removes it from history', async () => {
        const { service } = createService();
        const laptop = await service.start(userId, SessionMethod.PASSWORD);
        const phone = await service.start(userId, SessionMethod.PASSWORD);

        expect(await service.touch(phone.sessionId, userId)).toBe(true);
        expect(await service.remove(userId, phone.sessionId)).toBe(true);
        expect(await service.touch(phone.sessionId, userId)).toBe(false);
        expect(await service.rotate(phone.refreshToken)).toBeNull();

        const afterEnd = await service.list(userId, laptop.sessionId);
        expect(afterEnd.active.map((item) => item.id)).toEqual([
            laptop.sessionId,
        ]);
        expect(afterEnd.recent).toEqual([
            expect.objectContaining({
                id: phone.sessionId,
                endReason: SessionEndReason.REVOKED,
            }),
        ]);

        expect(await service.remove(userId, phone.sessionId)).toBe(true);
        expect((await service.list(userId)).recent).toHaveLength(0);
        expect(
            await service.remove('507f1f77bcf86cd799439099', laptop.sessionId),
        ).toBe(false);
    });

    it('ends every other session but keeps the current one', async () => {
        const { service } = createService();
        const current = await service.start(userId, SessionMethod.PASSWORD);
        await service.start(userId, SessionMethod.PASSWORD);
        await service.start(userId, SessionMethod.GOOGLE);

        expect(
            await service.endAll(
                userId,
                SessionEndReason.REVOKED,
                current.sessionId,
            ),
        ).toBe(2);

        const { active, recent } = await service.list(
            userId,
            current.sessionId,
        );
        expect(active.map((item) => item.id)).toEqual([current.sessionId]);
        expect(recent).toHaveLength(2);

        await service.endByRefreshToken(current.refreshToken);
        expect(await service.touch(current.sessionId, userId)).toBe(false);
        expect(await service.clearHistory(userId)).toBe(3);
    });
});
