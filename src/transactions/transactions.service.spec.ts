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
        const transactionsModel = {
            findOne: jest.fn().mockResolvedValue(userData),
            updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
        };
        const service = new TransactionsService(
            {} as never,
            transactionsModel as never,
            new CalculationService(),
        );

        return { service, transactionsModel };
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

        const result = await service.addSavingsOperation({ item }, request);

        expect(result.updatedOperations).toEqual([item]);
        expect(transactionsModel.updateOne).toHaveBeenCalledWith(
            { userId: request.userId },
            { $set: { savingsOperations: [item] } },
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
            },
            request,
        );

        expect(
            result.updatedOperations.map((operation) => operation.id),
        ).toContain('withdrawal-1');
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
