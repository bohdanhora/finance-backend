import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { RefreshToken } from 'src/auth/schemas/refresh-token.schema';
import { describeDevice } from './helpers/user-agent';
import { Session, SessionEndReason, SessionMethod } from './session.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;
const HISTORY_LIMIT = 15;
const ROTATION_GRACE_MS = 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export type SessionContext = {
    userAgent?: string;
    ip?: string;
};

export type IssuedSession = {
    sessionId: string;
    userId: string;
    refreshToken: string;
};

type StoredSession = Session & { _id: Types.ObjectId };

export const hashToken = (token: string) =>
    createHash('sha256').update(token).digest('hex');

const createRefreshToken = () => randomBytes(32).toString('base64url');

const objectId = (id: string) => new Types.ObjectId(id);

const addDays = (date: Date, days: number) =>
    new Date(date.getTime() + days * DAY_MS);

const contextFields = ({ userAgent, ip }: SessionContext) => ({
    ...(userAgent !== undefined ? { userAgent: userAgent.slice(0, 512) } : {}),
    ...(ip ? { ip: ip.slice(0, 64) } : {}),
});

export const isSessionActive = (
    session: Pick<Session, 'endedAt' | 'expiresAt'>,
    now = new Date(),
) => !session.endedAt && session.expiresAt.getTime() > now.getTime();

export const toSessionView = (
    session: StoredSession,
    currentId: string | undefined,
    now = new Date(),
) => {
    const active = isSessionActive(session, now);
    const id = session._id.toString();

    return {
        id,
        ...describeDevice(session.userAgent),
        ip: session.ip,
        method: session.method,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        expiresAt: session.expiresAt,
        active,
        current: active && id === currentId,
        ...(active
            ? {}
            : {
                  endedAt: session.endedAt ?? session.expiresAt,
                  endReason: session.endReason ?? 'expired',
              }),
    };
};

@Injectable()
export class SessionsService {
    constructor(
        @InjectModel(Session.name) private SessionModel: Model<Session>,
        @InjectModel(RefreshToken.name)
        private LegacyTokenModel: Model<RefreshToken>,
        private configService: ConfigService,
    ) {}

    private lifetimeDays() {
        return this.configService.get<number>('jwt.refreshTokenTtlDays') || 3;
    }

    async start(
        userId: string,
        method: SessionMethod,
        context: SessionContext = {},
    ): Promise<IssuedSession> {
        const now = new Date();
        const refreshToken = createRefreshToken();
        const expiresAt = addDays(now, this.lifetimeDays());

        const session = await this.SessionModel.create({
            userId: objectId(userId),
            tokenHash: hashToken(refreshToken),
            method,
            userAgent: '',
            ip: '',
            ...contextFields(context),
            createdAt: now,
            lastActiveAt: now,
            expiresAt,
            purgeAt: addDays(expiresAt, HISTORY_DAYS),
        });

        return { sessionId: session._id.toString(), userId, refreshToken };
    }

    async rotate(
        refreshToken: string,
        context: SessionContext = {},
    ): Promise<IssuedSession | null> {
        const now = new Date();
        const tokenHash = hashToken(refreshToken);
        const session = await this.SessionModel.findOne({
            endedAt: { $exists: false },
            expiresAt: { $gt: now },
            $or: [
                { tokenHash },
                {
                    previousTokenHash: tokenHash,
                    rotatedAt: {
                        $gte: new Date(now.getTime() - ROTATION_GRACE_MS),
                    },
                },
            ],
        });

        if (!session) {
            return this.adoptLegacyToken(refreshToken, context);
        }

        const nextToken = createRefreshToken();
        const expiresAt = addDays(now, this.lifetimeDays());

        await this.SessionModel.updateOne(
            { _id: session._id },
            {
                $set: {
                    tokenHash: hashToken(nextToken),
                    previousTokenHash: session.tokenHash,
                    rotatedAt: now,
                    lastActiveAt: now,
                    expiresAt,
                    purgeAt: addDays(expiresAt, HISTORY_DAYS),
                    ...contextFields(context),
                },
            },
        );

        return {
            sessionId: session._id.toString(),
            userId: session.userId.toString(),
            refreshToken: nextToken,
        };
    }

