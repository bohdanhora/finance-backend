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

@Injectable()
export class TransactionsService {
    constructor(
        @InjectModel(User.name) private UserModel: Model<User>,
        @InjectModel(AllTransactionsInfo.name)
        private AllTransactionsInfoModel: Model<AllTransactionsInfo>,
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
