import {
    BadRequestException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from 'src/app.controller';
import { User } from 'src/auth/schemas/user.schema';
import { AllTransactionsInfo } from './schemas/all-info.schema';
import {
    EssentialItemDto,
    EssentialsArrayDto,
    EssentialsType,
} from './dtos/essential-payments.dto';
import { TransactionDto, TransactionType } from './dtos/transaction.dto';
import { TotalAmountDto } from './dtos/total-amount.dto';
import { NextMonthTotalAmountDto } from './dtos/next-month-total-amount.dto';
import { CalculationService } from './helpers/calculation.service';
import { EssentialCheckedDto } from './dtos/essential-checked.dto';
import { RemoveEssentialDto } from './dtos/remove-essential.dto';
import { NewEssentialDto } from './dtos/add-new-essential.dto';
import { ClearAllInfoDto } from './dtos/clear-all-info';
import { SetPercentDto } from './dtos/percent';
import { DeleteTransaction } from './dtos/delete-transaction';
import { UpdateTransactionDto } from './dtos/update-transaction';
import { UpdateEssentialDto } from './dtos/update-essential.dto';
import {
    SavingsCurrency,
    SavingsGoalDto,
    SavingsGoalPayloadDto,
    SavingsOperationDto,
    SavingsOperationPayloadDto,
    SavingsOperationType,
    SavingsStorage,
} from './dtos/savings.dto';
import {
    buildMonthRolloverUpdate,
    getMonthDifference,
    isMonthKey,
    toMonthKey,
} from './helpers/month-rollover';

const SAVINGS_CATEGORY = 'savings';

@Injectable()
export class TransactionsService {
    constructor(
        @InjectModel(User.name) private UserModel: Model<User>,
        @InjectModel(AllTransactionsInfo.name)
        private AllTransactionsInfoModel: Model<AllTransactionsInfo>,
        private readonly calculationService: CalculationService,
    ) {}

    private getUpdateFieldName(type: EssentialsType): string {
        switch (type) {
            case EssentialsType.DEFAULT:
                return 'defaultEssentialsArray';
            case EssentialsType.THIS_MONTH:
                return 'essentialsArray';
            case EssentialsType.NEXT_MONTH:
                return 'nextMonthEssentialsArray';
            default:
                throw new BadRequestException('Invalid essentials type');
        }
    }

    private getUserIdOrThrow(req: AuthenticatedRequest): string {
        if (!req.userId) {
            throw new UnauthorizedException('User ID not found');
        }
        if (!Types.ObjectId.isValid(req.userId)) {
            throw new BadRequestException('Invalid userId format');
        }
        return req.userId;
    }

    private async getUserDataOrThrow(userId: string) {
        const userData = await this.AllTransactionsInfoModel.findOne({
            userId,
        });
        if (!userData) {
            throw new BadRequestException('User data not found');
        }
        return userData;
    }

    private isEssentialPaymentTransaction(
        userData: AllTransactionsInfo,
        transactionId: string,
    ): boolean {
        return [
            ...(userData.essentialsArray || []),
            ...(userData.nextMonthEssentialsArray || []),
        ].some((essential) => essential.paymentTransactionId === transactionId);
    }

    async getAllInfo(req: AuthenticatedRequest, requestedMonth?: string) {
        const userId = this.getUserIdOrThrow(req);
        const currentMonth = requestedMonth ?? toMonthKey();

        if (!isMonthKey(currentMonth)) {
            throw new BadRequestException('Invalid current month');
        }

        if (Math.abs(getMonthDifference(toMonthKey(), currentMonth)) > 1) {
            throw new BadRequestException('Current month is out of range');
        }

        const user = await this.UserModel.findById(userId);
        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        const transactions = await this.AllTransactionsInfoModel.findOne({
            userId,
        });
        if (!transactions) {
            throw new BadRequestException('No transactions found');
        }

        const rolloverUpdate = buildMonthRolloverUpdate(
            transactions,
            currentMonth,
        );

        if (rolloverUpdate) {
            transactions.set(rolloverUpdate);
            await transactions.save();
        }

        return transactions;
    }

    async newTransaction(
        transaction: TransactionDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        const userTransactionsInfo =
            await this.AllTransactionsInfoModel.findOne({ userId });
        if (!userTransactionsInfo) {
            throw new UnauthorizedException('Transaction data not found');
        }

        if (
            transaction.transactionType === TransactionType.EXPENSE &&
            transaction.value > userTransactionsInfo.totalAmount
        ) {
            throw new BadRequestException(
                'Not enough money on the main balance',
            );
        }

        const updatedTotals = this.calculationService.calculateAllTotals(
            userTransactionsInfo.totalAmount,
            userTransactionsInfo.totalIncome,
            userTransactionsInfo.totalSpend,
            transaction.value,
            transaction.transactionType,
        );

        if (
            transaction.transactionType === TransactionType.INCOME &&
            transaction.categorie === SAVINGS_CATEGORY
        ) {
            throw new BadRequestException(
                'Create savings withdrawals from the savings page',
            );
        }

        const transactionToSave: TransactionDto = { ...transaction };
        const savingsOperations = (userTransactionsInfo.savingsOperations ||
            []) as SavingsOperationDto[];

        if (
            transaction.transactionType === TransactionType.EXPENSE &&
            transaction.categorie === SAVINGS_CATEGORY
        ) {
            if (!transaction.savingsStorage || !transaction.savingsCurrency) {
                throw new BadRequestException(
                    'Choose where the savings will be stored',
                );
            }

            const savingsOperationId = uuidv4();
            const savingsOperation: SavingsOperationDto = {
                id: savingsOperationId,
                type: SavingsOperationType.DEPOSIT,
                storage: transaction.savingsStorage,
                amount: transaction.value,
                currency: transaction.savingsCurrency,
                date: new Date(transaction.date).toISOString(),
                note: transaction.description || undefined,
                linkedTransactionId: transaction.id,
                balanceAmount: transaction.value,
            };

            transactionToSave.savingsOperationId = savingsOperationId;
            userTransactionsInfo.savingsOperations = [
                savingsOperation,
                ...savingsOperations,
            ];
        }

        userTransactionsInfo.transactions.unshift(transactionToSave);
        Object.assign(userTransactionsInfo, updatedTotals);

        await userTransactionsInfo.save();

        return {
            message: 'Transaction added successfully',
            updatedTotals,
            updatedItems: userTransactionsInfo.transactions,
            updatedSavingsOperations:
                userTransactionsInfo.savingsOperations || [],
        };
    }

    async setTotalAmount(
        { totalAmount }: TotalAmountDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { totalAmount } },
            { upsert: true },
        );

        return {
            message: 'Total amount updated',
            totalAmount,
        };
    }

    async setNextMonthTotalAmount(
        { nextMonthTotalAmount }: NextMonthTotalAmountDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { nextMonthTotalAmount } },
            { upsert: true },
        );

        return {
            message: 'Next month amount updated',
            nextMonthTotalAmount,
        };
    }

    async setEssentalPayments(
        { type, items }: EssentialsArrayDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: items } },
            { upsert: true },
        );

        return {
            message: 'Essentials updated',
            updatedItems: items,
        };
    }

    async setCheckedEssentalPayments(
        { type, item }: EssentialCheckedDto,
        req: AuthenticatedRequest,
    ) {
        if (type === EssentialsType.DEFAULT) {
            throw new BadRequestException(
                'Default essentials cannot be marked as paid',
            );
        }

        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);
        const userData = await this.getUserDataOrThrow(userId);
        const currentItems =
            (userData[updateFieldName] as EssentialItemDto[]) || [];
        const essentialIndex = currentItems.findIndex(
            (essential) => essential.id === item.id,
        );

        if (essentialIndex === -1) {
            throw new BadRequestException('Essential not found');
        }

        const essential = currentItems[essentialIndex];
        const currentTotals = {
            totalAmount: userData.totalAmount,
            totalIncome: userData.totalIncome,
            totalSpend: userData.totalSpend,
        };

        if (essential.checked === item.checked) {
            return {
                message: 'Essential checked state unchanged',
                updatedItems: currentItems,
                updatedTotals: currentTotals,
                updatedTransactions: userData.transactions,
            };
        }

        let updatedEssential: EssentialItemDto;
        let updatedTotals = currentTotals;

        if (item.checked) {
            if (
                item.actualAmount === undefined ||
                !Number.isFinite(item.actualAmount) ||
                item.actualAmount <= 0
            ) {
                throw new BadRequestException(
                    'Actual payment amount must be greater than zero',
                );
            }
            if (item.actualAmount > userData.totalAmount) {
                throw new BadRequestException(
                    'Not enough funds in the main balance',
                );
            }

            const transactionId = uuidv4();
            const paidAt = new Date();
            const transaction: TransactionDto = {
                transactionType: TransactionType.EXPENSE,
                id: transactionId,
                value: item.actualAmount,
                date: paidAt,
                categorie: 'essentials',
                description: essential.title,
            };

            updatedTotals = this.calculationService.calculateAllTotals(
                userData.totalAmount,
                userData.totalIncome,
                userData.totalSpend,
                item.actualAmount,
                TransactionType.EXPENSE,
            );
            userData.transactions.unshift(transaction);
            updatedEssential = {
                ...essential,
                checked: true,
                paidAmount: item.actualAmount,
                paidAt: paidAt.toISOString(),
                paymentTransactionId: transactionId,
            };
        } else {
            const transactionIndex = essential.paymentTransactionId
                ? userData.transactions.findIndex(
                      (transaction) =>
                          transaction.id === essential.paymentTransactionId,
                  )
                : -1;

            if (transactionIndex >= 0) {
                const transaction = userData.transactions[transactionIndex];
                updatedTotals =
                    this.calculationService.calculateTotalsAfterDelete(
                        userData.totalAmount,
                        userData.totalIncome,
                        userData.totalSpend,
                        transaction.value,
                        transaction.transactionType,
                    );
                userData.transactions.splice(transactionIndex, 1);
            } else if (
                essential.paymentTransactionId &&
                essential.paidAmount !== undefined
            ) {
                updatedTotals =
                    this.calculationService.calculateTotalsAfterDelete(
                        userData.totalAmount,
                        userData.totalIncome,
                        userData.totalSpend,
                        essential.paidAmount,
                        TransactionType.EXPENSE,
                    );
            }

            updatedEssential = { ...essential, checked: false };
            delete updatedEssential.paidAmount;
            delete updatedEssential.paidAt;
            delete updatedEssential.paymentTransactionId;
        }

        const updatedItems = [...currentItems];
        updatedItems[essentialIndex] = updatedEssential;
        userData.set(updateFieldName, updatedItems);
        Object.assign(userData, updatedTotals);
        await userData.save();

        return {
            message: 'Essential checked state updated',
            updatedItems,
            updatedTotals,
            updatedTransactions: userData.transactions,
        };
    }

    async removeEssential(
        { type, id }: RemoveEssentialDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);

        const userData = await this.getUserDataOrThrow(userId);
        const currentItems =
            (userData[updateFieldName] as EssentialItemDto[]) || [];
        const essentialToRemove = currentItems.find(
            (essential) => essential.id === id,
        );

        if (essentialToRemove?.checked) {
            throw new BadRequestException(
                'Reverse the essential payment before removing it',
            );
        }

        const updatedItems = currentItems.filter(
            (el: EssentialItemDto) => el.id !== id,
        );

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: updatedItems } },
        );

        return {
            message: 'Essential removed',
            removedId: id,
            updatedItems,
        };
    }

    async addNewEssential(
        { type, item }: NewEssentialDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);

        const userData = await this.getUserDataOrThrow(userId);
        const currentItems =
            (userData[updateFieldName] as EssentialItemDto[]) || [];

        const filteredItems = currentItems.filter(
            (el: EssentialItemDto) => el.id !== item.id,
        );
        const updatedItems = [item, ...filteredItems];

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: updatedItems } },
        );

        return {
            message: 'Essential added',
            addedItem: item,
            updatedItems,
        };
    }

    async updateEssential(
        { type, item }: UpdateEssentialDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);
        const userData = await this.getUserDataOrThrow(userId);
        const currentItems =
            (userData[updateFieldName] as EssentialItemDto[]) || [];
        const currentEssential = currentItems.find(
            (essential) => essential.id === item.id,
        );

        if (!currentEssential) {
            throw new BadRequestException('Essential not found');
        }
        if (currentEssential.checked) {
            throw new BadRequestException(
                'Reverse the essential payment before updating it',
            );
        }

        const updatedItems = currentItems.map((essential) =>
            essential.id === item.id ? item : essential,
        );

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: updatedItems } },
        );

        return {
            message: 'Essential updated',
            updatedItem: item,
            updatedItems,
        };
    }

    private getSavingsStorageBalance(
        operations: SavingsOperationDto[],
        storage: SavingsStorage,
        currency: SavingsCurrency,
    ) {
        return operations
            .filter((operation) => operation.currency === currency)
            .reduce((total, operation) => {
                if (operation.type === SavingsOperationType.DEPOSIT) {
                    return operation.storage === storage
                        ? total + operation.amount
                        : total;
                }

                if (operation.type === SavingsOperationType.WITHDRAWAL) {
                    return operation.storage === storage
                        ? total - operation.amount
                        : total;
                }

                if (operation.storage === storage) {
                    return total - operation.amount;
                }

                if (operation.destinationStorage === storage) {
                    return total + operation.amount;
                }

                return total;
            }, 0);
    }

    async addSavingsGoal(
        { item }: SavingsGoalPayloadDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];

        if (goals.some((goal) => goal.id === item.id)) {
            throw new BadRequestException('Savings goal already exists');
        }

        const updatedGoals = [item, ...goals];
        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { savingsGoals: updatedGoals } },
        );

        return {
            message: 'Savings goal added',
            updatedGoals,
            updatedOperations: userData.savingsOperations || [],
        };
    }

    async updateSavingsGoal(
        { item }: SavingsGoalPayloadDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];
        const currentGoal = goals.find((goal) => goal.id === item.id);

        if (!currentGoal) {
            throw new BadRequestException('Savings goal not found');
        }

        const updatedGoals = goals.map((goal) =>
            goal.id === item.id ? item : goal,
        );

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { savingsGoals: updatedGoals } },
        );

        return {
            message: 'Savings goal updated',
            updatedGoals,
            updatedOperations: userData.savingsOperations || [],
        };
    }

    async deleteSavingsGoal(id: string, req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];
        const operations = (userData.savingsOperations ||
            []) as SavingsOperationDto[];

        if (!goals.some((goal) => goal.id === id)) {
            throw new BadRequestException('Savings goal not found');
        }

        const updatedGoals = goals.filter((goal) => goal.id !== id);
        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { savingsGoals: updatedGoals } },
        );

        return {
            message: 'Savings goal deleted',
            updatedGoals,
            updatedOperations: operations,
        };
    }

    async addSavingsOperation(
        { item, balanceAmount }: SavingsOperationPayloadDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];
        const operations = (userData.savingsOperations ||
            []) as SavingsOperationDto[];
        if (operations.some((operation) => operation.id === item.id)) {
            throw new BadRequestException('Savings operation already exists');
        }

        if (
            item.type === SavingsOperationType.TRANSFER &&
            (!item.destinationStorage ||
                item.destinationStorage === item.storage)
        ) {
            throw new BadRequestException(
                'Choose a different destination for the transfer',
            );
        }

        if (
            item.type !== SavingsOperationType.DEPOSIT &&
            this.getSavingsStorageBalance(
                operations,
                item.storage,
                item.currency,
            ) < item.amount
        ) {
            throw new BadRequestException(
                'Not enough savings in the selected storage',
            );
        }

        let operationToSave = item;
        let updatedTransactions = userData.transactions || [];
        let updatedTotals = {
            totalAmount: userData.totalAmount,
            totalIncome: userData.totalIncome,
            totalSpend: userData.totalSpend,
        };

        if (item.type !== SavingsOperationType.TRANSFER) {
            if (!balanceAmount || balanceAmount <= 0) {
                throw new BadRequestException(
                    'Main balance amount is required for this savings movement',
                );
            }

            const transactionType =
                item.type === SavingsOperationType.DEPOSIT
                    ? TransactionType.EXPENSE
                    : TransactionType.INCOME;
            if (
                transactionType === TransactionType.EXPENSE &&
                balanceAmount > userData.totalAmount
            ) {
                throw new BadRequestException(
                    'Not enough money on the main balance',
                );
            }
            updatedTotals = this.calculationService.calculateAllTotals(
                userData.totalAmount,
                userData.totalIncome,
                userData.totalSpend,
                balanceAmount,
                transactionType,
            );

            const transactionId = uuidv4();
            operationToSave = {
                ...item,
                linkedTransactionId: transactionId,
                balanceAmount,
            };
            const linkedTransaction: TransactionDto = {
                id: transactionId,
                transactionType,
                value: balanceAmount,
                date: new Date(item.date),
                categorie: SAVINGS_CATEGORY,
                description: item.note || '',
                savingsStorage: item.storage,
                savingsCurrency: item.currency,
                savingsOperationId: item.id,
            };
            updatedTransactions = [linkedTransaction, ...updatedTransactions];
        }

        const updatedOperations = [operationToSave, ...operations];
        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            {
                $set: {
                    savingsOperations: updatedOperations,
                    transactions: updatedTransactions,
                    ...updatedTotals,
                },
            },
        );

        return {
            message: 'Savings operation added',
            updatedGoals: goals,
            updatedOperations,
            updatedTransactions,
            updatedTotals,
        };
    }

    async deleteSavingsOperation(id: string, req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];
        const operations = (userData.savingsOperations ||
            []) as SavingsOperationDto[];

        const operationToDelete = operations.find(
            (operation) => operation.id === id,
        );

        if (!operationToDelete) {
            throw new BadRequestException('Savings operation not found');
        }

        const updatedOperations = operations.filter(
            (operation) => operation.id !== id,
        );

        const leavesNegativeBalance = Object.values(SavingsStorage).some(
            (storage) =>
                this.getSavingsStorageBalance(
                    updatedOperations,
                    storage,
                    operationToDelete.currency,
                ) < 0,
        );

        if (leavesNegativeBalance) {
            throw new BadRequestException(
                'This operation cannot be deleted because a later withdrawal depends on it',
            );
        }

        const linkedTransaction = operationToDelete.linkedTransactionId
            ? (userData.transactions || []).find(
                  (transaction) =>
                      transaction.id === operationToDelete.linkedTransactionId,
              )
            : undefined;
        const updatedTransactions = linkedTransaction
            ? (userData.transactions || []).filter(
                  (transaction) => transaction.id !== linkedTransaction.id,
              )
            : userData.transactions || [];

        let updatedTotals = {
            totalAmount: userData.totalAmount,
            totalIncome: userData.totalIncome,
            totalSpend: userData.totalSpend,
        };
        const linkedBalanceAmount =
            linkedTransaction?.value ?? operationToDelete.balanceAmount;

        if (
            linkedBalanceAmount &&
            operationToDelete.type !== SavingsOperationType.TRANSFER
        ) {
            const linkedTransactionType =
                linkedTransaction?.transactionType ??
                (operationToDelete.type === SavingsOperationType.DEPOSIT
                    ? TransactionType.EXPENSE
                    : TransactionType.INCOME);
            if (
                linkedTransactionType === TransactionType.INCOME &&
                linkedBalanceAmount > userData.totalAmount
            ) {
                throw new BadRequestException(
                    'Not enough money on the main balance to reverse this withdrawal',
                );
            }
            updatedTotals = this.calculationService.calculateTotalsAfterDelete(
                userData.totalAmount,
                userData.totalIncome,
                userData.totalSpend,
                linkedBalanceAmount,
                linkedTransactionType,
            );
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            {
                $set: {
                    savingsOperations: updatedOperations,
                    transactions: updatedTransactions,
                    ...updatedTotals,
                },
            },
        );

        return {
            message: 'Savings operation deleted',
            updatedGoals: goals,
            updatedOperations,
            updatedTransactions,
            updatedTotals,
        };
    }

    async clearAllInfo(
        { clearTotals }: ClearAllInfoDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const updatedSavingsOperations = (
            (userData.savingsOperations || []) as SavingsOperationDto[]
        ).map((operation) => {
            const documentOperation = operation as SavingsOperationDto & {
                toObject?: () => SavingsOperationDto;
            };
            const plainOperation = documentOperation.toObject?.() ?? operation;
            const unlinkedOperation = { ...plainOperation };
            delete unlinkedOperation.linkedTransactionId;
            delete unlinkedOperation.balanceAmount;
            return unlinkedOperation;
        });

        const updateData: Partial<AllTransactionsInfo> = {
            transactions: [],
            savingsOperations: updatedSavingsOperations,
        };
        let essentialsArray: EssentialItemDto[] | undefined;
        let nextMonthEssentialsArray: EssentialItemDto[] | undefined;

        if (clearTotals) {
            const resetPayments = (items: EssentialItemDto[] = []) =>
                items.map((item) => ({
                    id: item.id,
                    amount: item.amount,
                    title: item.title,
                    checked: false,
                }));

            updateData.totalAmount = 0;
            updateData.totalIncome = 0;
            updateData.totalSpend = 0;
            updateData.nextMonthTotalAmount = 0;
            essentialsArray = resetPayments(userData.essentialsArray);
            nextMonthEssentialsArray = resetPayments(
                userData.nextMonthEssentialsArray,
            );
            updateData.essentialsArray = essentialsArray;
            updateData.nextMonthEssentialsArray = nextMonthEssentialsArray;
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: updateData },
        );

        return {
            message: 'All info cleared',
            clearedTransactions: true,
            clearedTotals: clearTotals,
            essentialsArray,
            nextMonthEssentialsArray,
            updatedSavingsOperations,
        };
    }

    async setPercent({ percent }: SetPercentDto, req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);

        const updateData: Partial<AllTransactionsInfo> = {
            savePercent: percent,
        };

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: updateData },
        );

        return {
            message: 'Save Percent updated',
            percent,
        };
    }

    async deleteTransaction(
        { transactionId }: DeleteTransaction,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        const userTransactionsInfo =
            await this.AllTransactionsInfoModel.findOne({ userId });
        if (!userTransactionsInfo) {
            throw new UnauthorizedException('Transaction data not found');
        }

        const transactionToDelete = userTransactionsInfo.transactions.find(
            (t) => t.id === transactionId,
        );

        if (!transactionToDelete) {
            throw new BadRequestException('Transaction not found');
        }
        if (
            this.isEssentialPaymentTransaction(
                userTransactionsInfo,
                transactionId,
            )
        ) {
            throw new BadRequestException(
                'Reverse essential payments from the essentials checklist',
            );
        }

        if (transactionToDelete.transactionType === TransactionType.INCOME) {
            const newBalance =
                userTransactionsInfo.totalAmount - transactionToDelete.value;

            if (newBalance < 0) {
                throw new BadRequestException(
                    'You cannot delete this income transaction because it would make your balance negative',
                );
            }
        }

        const savingsOperations = (userTransactionsInfo.savingsOperations ||
            []) as SavingsOperationDto[];
        const linkedSavingsOperation = savingsOperations.find(
            (operation) =>
                operation.id === transactionToDelete.savingsOperationId ||
                operation.linkedTransactionId === transactionId,
        );

        let updatedSavingsOperations = savingsOperations;
        if (linkedSavingsOperation) {
            updatedSavingsOperations = savingsOperations.filter(
                (operation) => operation.id !== linkedSavingsOperation.id,
            );

            const leavesNegativeBalance = Object.values(SavingsStorage).some(
                (storage) =>
                    this.getSavingsStorageBalance(
                        updatedSavingsOperations,
                        storage,
                        linkedSavingsOperation.currency,
                    ) < 0,
            );

            if (leavesNegativeBalance) {
                throw new BadRequestException(
                    'This savings transaction cannot be deleted because a later movement depends on it',
                );
            }
        }

        userTransactionsInfo.transactions =
            userTransactionsInfo.transactions.filter(
                (t) => t.id !== transactionId,
            );

        const updatedTotals =
            this.calculationService.calculateTotalsAfterDelete(
                userTransactionsInfo.totalAmount,
                userTransactionsInfo.totalIncome,
                userTransactionsInfo.totalSpend,
                transactionToDelete.value,
                transactionToDelete.transactionType,
            );

        Object.assign(userTransactionsInfo, updatedTotals);
        userTransactionsInfo.savingsOperations = updatedSavingsOperations;

        await userTransactionsInfo.save();

        return {
            message: 'Transaction deleted successfully',
            deletedTransactionId: transactionId,
            updatedTotals,
            updatedItems: userTransactionsInfo.transactions,
            updatedSavingsOperations,
        };
    }

    async updateTransaction(
        {
            transactionId,
            value,
            transactionType,
            description,
            date,
            categorie,
            savingsStorage,
            savingsCurrency,
        }: UpdateTransactionDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        const userTransactionsInfo =
            await this.AllTransactionsInfoModel.findOne({ userId });
        if (!userTransactionsInfo) {
            throw new UnauthorizedException('Transaction data not found');
        }

        const transactionIndex = userTransactionsInfo.transactions.findIndex(
            (t) => t.id === transactionId,
        );

        if (transactionIndex === -1) {
            throw new BadRequestException('Transaction not found');
        }
        if (
            this.isEssentialPaymentTransaction(
                userTransactionsInfo,
                transactionId,
            )
        ) {
            throw new BadRequestException(
                'Reverse essential payments from the essentials checklist',
            );
        }

        const oldTransaction =
            userTransactionsInfo.transactions[transactionIndex];

        if (oldTransaction.savingsOperationId) {
            throw new BadRequestException(
                'Edit linked savings movements from the savings page',
            );
        }

        if (
            transactionType === TransactionType.INCOME &&
            categorie === SAVINGS_CATEGORY
        ) {
            throw new BadRequestException(
                'Create savings withdrawals from the savings page',
            );
        }

        const revertedTotals =
            this.calculationService.calculateTotalsAfterDelete(
                userTransactionsInfo.totalAmount,
                userTransactionsInfo.totalIncome,
                userTransactionsInfo.totalSpend,
                oldTransaction.value,
                oldTransaction.transactionType,
            );

        if (
            transactionType === TransactionType.EXPENSE &&
            value > revertedTotals.totalAmount
        ) {
            throw new BadRequestException(
                'Transaction cannot be updated because the main balance would be negative',
            );
        }

        Object.assign(userTransactionsInfo, revertedTotals);

        const updatedTransaction: TransactionDto = {
            ...oldTransaction,
            value,
            transactionType,
            categorie: categorie ?? oldTransaction.categorie,
            description: description ?? oldTransaction.description,
            date: date ?? oldTransaction.date,
            savingsStorage:
                categorie === SAVINGS_CATEGORY ? savingsStorage : undefined,
            savingsCurrency:
                categorie === SAVINGS_CATEGORY ? savingsCurrency : undefined,
        };
        const savingsOperations = (userTransactionsInfo.savingsOperations ||
            []) as SavingsOperationDto[];

        if (
            transactionType === TransactionType.EXPENSE &&
            categorie === SAVINGS_CATEGORY
        ) {
            if (!savingsStorage || !savingsCurrency) {
                throw new BadRequestException(
                    'Choose where the savings will be stored',
                );
            }

            const savingsOperationId = uuidv4();
            updatedTransaction.savingsOperationId = savingsOperationId;
            userTransactionsInfo.savingsOperations = [
                {
                    id: savingsOperationId,
                    type: SavingsOperationType.DEPOSIT,
                    storage: savingsStorage,
                    amount: value,
                    currency: savingsCurrency,
                    date: new Date(date).toISOString(),
                    note: description || undefined,
                    linkedTransactionId: oldTransaction.id,
                    balanceAmount: value,
                },
                ...savingsOperations,
            ];
        }

        userTransactionsInfo.transactions[transactionIndex] =
            updatedTransaction;

        const updatedTotals = this.calculationService.calculateAllTotals(
            userTransactionsInfo.totalAmount,
            userTransactionsInfo.totalIncome,
            userTransactionsInfo.totalSpend,
            value,
            transactionType,
        );

        Object.assign(userTransactionsInfo, updatedTotals);

        await userTransactionsInfo.save();

        return {
            message: 'Transaction updated successfully',
            updatedTransaction:
                userTransactionsInfo.transactions[transactionIndex],
            updatedTotals,
            updatedItems: userTransactionsInfo.transactions,
            updatedSavingsOperations:
                userTransactionsInfo.savingsOperations || [],
        };
    }
}
