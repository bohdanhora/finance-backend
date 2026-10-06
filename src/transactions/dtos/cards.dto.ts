import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator';

export const CARD_COVER_MAX_LENGTH = 400_000;
export const CARD_COVER_PATTERN =
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export enum CardSkin {
    DEFAULT = 'default',
    MONOBANK = 'monobank',
    PUMB = 'pumb',
    ROZETKA = 'rozetka',
}

export class CreateCardDto {
    @IsString()
    @MaxLength(40)
    name: string;

    @IsEnum(CardSkin)
    skin: CardSkin;

    @IsOptional()
    @IsNumber()
    balance?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    creditLimit?: number;

    @IsOptional()
    @IsString()
    @MaxLength(CARD_COVER_MAX_LENGTH)
    @Matches(CARD_COVER_PATTERN, {
        message: 'Card cover must be a JPEG, PNG or WebP image',
    })
    cover?: string;
}

export class UpdateCardDto {
    @IsString()
    id: string;

    @IsOptional()
    @IsString()
    @MaxLength(40)
    name?: string;

    @IsOptional()
    @IsEnum(CardSkin)
    skin?: CardSkin;

    @IsOptional()
    @IsNumber()
    @Min(0)
    creditLimit?: number;

    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(CARD_COVER_MAX_LENGTH)
    @Matches(CARD_COVER_PATTERN, {
        message: 'Card cover must be a JPEG, PNG or WebP image',
    })
    cover?: string | null;
}

export class DeleteCardQueryDto {
    @IsString()
    moveTo: string;
}

export class CardOrderDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    ids: string[];
}

export class CardTransferDto {
    @IsString()
    fromCardId: string;

    @IsString()
    toCardId: string;

    @IsNumber()
    @Min(0.01)
    amount: number;

    @IsOptional()
    @IsDateString()
    date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    description?: string;
}
