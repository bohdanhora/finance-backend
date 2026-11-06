import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EssentialItemDto } from './essential-payments.dto';

describe('EssentialItemDto foreign amount', () => {
    const base = { id: 'rent', title: 'Rent', amount: 100, checked: false };
    const errorsOf = (item: Record<string, unknown>) =>
        validate(plainToInstance(EssentialItemDto, { ...base, ...item }), {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

    it('accepts an item whose currency was stored as null', async () => {
        const errors = await errorsOf({ currency: null, currencyAmount: null });

        expect(errors).toHaveLength(0);
    });

    it('still requires the foreign amount when a currency is set', async () => {
        const errors = await errorsOf({
            currency: 'usd',
            currencyAmount: null,
        });

        expect(errors.map(({ property }) => property)).toEqual([
            'currencyAmount',
        ]);
    });
});
