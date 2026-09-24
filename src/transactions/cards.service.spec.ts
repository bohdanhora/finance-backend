import 'reflect-metadata';
import { AuthenticatedRequest } from 'src/app.controller';
import { CardsService } from './cards.service';
import { CardSkin } from './dtos/cards.dto';
import { TransactionDto, TransactionType } from './dtos/transaction.dto';
import { CalculationService } from './helpers/calculation.service';
import { buildCardsMigration } from './helpers/cards';
import { TransactionsService } from './transactions.service';

const request = {
    userId: '507f1f77bcf86cd799439011',
} as AuthenticatedRequest;

const date = new Date('2026-09-20T10:00:00.000Z');

const card = (id: string, balance: number) => ({
    id,
    name: id,
    skin: CardSkin.DEFAULT,
    balance,
    createdAt: date.toISOString(),
});

const createServices = (overrides: Record<string, any> = {}) => {
    const userData: Record<string, any> = {
        totalAmount: 0,
        totalIncome: 0,
        totalSpend: 0,
        transactions: [],
        savingsOperations: [],
        cards: [],
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    const model = {
        findOne: jest.fn().mockResolvedValue(userData),
        updateOne: jest.fn(
            (_filter: unknown, update: { $set: Record<string, unknown> }) => {
                Object.assign(userData, update.$set);
                return Promise.resolve({});
            },
        ),
    };

    return {
        userData,
        cards: new CardsService(model as never),
        transactions: new TransactionsService(
            {} as never,
            model as never,
            new CalculationService(),
        ),
    };
};

describe('cards', () => {
    it('moves a legacy balance and history onto a first card', () => {
        const migration = buildCardsMigration({
            totalAmount: 750,
            transactions: [
                {
                    id: 'old',
                    transactionType: TransactionType.EXPENSE,
                    value: 50,
                    date,
                    categorie: 'food',
                    description: '',
                },
            ],
        });

        expect(migration?.cards).toEqual([
            expect.objectContaining({ balance: 750, name: '' }),
        ]);
        expect(migration?.transactions?.[0].cardId).toBe(
            migration?.cards[0].id,
        );
        expect(
            buildCardsMigration({
                totalAmount: 750,
                cards: migration!.cards,
                transactions: migration!.transactions,
            }),
        ).toBeNull();
    });

    it('puts a total changed behind the cards back onto the first card', () => {
        const migration = buildCardsMigration({
            totalAmount: 1_250,
            cards: [card('mono', 700), card('pumb', 300)],
            transactions: [],
        });

        expect(migration?.cards.map((item) => item.balance)).toEqual([
            950, 300,
        ]);
    });

    it('spends from the chosen card and checks that card, not the total', async () => {
        const { transactions, userData } = createServices({
            totalAmount: 1_000,
            cards: [card('mono', 900), card('pumb', 100)],
        });

        await expect(
            transactions.newTransaction(
                {
                    id: 'too-much',
                    transactionType: TransactionType.EXPENSE,
                    value: 150,
                    date,
                    categorie: 'food',
                    description: '',
                    cardId: 'pumb',
                },
                request,
            ),
        ).rejects.toThrow('Not enough money on this card');

        const result = await transactions.newTransaction(
            {
                id: 'lunch',
                transactionType: TransactionType.EXPENSE,
                value: 60,
                date,
                categorie: 'food',
                description: '',
                cardId: 'pumb',
            },
            request,
        );

        expect(result.updatedCards.map((item) => item.balance)).toEqual([
            900, 40,
        ]);
        expect(result.updatedTotals.totalAmount).toBe(940);
        expect((userData.transactions as TransactionDto[])[0].cardId).toBe(
            'pumb',
        );
    });

    it('keeps a transfer out of income and spending and undoes it on delete', async () => {
        const { cards, transactions, userData } = createServices({
            totalAmount: 1_000,
            totalIncome: 1_000,
            cards: [card('mono', 1_000), card('pumb', 0)],
        });

        const moved = await cards.transfer(
            { fromCardId: 'mono', toCardId: 'pumb', amount: 300 },
            request,
        );

        expect(moved.updatedCards.map((item) => item.balance)).toEqual([
            700, 300,
        ]);
        expect(moved.totalAmount).toBe(1_000);
        expect(userData.totalIncome).toBe(1_000);
        expect(userData.totalSpend).toBe(0);

        const transfer = moved.updatedTransactions[0];
        expect(transfer).toEqual(
            expect.objectContaining({
                transactionType: TransactionType.TRANSFER,
                cardId: 'mono',
                toCardId: 'pumb',
            }),
        );

        const undone = await transactions.deleteTransaction(
            { transactionId: transfer.id },
            request,
        );

        expect(undone.updatedCards.map((item) => item.balance)).toEqual([
            1_000, 0,
        ]);
        expect(undone.updatedTotals).toEqual({
            totalAmount: 1_000,
            totalIncome: 1_000,
            totalSpend: 0,
        });
    });

    it('hands the balance and history of a deleted card to another one', async () => {
        const { cards, userData } = createServices({
            totalAmount: 500,
            cards: [card('mono', 400), card('pumb', 100)],
            transactions: [
                {
                    id: 'spend',
                    transactionType: TransactionType.EXPENSE,
                    value: 20,
                    date,
                    categorie: 'food',
                    description: '',
                    cardId: 'pumb',
                },
                {
                    id: 'move',
                    transactionType: TransactionType.TRANSFER,
                    value: 50,
                    date,
                    categorie: 'transfer',
                    description: '',
                    cardId: 'mono',
                    toCardId: 'pumb',
                },
            ],
        });

        const result = await cards.deleteCard('pumb', 'mono', request);

        expect(result.updatedCards).toEqual([
            expect.objectContaining({ id: 'mono', balance: 500 }),
        ]);
        expect(result.totalAmount).toBe(500);
        expect(userData.transactions).toEqual([
            expect.objectContaining({ id: 'spend', cardId: 'mono' }),
        ]);
    });

    it('moves an edited transaction to another card', async () => {
        const { transactions } = createServices({
            totalAmount: 1_000,
            totalSpend: 100,
            cards: [card('mono', 400), card('pumb', 600)],
            transactions: [
                {
                    id: 'rent',
                    transactionType: TransactionType.EXPENSE,
                    value: 100,
                    date,
                    categorie: 'home',
                    description: '',
                    cardId: 'mono',
                },
            ],
        });

        const result = await transactions.updateTransaction(
            {
                transactionId: 'rent',
                value: 150,
                transactionType: TransactionType.EXPENSE,
                description: '',
                date,
                categorie: 'home',
                cardId: 'pumb',
            },
            request,
        );

        expect(result.updatedCards.map((item) => item.balance)).toEqual([
            500, 450,
        ]);
        expect(result.updatedTotals).toEqual({
            totalAmount: 950,
            totalIncome: 0,
            totalSpend: 150,
        });
    });

    it('corrects one card balance without touching the others', async () => {
        const { transactions } = createServices({
            totalAmount: 1_000,
            cards: [card('mono', 400), card('pumb', 600)],
        });

        const result = await transactions.setTotalAmount(
            { totalAmount: 250, cardId: 'pumb' },
            request,
        );

        expect(result.updatedCards.map((item) => item.balance)).toEqual([
            400, 250,
        ]);
        expect(result.totalAmount).toBe(650);
    });
});
