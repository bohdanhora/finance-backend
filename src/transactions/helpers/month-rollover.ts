import { EssentialItemDto } from '../dtos/essential-payments.dto';

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

type MonthRolloverSource = {
    lastProcessedMonth?: string;
    defaultEssentialsArray: EssentialItemDto[];
    nextMonthEssentialsArray: EssentialItemDto[];
};

export type MonthRolloverUpdate = {
    lastProcessedMonth: string;
    essentialsArray?: EssentialItemDto[];
    nextMonthEssentialsArray?: EssentialItemDto[];
    nextMonthTotalAmount?: number;
};

export const toMonthKey = (date = new Date()): string =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export const isMonthKey = (value: string): boolean =>
    MONTH_KEY_PATTERN.test(value);

const monthIndex = (month: string): number => {
    const [year, monthNumber] = month.split('-').map(Number);
    return year * 12 + monthNumber - 1;
};

export const getMonthDifference = (from: string, to: string): number =>
    monthIndex(to) - monthIndex(from);

const copyEssentials = (
    items: EssentialItemDto[] = [],
    resetChecked = false,
): EssentialItemDto[] =>
    items.map(({ id, amount, title, checked }) => ({
        id,
        amount,
        title,
        checked: resetChecked ? false : checked,
    }));

/**
 * Builds the persisted changes needed when the dashboard enters a new month.
 * The current balance is deliberately absent: a forecast must never become
 * spendable money without an explicit income transaction from the user.
 */
export const buildMonthRolloverUpdate = (
    source: MonthRolloverSource,
    currentMonth: string,
): MonthRolloverUpdate | null => {
    if (!isMonthKey(currentMonth)) {
        throw new Error('Invalid current month');
    }

    if (!source.lastProcessedMonth) {
        return { lastProcessedMonth: currentMonth };
    }

    if (!isMonthKey(source.lastProcessedMonth)) {
        return { lastProcessedMonth: currentMonth };
    }

    const elapsedMonths = getMonthDifference(
        source.lastProcessedMonth,
        currentMonth,
    );

    if (elapsedMonths <= 0) {
        return null;
    }

    const currentEssentials =
        elapsedMonths === 1
            ? source.nextMonthEssentialsArray
            : source.defaultEssentialsArray;

    return {
        lastProcessedMonth: currentMonth,
        essentialsArray: copyEssentials(currentEssentials, elapsedMonths > 1),
        nextMonthEssentialsArray: copyEssentials(
            source.defaultEssentialsArray,
            true,
        ),
        nextMonthTotalAmount: 0,
    };
};
