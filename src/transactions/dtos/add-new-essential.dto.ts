import {
    IsBoolean,
    IsEnum,
    IsNumber,
    IsString,
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
}

export class NewEssentialDto {
    @IsEnum(EssentialsType)
    type: EssentialsType;

    @ValidateNested()
    @Type(() => NewEssentialItemDto)
    item: NewEssentialItemDto;
}
