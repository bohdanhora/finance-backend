import {
    IsBoolean,
    IsEnum,
    IsNumber,
    IsString,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { EssentialsType } from './essential-payments.dto';
import { Type } from 'class-transformer';

export class EssentialCheckedItemDto {
    @IsString()
    id: string;

    @IsBoolean()
    checked: boolean;

    @ValidateIf((item: EssentialCheckedItemDto) => item.checked)
    @IsNumber()
    @Min(0.01)
    actualAmount?: number;
}

export class EssentialCheckedDto {
    @IsEnum(EssentialsType)
    type: EssentialsType;

    @ValidateNested()
    @Type(() => EssentialCheckedItemDto)
    item: EssentialCheckedItemDto;
}
