import {
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator';
import { PET_SLOTS, PET_SPECIES } from '../helpers/pet';
import type { PetSlot, PetSpecies } from '../helpers/pet';

export class PetSyncDto {
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'day must be a YYYY-MM-DD calendar day',
    })
    day: string;

    @IsOptional()
    @IsInt()
    @Min(-14 * 60)
    @Max(14 * 60)
    offset?: number;
}

export class PetBuyDto {
    @IsString()
    @MaxLength(40)
    itemId: string;
}

export class PetEquipDto {
    @IsIn(PET_SLOTS)
    slot: PetSlot;

    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(40)
    itemId: string | null;
}

export class PetProfileDto {
    @IsOptional()
    @IsIn(PET_SPECIES)
    species?: PetSpecies;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    name?: string;
}
