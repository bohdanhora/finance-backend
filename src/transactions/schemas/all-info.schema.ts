import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EssentialItemDto } from '../dtos/essential-payments.dto';
import { TransactionDto } from '../dtos/transaction.dto';

@Schema()
export class AllTransactionsInfo {
    @Prop({ required: true, unique: true })
    userId: string;
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
    @Prop({ required: true, default: [] })
    defaultEssentialsArray: EssentialItemDto[];
    @Prop({ required: true, default: [] })
    essentialsArray: EssentialItemDto[];
    @Prop({ required: true, default: [] })
    nextMonthEssentialsArray: EssentialItemDto[];
    @Prop({ required: true, default: [] })
    transactions: TransactionDto[];
}

export type AllTransactionsInfoDocument = HydratedDocument<AllTransactionsInfo>;

export const AllTransactionsInfoSchema =
    SchemaFactory.createForClass(AllTransactionsInfo);

AllTransactionsInfoSchema.set('toJSON', { versionKey: false });
AllTransactionsInfoSchema.set('toObject', { versionKey: false });
