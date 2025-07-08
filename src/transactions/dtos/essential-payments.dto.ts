import { Type } from 'class-transformer';
import {
    IsString,
    IsNumber,
    IsBoolean,
    IsArray,
    ValidateNested,
    IsEnum,
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
