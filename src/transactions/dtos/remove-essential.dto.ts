import { IsEnum, IsString } from 'class-validator';
import { EssentialsType } from './essential-payments.dto';

export class RemoveEssentialDto {
    @IsEnum(EssentialsType)
    type: EssentialsType;

    @IsString()
    id: string;
}
