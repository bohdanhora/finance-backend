import {
    BadRequestException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from 'src/app.controller';
import { AllTransactionsInfo } from './schemas/all-info.schema';
import {
    CardOrderDto,
    CardTransferDto,
    CreateCardDto,
    UpdateCardDto,
} from './dtos/cards.dto';
import { TransactionDto, TransactionType } from './dtos/transaction.dto';
import {
    CardRecord,
    buildCardsMigration,
    changeCardBalance,
    createCard,
    ensureCardFunds,
    findCard,
    plainCards,
    sumCards,
} from './helpers/cards';

export const MAX_CARDS = 12;
const TRANSFER_CATEGORY = 'transfer';

type PlainDocument<T> = T & { toObject?: () => T };

const toPlain = <T>(item: T): T =>
    (item as PlainDocument<T>).toObject?.() ?? item;

@Injectable()
export class CardsService {
    constructor(
        @InjectModel(AllTransactionsInfo.name)
        private AllTransactionsInfoModel: Model<AllTransactionsInfo>,
    ) {}

    private async load(req: AuthenticatedRequest) {
        if (!req.userId) {
            throw new UnauthorizedException('User not authenticated');
        }

        const userData = await this.AllTransactionsInfoModel.findOne({
            userId: req.userId,
        });

        if (!userData) {
            throw new BadRequestException('User data not found');
        }

        const migration = buildCardsMigration(userData);
        const cards = migration?.cards ?? plainCards(userData.cards);
        const transactions = (
            migration?.transactions ??
            userData.transactions ??
            []
        ).map((transaction) => toPlain(transaction));

        return { userId: req.userId, cards, transactions };
    }

    private async save(
        userId: string,
        cards: CardRecord[],
        transactions: TransactionDto[],
    ) {
        const totalAmount = sumCards(cards);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { cards, transactions, totalAmount } },
        );

        return {
            updatedCards: cards,
            updatedTransactions: transactions,
            totalAmount,
        };
    }

    async createCard(
        { name, skin, balance }: CreateCardDto,
        req: AuthenticatedRequest,
    ) {
        const { userId, cards, transactions } = await this.load(req);

        if (cards.length >= MAX_CARDS) {
            throw new BadRequestException(
                `You can keep up to ${MAX_CARDS} cards`,
            );
        }

        const card = createCard({ name, skin, balance });

        return {
            message: 'Card added',
            card,
            ...(await this.save(userId, [...cards, card], transactions)),
        };
    }

    async updateCard(
        { id, name, skin }: UpdateCardDto,
        req: AuthenticatedRequest,
    ) {
        const { userId, cards, transactions } = await this.load(req);
        findCard(cards, id);

        const updatedCards = cards.map((card) =>
            card.id === id
                ? {
                      ...card,
                      ...(name !== undefined ? { name: name.trim() } : {}),
                      ...(skin ? { skin } : {}),
                  }
                : card,
        );

        return {
            message: 'Card updated',
            ...(await this.save(userId, updatedCards, transactions)),
        };
    }

    async reorderCards({ ids }: CardOrderDto, req: AuthenticatedRequest) {
        const { userId, cards, transactions } = await this.load(req);
        const unique = new Set(ids);

        if (
            unique.size !== cards.length ||
            ids.length !== cards.length ||
            cards.some((card) => !unique.has(card.id))
        ) {
            throw new BadRequestException('The card order does not match');
        }

        const reordered = ids.map((id) => findCard(cards, id));

        return {
            message: 'Cards reordered',
            ...(await this.save(userId, reordered, transactions)),
        };
    }

    async deleteCard(id: string, moveTo: string, req: AuthenticatedRequest) {
        const { userId, cards, transactions } = await this.load(req);
        const card = findCard(cards, id);
        const target = findCard(cards, moveTo);

        if (card.id === target.id) {
            throw new BadRequestException(
                'Choose another card to keep the money and history',
            );
        }

        const updatedCards = changeCardBalance(
            cards.filter((item) => item.id !== card.id),
            target.id,
            card.balance,
        );
        const updatedTransactions = transactions
            .map((transaction) => ({
                ...transaction,
                ...(transaction.cardId === card.id
                    ? { cardId: target.id }
                    : {}),
                ...(transaction.toCardId === card.id
                    ? { toCardId: target.id }
                    : {}),
            }))
            .filter(
                (transaction) =>
                    transaction.transactionType !== TransactionType.TRANSFER ||
                    transaction.cardId !== transaction.toCardId,
            );

        return {
            message: 'Card deleted',
            ...(await this.save(userId, updatedCards, updatedTransactions)),
        };
    }

    async transfer(
        { fromCardId, toCardId, amount, date, description }: CardTransferDto,
        req: AuthenticatedRequest,
    ) {
        const { userId, cards, transactions } = await this.load(req);
        const source = findCard(cards, fromCardId);
        const destination = findCard(cards, toCardId);

        if (source.id === destination.id) {
            throw new BadRequestException('Choose two different cards');
        }

        ensureCardFunds(source, amount);

        const transaction: TransactionDto = {
            id: uuidv4(),
            transactionType: TransactionType.TRANSFER,
            value: amount,
            date: date ? new Date(date) : new Date(),
            categorie: TRANSFER_CATEGORY,
            description: description?.trim() || '',
            cardId: source.id,
            toCardId: destination.id,
        };
        const updatedCards = changeCardBalance(
            changeCardBalance(cards, source.id, -amount),
            destination.id,
            amount,
        );

        return {
            message: 'Transfer saved',
            ...(await this.save(userId, updatedCards, [
                transaction,
                ...transactions,
            ])),
        };
    }
}
