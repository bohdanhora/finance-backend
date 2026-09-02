const DAY_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days of history kept per user; the dashboard shows the last seven. */
export const STREAK_HISTORY_LENGTH = 30;

/** Reaching one of these changes the flame and is announced once. */
export const STREAK_MILESTONES = [10, 50, 100];

export type StreakState = {
    lastVisit: string;
    current: number;
    best: number;
    history: string[];
    celebrated: number[];
};

export type StreakVisit = {
    streak: StreakState;
    /** False when the day was already recorded, so nothing has to be saved. */
    changed: boolean;
    /** The milestone this visit reached, when it deserves an announcement. */
    reached: number | null;
};

export const toDayKey = (date = new Date()): string =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
        date.getUTCDate(),
    ).padStart(2, '0')}`;

export const isDayKey = (value: string): boolean => DAY_KEY_PATTERN.test(value);

const dayIndex = (day: string): number => {
    const [year, month, date] = day.split('-').map(Number);
    return Math.round(Date.UTC(year, month - 1, date) / MILLISECONDS_PER_DAY);
};

export const getDayDifference = (from: string, to: string): number =>
    dayIndex(to) - dayIndex(from);

/**
 * The day a visit is recorded on.
 *
 * The client sends its own calendar day because only the browser knows the
 * user's timezone, and the server cannot tell an Auckland morning from a Los
 * Angeles evening. Timezones span a day either side of UTC, so anything
 * further out is a wrong device clock rather than a traveller, and the server
 * date is used instead.
 */
export const resolveVisitDay = (day: string, today = toDayKey()): string =>
    isDayKey(day) && Math.abs(getDayDifference(today, day)) <= 1 ? day : today;

/**
 * Folds a visit into the stored streak: the next day continues the run, a
 * longer gap starts it again, and the same day changes nothing.
 */
export const registerStreakVisit = (
    stored: StreakState | null | undefined,
    day: string,
): StreakVisit => {
    if (!stored || !isDayKey(stored.lastVisit)) {
        return {
            streak: {
                lastVisit: day,
                current: 1,
                best: Math.max(stored?.best ?? 0, 1),
                history: [day],
                celebrated: [],
            },
            changed: true,
            reached: null,
        };
    }

    const gap = getDayDifference(stored.lastVisit, day);

    // Zero is the same day. A negative gap means this device is behind one
    // that already checked in today, and rolling the streak back for it would
    // punish the user for switching phones.
    if (gap <= 0) {
        return { streak: stored, changed: false, reached: null };
    }

    const current = gap === 1 ? stored.current + 1 : 1;

    // A broken streak drops the milestones above the new count, so climbing
    // back to ten days is announced again.
    const celebrated = (stored.celebrated || []).filter(
        (milestone) => milestone <= current,
    );
    const reached =
        STREAK_MILESTONES.includes(current) && !celebrated.includes(current)
            ? current
            : null;

    return {
        streak: {
            lastVisit: day,
            current,
            best: Math.max(stored.best || 0, current),
            history: [...(stored.history || []), day].slice(
                -STREAK_HISTORY_LENGTH,
            ),
            celebrated: reached ? [...celebrated, reached] : celebrated,
        },
        changed: true,
        reached,
    };
};
