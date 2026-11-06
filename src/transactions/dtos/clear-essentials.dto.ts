import { IsEnum } from 'class-validator';
import { EssentialsType } from './essential-payments.dto';

export class ClearEssentialsDto {
    @IsEnum(EssentialsType)
    type: EssentialsType;
}
