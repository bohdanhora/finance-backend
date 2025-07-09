import { IsBoolean, IsEnum, IsString, ValidateNested } from 'class-validator';
import { EssentialsType } from './essential-payments.dto';
import { Type } from 'class-transformer';

export class EssentialCheckedItemDto {
    @IsString()
    id: string;

    @IsBoolean()
    checked: boolean;
}

export class EssentialCheckedDto {
    @IsEnum(EssentialsType)
    type: EssentialsType;

    @ValidateNested()
    @Type(() => EssentialCheckedItemDto)
    item: EssentialCheckedItemDto;
}
