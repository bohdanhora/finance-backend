import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';

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
    @Min(0)
    balance?: number;
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
