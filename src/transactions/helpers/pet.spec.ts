import {
    FREEZE_LIMIT,
    FREEZE_PRICE,
    PetActivity,
    WELCOME_COINS,
    buyPetItem,
    collectPetRewards,
    createPetState,
    equipPetItem,
    normalizePetState,
    renamePet,
} from './pet';
import { registerStreakVisit } from './streak';

const activity = (patch: Partial<PetActivity> = {}): PetActivity => ({
    day: '2026-11-16',
    offsetMinutes: 0,
    streak: { lastVisit: '2026-11-16', current: 1 },
    transactions: [],
    savings: [],
    bills: [],
    ...patch,
});

describe('collectPetRewards', () => {
    it('gives the welcome coins and the daily visit once', () => {
        const first = collectPetRewards(createPetState(), activity());
        expect(first.granted.map((reward) => reward.kind)).toEqual([
            'welcome',
            'visit',
        ]);
        expect(first.state.coins).toBe(WELCOME_COINS + 5);

        const again = collectPetRewards(first.state, activity());
        expect(again.granted).toEqual([]);
        expect(again.state.coins).toBe(first.state.coins);
    });

    it('multiplies the visit reward on long streaks and pays milestones once', () => {
        const { granted } = collectPetRewards(
            createPetState(),
            activity({ streak: { lastVisit: '2026-11-16', current: 30 } }),
        );
        const visit = granted.find((reward) => reward.kind === 'visit');
        expect(visit?.amount).toBe(10);
        expect(
            granted
                .filter((reward) => reward.kind === 'streak')
                .map((reward) => reward.key),
        ).toEqual(['streak:7', 'streak:30']);
    });

    it('rewards a logged day and a deposit per day, not per item', () => {
        const { granted } = collectPetRewards(
            createPetState(),
            activity({
                transactions: [
                    {
                        date: '2026-11-16T09:00:00.000Z',
                        transactionType: 'expense',
                    },
                    {
                        date: '2026-11-16T10:00:00.000Z',
                        transactionType: 'income',
                    },
                    {
                        date: '2026-11-15T10:00:00.000Z',
                        transactionType: 'expense',
                    },
                    {
                        date: '2026-11-16T11:00:00.000Z',
                        transactionType: 'transfer',
                    },
                ],
                savings: [
                    { date: '2026-11-16T12:00:00.000Z', type: 'deposit' },
                ],
            }),
        );
        expect(
            granted
                .filter(
                    (reward) => reward.kind === 'log' || reward.kind === 'save',
                )
                .map((reward) => reward.key),
        ).toEqual(['log:2026-11-15', 'log:2026-11-16', 'save:2026-11-16']);
    });

    it('reads transaction days in the visitor timezone', () => {
        const { granted } = collectPetRewards(
            createPetState(),
            activity({
                offsetMinutes: -120,
                transactions: [
                    {
                        date: '2026-11-15T23:30:00.000Z',
                        transactionType: 'expense',
                    },
                ],
            }),
        );
        expect(granted.some((reward) => reward.key === 'log:2026-11-16')).toBe(
            true,
        );
    });

    it('pays the bills bonus only when every bill is checked', () => {
        const open = collectPetRewards(
            createPetState(),
            activity({ bills: [{ checked: true }, { checked: false }] }),
        );
        expect(open.granted.some((reward) => reward.kind === 'bills')).toBe(
            false,
        );

        const done = collectPetRewards(
            createPetState(),
            activity({ bills: [{ checked: true }, { checked: true }] }),
        );
        expect(
            done.granted.find((reward) => reward.kind === 'bills')?.key,
        ).toBe('bills:2026-11');
    });

    it('forgets old dated keys but keeps milestone keys', () => {
        const state = {
            ...createPetState(),
            claimed: [
                'welcome',
                'streak:7',
                'visit:2026-10-01',
                'visit:2026-11-10',
            ],
        };
        const { state: next } = collectPetRewards(
            state,
            activity({ streak: null }),
        );
        expect(next.claimed).toEqual([
            'welcome',
            'streak:7',
            'visit:2026-11-10',
        ]);
    });
});

describe('pet shop', () => {
    const rich = { ...createPetState(), coins: 500 };

    it('buys and wears an item, and refuses a second purchase', () => {
        const bought = buyPetItem(rich, 'cap');
        expect(bought.ok).toBe(true);
        if (!bought.ok) return;
        expect(bought.state.coins).toBe(420);
        expect(bought.state.equipped.head).toBe('cap');
        expect(buyPetItem(bought.state, 'cap')).toEqual({
            ok: false,
            reason: 'owned',
        });
    });

    it('refuses when coins are short or the item is unknown', () => {
        expect(buyPetItem(createPetState(), 'tophat')).toEqual({
            ok: false,
            reason: 'coins',
        });
        expect(buyPetItem(rich, 'dragon')).toEqual({
            ok: false,
            reason: 'unknown',
        });
    });

    it('caps streak freezes', () => {
        let state = rich;
        for (let index = 0; index < FREEZE_LIMIT; index++) {
            const result = buyPetItem(state, 'freeze');
            if (!result.ok) throw new Error('expected a freeze');
            state = result.state;
        }
        expect(state.coins).toBe(500 - FREEZE_PRICE * FREEZE_LIMIT);
        expect(buyPetItem(state, 'freeze')).toEqual({
            ok: false,
            reason: 'limit',
        });
    });

    it('only equips owned items in their own slot and keeps a background on', () => {
        expect(equipPetItem(rich, 'head', 'cap')).toBeNull();
        expect(equipPetItem(rich, 'eyes', 'room')).toBeNull();
        expect(equipPetItem(rich, 'background', null)).toBeNull();
        expect(equipPetItem(rich, 'head', null)?.equipped.head).toBeNull();
    });

    it('cleans names and drops unknown stored items', () => {
        expect(renamePet(rich, '   Пельмень   Петрович  ').name).toBe(
            'Пельмень Петрович',
        );
        expect(renamePet(rich, '   ').name).toBeNull();

        const normalized = normalizePetState({
            species: 'dragon' as never,
            owned: ['cap', 'ghost'],
            equipped: {
                head: 'ghost',
                eyes: 'cap',
                neck: null,
                background: 'room',
            },
            coins: -4,
            freezes: 9,
        });
        expect(normalized.species).toBeNull();
        expect(normalized.owned).toEqual(['room', 'cap']);
        expect(normalized.equipped.head).toBeNull();
        expect(normalized.equipped.eyes).toBeNull();
        expect(normalized.coins).toBe(0);
        expect(normalized.freezes).toBe(FREEZE_LIMIT);
    });
});

describe('streak freezes', () => {
    const stored = {
        lastVisit: '2026-11-13',
        current: 12,
        best: 12,
        history: ['2026-11-13'],
        celebrated: [10],
    };

    it('bridges missed days when enough freezes are owned', () => {
        const visit = registerStreakVisit(stored, '2026-11-15', 1);
        expect(visit.streak.current).toBe(13);
        expect(visit.frozen).toBe(1);
    });

    it('breaks the run when the gap is longer than the freezes', () => {
        const visit = registerStreakVisit(stored, '2026-11-16', 1);
        expect(visit.streak.current).toBe(1);
        expect(visit.frozen).toBeUndefined();
    });
});
