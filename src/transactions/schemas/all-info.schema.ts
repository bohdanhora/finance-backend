import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EssentialItemDto } from '../dtos/essential-payments.dto';

@Schema()
export class AllTransactionsInfo {
    @Prop({ required: true, unique: true })
    userId: string;
    @Prop({ required: true })
    totalAmount: number;
    @Prop({ required: true })
    nextMonthTotalAmount: number;
    @Prop({ required: true })
    defaultEssentialsArray: EssentialItemDto[] | [];
    @Prop({ required: true })
    essentialsArray: EssentialItemDto[] | [];
    @Prop({ required: true })
    nextMonthEssentialsArray: EssentialItemDto[] | [];
    @Prop({ required: true })
    transactions: string[] | [];
}

export type AllTransactionsInfoDocument = HydratedDocument<AllTransactionsInfo>;

export const AllTransactionsInfoSchema =
    SchemaFactory.createForClass(AllTransactionsInfo);

AllTransactionsInfoSchema.set('toJSON', { versionKey: false });
AllTransactionsInfoSchema.set('toObject', { versionKey: false });
