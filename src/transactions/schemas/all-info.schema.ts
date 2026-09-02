import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EssentialItemDto } from '../dtos/essential-payments.dto';
import { TransactionDto } from '../dtos/transaction.dto';
import { SavingsCurrency } from '../dtos/savings.dto';
import {
    SavingsGoal,
    SavingsGoalSchema,
    SavingsOperation,
    SavingsOperationSchema,
} from './savings.schema';

@Schema()
export class AllTransactionsInfo {
    @Prop({ required: true, unique: true })
    userId: string;
    @Prop({ enum: SavingsCurrency })
    currency?: SavingsCurrency;
    @Prop({ required: true })
    totalAmount: number;
    @Prop({ required: true })
    totalIncome: number;
    @Prop({ required: true })
    totalSpend: number;
    @Prop({ required: true })
    nextMonthTotalAmount: number;
    @Prop({ required: true })
    savePercent: number;
    @Prop({ required: true })
    lastProcessedMonth: string;
    @Prop({ required: true, default: [] })
    defaultEssentialsArray: EssentialItemDto[];
    @Prop({ required: true, default: [] })
    essentialsArray: EssentialItemDto[];
    @Prop({ required: true, default: [] })
    nextMonthEssentialsArray: EssentialItemDto[];
    @Prop({ required: true, default: [] })
    transactions: TransactionDto[];
    @Prop({ type: [SavingsGoalSchema], required: true, default: [] })
    savingsGoals: SavingsGoal[];
    @Prop({ type: [SavingsOperationSchema], required: true, default: [] })
    savingsOperations: SavingsOperation[];
}

export type AllTransactionsInfoDocument = HydratedDocument<AllTransactionsInfo>;

export const AllTransactionsInfoSchema =
    SchemaFactory.createForClass(AllTransactionsInfo);

AllTransactionsInfoSchema.set('toJSON', { versionKey: false });
AllTransactionsInfoSchema.set('toObject', { versionKey: false });
