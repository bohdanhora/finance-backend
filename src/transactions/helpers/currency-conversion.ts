import { EssentialItemDto } from '../dtos/essential-payments.dto';
import { ExpectedIncomeRecord } from '../dtos/expected-income.dto';
import { SavingsOperationDto } from '../dtos/savings.dto';
import { TransactionDto } from '../dtos/transaction.dto';
import { MonthSnapshot } from './month-rollover';
import type { CardRecord } from './cards';

export type MainCurrencyAmounts = {
    cards?: CardRecord[];
    totalAmount: number;
    totalIncome: number;
    totalSpend: number;
    nextMonthTotalAmount: number;
    defaultEssentialsArray: EssentialItemDto[];
    essentialsArray: EssentialItemDto[];
    nextMonthEssentialsArray: EssentialItemDto[];
    expectedIncomes: ExpectedIncomeRecord[];
    monthHistory: MonthSnapshot[];
    transactions: TransactionDto[];
    savingsOperations: SavingsOperationDto[];
};

type PlainDocument<T> = T & { toObject?: () => T };

const toPlain = <T>(item: T): T =>
    (item as PlainDocument<T>).toObject?.() ?? item;

export const roundCurrency = (value: number): number =>
    Math.round((value + Number.EPSILON) * 100) / 100;

const convertValue = (value: number, rate: number): number =>
    roundCurrency(value * rate);

const convertEssentials = (
    items: EssentialItemDto[] = [],
    rate: number,
): EssentialItemDto[] =>
    items.map((documentItem) => {
        const item = toPlain(documentItem);
        return {
            ...item,
            amount: convertValue(item.amount, rate),
            ...(typeof item.paidAmount === 'number'
                ? { paidAmount: convertValue(item.paidAmount, rate) }
                : {}),
        };
    });

const convertExpectedIncomes = <
    T extends { amount: number; receivedAmount?: number },
>(
    items: T[] = [],
    rate: number,
): T[] =>
    items.map((documentItem) => {
        const item = toPlain(documentItem);
        return {
            ...item,
            amount: convertValue(item.amount, rate),
            ...(typeof item.receivedAmount === 'number'
                ? { receivedAmount: convertValue(item.receivedAmount, rate) }
                : {}),
        };
    });

const convertMonthHistory = (
    history: MonthSnapshot[] = [],
    rate: number,
): MonthSnapshot[] =>
    history.map((documentEntry) => {
        const entry = toPlain(documentEntry);
        return {
            ...entry,
            essentials: convertEssentials(
                entry.essentials as EssentialItemDto[],
                rate,
            ),
            expectedIncomes: convertExpectedIncomes(
                entry.expectedIncomes,
                rate,
            ),
        };
    });

/**
 * Converts every value denominated in the account's main currency. Savings
 * goal targets and SavingsOperation.amount deliberately stay untouched: they
 * describe real holdings in their own explicitly stored currency.
 */
const convertCards = (cards: CardRecord[], rate: number): CardRecord[] =>
    cards.map((documentCard) => {
        const card = toPlain(documentCard);
        return { ...card, balance: convertValue(card.balance, rate) };
    });

export const convertMainCurrencyAmounts = (
    source: MainCurrencyAmounts,
    rate: number,
): MainCurrencyAmounts => {
    const converted = convertAmounts(source, rate);

    if (!source.cards?.length) {
        return converted;
    }

    const cards = convertCards(source.cards, rate);
    return {
        ...converted,
        cards,
        totalAmount: roundCurrency(
            cards.reduce((total, card) => total + card.balance, 0),
        ),
    };
};

const convertAmounts = (
    source: MainCurrencyAmounts,
    rate: number,
): MainCurrencyAmounts => ({
    totalAmount: convertValue(source.totalAmount, rate),
    totalIncome: convertValue(source.totalIncome, rate),
    totalSpend: convertValue(source.totalSpend, rate),
    nextMonthTotalAmount: convertValue(source.nextMonthTotalAmount, rate),
    defaultEssentialsArray: convertEssentials(
        source.defaultEssentialsArray,
        rate,
    ),
    essentialsArray: convertEssentials(source.essentialsArray, rate),
    nextMonthEssentialsArray: convertEssentials(
        source.nextMonthEssentialsArray,
        rate,
    ),
    expectedIncomes: convertExpectedIncomes(source.expectedIncomes, rate),
    monthHistory: convertMonthHistory(source.monthHistory, rate),
    transactions: (source.transactions || []).map((documentTransaction) => {
        const transaction = toPlain(documentTransaction);
        return {
            ...transaction,
            value: convertValue(transaction.value, rate),
        };
    }),
    savingsOperations: (source.savingsOperations || []).map(
        (documentOperation) => {
            const operation = toPlain(documentOperation);
            return {
                ...operation,
                ...(typeof operation.balanceAmount === 'number'
                    ? {
                          balanceAmount: convertValue(
                              operation.balanceAmount,
                              rate,
                          ),
                      }
                    : {}),
            };
        },
    ),
});
