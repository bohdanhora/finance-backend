import {
    MONTH_HISTORY_LIMIT,
    MonthSnapshot,
    buildMonthRolloverUpdate,
} from './month-rollover';

const defaultEssentials = [
    {
        id: 'default-rent',
        amount: 800,
        title: 'Rent',
        checked: true,
    },
];

const nextMonthEssentialsArray = [
    {
        id: 'planned-rent',
        amount: 900,
        title: 'New rent',
        checked: false,
    },
];

const salary = {
    id: 'salary-15',
    title: 'Salary',
    amount: 40_000,
    day: 15,
    recurring: true,
};

describe('buildMonthRolloverUpdate', () => {
    it('initializes legacy records without moving their plans', () => {
        expect(
            buildMonthRolloverUpdate(
                {
                    defaultEssentialsArray: defaultEssentials,
                    nextMonthEssentialsArray,
                },
                '2026-08',
            ),
        ).toEqual({ lastProcessedMonth: '2026-08' });
    });

    it('does nothing when the current month was already processed', () => {
        expect(
            buildMonthRolloverUpdate(
                {
                    lastProcessedMonth: '2026-08',
                    defaultEssentialsArray: defaultEssentials,
                    nextMonthEssentialsArray,
                },
                '2026-08',
            ),
        ).toBeNull();
    });

    it('moves next-month essentials once and resets the next-month plan', () => {
        const update = buildMonthRolloverUpdate(
            {
                lastProcessedMonth: '2026-08',
                defaultEssentialsArray: defaultEssentials,
                nextMonthEssentialsArray,
            },
            '2026-09',
        );

        expect(update).toEqual({
            lastProcessedMonth: '2026-09',
            essentialsArray: nextMonthEssentialsArray,
            nextMonthEssentialsArray: [
                { ...defaultEssentials[0], checked: false },
            ],
            nextMonthTotalAmount: 0,
            expectedIncomes: [],
        });
        expect(update).not.toHaveProperty('totalAmount');
    });

    it('falls back to the recurring template when next month was never planned', () => {
        const update = buildMonthRolloverUpdate(
            {
                lastProcessedMonth: '2026-08',
                defaultEssentialsArray: defaultEssentials,
                nextMonthEssentialsArray: [],
            },
            '2026-09',
        );

        expect(update?.essentialsArray).toEqual([
            { ...defaultEssentials[0], checked: false },
        ]);
    });

    it('uses recurring essentials when more than one month was skipped', () => {
        expect(
            buildMonthRolloverUpdate(
                {
                    lastProcessedMonth: '2026-06',
                    defaultEssentialsArray: defaultEssentials,
                    nextMonthEssentialsArray,
                },
                '2026-08',
            ),
        ).toEqual({
            lastProcessedMonth: '2026-08',
            essentialsArray: [{ ...defaultEssentials[0], checked: false }],
            nextMonthEssentialsArray: [
                { ...defaultEssentials[0], checked: false },
            ],
            nextMonthTotalAmount: 0,
            expectedIncomes: [],
        });
    });

    it('carries unpaid bills into the new month without doubling recurring ones', () => {
        const update = buildMonthRolloverUpdate(
            {
                lastProcessedMonth: '2026-09',
                defaultEssentialsArray: defaultEssentials,
                nextMonthEssentialsArray: [],
                essentialsArray: [
                    {
                        id: 'default-rent',
                        title: 'rent ',
                        amount: 800,
                        checked: false,
                    },
                    {
                        id: 'socket',
                        title: 'Socket',
                        amount: 14_000,
                        checked: false,
                    },
                    {
                        id: 'phone',
                        title: 'Phone',
                        amount: 400,
                        checked: true,
                        paidAmount: 400,
                    },
                ],
            },
            '2026-10',
        );

        expect(update?.essentialsArray).toEqual([
            { ...defaultEssentials[0], checked: false },
            {
                id: 'socket',
                title: 'Socket',
                amount: 14_000,
                checked: false,
                carriedFrom: '2026-09',
            },
        ]);
    });

    it('gives a carried bill a fresh id when its id is already taken', () => {
        const update = buildMonthRolloverUpdate(
            {
                lastProcessedMonth: '2026-09',
                defaultEssentialsArray: defaultEssentials,
                nextMonthEssentialsArray: [],
                essentialsArray: [
                    {
                        id: 'default-rent',
                        title: 'Old loan',
                        amount: 50,
                        checked: false,
                    },
                ],
            },
            '2026-10',
        );

        expect(update?.essentialsArray?.[1]).toEqual(
            expect.objectContaining({
                id: 'default-rent-2026-09',
                title: 'Old loan',
            }),
        );
    });

    it('keeps the month a bill was first carried from', () => {
        const update = buildMonthRolloverUpdate(
            {
                lastProcessedMonth: '2026-09',
                defaultEssentialsArray: [],
                nextMonthEssentialsArray: [],
                essentialsArray: [
                    {
                        id: 'socket',
                        title: 'Socket',
                        amount: 14_000,
                        checked: false,
                        carriedFrom: '2026-08',
                    },
                ],
            },
            '2026-10',
        );

        expect(update?.essentialsArray?.[0].carriedFrom).toBe('2026-08');
    });

    it('records the closing month and restarts recurring incomes', () => {
        const update = buildMonthRolloverUpdate(
            {
                lastProcessedMonth: '2026-09',
                defaultEssentialsArray: [],
                nextMonthEssentialsArray: [],
                essentialsArray: [
                    {
                        id: 'rent',
                        title: 'Rent',
                        amount: 800,
                        checked: true,
                        paidAmount: 750,
                        paymentTransactionId: 'tx-rent',
                    },
                ],
                expectedIncomes: [
                    {
                        ...salary,
                        received: true,
                        receivedAmount: 38_500,
                        receivedAt: '2026-09-15T08:00:00.000Z',
                        transactionId: 'tx-salary',
                    },
                    {
                        id: 'bonus',
                        title: 'Bonus',
                        amount: 5_000,
                        day: 20,
                        recurring: false,
                        received: false,
                    },
                ],
            },
            '2026-10',
        );

        expect(update?.expectedIncomes).toEqual([
            { ...salary, received: false },
        ]);
        expect(update?.monthHistory).toEqual([
            {
                month: '2026-09',
                essentials: [
                    {
                        id: 'rent',
                        title: 'Rent',
                        amount: 800,
                        checked: true,
                        paidAmount: 750,
                    },
                ],
                expectedIncomes: [
                    {
                        id: 'salary-15',
                        title: 'Salary',
                        amount: 40_000,
                        day: 15,
                        received: true,
                        receivedAmount: 38_500,
                    },
                    {
                        id: 'bonus',
                        title: 'Bonus',
                        amount: 5_000,
                        day: 20,
                        received: false,
                    },
                ],
            },
        ]);
    });

    it('keeps the history bounded and never records a month twice', () => {
        const history: MonthSnapshot[] = Array.from(
            { length: MONTH_HISTORY_LIMIT },
            (_, index) => ({
                month: `2024-${String((index % 12) + 1).padStart(2, '0')}`,
                essentials: [],
                expectedIncomes: [],
            }),
        );
        history[history.length - 1] = {
            month: '2026-09',
            essentials: [],
            expectedIncomes: [],
        };

        const update = buildMonthRolloverUpdate(
            {
                lastProcessedMonth: '2026-09',
                defaultEssentialsArray: [],
                nextMonthEssentialsArray: [],
                expectedIncomes: [{ ...salary, received: false }],
                monthHistory: history,
            },
            '2026-10',
        );

        expect(update?.monthHistory).toHaveLength(MONTH_HISTORY_LIMIT);
        expect(
            update?.monthHistory?.filter((entry) => entry.month === '2026-09'),
        ).toHaveLength(1);
        expect(update?.monthHistory?.at(-1)?.expectedIncomes).toHaveLength(1);
    });
});
