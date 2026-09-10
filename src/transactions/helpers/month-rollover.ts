import { EssentialItemDto } from '../dtos/essential-payments.dto';
import { ExpectedIncomeRecord } from '../dtos/expected-income.dto';

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Two years of closed months is plenty to compare against. */
export const MONTH_HISTORY_LIMIT = 24;

/** What a finished month planned and what actually happened to that plan. */
export type MonthSnapshot = {
    month: string;
    essentials: Array<
        Pick<EssentialItemDto, 'id' | 'title' | 'amount' | 'checked'> & {
            paidAmount?: number;
        }
    >;
    expectedIncomes: Array<
        Pick<
            ExpectedIncomeRecord,
            'id' | 'title' | 'amount' | 'day' | 'received'
        > & { receivedAmount?: number }
    >;
};

type MonthRolloverSource = {
    lastProcessedMonth?: string;
    defaultEssentialsArray: EssentialItemDto[];
    essentialsArray?: EssentialItemDto[];
    nextMonthEssentialsArray: EssentialItemDto[];
    expectedIncomes?: ExpectedIncomeRecord[];
    monthHistory?: MonthSnapshot[];
};

export type MonthRolloverUpdate = {
    lastProcessedMonth: string;
    essentialsArray?: EssentialItemDto[];
    nextMonthEssentialsArray?: EssentialItemDto[];
    nextMonthTotalAmount?: number;
    expectedIncomes?: ExpectedIncomeRecord[];
    monthHistory?: MonthSnapshot[];
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
    items.map((item) => {
        const copiedItem: EssentialItemDto = {
            id: item.id,
            amount: item.amount,
            title: item.title,
            checked: resetChecked ? false : item.checked,
        };

        if (!resetChecked && item.checked) {
            copiedItem.paidAmount = item.paidAmount;
            copiedItem.paidAt = item.paidAt;
            copiedItem.paymentTransactionId = item.paymentTransactionId;
        }

        return copiedItem;
    });

const normalizeTitle = (title: string) => title.trim().toLowerCase();

/**
 * Bills the closing month never paid are still owed, so they move into the
 * new month. A bill already planned under the same name is the recurring
 * version of it and is not added twice.
 */
const carryUnpaidEssentials = (
    closing: EssentialItemDto[] = [],
    planned: EssentialItemDto[],
    closingMonth: string,
): EssentialItemDto[] => {
    const plannedTitles = new Set(
        planned.map((item) => normalizeTitle(item.title)),
    );
    const usedIds = new Set(planned.map((item) => item.id));

    return closing
        .filter(
            (item) =>
                !item.checked &&
                item.amount > 0 &&
                !plannedTitles.has(normalizeTitle(item.title)),
        )
        .map((item) => {
            const id = usedIds.has(item.id)
                ? `${item.id}-${closingMonth}`
                : item.id;
            usedIds.add(id);

            return {
                id,
                amount: item.amount,
                title: item.title,
                checked: false,
                carriedFrom: item.carriedFrom ?? closingMonth,
            };
        });
};

/** Recurring incomes start the month again as not yet received. */
const renewExpectedIncomes = (
    items: ExpectedIncomeRecord[] = [],
): ExpectedIncomeRecord[] =>
    items
        .filter((item) => item.recurring !== false)
        .map((item) => ({
            id: item.id,
            title: item.title,
            amount: item.amount,
            day: item.day,
            recurring: true,
            received: false,
        }));

export const buildMonthSnapshot = (
    source: Pick<MonthRolloverSource, 'essentialsArray' | 'expectedIncomes'>,
    month: string,
): MonthSnapshot | null => {
    const essentials = (source.essentialsArray || []).map((item) => ({
        id: item.id,
        title: item.title,
        amount: item.amount,
        checked: item.checked,
        ...(item.checked && typeof item.paidAmount === 'number'
            ? { paidAmount: item.paidAmount }
            : {}),
    }));
    const expectedIncomes = (source.expectedIncomes || []).map((item) => ({
        id: item.id,
        title: item.title,
        amount: item.amount,
        day: item.day,
        received: item.received,
        ...(item.received && typeof item.receivedAmount === 'number'
            ? { receivedAmount: item.receivedAmount }
            : {}),
    }));

    if (!essentials.length && !expectedIncomes.length) {
        return null;
    }

    return { month, essentials, expectedIncomes };
};

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

    const closingMonth = source.lastProcessedMonth;
    const elapsedMonths = getMonthDifference(closingMonth, currentMonth);

    if (elapsedMonths <= 0) {
        return null;
    }

    // An empty next-month plan used to leave the new month with no bills at
    // all, so the recurring template fills in whenever there is no plan.
    const plannedEssentials =
        elapsedMonths === 1 && source.nextMonthEssentialsArray?.length
            ? copyEssentials(source.nextMonthEssentialsArray)
            : copyEssentials(source.defaultEssentialsArray, true);

    const snapshot = buildMonthSnapshot(source, closingMonth);
    const history = [...(source.monthHistory || [])];

    return {
        lastProcessedMonth: currentMonth,
        essentialsArray: [
            ...plannedEssentials,
            ...carryUnpaidEssentials(
                source.essentialsArray,
                plannedEssentials,
                closingMonth,
            ),
        ],
        nextMonthEssentialsArray: copyEssentials(
            source.defaultEssentialsArray,
            true,
        ),
        nextMonthTotalAmount: 0,
        expectedIncomes: renewExpectedIncomes(source.expectedIncomes),
        ...(snapshot
            ? {
                  monthHistory: [
                      ...history.filter(
                          (entry) => entry.month !== snapshot.month,
                      ),
                      snapshot,
                  ].slice(-MONTH_HISTORY_LIMIT),
              }
            : {}),
    };
};
