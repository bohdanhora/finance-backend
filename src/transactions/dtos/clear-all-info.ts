import { IsBoolean } from 'class-validator';

export class ClearAllInfoDto {
    @IsBoolean()
    clearTotals: boolean;
}
