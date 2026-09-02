import {
    IsDateString,
    IsEnum,
    IsNumber,
    IsString,
    Min,
    ValidateIf,
} from 'class-validator';
import { TransactionType } from './transaction.dto';
import { SavingsCurrency, SavingsStorage } from './savings.dto';

export class UpdateTransactionDto {
    @IsString()
    transactionId: string;
    @IsNumber()
    @Min(0.01)
    value: number;
    @IsEnum(TransactionType)
    transactionType: TransactionType;
    @IsString()
    description: string;
    @IsDateString()
    date: Date;
    @IsString()
    categorie: string;

    @ValidateIf(
        (transaction: UpdateTransactionDto) =>
            transaction.transactionType === TransactionType.EXPENSE &&
            transaction.categorie === 'savings',
    )
    @IsEnum(SavingsStorage)
    savingsStorage?: SavingsStorage;

    @ValidateIf(
        (transaction: UpdateTransactionDto) =>
            transaction.transactionType === TransactionType.EXPENSE &&
            transaction.categorie === 'savings',
    )
    @IsEnum(SavingsCurrency)
    savingsCurrency?: SavingsCurrency;
}
