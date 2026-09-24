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
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

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
    controllers: [
        ConnectionsController,
        CardsController,
        TransactionsController,
    ],
    providers: [
        TransactionsService,
        ConnectionsService,
        CardsService,
        CalculationService,
        ProductPriceService,
    ],
})
export class TransactionsModule {}
