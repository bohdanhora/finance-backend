import 'reflect-metadata';
import { AuthenticatedRequest } from 'src/app.controller';
import { EssentialsType } from './dtos/essential-payments.dto';
import {
    SavingsCurrency,
    SavingsOperationType,
    SavingsStorage,
} from './dtos/savings.dto';
import { CalculationService } from './helpers/calculation.service';
import { TransactionsService } from './transactions.service';
import { TransactionType } from './dtos/transaction.dto';

describe('TransactionsService essential payments', () => {
    const request = {
        userId: '507f1f77bcf86cd799439011',
    } as AuthenticatedRequest;

    it('deducts the actual amount once and returns it when payment is undone', async () => {
        const userData: Record<string, any> = {
            totalAmount: 10_000,
            totalIncome: 10_000,
            totalSpend: 0,
            essentialsArray: [
                {
                    id: 'utilities',
                    title: 'Utilities',
                    amount: 4_000,
                    checked: false,
                },
            ],
            nextMonthEssentialsArray: [],
            transactions: [],
            set: jest.fn((field: string, value: unknown) => {
                userData[field] = value;
            }),
            save: jest.fn().mockResolvedValue(undefined),
        };
        const transactionsModel = {
            findOne: jest.fn().mockResolvedValue(userData),
        };
        const service = new TransactionsService(
            {} as never,
            transactionsModel as never,
            new CalculationService(),
        );

        const paid = await service.setCheckedEssentalPayments(
            {
                type: EssentialsType.THIS_MONTH,
                item: {
                    id: 'utilities',
                    checked: true,
                    actualAmount: 3_200,
                },
            },
            request,
        );

        expect(paid.updatedTotals).toEqual({
            totalAmount: 6_800,
            totalIncome: 10_000,
            totalSpend: 3_200,
        });
        expect(paid.updatedItems[0]).toEqual(
            expect.objectContaining({
                checked: true,
                amount: 4_000,
                paidAmount: 3_200,
            }),
        );
        expect(typeof paid.updatedItems[0].paymentTransactionId).toBe('string');
        expect(paid.updatedTransactions).toHaveLength(1);
        expect(paid.updatedTransactions[0]).toEqual(
            expect.objectContaining({
                value: 3_200,
                categorie: 'essentials',
                description: 'Utilities',
            }),
        );

        await service.setCheckedEssentalPayments(
            {
                type: EssentialsType.THIS_MONTH,
                item: {
                    id: 'utilities',
                    checked: true,
                    actualAmount: 3_200,
                },
            },
            request,
        );
        expect(userData.totalAmount).toBe(6_800);
        expect(userData.transactions).toHaveLength(1);

        const undone = await service.setCheckedEssentalPayments(
            {
                type: EssentialsType.THIS_MONTH,
                item: { id: 'utilities', checked: false },
            },
            request,
        );

        expect(undone.updatedTotals).toEqual({
            totalAmount: 10_000,
            totalIncome: 10_000,
            totalSpend: 0,
        });
        expect(undone.updatedItems[0]).toEqual({
            id: 'utilities',
            title: 'Utilities',
            amount: 4_000,
            checked: false,
        });
        expect(undone.updatedTransactions).toHaveLength(0);
    });
});

