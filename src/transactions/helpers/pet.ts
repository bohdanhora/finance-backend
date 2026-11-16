import { getDayDifference, isDayKey } from './streak';

export const PET_SPECIES = ['bulldog', 'monkey', 'sphynx'] as const;

export type PetSpecies = (typeof PET_SPECIES)[number];

export type PetSlot = 'head' | 'eyes' | 'neck' | 'background';

export type PetItem = {
    id: string;
    slot: PetSlot;
    price: number;
};

export const PET_ITEMS: PetItem[] = [
    { id: 'cap', slot: 'head', price: 80 },
    { id: 'beanie', slot: 'head', price: 100 },
    { id: 'party', slot: 'head', price: 120 },
    { id: 'beret', slot: 'head', price: 140 },
    { id: 'chef', slot: 'head', price: 180 },
    { id: 'cowboy', slot: 'head', price: 220 },
    { id: 'tophat', slot: 'head', price: 300 },
    { id: 'shades', slot: 'eyes', price: 90 },
    { id: 'round', slot: 'eyes', price: 110 },
    { id: 'hearts', slot: 'eyes', price: 130 },
    { id: 'monocle', slot: 'eyes', price: 160 },
    { id: 'bandana', slot: 'neck', price: 60 },
    { id: 'bowtie', slot: 'neck', price: 90 },
    { id: 'scarf', slot: 'neck', price: 120 },
    { id: 'chain', slot: 'neck', price: 250 },
    { id: 'room', slot: 'background', price: 0 },
    { id: 'park', slot: 'background', price: 150 },
    { id: 'beach', slot: 'background', price: 200 },
    { id: 'night', slot: 'background', price: 200 },
    { id: 'space', slot: 'background', price: 300 },
];

export const PET_SLOTS: PetSlot[] = ['head', 'eyes', 'neck', 'background'];

export const FREEZE_PRICE = 60;
export const FREEZE_LIMIT = 2;
export const PET_NAME_LIMIT = 20;
export const WELCOME_COINS = 60;

export const REWARDS = {
    visit: 5,
    log: 5,
    save: 20,
    bills: 30,
} as const;

export const STREAK_BONUSES: Record<number, number> = {
    7: 50,
    30: 200,
    100: 500,
};

const DATED_KEY_WINDOW = 14;
const KEY_LIMIT = 200;

export type PetEquipped = Record<PetSlot, string | null>;

export type PetState = {
    species: PetSpecies | null;
    coins: number;
    earned: number;
    owned: string[];
    equipped: PetEquipped;
    freezes: number;
    name: string | null;
    claimed: string[];
};

export type PetRewardKind =
    | 'welcome'
    | 'visit'
    | 'log'
    | 'save'
    | 'bills'
    | 'streak';

export type PetReward = {
    key: string;
    kind: PetRewardKind;
    amount: number;
    days?: number;
};

export type PetActivity = {
    day: string;
    offsetMinutes: number;
    streak: { lastVisit: string; current: number } | null;
    transactions: { date: Date | string; transactionType: string }[];
    savings: { date: string; type: string }[];
    bills: { checked: boolean }[];
};

export const isPetSpecies = (value: unknown): value is PetSpecies =>
    typeof value === 'string' &&
    (PET_SPECIES as readonly string[]).includes(value);

export const findPetItem = (id: string): PetItem | undefined =>
    PET_ITEMS.find((item) => item.id === id);

export const createPetState = (): PetState => ({
    species: null,
    coins: 0,
    earned: 0,
    owned: ['room'],
    equipped: { head: null, eyes: null, neck: null, background: 'room' },
    freezes: 0,
    name: null,
    claimed: [],
});

export const normalizePetState = (
    stored: Partial<PetState> | null | undefined,
): PetState => {
    const base = createPetState();
    if (!stored) return base;

    const owned = Array.from(
        new Set([
            'room',
            ...(stored.owned || []).filter((id) => findPetItem(id)),
        ]),
    );
    const equipped = { ...base.equipped };
    for (const slot of PET_SLOTS) {
        const id = stored.equipped?.[slot];
        const item = id ? findPetItem(id) : undefined;
        equipped[slot] =
            item && item.slot === slot && owned.includes(item.id)
                ? item.id
                : base.equipped[slot];
    }

    return {
        species: isPetSpecies(stored.species) ? stored.species : null,
        coins: Math.max(0, Math.floor(stored.coins || 0)),
        earned: Math.max(0, Math.floor(stored.earned || 0)),
        owned,
        equipped,
        freezes: Math.min(
            FREEZE_LIMIT,
            Math.max(0, Math.floor(stored.freezes || 0)),
        ),
        name: stored.name || null,
        claimed: (stored.claimed || []).filter(
            (key) => typeof key === 'string',
        ),
    };
};

export const streakMultiplier = (current: number): number => {
    if (current >= 100) return 3;
    if (current >= 30) return 2;
    if (current >= 7) return 1.5;
    return 1;
};

