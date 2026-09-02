import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TransactionDto, TransactionType } from './transaction.dto';

describe('TransactionDto', () => {
    const income = {
        transactionType: TransactionType.INCOME,
        id: 'income-1',
        value: 10,
        date: '2026-09-02T00:00:00.000Z',
        categorie: 'income',
        description: 'Salary',
    };

    it('accepts a regular income with whitelist validation enabled', async () => {
        const dto = plainToInstance(TransactionDto, income);

        const errors = await validate(dto, {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

        expect(errors).toEqual([]);
    });

    it('rejects a client-provided savings link', async () => {
        const dto = plainToInstance(TransactionDto, {
            ...income,
            savingsOperationId: 'forged-link',
        });

        const errors = await validate(dto, {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

        expect(errors).toEqual([
            expect.objectContaining({
                property: 'savingsOperationId',
            }),
        ]);
    });
});