describe('TransactionsService shared savings', () => {
    const request = {
        userId: '507f1f77bcf86cd799439011',
    } as AuthenticatedRequest;
    const date = '2026-09-02T12:00:00.000Z';

    const createService = (userData: Record<string, any>) => {
        const completeUserData = {
            totalAmount: 500_000,
            totalIncome: 500_000,
            totalSpend: 0,
            transactions: [],
            savingsGoals: [],
            savingsOperations: [],
            save: jest.fn().mockResolvedValue(undefined),
            ...userData,
        };
        const transactionsModel = {
            findOne: jest.fn().mockResolvedValue(completeUserData),
            updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
        };
        const service = new TransactionsService(
            {} as never,
            transactionsModel as never,
            new CalculationService(),
        );

        return { service, transactionsModel, userData: completeUserData };
    };

    it('adds savings without assigning them to a goal', async () => {
        const { service, transactionsModel } = createService({
            savingsGoals: [],
            savingsOperations: [],
        });
        const item = {
            id: 'deposit-1',
            type: SavingsOperationType.DEPOSIT,
            storage: SavingsStorage.CARD,
            amount: 300_000,
            currency: SavingsCurrency.UAH,
            date,
        };

        const result = await service.addSavingsOperation(
            { item, balanceAmount: 300_000 },
            request,
        );

        expect(typeof result.updatedOperations[0].linkedTransactionId).toBe(
            'string',
        );
        expect(result.updatedOperations[0]).toEqual({
            ...item,
            balanceAmount: 300_000,
            linkedTransactionId:
                result.updatedOperations[0].linkedTransactionId,
        });
        expect(result.updatedTransactions[0]).toEqual(
            expect.objectContaining({
                transactionType: TransactionType.EXPENSE,
                value: 300_000,
                categorie: 'savings',
                savingsOperationId: item.id,
            }),
        );
        expect(result.updatedTotals).toEqual({
            totalAmount: 200_000,
            totalIncome: 500_000,
            totalSpend: 300_000,
        });
        expect(transactionsModel.updateOne).toHaveBeenCalledWith(
            { userId: request.userId },
            {
                $set: {
                    savingsOperations: result.updatedOperations,
                    transactions: result.updatedTransactions,
                    totalAmount: 200_000,
                    totalIncome: 500_000,
                    totalSpend: 300_000,
                },
            },
        );
    });

    it('uses legacy goal movements as part of the shared balance', async () => {
        const { service } = createService({
            savingsGoals: [],
            savingsOperations: [
                {
                    id: 'legacy-a',
                    goalId: 'goal-a',
                    type: SavingsOperationType.DEPOSIT,
                    storage: SavingsStorage.CARD,
                    amount: 100_000,
                    currency: SavingsCurrency.UAH,
                    date,
                },
                {
                    id: 'legacy-b',
                    goalId: 'goal-b',
                    type: SavingsOperationType.DEPOSIT,
                    storage: SavingsStorage.CARD,
                    amount: 50_000,
                    currency: SavingsCurrency.UAH,
                    date,
                },
            ],
        });

        const result = await service.addSavingsOperation(
            {
                item: {
                    id: 'withdrawal-1',
                    type: SavingsOperationType.WITHDRAWAL,
                    storage: SavingsStorage.CARD,
                    amount: 120_000,
                    currency: SavingsCurrency.UAH,
                    date,
                },
                balanceAmount: 120_000,
            },
            request,
        );

        expect(
            result.updatedOperations.map((operation) => operation.id),
        ).toContain('withdrawal-1');
        expect(result.updatedTotals.totalAmount).toBe(620_000);
        expect(result.updatedTransactions[0]).toEqual(
            expect.objectContaining({
                transactionType: TransactionType.INCOME,
                value: 120_000,
                categorie: 'savings',
            }),
        );
    });

    it('does not withdraw card savings from the cash balance', async () => {
        const { service } = createService({
            savingsOperations: [
                {
                    id: 'cash-deposit',
                    type: SavingsOperationType.DEPOSIT,
                    storage: SavingsStorage.CASH,
                    amount: 1_000,
                    currency: SavingsCurrency.UAH,
                    date,
                },
            ],
        });

        await expect(
            service.addSavingsOperation(
                {
                    item: {
                        id: 'card-withdrawal',
                        type: SavingsOperationType.WITHDRAWAL,
                        storage: SavingsStorage.CARD,
                        amount: 1,
                        currency: SavingsCurrency.UAH,
                        date,
                    },
                    balanceAmount: 1,
                },
                request,
            ),
        ).rejects.toThrow('Not enough savings in the selected storage');
    });

    it('moves savings between storages without changing the main balance', async () => {
        const existingDeposit = {
            id: 'cash-deposit',
            type: SavingsOperationType.DEPOSIT,
            storage: SavingsStorage.CASH,
            amount: 1_000,
            currency: SavingsCurrency.UAH,
            date,
        };
        const { service } = createService({
            savingsOperations: [existingDeposit],
        });
        const transfer = {
            id: 'cash-to-card',
            type: SavingsOperationType.TRANSFER,
            storage: SavingsStorage.CASH,
            destinationStorage: SavingsStorage.CARD,
            amount: 400,
            currency: SavingsCurrency.UAH,
            date,
        };

        const result = await service.addSavingsOperation(
            { item: transfer },
            request,
        );

        expect(result.updatedOperations).toEqual([transfer, existingDeposit]);
        expect(result.updatedTransactions).toEqual([]);
        expect(result.updatedTotals).toEqual({
            totalAmount: 500_000,
            totalIncome: 500_000,
            totalSpend: 0,
        });
    });

    it('does not deposit more than the main balance', async () => {
        const { service } = createService({ totalAmount: 100 });

        await expect(
            service.addSavingsOperation(
                {
                    item: {
                        id: 'too-large-deposit',
                        type: SavingsOperationType.DEPOSIT,
                        storage: SavingsStorage.CASH,
                        amount: 101,
                        currency: SavingsCurrency.UAH,
                        date,
                    },
                    balanceAmount: 101,
                },
                request,
            ),
        ).rejects.toThrow('Not enough money on the main balance');
    });

    it('turns a savings expense into a linked deposit', async () => {
        const { service, userData } = createService({});

        const result = await service.newTransaction(
            {
                id: 'expense-1',
                transactionType: TransactionType.EXPENSE,
                value: 50_000,
                date: new Date(date),
                categorie: 'savings',
                description: 'Emergency fund',
                savingsStorage: SavingsStorage.CARD,
                savingsCurrency: SavingsCurrency.UAH,
            },
            request,
        );

        expect(result.updatedTotals.totalAmount).toBe(450_000);
        expect(result.updatedSavingsOperations[0]).toEqual(
            expect.objectContaining({
                type: SavingsOperationType.DEPOSIT,
                storage: SavingsStorage.CARD,
                amount: 50_000,
                linkedTransactionId: 'expense-1',
            }),
        );
        expect(result.updatedItems[0].savingsOperationId).toBe(
            result.updatedSavingsOperations[0].id,
        );
        expect(userData.save).toHaveBeenCalledTimes(1);
    });

    it('deletes a linked savings deposit and its balance expense together', async () => {
        const linkedOperation = {
            id: 'deposit-1',
            type: SavingsOperationType.DEPOSIT,
            storage: SavingsStorage.CARD,
            amount: 100,
            currency: SavingsCurrency.UAH,
            date,
            linkedTransactionId: 'transaction-1',
            balanceAmount: 100,
        };
        const { service, transactionsModel } = createService({
            totalAmount: 400,
            totalIncome: 500,
            totalSpend: 100,
            savingsOperations: [linkedOperation],
            transactions: [
                {
                    id: 'transaction-1',
                    transactionType: TransactionType.EXPENSE,
                    value: 100,
                    date,
                    categorie: 'savings',
                    description: '',
                    savingsOperationId: 'deposit-1',
                },
            ],
        });

        const result = await service.deleteSavingsOperation(
            'deposit-1',
            request,
        );

        expect(result.updatedOperations).toEqual([]);
        expect(result.updatedTransactions).toEqual([]);
        expect(result.updatedTotals).toEqual({
            totalAmount: 500,
            totalIncome: 500,
            totalSpend: 0,
        });
        expect(transactionsModel.updateOne).toHaveBeenCalledWith(
            { userId: request.userId },
            {
                $set: {
                    savingsOperations: [],
                    transactions: [],
                    totalAmount: 500,
                    totalIncome: 500,
                    totalSpend: 0,
                },
            },
        );
    });

    it('deletes the linked savings operation when its expense is deleted', async () => {
        const linkedOperation = {
            id: 'deposit-1',
            type: SavingsOperationType.DEPOSIT,
            storage: SavingsStorage.CASH,
            amount: 100,
            currency: SavingsCurrency.UAH,
            date,
            linkedTransactionId: 'transaction-1',
            balanceAmount: 100,
        };
        const transaction = {
            id: 'transaction-1',
            transactionType: TransactionType.EXPENSE,
            value: 100,
            date,
            categorie: 'savings',
            description: '',
            savingsOperationId: 'deposit-1',
        };
        const { service, userData } = createService({
            totalAmount: 400,
            totalIncome: 500,
            totalSpend: 100,
            savingsOperations: [linkedOperation],
            transactions: [transaction],
        });

        const result = await service.deleteTransaction(
            { transactionId: transaction.id },
            request,
        );

        expect(result.updatedItems).toEqual([]);
        expect(result.updatedSavingsOperations).toEqual([]);
        expect(result.updatedTotals).toEqual({
            totalAmount: 500,
            totalIncome: 500,
            totalSpend: 0,
        });
        expect(userData.save).toHaveBeenCalledTimes(1);
    });

    it('keeps shared savings when a goal is deleted', async () => {
        const legacyOperation = {
            id: 'legacy-a',
            goalId: 'goal-a',
            type: SavingsOperationType.DEPOSIT,
            storage: SavingsStorage.CASH,
            amount: 10_000,
            currency: SavingsCurrency.UAH,
            date,
        };
        const { service, transactionsModel } = createService({
            savingsGoals: [
                {
                    id: 'goal-a',
                    name: 'GPU',
                    targetAmount: 120_000,
                    currency: SavingsCurrency.UAH,
                    monthlyContribution: 0,
                    createdAt: date,
                },
            ],
            savingsOperations: [legacyOperation],
        });

        const result = await service.deleteSavingsGoal('goal-a', request);

        expect(result.updatedOperations).toEqual([legacyOperation]);
        expect(transactionsModel.updateOne).toHaveBeenCalledWith(
            { userId: request.userId },
            { $set: { savingsGoals: [] } },
        );
    });
});
