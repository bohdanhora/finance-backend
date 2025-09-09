import { IsString } from 'class-validator';

export class DeleteTransaction {
    @IsString()
    transactionId: string;
}
