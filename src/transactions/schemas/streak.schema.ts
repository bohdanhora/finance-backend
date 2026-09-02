import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** How many days in a row the user has opened the app. */
@Schema({ _id: false })
export class Streak {
    @Prop({ required: true })
    lastVisit: string;

    @Prop({ required: true, min: 1 })
    current: number;

    @Prop({ required: true, min: 1 })
    best: number;

    @Prop({ type: [String], required: true, default: [] })
    history: string[];

    @Prop({ type: [Number], required: true, default: [] })
    celebrated: number[];
}

export const StreakSchema = SchemaFactory.createForClass(Streak);
