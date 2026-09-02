import 'reflect-metadata';
import {
    convertMainCurrencyAmounts,
    roundCurrency,
} from './currency-conversion';
import {
    SavingsCurrency,
    SavingsOperationType,
    SavingsStorage,
} from '../dtos/savings.dto';
import { TransactionType } from '../dtos/transaction.dto';

describe('convertMainCurrencyAmounts', () => {
    it('converts all main-currency values and rounds each amount to cents', () => {
        const converted = convertMainCurrencyAmounts(
            {
                totalAmount: 1000,
                totalIncome: 1500,
                totalSpend: 500,
                nextMonthTotalAmount: 2000,
                defaultEssentialsArray: [
                    {
                        id: 'rent',
                        title: 'Rent',
                        amount: 700,
                        checked: false,
                    },
                ],
                essentialsArray: [
                    {
                        id: 'utilities',
                        title: 'Utilities',
                        amount: 123.45,
                        checked: true,
                        paidAmount: 120.1,
                    },
                ],
                nextMonthEssentialsArray: [],
                transactions: [
                    {
                        id: 'income',
                        transactionType: TransactionType.INCOME,
                        value: 333.33,
                        date: new Date('2026-09-02T00:00:00.000Z'),
                        categorie: 'salary',
                        description: 'Salary',
                    },
                ],
                savingsOperations: [
                    {
                        id: 'linked',
                        type: SavingsOperationType.DEPOSIT,
                        storage: SavingsStorage.CARD,
                        amount: 200,
                        currency: SavingsCurrency.EUR,
                        date: '2026-09-02T00:00:00.000Z',
                        balanceAmount: 10_270,
                    },
                    {
                        id: 'cash',
                        type: SavingsOperationType.DEPOSIT,
                        storage: SavingsStorage.CASH,
                        amount: 100,
                        currency: SavingsCurrency.USD,
                        date: '2026-09-02T00:00:00.000Z',
                    },
                ],
            },
            0.025,
        );

        expect(converted).toEqual(
            expect.objectContaining({
                totalAmount: 25,
                totalIncome: 37.5,
                totalSpend: 12.5,
                nextMonthTotalAmount: 50,
            }),
        );
        expect(converted.defaultEssentialsArray[0].amount).toBe(17.5);
        expect(converted.essentialsArray[0]).toEqual(
            expect.objectContaining({ amount: 3.09, paidAmount: 3 }),
        );
        expect(converted.transactions[0].value).toBe(8.33);
        expect(converted.savingsOperations[0]).toEqual(
            expect.objectContaining({
                amount: 200,
                currency: SavingsCurrency.EUR,
                balanceAmount: 256.75,
            }),
        );
        expect(converted.savingsOperations[1]).toEqual(
            expect.objectContaining({
                amount: 100,
                currency: SavingsCurrency.USD,
            }),
        );
        expect(converted.savingsOperations[1]).not.toHaveProperty(
            'balanceAmount',
        );
    });

    it('rounds floating point values predictably', () => {
        expect(roundCurrency(1.005)).toBe(1.01);
        expect(roundCurrency(10.999)).toBe(11);
    });
});
