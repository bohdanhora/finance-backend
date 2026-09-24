import { IsNumber, IsOptional, IsString } from 'class-validator';

export class TotalAmountDto {
    @IsNumber()
    totalAmount: number;

    @IsOptional()
    @IsString()
    cardId?: string;
}