    private async adoptLegacyToken(
        refreshToken: string,
        context: SessionContext,
    ): Promise<IssuedSession | null> {
        const legacy = await this.LegacyTokenModel.findOneAndDelete({
            token: refreshToken,
            expiryDate: { $gte: new Date() },
        });

        if (!legacy || !Types.ObjectId.isValid(legacy.userId)) {
            return null;
        }

        return this.start(
            legacy.userId.toString(),
            SessionMethod.LEGACY,
            context,
        );
    }

    async touch(
        sessionId: string,
        userId: string,
        context: SessionContext = {},
    ): Promise<boolean> {
        if (
            !Types.ObjectId.isValid(sessionId) ||
            !Types.ObjectId.isValid(userId)
        ) {
            return false;
        }

        const session = await this.SessionModel.findOne(
            { _id: objectId(sessionId), userId: objectId(userId) },
            { endedAt: 1, expiresAt: 1, lastActiveAt: 1 },
        ).lean();

        if (!session || !isSessionActive(session)) {
            return false;
        }

        const now = new Date();
        if (
            now.getTime() - session.lastActiveAt.getTime() >
            TOUCH_INTERVAL_MS
        ) {
            await this.SessionModel.updateOne(
                { _id: objectId(sessionId) },
                { $set: { lastActiveAt: now, ...contextFields(context) } },
            );
        }

        return true;
    }

    async list(userId: string, currentId?: string) {
        const now = new Date();
        const sessions = await this.SessionModel.find({
            userId: objectId(userId),
        })
            .sort({ lastActiveAt: -1 })
            .lean<StoredSession[]>();
        const views = sessions.map((session) =>
            toSessionView(session, currentId, now),
        );

        return {
            active: views.filter((view) => view.active),
            recent: views
                .filter((view) => !view.active)
                .sort(
                    (a, b) =>
                        new Date(b.endedAt!).getTime() -
                        new Date(a.endedAt!).getTime(),
                )
                .slice(0, HISTORY_LIMIT),
        };
    }

    private endUpdate(reason: SessionEndReason) {
        const now = new Date();
        return {
            $set: {
                endedAt: now,
                endReason: reason,
                purgeAt: addDays(now, HISTORY_DAYS),
            },
        };
    }

    async remove(userId: string, sessionId: string) {
        if (!Types.ObjectId.isValid(sessionId)) {
            return false;
        }

        const session = await this.SessionModel.findOne({
            _id: objectId(sessionId),
            userId: objectId(userId),
        }).lean<StoredSession>();

        if (!session) {
            return false;
        }

        if (isSessionActive(session)) {
            await this.SessionModel.updateOne(
                { _id: session._id },
                this.endUpdate(SessionEndReason.REVOKED),
            );
        } else {
            await this.SessionModel.deleteOne({ _id: session._id });
        }

        return true;
    }

    async endAll(userId: string, reason: SessionEndReason, exceptId?: string) {
        const result = await this.SessionModel.updateMany(
            {
                userId: objectId(userId),
                endedAt: { $exists: false },
                expiresAt: { $gt: new Date() },
                ...(exceptId && Types.ObjectId.isValid(exceptId)
                    ? { _id: { $ne: new Types.ObjectId(exceptId) } }
                    : {}),
            },
            this.endUpdate(reason),
        );

        await this.LegacyTokenModel.deleteMany({ userId: objectId(userId) });

        return result.modifiedCount;
    }

    async endByRefreshToken(refreshToken: string) {
        const result = await this.SessionModel.updateOne(
            { tokenHash: hashToken(refreshToken), endedAt: { $exists: false } },
            this.endUpdate(SessionEndReason.LOGOUT),
        );

        if (!result.modifiedCount) {
            await this.LegacyTokenModel.deleteOne({ token: refreshToken });
        }
    }

    async clearHistory(userId: string) {
        const now = new Date();
        const result = await this.SessionModel.deleteMany({
            userId: objectId(userId),
            $or: [{ endedAt: { $exists: true } }, { expiresAt: { $lte: now } }],
        });

        return result.deletedCount;
    }
}
