import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema()
export class AllTransactionsInfo {
    @Prop({ required: true, unique: true })
    userId: string;
    @Prop({ required: true })
    totalAmount: number;
    @Prop({ required: true })
    nextMonthTotalAmount: number;
    @Prop({ required: true })
    defaultEssentialsArray: string[] | [];
    @Prop({ required: true })
    essentialsArray: string[] | [];
    @Prop({ required: true })
    nextMonthEssentialsArray: string[] | [];
    @Prop({ required: true })
    transactions: string[] | [];
}

export type AllTransactionsInfoDocument = HydratedDocument<AllTransactionsInfo>;

export const AllTransactionsInfoSchema =
    SchemaFactory.createForClass(AllTransactionsInfo);
