import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';

export class ExpectedIncomeItemDto {
    @IsString()
    @IsNotEmpty()
    id: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(80)
    title: string;

    @IsNumber()
    @Min(0.01)
    amount: number;

    /** Day of the month the money usually arrives. */
    @IsInt()
    @Min(1)
    @Max(31)
    day: number;

    /** Recurring incomes come back every month, one-offs are dropped. */
    @IsBoolean()
    recurring: boolean;
}

/** The stored plan plus whether, and how much, actually arrived. */
export type ExpectedIncomeRecord = ExpectedIncomeItemDto & {
    received: boolean;
    receivedAmount?: number;
    receivedAt?: string;
    transactionId?: string;
};

export class ExpectedIncomePayloadDto {
    @ValidateNested()
    @Type(() => ExpectedIncomeItemDto)
    item: ExpectedIncomeItemDto;
}

export class ExpectedIncomeReceivedDto {
    @IsString()
    id: string;

    @IsBoolean()
    received: boolean;

    @ValidateIf((dto: ExpectedIncomeReceivedDto) => dto.received)
    @IsNumber()
    @Min(0.01)
    actualAmount?: number;

    /** False when the income was already recorded as a transaction by hand. */
    @IsOptional()
    @IsBoolean()
    addToBalance?: boolean;

    @IsOptional()
    @IsString()
    cardId?: string;
}
