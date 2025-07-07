import { IsNumber } from 'class-validator';

export class TotalAmountDto {
    @IsNumber()
    totalAmount: number;
}
