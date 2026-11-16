export type AchievementId =
    | 'chronicler'
    | 'diary'
    | 'steady'
    | 'saver'
    | 'dreamer'
    | 'debtfree'
    | 'surplus'
    | 'earner'
    | 'analyst'
    | 'collector'
    | 'dandy'
    | 'wealthy';

export type AchievementDefinition = {
    id: AchievementId;
    targets: [number, number, number];
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
    { id: 'chronicler', targets: [10, 100, 500] },
    { id: 'diary', targets: [7, 30, 100] },
    { id: 'steady', targets: [7, 30, 100] },
    { id: 'saver', targets: [1, 10, 50] },
    { id: 'dreamer', targets: [1, 3, 5] },
    { id: 'debtfree', targets: [1, 3, 12] },
    { id: 'surplus', targets: [1, 3, 12] },
    { id: 'earner', targets: [1, 12, 50] },
    { id: 'analyst', targets: [5, 10, 15] },
    { id: 'collector', targets: [2, 3, 5] },
    { id: 'dandy', targets: [1, 5, 12] },
    { id: 'wealthy', targets: [100, 500, 2000] },
];

export const ACHIEVEMENT_REWARDS = [20, 50, 100];

export type AchievementSource = {
    today: string;
    transactions: {
        date: Date | string;
        transactionType: string;
        categorie?: string;
        value?: number;
    }[];
    savings: { type: string }[];
    goals: unknown[];
    cards: unknown[];
    bills: { checked: boolean }[];
    monthHistory: { month: string; essentials: { checked: boolean }[] }[];
    bestStreak: number;
    ownedItems: string[];
    coinsEarned: number;
};

export type AchievementProgress = {
    id: AchievementId;
    value: number;
    tier: number;
    targets: [number, number, number];
};

const dayOf = (value: Date | string): string | null => {
    const time = new Date(value).getTime();
    return Number.isNaN(time)
        ? null
        : new Date(time).toISOString().slice(0, 10);
};

const allPaid = (bills: { checked: boolean }[]) =>
    bills.length > 0 && bills.every((bill) => bill.checked);

export const measureAchievements = (
    source: AchievementSource,
): Record<AchievementId, number> => {
    const records = source.transactions.filter(
        (item) => item.transactionType !== 'transfer',
    );
    const currentMonth = source.today.slice(0, 7);

    const days = new Set(
        records.map((item) => dayOf(item.date)).filter(Boolean),
    );

    const balances = new Map<string, number>();
    for (const item of records) {
        const day = dayOf(item.date);
        if (!day) continue;
        const month = day.slice(0, 7);
        const sign = item.transactionType === 'income' ? 1 : -1;
        balances.set(
            month,
            (balances.get(month) ?? 0) + sign * (item.value ?? 0),
        );
    }

    const paidMonths = new Set(
        source.monthHistory
            .filter((snapshot) => allPaid(snapshot.essentials || []))
            .map((snapshot) => snapshot.month),
    );
    if (allPaid(source.bills)) paidMonths.add(currentMonth);

    return {
        chronicler: records.length,
        diary: days.size,
        steady: source.bestStreak,
        saver: source.savings.filter((item) => item.type === 'deposit').length,
        dreamer: source.goals.length,
        debtfree: paidMonths.size,
        surplus: [...balances.entries()].filter(
            ([month, balance]) => month < currentMonth && balance > 0,
        ).length,
        earner: records.filter((item) => item.transactionType === 'income')
            .length,
        analyst: new Set(
            records
                .filter(
                    (item) =>
                        item.transactionType === 'expense' && item.categorie,
                )
                .map((item) => item.categorie),
        ).size,
        collector: source.cards.length,
        dandy: source.ownedItems.filter((id) => id !== 'room').length,
        wealthy: source.coinsEarned,
    };
};

export const tierFor = (value: number, targets: number[]): number =>
    targets.filter((target) => value >= target).length;

export const buildAchievements = (
    source: AchievementSource,
): AchievementProgress[] => {
    const values = measureAchievements(source);

    return ACHIEVEMENTS.map(({ id, targets }) => ({
        id,
        value: values[id],
        tier: tierFor(values[id], targets),
        targets,
    }));
};
