import {
    Injectable,
    InternalServerErrorException,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { AllTransactionsInfo } from 'src/transactions/schemas/all-info.schema';
import { toMonthKey } from 'src/transactions/helpers/month-rollover';

@Injectable()
export class TestAccountSeedService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TestAccountSeedService.name);

    constructor(
        @InjectModel(User.name) private readonly UserModel: Model<User>,
        @InjectModel(AllTransactionsInfo.name)
        private readonly AllTransactionsInfoModel: Model<AllTransactionsInfo>,
        private readonly configService: ConfigService,
    ) {}

    async onApplicationBootstrap() {
        if (!this.configService.get<boolean>('testAccount.enabled')) {
            return;
        }

        const email =
            this.configService.getOrThrow<string>('testAccount.email');
        const password = this.configService.getOrThrow<string>(
            'testAccount.password',
        );
        const name = this.configService.getOrThrow<string>('testAccount.name');

        const existingUser = await this.UserModel.findOne({ email });
        const passwordMatches =
            Boolean(existingUser?.password) &&
            (await bcrypt.compare(password, existingUser!.password!));
        const passwordHash = passwordMatches
            ? existingUser!.password!
            : await bcrypt.hash(password, 10);

        const user = await this.UserModel.findOneAndUpdate(
            { email },
            {
                $set: {
                    name,
                    email,
                    password: passwordHash,
                    registeredVia: 'local',
                },
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            },
        );

        if (!user) {
            throw new InternalServerErrorException(
                'Failed to seed the test account',
            );
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId: user._id.toString() },
            {
                $setOnInsert: {
                    userId: user._id.toString(),
                    totalAmount: 0,
                    totalIncome: 0,
                    totalSpend: 0,
                    nextMonthTotalAmount: 0,
                    savePercent: 0,
                    lastProcessedMonth: toMonthKey(),
                    defaultEssentialsArray: [],
                    essentialsArray: [],
                    nextMonthEssentialsArray: [],
                    transactions: [],
                    savingsGoals: [],
                    savingsOperations: [],
                },
            },
            { upsert: true },
        );

        this.logger.log(`Test account is ready: ${email}`);
    }
}
