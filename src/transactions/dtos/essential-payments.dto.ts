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
} from 'class-validator';

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
