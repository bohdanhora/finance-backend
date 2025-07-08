import { IsDateString, IsEnum, IsNumber, IsString } from 'class-validator';

export enum TransactionType {
    EXPENCE = 'expence',
    INCOME = 'income',
}

export class TransactionDto {
    @IsEnum(TransactionType)
    transactionType: TransactionType;
    @IsString()
    id: string;
    @IsNumber()
    value: number;
    @IsDateString()
    date: Date;
    @IsString()
    categorie: string;
    @IsString()
    description: string;
}
