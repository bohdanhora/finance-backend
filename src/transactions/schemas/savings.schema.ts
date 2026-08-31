import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
    SavingsCurrency,
    SavingsOperationType,
    SavingsStorage,
} from '../dtos/savings.dto';

@Schema({ _id: false })
export class SavingsGoal {
    @Prop({ required: true })
    id: string;

    @Prop({ required: true, trim: true })
    name: string;

    @Prop({ required: true, min: 0.01 })
    targetAmount: number;

    @Prop({ required: true, enum: SavingsCurrency })
    currency: SavingsCurrency;

    @Prop({ required: true, min: 0, default: 0 })
    monthlyContribution: number;

    @Prop()
    targetDate?: string;

    @Prop({ required: true })
    createdAt: string;
}

export const SavingsGoalSchema = SchemaFactory.createForClass(SavingsGoal);

@Schema({ _id: false })
export class SavingsOperation {
    @Prop({ required: true })
    id: string;

    @Prop({ required: true })
    goalId: string;

    @Prop({ required: true, enum: SavingsOperationType })
    type: SavingsOperationType;

    @Prop({ required: true, enum: SavingsStorage })
    storage: SavingsStorage;

    @Prop({ enum: SavingsStorage })
    destinationStorage?: SavingsStorage;

    @Prop({ required: true, min: 0.01 })
    amount: number;

    @Prop({ required: true, enum: SavingsCurrency })
    currency: SavingsCurrency;

    @Prop({ required: true })
    date: string;

    @Prop({ trim: true, default: '' })
    note?: string;
}

export const SavingsOperationSchema =
    SchemaFactory.createForClass(SavingsOperation);
