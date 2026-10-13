import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { RefreshToken } from 'src/auth/schemas/refresh-token.schema';
import { ResetToken } from 'src/auth/schemas/reset-token.schema';
import { User, UserDocument } from 'src/auth/schemas/user.schema';
import { Session, SessionDocument } from 'src/sessions/session.schema';
import {
    AllTransactionsInfo,
    AllTransactionsInfoDocument,
} from 'src/transactions/schemas/all-info.schema';

import type {
    AdminField,
    AdminStats,
    AdminTable,
    AdminUserDetail,
    AdminUserList,
    AdminUserSummary,
} from './admin.contract';
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto';

const DAY_MS = 86_400_000;
const RECENT_ROWS = 50;

type LeanUser = Pick<
    User,
    'name' | 'email' | 'password' | 'registeredVia' | 'avatar'
> & { _id: Types.ObjectId };

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

const idSince = (date: Date): Types.ObjectId =>
    Types.ObjectId.createFromTime(Math.floor(date.getTime() / 1000));

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toIso = (value: Date | string | null | undefined): string | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const money = (value: number | null | undefined): number | null =>
    typeof value === 'number' ? Math.round(value * 100) / 100 : null;

const toSummary = (
    user: LeanUser,
    lastActive: Date | undefined,
): AdminUserSummary => ({
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    createdAt: user._id.getTimestamp().toISOString(),
    lastActiveAt: toIso(lastActive),
    authMethods: [
        ...(user.password ? ['password'] : []),
        ...(user.registeredVia === 'google' ? ['google'] : []),
    ],
});

const userFields = {
    name: 1,
    email: 1,
    password: 1,
    registeredVia: 1,
    avatar: 1,
} as const;

@Injectable()
export class AdminService {
    constructor(
        @InjectModel(User.name) private readonly users: Model<UserDocument>,
        @InjectModel(Session.name)
        private readonly sessions: Model<SessionDocument>,
        @InjectModel(AllTransactionsInfo.name)
        private readonly finances: Model<AllTransactionsInfoDocument>,
        @InjectModel(RefreshToken.name)
        private readonly refreshTokens: Model<RefreshToken>,
        @InjectModel(ResetToken.name)
        private readonly resetTokens: Model<ResetToken>,
    ) {}

    async getStats(): Promise<AdminStats> {
        const weekAgo = daysAgo(7);
        const [total, new7d, new30d, activeIds, google, totals] =
            await Promise.all([
                this.users.countDocuments(),
                this.users.countDocuments({ _id: { $gte: idSince(weekAgo) } }),
                this.users.countDocuments({
                    _id: { $gte: idSince(daysAgo(30)) },
                }),
                this.sessions.distinct('userId', {
                    lastActiveAt: { $gte: weekAgo },
                }),
                this.users.countDocuments({ registeredVia: 'google' }),
                this.finances.aggregate<{
                    accounts: number;
                    transactions: number;
                    cards: number;
                    goals: number;
                    recent: number;
                }>([
                    {
                        $project: {
                            transactions: {
                                $size: { $ifNull: ['$transactions', []] },
                            },
                            cards: { $size: { $ifNull: ['$cards', []] } },
                            goals: {
                                $size: { $ifNull: ['$savingsGoals', []] },
                            },
                            recent: {
                                $size: {
                                    $filter: {
                                        input: {
                                            $ifNull: ['$transactions', []],
                                        },
                                        cond: {
                                            $gte: [
                                                { $toDate: '$$this.date' },
                                                weekAgo,
                                            ],
                                        },
                                    },
                                },
                            },
                        },
                    },
                    {
                        $group: {
                            _id: null,
                            accounts: { $sum: 1 },
                            transactions: { $sum: '$transactions' },
                            cards: { $sum: '$cards' },
                            goals: { $sum: '$goals' },
                            recent: { $sum: '$recent' },
                        },
                    },
                ]),
            ]);

        const summary = totals[0];

        return {
            users: { total, new7d, new30d, active7d: activeIds.length },
            metrics: [
                { label: 'Google accounts', value: google, kind: 'number' },
                {
                    label: 'Accounts with data',
                    value: summary?.accounts ?? 0,
                    kind: 'number',
                },
                {
                    label: 'Transactions',
                    value: summary?.transactions ?? 0,
                    kind: 'number',
                },
                {
                    label: 'Transactions, 7 days',
                    value: summary?.recent ?? 0,
                    kind: 'number',
                },
                { label: 'Cards', value: summary?.cards ?? 0, kind: 'number' },
                {
                    label: 'Savings goals',
                    value: summary?.goals ?? 0,
                    kind: 'number',
                },
            ],
        };
    }

