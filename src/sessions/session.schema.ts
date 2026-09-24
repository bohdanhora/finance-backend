import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export enum SessionMethod {
    PASSWORD = 'password',
    GOOGLE = 'google',
    LEGACY = 'legacy',
}

export enum SessionEndReason {
    LOGOUT = 'logout',
    REVOKED = 'revoked',
    PASSWORD_CHANGED = 'password-changed',
    PASSWORD_RESET = 'password-reset',
}

@Schema({ versionKey: false })
export class Session {
    @Prop({
        required: true,
        type: mongoose.Schema.Types.ObjectId,
        index: true,
    })
    userId: mongoose.Types.ObjectId;

    @Prop({ required: true, unique: true })
    tokenHash: string;

    @Prop({ index: true, sparse: true })
    previousTokenHash?: string;

    @Prop()
    rotatedAt?: Date;

    @Prop({ required: true, enum: SessionMethod })
    method: SessionMethod;

    @Prop({ default: '' })
    userAgent: string;

    @Prop({ default: '' })
    ip: string;

    @Prop({ required: true })
    createdAt: Date;

    @Prop({ required: true })
    lastActiveAt: Date;

    @Prop({ required: true })
    expiresAt: Date;

    @Prop()
    endedAt?: Date;

    @Prop({ enum: SessionEndReason })
    endReason?: SessionEndReason;

    @Prop({ required: true, expires: 0 })
    purgeAt: Date;
}

export type SessionDocument = HydratedDocument<Session>;

export const SessionSchema = SchemaFactory.createForClass(Session);
