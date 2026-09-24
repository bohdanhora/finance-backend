import { BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CardSkin } from '../dtos/cards.dto';
import { TransactionDto } from '../dtos/transaction.dto';
import { roundCurrency } from './currency-conversion';

export type CardRecord = {
    id: string;
    name: string;
    skin: CardSkin;
    balance: number;
    creditLimit?: number;
    createdAt: string;
};

type CardsSource = {
    cards?: CardRecord[];
    totalAmount: number;
    transactions?: TransactionDto[];
};

type PlainDocument<T> = T & { toObject?: () => T };

const toPlain = <T>(item: T): T =>
    (item as PlainDocument<T>).toObject?.() ?? item;

export const plainCards = (cards: CardRecord[] = []): CardRecord[] =>
    cards.map((card) => ({ ...toPlain(card) }));

export const sumCards = (cards: CardRecord[] = []): number =>
    roundCurrency(cards.reduce((total, card) => total + card.balance, 0));

export const creditLimitOf = (card: Pick<CardRecord, 'creditLimit'>) =>
    roundCurrency(Math.max(0, card.creditLimit ?? 0));

export const availableOnCard = (card: CardRecord) =>
    roundCurrency(card.balance + creditLimitOf(card));

export const createCard = (
    fields: Partial<Omit<CardRecord, 'createdAt'>> = {},
): CardRecord => {
    const creditLimit = creditLimitOf(fields);

    return {
        id: fields.id || uuidv4(),
        name: fields.name?.trim() || '',
        skin: fields.skin || CardSkin.DEFAULT,
        balance: roundCurrency(Math.max(-creditLimit, fields.balance ?? 0)),
        ...(creditLimit ? { creditLimit } : {}),
        createdAt: new Date().toISOString(),
    };
};

export const ensureWithinCreditLimit = (
    balance: number,
    creditLimit: number,
) => {
    if (roundCurrency(balance) < -roundCurrency(Math.max(0, creditLimit))) {
        throw new BadRequestException(
            creditLimit > 0
                ? 'The debt on this card is bigger than its credit limit'
                : 'This card has no credit limit, so its balance cannot be negative',
        );
    }
};

export const buildCardsMigration = (
    source: CardsSource,
): { cards: CardRecord[]; transactions?: TransactionDto[] } | null => {
    const existing = plainCards(source.cards);
    const drift = existing.length
        ? roundCurrency(source.totalAmount - sumCards(existing))
        : 0;
    const cards = existing.length
        ? drift
            ? changeCardBalance(existing, existing[0].id, drift)
            : existing
        : [createCard({ balance: source.totalAmount })];
    const primaryId = cards[0].id;
    const transactions = (source.transactions || []).map((transaction) =>
        toPlain(transaction),
    );
    const untagged = transactions.some((transaction) => !transaction.cardId);

    if (existing.length && !untagged && !drift) {
        return null;
    }

    return {
        cards,
        ...(untagged
            ? {
                  transactions: transactions.map((transaction) =>
                      transaction.cardId
                          ? transaction
                          : { ...transaction, cardId: primaryId },
                  ),
              }
            : {}),
    };
};

export const findCard = (cards: CardRecord[], cardId?: string): CardRecord => {
    const card = cardId ? cards.find((item) => item.id === cardId) : cards[0];

    if (!card) {
        throw new BadRequestException('Card not found');
    }

    return card;
};

export const changeCardBalance = (
    cards: CardRecord[],
    cardId: string,
    delta: number,
): CardRecord[] =>
    cards.map((card) =>
        card.id === cardId
            ? {
                  ...card,
                  balance: roundCurrency(
                      Math.max(-creditLimitOf(card), card.balance + delta),
                  ),
              }
            : card,
    );

export const ensureCardFunds = (
    card: CardRecord,
    amount: number,
    message = 'Not enough money on this card',
) => {
    if (roundCurrency(amount) > availableOnCard(card)) {
        throw new BadRequestException(message);
    }
};