    async listUsers(query: AdminUsersQueryDto): Promise<AdminUserList> {
        const filter: Record<string, unknown> = {};

        if (query.search) {
            const pattern = new RegExp(escapeRegex(query.search), 'i');
            filter.$or = [
                { email: pattern },
                { name: pattern },
                ...(isValidObjectId(query.search)
                    ? [{ _id: new Types.ObjectId(query.search) }]
                    : []),
            ];
        }

        const [total, users] = await Promise.all([
            this.users.countDocuments(filter),
            this.users
                .find(filter, userFields)
                .sort({ _id: -1 })
                .skip(query.offset)
                .limit(query.limit)
                .lean<LeanUser[]>(),
        ]);

        const lastActive = await this.lastActiveFor(users.map((u) => u._id));

        return {
            items: users.map((user) =>
                toSummary(user, lastActive.get(user._id.toString())),
            ),
            meta: {
                total,
                limit: query.limit,
                offset: query.offset,
                hasMore: query.offset + query.limit < total,
            },
        };
    }

    async deleteUser(id: string): Promise<void> {
        const objectId = new Types.ObjectId(id);
        const deleted = await this.users.findByIdAndDelete(objectId);

        if (!deleted) {
            throw new NotFoundException('User not found');
        }

        await Promise.all([
            this.sessions.deleteMany({ userId: objectId }),
            this.refreshTokens.deleteMany({ userId: objectId }),
            this.resetTokens.deleteMany({ userId: objectId }),
            this.finances.deleteMany({ userId: { $in: [id, objectId] } }),
        ]);
    }

