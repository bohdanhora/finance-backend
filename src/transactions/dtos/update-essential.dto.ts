import { Type } from 'class-transformer';
import { IsEnum, ValidateNested } from 'class-validator';
import {
    EssentialItemDto,
    EssentialsType,
} from './essential-payments.dto';

export class UpdateEssentialDto {
    @IsEnum(EssentialsType)
    type: EssentialsType;

    @ValidateNested()
    @Type(() => EssentialItemDto)
    item: EssentialItemDto;
}
