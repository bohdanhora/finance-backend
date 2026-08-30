import { buildMonthRolloverUpdate } from './month-rollover';

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
        });
        expect(update).not.toHaveProperty('totalAmount');
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
        });
    });
});
