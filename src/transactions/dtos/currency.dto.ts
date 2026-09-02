import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { SavingsCurrency } from './savings.dto';

export class ChangeCurrencyDto {
    @IsOptional()
    @IsEnum(SavingsCurrency)
    fromCurrency?: SavingsCurrency;

    @IsEnum(SavingsCurrency)
    toCurrency: SavingsCurrency;

    @IsOptional()
    @IsNumber()
    @Min(0.000001)
    @Max(10_000)
    conversionRate?: number;
}