const shiftDay = (day: string, days: number): string => {
    const [year, month, date] = day.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, date + days));
    return shifted.toISOString().slice(0, 10);
};

export const localDayOf = (
    value: Date | string,
    offsetMinutes: number,
): string | null => {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return null;
    return new Date(time - offsetMinutes * 60 * 1000)
        .toISOString()
        .slice(0, 10);
};

const pruneClaimed = (claimed: string[], day: string): string[] => {
    const kept = claimed.filter((key) => {
        const stamp = key.split(':')[1] || '';
        if (!isDayKey(stamp)) return true;
        return getDayDifference(stamp, day) <= DATED_KEY_WINDOW;
    });
    return kept.slice(-KEY_LIMIT);
};

export const collectPetRewards = (
    stored: PetState,
    activity: PetActivity,
): { state: PetState; granted: PetReward[] } => {
    const claimed = new Set(stored.claimed);
    const granted: PetReward[] = [];

    const grant = (reward: PetReward) => {
        if (claimed.has(reward.key) || reward.amount <= 0) return;
        claimed.add(reward.key);
        granted.push(reward);
    };

    const { day, offsetMinutes, streak } = activity;
    const days = [shiftDay(day, -1), day];

    grant({ key: 'welcome', kind: 'welcome', amount: WELCOME_COINS });

    if (streak && streak.lastVisit === day) {
        grant({
            key: `visit:${day}`,
            kind: 'visit',
            amount: Math.round(
                REWARDS.visit * streakMultiplier(streak.current),
            ),
            days: streak.current,
        });

        for (const [milestone, bonus] of Object.entries(STREAK_BONUSES)) {
            if (streak.current >= Number(milestone)) {
                grant({
                    key: `streak:${milestone}`,
                    kind: 'streak',
                    amount: bonus,
                    days: Number(milestone),
                });
            }
        }
    }

    const loggedDays = new Set(
        activity.transactions
            .filter((item) => item.transactionType !== 'transfer')
            .map((item) => localDayOf(item.date, offsetMinutes)),
    );
    const savedDays = new Set(
        activity.savings
            .filter((item) => item.type === 'deposit')
            .map((item) => localDayOf(item.date, offsetMinutes)),
    );

    for (const target of days) {
        if (loggedDays.has(target)) {
            grant({ key: `log:${target}`, kind: 'log', amount: REWARDS.log });
        }
        if (savedDays.has(target)) {
            grant({
                key: `save:${target}`,
                kind: 'save',
                amount: REWARDS.save,
            });
        }
    }

    if (
        activity.bills.length > 0 &&
        activity.bills.every((bill) => bill.checked)
    ) {
        grant({
            key: `bills:${day.slice(0, 7)}`,
            kind: 'bills',
            amount: REWARDS.bills,
        });
    }

    const total = granted.reduce((sum, reward) => sum + reward.amount, 0);

    return {
        state: {
            ...stored,
            coins: stored.coins + total,
            earned: stored.earned + total,
            claimed: pruneClaimed([...claimed], day),
        },
        granted,
    };
};

export type PetPurchase =
    | { ok: true; state: PetState }
    | { ok: false; reason: 'unknown' | 'owned' | 'coins' | 'limit' };

export const buyPetItem = (stored: PetState, id: string): PetPurchase => {
    if (id === 'freeze') {
        if (stored.freezes >= FREEZE_LIMIT)
            return { ok: false, reason: 'limit' };
        if (stored.coins < FREEZE_PRICE) return { ok: false, reason: 'coins' };
        return {
            ok: true,
            state: {
                ...stored,
                coins: stored.coins - FREEZE_PRICE,
                freezes: stored.freezes + 1,
            },
        };
    }

    const item = findPetItem(id);
    if (!item) return { ok: false, reason: 'unknown' };
    if (stored.owned.includes(id)) return { ok: false, reason: 'owned' };
    if (stored.coins < item.price) return { ok: false, reason: 'coins' };

    return {
        ok: true,
        state: {
            ...stored,
            coins: stored.coins - item.price,
            owned: [...stored.owned, id],
            equipped: { ...stored.equipped, [item.slot]: id },
        },
    };
};

export const equipPetItem = (
    stored: PetState,
    slot: PetSlot,
    id: string | null,
): PetState | null => {
    if (id === null) {
        if (slot === 'background') return null;
        return { ...stored, equipped: { ...stored.equipped, [slot]: null } };
    }

    const item = findPetItem(id);
    if (!item || item.slot !== slot || !stored.owned.includes(id)) return null;

    return { ...stored, equipped: { ...stored.equipped, [slot]: id } };
};

export const renamePet = (stored: PetState, name: string): PetState => {
    const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, PET_NAME_LIMIT);
    return { ...stored, name: trimmed || null };
};

export const toPublicPet = (state: PetState) => ({
    species: state.species,
    coins: state.coins,
    earned: state.earned,
    owned: state.owned,
    equipped: state.equipped,
    freezes: state.freezes,
    name: state.name,
});
