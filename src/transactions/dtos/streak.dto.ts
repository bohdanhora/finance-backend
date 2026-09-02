import { Matches } from 'class-validator';

export class StreakVisitDto {
    /** The visitor's own calendar day, `YYYY-MM-DD`, in their timezone. */
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'day must be a YYYY-MM-DD calendar day',
    })
    day: string;
}
