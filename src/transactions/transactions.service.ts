import {
    BadRequestException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedRequest } from 'src/app.controller';
import { User } from 'src/auth/schemas/user.schema';
import { AllTransactionsInfo } from './schemas/all-info.schema';
import {
    EssentialItemDto,
    EssentialsArrayDto,
    EssentialsType,
} from './dtos/essential-payments.dto';
import { TransactionDto } from './dtos/transaction.dto';
import { TotalAmountDto } from './dtos/total-amount.dto';
import { NextMonthTotalAmountDto } from './dtos/next-month-total-amount.dto';
import { CalculationService } from './helpers/calculation.service';
import { EssentialCheckedDto } from './dtos/essential-checked.dto';
import { RemoveEssentialDto } from './dtos/remove-essential.dto';
import { NewEssentialDto } from './dtos/add-new-essential.dto';

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
}
