import {
    BadRequestException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

    async getAllInfo(req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);

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

        const updatedTotals = this.calculationService.calculateAllTotals(
            userTransactionsInfo.totalAmount,
            userTransactionsInfo.totalIncome,
            userTransactionsInfo.totalSpend,
            transaction.value,
            transaction.transactionType,
        );

        userTransactionsInfo.transactions.unshift(transaction);
        Object.assign(userTransactionsInfo, updatedTotals);

        await userTransactionsInfo.save();

        return {
            message: 'Transaction added successfully',
            updatedTotals,
            updatedItems: userTransactionsInfo.transactions,
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
        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);
        const userData = await this.getUserDataOrThrow(userId);

        const currentItems =
            (userData[updateFieldName] as EssentialItemDto[]) || [];

        const updatedItems = currentItems.map((el: EssentialItemDto) =>
            el.id === item.id ? { ...el, checked: item.checked } : el,
        );

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: updatedItems } },
        );

        return {
            message: 'Essential checked state updated',
            updatedItems,
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

    async clearAllInfo(
        { clearTotals }: ClearAllInfoDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        const updateData: Partial<AllTransactionsInfo> = {
            transactions: [],
        };

        if (clearTotals) {
            updateData.totalAmount = 0;
            updateData.totalIncome = 0;
            updateData.totalSpend = 0;
            updateData.nextMonthTotalAmount = 0;
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: updateData },
        );

        return {
            message: 'All info cleared',
            clearedTransactions: true,
            clearedTotals: clearTotals,
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

        if (transactionToDelete.transactionType === TransactionType.INCOME) {
            const newBalance =
                userTransactionsInfo.totalAmount - transactionToDelete.value;

            if (newBalance <= 0) {
                throw new BadRequestException(
                    'You cannot delete this income transaction because it would make your balance zero or negative',
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

        await userTransactionsInfo.save();

        return {
            message: 'Transaction deleted successfully',
            deletedTransactionId: transactionId,
            updatedTotals,
            updatedItems: userTransactionsInfo.transactions,
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

        const oldTransaction =
            userTransactionsInfo.transactions[transactionIndex];

        let revertedTotals = this.calculationService.calculateTotalsAfterDelete(
            userTransactionsInfo.totalAmount,
            userTransactionsInfo.totalIncome,
            userTransactionsInfo.totalSpend,
            oldTransaction.value,
            oldTransaction.transactionType,
        );

        Object.assign(userTransactionsInfo, revertedTotals);

        userTransactionsInfo.transactions[transactionIndex] = {
            ...oldTransaction,
            value,
            transactionType,
            categorie: categorie ?? oldTransaction.description,
            description: description ?? oldTransaction.description,
            date: date ?? oldTransaction.date,
        };

        const updatedTotals = this.calculationService.calculateAllTotals(
            userTransactionsInfo.totalAmount,
            userTransactionsInfo.totalIncome,
            userTransactionsInfo.totalSpend,
            value,
            transactionType,
        );

        if (updatedTotals.totalAmount <= 0) {
            throw new BadRequestException(
                'Transaction cannot be updated because total would be zero or negative',
            );
        }

        Object.assign(userTransactionsInfo, updatedTotals);

        await userTransactionsInfo.save();

        return {
            message: 'Transaction updated successfully',
            updatedTransaction:
                userTransactionsInfo.transactions[transactionIndex],
            updatedTotals,
            updatedItems: userTransactionsInfo.transactions,
        };
    }
}
