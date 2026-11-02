import {
    IsBoolean,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { EssentialsType } from './essential-payments.dto';
import { Type } from 'class-transformer';

export class NewEssentialItemDto {
    @IsString()
    id: string;

    @IsString()
    title: string;

    @IsNumber()
    amount: number;

    @IsBoolean()
    checked: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    category?: string;
}

export class NewEssentialDto {
    @IsEnum(EssentialsType)
    type: EssentialsType;

    @ValidateNested()
    @Type(() => NewEssentialItemDto)
    item: NewEssentialItemDto;
}
