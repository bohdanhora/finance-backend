import { AchievementSource, buildAchievements, tierFor } from './achievements';
import { collectPetRewards, createPetState } from './pet';

const source = (patch: Partial<AchievementSource> = {}): AchievementSource => ({
    today: '2026-11-16',
    transactions: [],
    savings: [],
    goals: [],
    cards: [],
    bills: [],
    monthHistory: [],
    bestStreak: 0,
    ownedItems: ['room'],
    coinsEarned: 0,
    ...patch,
});

const find = (list: ReturnType<typeof buildAchievements>, id: string) =>
    list.find((item) => item.id === id);

describe('achievements', () => {
    it('counts tiers from the targets', () => {
        expect(tierFor(0, [1, 10, 50])).toBe(0);
        expect(tierFor(10, [1, 10, 50])).toBe(2);
        expect(tierFor(99, [1, 10, 50])).toBe(3);
    });

    it('measures records, days, income and categories without transfers', () => {
        const list = buildAchievements(
            source({
                transactions: [
                    {
                        date: '2026-11-01T10:00:00Z',
                        transactionType: 'expense',
                        categorie: 'food',
                        value: 10,
                    },
                    {
                        date: '2026-11-01T12:00:00Z',
                        transactionType: 'expense',
                        categorie: 'taxi',
                        value: 10,
                    },
                    {
                        date: '2026-11-02T12:00:00Z',
                        transactionType: 'income',
                        categorie: 'salary',
                        value: 100,
                    },
                    {
                        date: '2026-11-03T12:00:00Z',
                        transactionType: 'transfer',
                        value: 50,
                    },
                ],
            }),
        );

        expect(find(list, 'chronicler')?.value).toBe(3);
        expect(find(list, 'diary')?.value).toBe(2);
        expect(find(list, 'earner')).toMatchObject({ value: 1, tier: 1 });
        expect(find(list, 'analyst')?.value).toBe(2);
    });

    it('counts only finished months in the plus and every fully paid month', () => {
        const list = buildAchievements(
            source({
                transactions: [
                    {
                        date: '2026-09-02T12:00:00Z',
                        transactionType: 'income',
                        value: 100,
                    },
                    {
                        date: '2026-09-05T12:00:00Z',
                        transactionType: 'expense',
                        value: 40,
                    },
                    {
                        date: '2026-10-05T12:00:00Z',
                        transactionType: 'expense',
                        value: 40,
                    },
                    {
                        date: '2026-11-02T12:00:00Z',
                        transactionType: 'income',
                        value: 100,
                    },
                ],
                monthHistory: [
                    { month: '2026-09', essentials: [{ checked: true }] },
                    { month: '2026-10', essentials: [{ checked: false }] },
                ],
                bills: [{ checked: true }],
            }),
        );

        expect(find(list, 'surplus')?.value).toBe(1);
        expect(find(list, 'debtfree')?.value).toBe(2);
    });

    it('pays every reached tier once through the pet rewards', () => {
        const activity = {
            day: '2026-11-16',
            offsetMinutes: 0,
            streak: null,
            transactions: [],
            savings: [],
            bills: [],
            achievements: [{ id: 'saver', tier: 2 }],
        };

        const first = collectPetRewards(createPetState(), activity);
        const tiers = first.granted.filter(
            (reward) => reward.kind === 'achievement',
        );
        expect(tiers.map((reward) => [reward.key, reward.amount])).toEqual([
            ['ach:saver:1', 20],
            ['ach:saver:2', 50],
        ]);

        const again = collectPetRewards(first.state, activity);
        expect(again.granted).toEqual([]);
    });
});
