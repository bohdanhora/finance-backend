import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ versionKey: false })
export class EmailCode {
    @Prop({ required: true, unique: true })
    email: string;

    @Prop({ required: true })
    code: string;

    @Prop({ required: true })
    sentAt: Date;

    @Prop({ required: true, expires: 0 })
    expiresAt: Date;

    @Prop({ required: true, default: 0 })
    attempts: number;
}

export const EmailCodeSchema = SchemaFactory.createForClass(EmailCode);
