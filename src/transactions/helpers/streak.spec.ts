import {
    StreakState,
    registerStreakVisit,
    resolveVisitDay,
    toDayKey,
} from './streak';

const state = (
    item: Partial<StreakState> & Pick<StreakState, 'lastVisit' | 'current'>,
): StreakState => ({
    best: item.current,
    history: [item.lastVisit],
    celebrated: [],
    ...item,
});

describe('registerStreakVisit', () => {
    it('starts a run when the user has no streak yet', () => {
        expect(registerStreakVisit(null, '2026-09-03')).toEqual({
            streak: {
                lastVisit: '2026-09-03',
                current: 1,
                best: 1,
                history: ['2026-09-03'],
                celebrated: [],
            },
            changed: true,
            reached: null,
        });
    });

    it('counts the next day and ignores a second visit on the same day', () => {
        const continued = registerStreakVisit(
            state({ lastVisit: '2026-09-02', current: 4 }),
            '2026-09-03',
        );
        expect(continued.streak.current).toBe(5);
        expect(continued.changed).toBe(true);

        const again = registerStreakVisit(continued.streak, '2026-09-03');
        expect(again.streak.current).toBe(5);
        expect(again.changed).toBe(false);
    });

    it('starts over after a missed day but keeps the best run', () => {
        const { streak } = registerStreakVisit(
            state({ lastVisit: '2026-08-30', current: 12, best: 12 }),
            '2026-09-03',
        );

        expect(streak.current).toBe(1);
        expect(streak.best).toBe(12);
    });

    it('leaves the streak alone for a device that is behind another one', () => {
        const stored = state({ lastVisit: '2026-09-03', current: 9 });

        expect(registerStreakVisit(stored, '2026-09-02')).toEqual({
            streak: stored,
            changed: false,
            reached: null,
        });
    });

    it('announces a milestone once, and again once the streak is rebuilt', () => {
        const first = registerStreakVisit(
            state({ lastVisit: '2026-09-02', current: 9 }),
            '2026-09-03',
        );
        expect(first.reached).toBe(10);
        expect(first.streak.celebrated).toEqual([10]);

        expect(registerStreakVisit(first.streak, '2026-09-04').reached).toBe(
            null,
        );

        const broken = registerStreakVisit(first.streak, '2026-09-20');
        expect(broken.streak.celebrated).toEqual([]);
    });

    it('keeps a month of history and drops the oldest days', () => {
        const history = Array.from({ length: 30 }, (_, index) => {
            const date = new Date(Date.UTC(2026, 7, 4 + index));
            return toDayKey(date);
        });

        const { streak } = registerStreakVisit(
            state({
                lastVisit: '2026-09-02',
                current: 30,
                best: 30,
                history,
            }),
            '2026-09-03',
        );

        expect(streak.history).toHaveLength(30);
        expect(streak.history[0]).toBe('2026-08-05');
        expect(streak.history[29]).toBe('2026-09-03');
    });

    it('repairs a record whose stored day is unusable', () => {
        const { streak } = registerStreakVisit(
            state({ lastVisit: 'yesterday', current: 7, best: 9 }),
            '2026-09-03',
        );

        expect(streak.current).toBe(1);
        expect(streak.best).toBe(9);
    });
});

describe('resolveVisitDay', () => {
    it('trusts a day within a timezone of the server date', () => {
        expect(resolveVisitDay('2026-09-04', '2026-09-03')).toBe('2026-09-04');
        expect(resolveVisitDay('2026-09-02', '2026-09-03')).toBe('2026-09-02');
    });

    it('falls back to the server date for a wrong clock or a broken day', () => {
        expect(resolveVisitDay('2027-01-01', '2026-09-03')).toBe('2026-09-03');
        expect(resolveVisitDay('not-a-day', '2026-09-03')).toBe('2026-09-03');
        expect(resolveVisitDay('2026-13-40', '2026-09-03')).toBe('2026-09-03');
    });
});
