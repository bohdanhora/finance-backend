import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema()
export class User {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true, unique: true })
    email: string;

    @Prop()
    password?: string;

    @Prop({ default: 'local' })
    registeredVia: 'local' | 'google';

    @Prop()
    avatar?: string;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.set('toJSON', { versionKey: false });
UserSchema.set('toObject', { versionKey: false });
