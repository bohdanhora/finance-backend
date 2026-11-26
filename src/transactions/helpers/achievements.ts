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
    | 'wealthy'
    | 'payself'
    | 'untouchable'
    | 'perfectweek'
    | 'perfectmonth'
    | 'rhythm'
    | 'thrifty'
    | 'pedant'
    | 'veteran';

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
    { id: 'payself', targets: [1, 6, 24] },
    { id: 'untouchable', targets: [30, 90, 365] },
    { id: 'perfectweek', targets: [1, 4, 12] },
    { id: 'perfectmonth', targets: [1, 3, 6] },
    { id: 'rhythm', targets: [2, 6, 12] },
    { id: 'thrifty', targets: [1, 4, 10] },
    { id: 'pedant', targets: [25, 150, 600] },
    { id: 'veteran', targets: [30, 180, 365] },
];

export const ACHIEVEMENT_REWARDS = [20, 50, 100];

export type AchievementSource = {
    today: string;
    transactions: {
        date: Date | string;
        transactionType: string;
        categorie?: string;
        value?: number;
        description?: string;
    }[];
    savings: { type: string; date?: Date | string }[];
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

const DAY_MS = 24 * 60 * 60 * 1000;

const dayIndex = (day: string) =>
    Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

const monthIndex = (month: string) =>
    Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

const longestRun = (values: number[]): number => {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    sorted.forEach((value, index) => {
        run = index > 0 && value - sorted[index - 1] === 1 ? run + 1 : 1;
        best = Math.max(best, run);
    });
    return best;
};

const daysOf = (items: { date?: Date | string }[]): number[] =>
    items
        .map((item) => (item.date === undefined ? null : dayOf(item.date)))
        .filter((day): day is string => Boolean(day))
        .map(dayIndex)
        .sort((a, b) => a - b);

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

    const todayIndex = dayIndex(source.today);
    const recordDays = daysOf(records);
    const incomeDays = daysOf(
        records.filter((item) => item.transactionType === 'income'),
    );
    const depositDays = daysOf(
        source.savings.filter((item) => item.type === 'deposit'),
    );
    const withdrawalDays = daysOf(
        source.savings.filter((item) => item.type === 'withdrawal'),
    );

    const payself = depositDays.filter((deposit) =>
        incomeDays.some(
            (income) => deposit - income >= 0 && deposit - income <= 3,
        ),
    ).length;

    let untouchable = 0;
    if (depositDays.length > 0) {
        const start = depositDays[0];
        const marks = [
            start,
            ...withdrawalDays.filter(
                (day) => day >= start && day <= todayIndex,
            ),
            todayIndex,
        ];
        for (let index = 1; index < marks.length; index += 1) {
            untouchable = Math.max(
                untouchable,
                marks[index] - marks[index - 1],
            );
        }
    }

    const weeks = new Map<number, Set<number>>();
    for (const day of recordDays) {
        const week = Math.floor((day + 3) / 7);
        weeks.set(week, (weeks.get(week) ?? new Set()).add(day));
    }

    const spent = new Map<string, number>();
    const activeMonths = new Set<string>();
    for (const item of records) {
        const day = dayOf(item.date);
        if (!day) continue;
        const month = day.slice(0, 7);
        activeMonths.add(month);
        if (item.transactionType === 'expense') {
            spent.set(month, (spent.get(month) ?? 0) + (item.value ?? 0));
        }
    }
    const spentByIndex = new Map(
        [...spent.entries()].map(([month, total]) => [
            monthIndex(month),
            total,
        ]),
    );
    const thrifty = [...activeMonths].filter((month) => {
        if (month >= currentMonth) return false;
        const previous = spentByIndex.get(monthIndex(month) - 1) ?? 0;
        return previous > 0 && (spent.get(month) ?? 0) < previous;
    }).length;

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
        payself,
        untouchable,
        perfectweek: [...weeks.values()].filter((days) => days.size === 7)
            .length,
        perfectmonth: [...balances.entries()].filter(
            ([month, balance]) =>
                month < currentMonth && balance > 0 && paidMonths.has(month),
        ).length,
        rhythm: longestRun(
            depositDays.map((day) =>
                monthIndex(new Date(day * DAY_MS).toISOString().slice(0, 7)),
            ),
        ),
        thrifty,
        pedant: records.filter((item) => item.description?.trim()).length,
        veteran:
            recordDays.length > 0 ? Math.max(0, todayIndex - recordDays[0]) : 0,
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
