import { Type } from 'class-transformer';
import {
    IsString,
    IsNumber,
    IsBoolean,
    IsArray,
    ValidateNested,
    IsEnum,
    IsOptional,
    IsDateString,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator';
import { SavingsCurrency } from './savings.dto';

export class EssentialItemDto {
    @IsString()
    id: string;

    @IsNumber()
    amount: number;

    @IsString()
    title: string;

    @IsBoolean()
    checked: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    category?: string;

    @IsOptional()
    @IsEnum(SavingsCurrency)
    currency?: SavingsCurrency;

    @ValidateIf((dto: EssentialItemDto) => dto.currency != null)
    @IsNumber()
    @Min(0.01)
    currencyAmount?: number;

    @IsOptional()
    @IsNumber()
    paidAmount?: number;

    @IsOptional()
    @IsDateString()
    paidAt?: string;

    @IsOptional()
    @IsString()
    paymentTransactionId?: string;

    /** Month key the bill was left unpaid in before it moved to this month. */
    @IsOptional()
    @IsString()
    carriedFrom?: string;
}

export enum EssentialsType {
    DEFAULT = 'default',
    THIS_MONTH = 'this-month',
    NEXT_MONTH = 'next-month',
}

export class EssentialsArrayDto {
    @IsEnum(EssentialsType)
    type: EssentialsType;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EssentialItemDto)
    items: EssentialItemDto[] | [];
}
