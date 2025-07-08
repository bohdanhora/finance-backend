import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/auth/schemas/user.schema';
import {
    AllTransactionsInfo,
    AllTransactionsInfoSchema,
} from './schemas/all-info.schema';
import { CalculationService } from './helpers/calculation.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            {
                name: User.name,
                schema: UserSchema,
            },
            {
                name: AllTransactionsInfo.name,
                schema: AllTransactionsInfoSchema,
            },
        ]),
    ],
    controllers: [TransactionsController],
    providers: [TransactionsService, CalculationService],
})
export class TransactionsModule {}
