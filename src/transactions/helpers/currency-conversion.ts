import { EssentialItemDto } from '../dtos/essential-payments.dto';
import { SavingsOperationDto } from '../dtos/savings.dto';
import { TransactionDto } from '../dtos/transaction.dto';

export type MainCurrencyAmounts = {
    totalAmount: number;
    totalIncome: number;
    totalSpend: number;
    nextMonthTotalAmount: number;
    defaultEssentialsArray: EssentialItemDto[];
    essentialsArray: EssentialItemDto[];
    nextMonthEssentialsArray: EssentialItemDto[];
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

/**
 * Converts every value denominated in the account's main currency. Savings
 * goal targets and SavingsOperation.amount deliberately stay untouched: they
 * describe real holdings in their own explicitly stored currency.
 */
export const convertMainCurrencyAmounts = (
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