    async getUser(id: string): Promise<AdminUserDetail> {
        const objectId = new Types.ObjectId(id);
        const user = await this.users
            .findById(objectId, userFields)
            .lean<LeanUser>();

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const now = new Date();
        const [sessions, finance, bankConnected] = await Promise.all([
            this.sessions
                .find(
                    { userId: objectId },
                    {
                        method: 1,
                        userAgent: 1,
                        ip: 1,
                        createdAt: 1,
                        lastActiveAt: 1,
                        expiresAt: 1,
                        endedAt: 1,
                        endReason: 1,
                    },
                )
                .sort({ lastActiveAt: -1 })
                .limit(RECENT_ROWS)
                .lean(),
            this.finances
                .findOne(
                    { userId: id },
                    { assistantPreferences: 0, monobankToken: 0 },
                )
                .lean<AllTransactionsInfo>(),
            this.finances.exists({
                userId: id,
                monobankToken: { $exists: true },
            }),
        ]);

        const activeSessions = sessions.filter(
            (session) => !session.endedAt && session.expiresAt > now,
        ).length;

        const account: AdminField[] = [
            { label: 'ID', value: id },
            { label: 'Email', value: user.email, kind: 'email' },
            { label: 'Name', value: user.name },
            { label: 'Registered via', value: user.registeredVia ?? 'local' },
            {
                label: 'Password set',
                value: Boolean(user.password),
                kind: 'boolean',
            },
            { label: 'Avatar', value: user.avatar ?? null },
            {
                label: 'Registered',
                value: user._id.getTimestamp().toISOString(),
                kind: 'datetime',
            },
            {
                label: 'Last active',
                value: toIso(sessions[0]?.lastActiveAt),
                kind: 'datetime',
            },
            { label: 'Active sessions', value: activeSessions, kind: 'number' },
        ];

        const sessionsTable: AdminTable = {
            columns: [
                { key: 'lastActive', label: 'Last active', kind: 'datetime' },
                { key: 'method', label: 'Method' },
                { key: 'device', label: 'Device' },
                { key: 'ip', label: 'IP' },
                { key: 'created', label: 'Started', kind: 'datetime' },
                { key: 'state', label: 'State' },
            ],
            rows: sessions.map((session) => ({
                lastActive: toIso(session.lastActiveAt),
                method: session.method,
                device: session.userAgent || null,
                ip: session.ip || null,
                created: toIso(session.createdAt),
                state: session.endedAt
                    ? (session.endReason ?? 'ended')
                    : session.expiresAt <= now
                      ? 'expired'
                      : 'active',
            })),
            total: sessions.length,
        };

        const summary = toSummary(user, sessions[0]?.lastActiveAt);

        if (!finance) {
            return {
                user: summary,
                sections: [
                    { key: 'account', title: 'Account', fields: account },
                    {
                        key: 'finance',
                        title: 'Finance',
                        fields: [{ label: 'Data', value: 'Not created yet' }],
                    },
                    {
                        key: 'sessions',
                        title: 'Sessions',
                        table: sessionsTable,
                    },
                ],
            };
        }

        const transactions = [...(finance.transactions ?? [])].sort(
            (left, right) =>
                new Date(right.date).getTime() - new Date(left.date).getTime(),
        );
        const cards = finance.cards ?? [];
        const cardNames = new Map(cards.map((card) => [card.id, card.name]));
        const essentials = finance.essentialsArray ?? [];
        const incomes = finance.expectedIncomes ?? [];
        const goals = finance.savingsGoals ?? [];
        const operations = [...(finance.savingsOperations ?? [])].sort(
            (left, right) => right.date.localeCompare(left.date),
        );
        const history = [...(finance.monthHistory ?? [])].sort((left, right) =>
            right.month.localeCompare(left.month),
        );

        const overview: AdminField[] = [
            { label: 'Currency', value: finance.currency ?? null },
            {
                label: 'Balance',
                value: money(finance.totalAmount),
                kind: 'number',
            },
            {
                label: 'Income',
                value: money(finance.totalIncome),
                kind: 'number',
            },
            {
                label: 'Spent',
                value: money(finance.totalSpend),
                kind: 'number',
            },
            {
                label: 'Next month',
                value: money(finance.nextMonthTotalAmount),
                kind: 'number',
            },
            {
                label: 'Save percent',
                value: finance.savePercent,
                kind: 'number',
            },
            {
                label: 'Last processed month',
                value: finance.lastProcessedMonth,
            },
            {
                label: 'Transactions',
                value: transactions.length,
                kind: 'number',
            },
            { label: 'Cards', value: cards.length, kind: 'number' },
            { label: 'Savings goals', value: goals.length, kind: 'number' },
            {
                label: 'Bank connected',
                value: Boolean(bankConnected),
                kind: 'boolean',
            },
            {
                label: 'Streak',
                value: finance.streak
                    ? `${finance.streak.current} days, best ${finance.streak.best}`
                    : null,
            },
            {
                label: 'Last visit',
                value: finance.streak?.lastVisit ?? null,
                kind: 'date',
            },
        ];

        return {
            user: summary,
            sections: [
                { key: 'account', title: 'Account', fields: account },
                { key: 'finance', title: 'Finance', fields: overview },
                {
                    key: 'transactions',
                    title: 'Transactions',
                    table: {
                        columns: [
                            { key: 'date', label: 'Date', kind: 'datetime' },
                            { key: 'type', label: 'Type' },
                            { key: 'category', label: 'Category' },
                            { key: 'description', label: 'Description' },
                            { key: 'value', label: 'Amount', kind: 'number' },
                            { key: 'card', label: 'Card' },
                        ],
                        rows: transactions
                            .slice(0, RECENT_ROWS)
                            .map((item) => ({
                                date: toIso(item.date),
                                type: item.transactionType,
                                category: item.categorie,
                                description: item.description || null,
                                value: money(item.value),
                                card: item.cardId
                                    ? (cardNames.get(item.cardId) ??
                                      item.cardId)
                                    : null,
                            })),
                        total: transactions.length,
                    },
                },
                {
                    key: 'cards',
                    title: 'Cards',
                    table: {
                        columns: [
                            { key: 'name', label: 'Card' },
                            { key: 'skin', label: 'Bank' },
                            {
                                key: 'balance',
                                label: 'Balance',
                                kind: 'number',
                            },
                            {
                                key: 'limit',
                                label: 'Credit limit',
                                kind: 'number',
                            },
                            {
                                key: 'created',
                                label: 'Created',
                                kind: 'datetime',
                            },
                        ],
                        rows: cards.map((card) => ({
                            name: card.name,
                            skin: card.skin,
                            balance: money(card.balance),
                            limit: money(card.creditLimit),
                            created: toIso(card.createdAt),
                        })),
                        total: cards.length,
                    },
                },
                {
                    key: 'essentials',
                    title: 'Monthly payments',
                    table: {
                        columns: [
                            { key: 'title', label: 'Payment' },
                            { key: 'amount', label: 'Amount', kind: 'number' },
                            { key: 'paid', label: 'Paid', kind: 'number' },
                            { key: 'checked', label: 'Done', kind: 'boolean' },
                            {
                                key: 'paidAt',
                                label: 'Paid at',
                                kind: 'datetime',
                            },
                        ],
                        rows: essentials.map((item) => ({
                            title: item.title,
                            amount: money(item.amount),
                            paid: money(item.paidAmount),
                            checked: item.checked,
                            paidAt: toIso(item.paidAt),
                        })),
                        total: essentials.length,
                    },
                },
                {
                    key: 'incomes',
                    title: 'Expected income',
                    table: {
                        columns: [
                            { key: 'title', label: 'Income' },
                            { key: 'day', label: 'Day', kind: 'number' },
                            { key: 'amount', label: 'Amount', kind: 'number' },
                            {
                                key: 'received',
                                label: 'Received',
                                kind: 'number',
                            },
                            {
                                key: 'receivedAt',
                                label: 'Received at',
                                kind: 'datetime',
                            },
                        ],
                        rows: incomes.map((item) => ({
                            title: item.title,
                            day: item.day,
                            amount: money(item.amount),
                            received: item.received
                                ? money(item.receivedAmount ?? item.amount)
                                : null,
                            receivedAt: toIso(item.receivedAt),
                        })),
                        total: incomes.length,
                    },
                },
                {
                    key: 'savings-goals',
                    title: 'Savings goals',
                    table: {
                        columns: [
                            { key: 'name', label: 'Goal' },
                            { key: 'target', label: 'Target', kind: 'number' },
                            { key: 'currency', label: 'Currency' },
                            {
                                key: 'monthly',
                                label: 'Monthly',
                                kind: 'number',
                            },
                            { key: 'targetDate', label: 'By', kind: 'date' },
                            {
                                key: 'created',
                                label: 'Created',
                                kind: 'datetime',
                            },
                        ],
                        rows: goals.map((goal) => ({
                            name: goal.name,
                            target: money(goal.targetAmount),
                            currency: goal.currency,
                            monthly: money(goal.monthlyContribution),
                            targetDate: goal.targetDate ?? null,
                            created: toIso(goal.createdAt),
                        })),
                        total: goals.length,
                    },
                },
                {
                    key: 'savings-operations',
                    title: 'Savings operations',
                    table: {
                        columns: [
                            { key: 'date', label: 'Date', kind: 'date' },
                            { key: 'type', label: 'Type' },
                            { key: 'storage', label: 'Storage' },
                            { key: 'amount', label: 'Amount', kind: 'number' },
                            { key: 'currency', label: 'Currency' },
                            { key: 'note', label: 'Note' },
                        ],
                        rows: operations.slice(0, RECENT_ROWS).map((item) => ({
                            date: item.date.slice(0, 10),
                            type: item.type,
                            storage: item.destinationStorage
                                ? `${item.storage} > ${item.destinationStorage}`
                                : item.storage,
                            amount: money(item.amount),
                            currency: item.currency,
                            note: item.note || null,
                        })),
                        total: operations.length,
                    },
                },
                {
                    key: 'months',
                    title: 'Month history',
                    table: {
                        columns: [
                            { key: 'month', label: 'Month' },
                            {
                                key: 'payments',
                                label: 'Payments',
                                kind: 'number',
                            },
                            { key: 'paid', label: 'Paid', kind: 'number' },
                            {
                                key: 'incomes',
                                label: 'Incomes',
                                kind: 'number',
                            },
                            {
                                key: 'received',
                                label: 'Received',
                                kind: 'number',
                            },
                        ],
                        rows: history.slice(0, RECENT_ROWS).map((month) => ({
                            month: month.month,
                            payments: month.essentials.length,
                            paid: money(
                                month.essentials.reduce(
                                    (sum, item) =>
                                        sum +
                                        (item.checked
                                            ? (item.paidAmount ?? item.amount)
                                            : 0),
                                    0,
                                ),
                            ),
                            incomes: month.expectedIncomes.length,
                            received: money(
                                month.expectedIncomes.reduce(
                                    (sum, item) =>
                                        sum +
                                        (item.received
                                            ? (item.receivedAmount ??
                                              item.amount)
                                            : 0),
                                    0,
                                ),
                            ),
                        })),
                        total: history.length,
                    },
                },
                { key: 'sessions', title: 'Sessions', table: sessionsTable },
            ],
        };
    }

    private async lastActiveFor(
        ids: Types.ObjectId[],
    ): Promise<Map<string, Date>> {
        if (ids.length === 0) return new Map();

        const rows = await this.sessions.aggregate<{
            _id: Types.ObjectId;
            lastActiveAt: Date;
        }>([
            { $match: { userId: { $in: ids } } },
            {
                $group: {
                    _id: '$userId',
                    lastActiveAt: { $max: '$lastActiveAt' },
                },
            },
        ]);

        return new Map(
            rows.map((row) => [row._id.toString(), row.lastActiveAt]),
        );
    }
}
