import { IsNumber } from 'class-validator';

export class SetPercentDto {
    @IsNumber()
    percent: number;
}
