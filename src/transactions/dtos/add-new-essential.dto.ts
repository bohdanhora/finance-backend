import {
    IsBoolean,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { EssentialsType } from './essential-payments.dto';
import { SavingsCurrency } from './savings.dto';
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

    @IsOptional()
    @IsEnum(SavingsCurrency)
    currency?: SavingsCurrency;

    @ValidateIf((dto: NewEssentialItemDto) => dto.currency !== undefined)
    @IsNumber()
    @Min(0.01)
    currencyAmount?: number;
}

export class NewEssentialDto {
    @IsEnum(EssentialsType)
    type: EssentialsType;

    @ValidateNested()
    @Type(() => NewEssentialItemDto)
    item: NewEssentialItemDto;
}
