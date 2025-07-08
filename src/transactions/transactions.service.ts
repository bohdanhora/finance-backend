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
import { TotalAmountDto } from './dtos/total-amount.dto';
import { NextMonthTotalAmountDto } from './dtos/next-month-total-amount.dto';
import {
    EssentialsArrayDto,
    EssentialsType,
} from './dtos/essential-payments.dto';
import { TransactionDto } from './dtos/transaction.dto';
import { CalculationService } from './helpers/calculation.service';

@Injectable()
export class TransactionsService {
    constructor(
        @InjectModel(User.name) private UserModel: Model<User>,
        @InjectModel(AllTransactionsInfo.name)
        private AllTransactionsInfoModel: Model<AllTransactionsInfo>,
        private readonly calculationService: CalculationService,
    ) {}

    async getAllInfo(req: AuthenticatedRequest) {
        const userId = req.userId;
        const user = await this.UserModel.findById(userId);

        if (!user) {
            throw new UnauthorizedException('User dont found');
        }

        const transactions = await this.AllTransactionsInfoModel.findOne({
            userId,
        });

        if (!transactions) {
            throw new BadRequestException('No transactions...');
        }

        return transactions;
    }

    async newTransaction(
        transaction: TransactionDto,
        req: AuthenticatedRequest,
    ) {
        const userId = req.userId;

        if (!userId) {
            throw new UnauthorizedException('User id dont found');
        }

        const userTransactionsInfo =
            await this.AllTransactionsInfoModel.findOne({ userId });

        if (!userTransactionsInfo) {
            throw new UnauthorizedException('User transactions info not found');
        }

        const updatedTotals = this.calculationService.calculateAllTotals(
            userTransactionsInfo.totalAmount,
            userTransactionsInfo.totalIncome,
            userTransactionsInfo.totalSpend,
            transaction.value,
            transaction.transactionType,
        );

        userTransactionsInfo.transactions.unshift(transaction);
        userTransactionsInfo.totalAmount = updatedTotals.totalAmount;
        userTransactionsInfo.totalIncome = updatedTotals.totalIncome;
        userTransactionsInfo.totalSpend = updatedTotals.totalSpend;

        await userTransactionsInfo.save();

        return {
            message: 'Transaction added successfully',
            updatedTotals,
        };
    }

    async setTotalAmount(
        { totalAmount }: TotalAmountDto,
        req: AuthenticatedRequest,
    ) {
        const userId = req.userId;

        if (!userId) {
            throw new UnauthorizedException('User id dont found');
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { totalAmount } },
            { upsert: true, new: true },
        );

        return {
            message: 'Amount updated',
            totalAmount: totalAmount,
        };
    }

    async setNextMonthTotalAmount(
        { nextMonthTotalAmount }: NextMonthTotalAmountDto,
        req: AuthenticatedRequest,
    ) {
        const userId = req.userId;

        if (!userId) {
            throw new UnauthorizedException('User id dont found');
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { nextMonthTotalAmount } },
            { upsert: true, new: true },
        );

        return {
            message: 'Amount updated',
            nextMonthTotalAmount: nextMonthTotalAmount,
        };
    }
    async setEssentalPayments(
        { type, items }: EssentialsArrayDto,
        req: AuthenticatedRequest,
    ) {
        const userId = req.userId;

        if (!userId) {
            throw new UnauthorizedException('User id not found');
        }

        let updateFieldName: string;

        switch (type) {
            case EssentialsType.DEFAULT:
                updateFieldName = 'defaultEssentialsArray';
                break;
            case EssentialsType.THIS_MONTH:
                updateFieldName = 'essentialsArray';
                break;
            case EssentialsType.NEXT_MONTH:
                updateFieldName = 'nextMonthEssentialsArray';
                break;
            default:
                throw new BadRequestException('Invalid type');
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: items } },
            { upsert: true, new: true },
        );

        return {
            message: 'Essentials updated',
            [updateFieldName]: items,
        };
    }
}
