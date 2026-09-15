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
import { ProductPriceService } from './helpers/product-price.service';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

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
    controllers: [ConnectionsController, TransactionsController],
    providers: [
        TransactionsService,
        ConnectionsService,
        CalculationService,
        ProductPriceService,
    ],
})
export class TransactionsModule {}
