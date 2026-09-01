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
