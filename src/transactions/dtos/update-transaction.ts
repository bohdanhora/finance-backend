import { IsDateString, IsEnum, IsNumber, IsString } from 'class-validator';
import { TransactionType } from './transaction.dto';

export class UpdateTransactionDto {
    @IsString()
    transactionId: string;
    @IsNumber()
    value: number;
    @IsEnum(TransactionType)
    transactionType: TransactionType;
    @IsString()
    description: string;
    @IsDateString()
    date: Date;
    @IsString()
    categorie: string;
}
