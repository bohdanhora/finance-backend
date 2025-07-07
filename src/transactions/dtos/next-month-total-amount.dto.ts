import { IsNumber } from 'class-validator';

export class NextMonthTotalAmountDto {
    @IsNumber()
    nextMonthTotalAmount: number;
}
