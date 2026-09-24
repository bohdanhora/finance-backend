import {
    BadRequestException,
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from 'src/app.controller';
import { User } from 'src/auth/schemas/user.schema';
import { AllTransactionsInfo } from './schemas/all-info.schema';
import {
    EssentialItemDto,
    EssentialsArrayDto,
    EssentialsType,
} from './dtos/essential-payments.dto';
import { TransactionDto, TransactionType } from './dtos/transaction.dto';
import { TotalAmountDto } from './dtos/total-amount.dto';
import { NextMonthTotalAmountDto } from './dtos/next-month-total-amount.dto';
import { CalculationService } from './helpers/calculation.service';
import { EssentialCheckedDto } from './dtos/essential-checked.dto';
import { RemoveEssentialDto } from './dtos/remove-essential.dto';
import { NewEssentialDto } from './dtos/add-new-essential.dto';
import { ClearAllInfoDto } from './dtos/clear-all-info';
import { SetPercentDto } from './dtos/percent';
import { DeleteTransaction } from './dtos/delete-transaction';
import { UpdateTransactionDto } from './dtos/update-transaction';
import { UpdateEssentialDto } from './dtos/update-essential.dto';
import {
    DeleteSavingsGoalDto,
    SavingsCurrency,
    SavingsGoalDto,
    SavingsGoalPayloadDto,
    SavingsOperationDto,
    SavingsOperationPayloadDto,
    SavingsOperationType,
    SavingsStorage,
} from './dtos/savings.dto';
import {
    buildMonthRolloverUpdate,
    getMonthDifference,
    isMonthKey,
    toMonthKey,
} from './helpers/month-rollover';
import { ChangeCurrencyDto } from './dtos/currency.dto';
import { StreakVisitDto } from './dtos/streak.dto';
import {
    ExpectedIncomePayloadDto,
    ExpectedIncomeReceivedDto,
    ExpectedIncomeRecord,
} from './dtos/expected-income.dto';
import {
    StreakState,
    registerStreakVisit,
    resolveVisitDay,
} from './helpers/streak';
import {
    convertMainCurrencyAmounts,
    roundCurrency,
} from './helpers/currency-conversion';
import {
    CardRecord,
    buildCardsMigration,
    changeCardBalance,
    creditLimitOf,
    ensureCardFunds,
    ensureWithinCreditLimit,
    findCard,
    plainCards,
    sumCards,
} from './helpers/cards';

const SAVINGS_CATEGORY = 'savings';
const INCOME_CATEGORY = 'income';

const byPayday = (items: ExpectedIncomeRecord[]) =>
    [...items].sort((a, b) => a.day - b.day);

@Injectable()
export class TransactionsService {
    constructor(
        @InjectModel(User.name) private UserModel: Model<User>,
        @InjectModel(AllTransactionsInfo.name)
        private AllTransactionsInfoModel: Model<AllTransactionsInfo>,
        private readonly calculationService: CalculationService,
    ) {}

    private getUpdateFieldName(type: EssentialsType): string {
        switch (type) {
            case EssentialsType.DEFAULT:
                return 'defaultEssentialsArray';
            case EssentialsType.THIS_MONTH:
                return 'essentialsArray';
            case EssentialsType.NEXT_MONTH:
                return 'nextMonthEssentialsArray';
            default:
                throw new BadRequestException('Invalid essentials type');
        }
    }

    private getUserIdOrThrow(req: AuthenticatedRequest): string {
        if (!req.userId) {
            throw new UnauthorizedException('User ID not found');
        }
        if (!Types.ObjectId.isValid(req.userId)) {
            throw new BadRequestException('Invalid userId format');
        }
        return req.userId;
    }

    private async getUserDataOrThrow(userId: string) {
        const userData = await this.AllTransactionsInfoModel.findOne({
            userId,
        });
        if (!userData) {
            throw new BadRequestException('User data not found');
        }
        return userData;
    }

    private prepareCards(userData: {
        cards?: CardRecord[];
        totalAmount: number;
        transactions: TransactionDto[];
    }): CardRecord[] {
        const migration = buildCardsMigration(userData);

        if (migration) {
            userData.cards = migration.cards;
            if (migration.transactions) {
                userData.transactions = migration.transactions;
            }
        }

        return plainCards(userData.cards);
    }

    private moveCardMoney(
        cards: CardRecord[],
        cardId: string,
        amount: number,
        type: TransactionType,
        reverse = false,
    ): CardRecord[] {
        const incoming = (type === TransactionType.INCOME) !== reverse;
        return changeCardBalance(cards, cardId, incoming ? amount : -amount);
    }

    private isEssentialPaymentTransaction(
        userData: AllTransactionsInfo,
        transactionId: string,
    ): boolean {
        return [
            ...(userData.essentialsArray || []),
            ...(userData.nextMonthEssentialsArray || []),
        ].some((essential) => essential.paymentTransactionId === transactionId);
    }

    private getExpectedIncomes(
        userData: AllTransactionsInfo,
    ): ExpectedIncomeRecord[] {
        return userData.expectedIncomes || [];
    }

    private isExpectedIncomeTransaction(
        userData: AllTransactionsInfo,
        transactionId: string,
    ): boolean {
        return this.getExpectedIncomes(userData).some(
            (income) => income.transactionId === transactionId,
        );
    }

    async getAllInfo(req: AuthenticatedRequest, requestedMonth?: string) {
        const userId = this.getUserIdOrThrow(req);
        const currentMonth = requestedMonth ?? toMonthKey();

        if (!isMonthKey(currentMonth)) {
            throw new BadRequestException('Invalid current month');
        }

        if (Math.abs(getMonthDifference(toMonthKey(), currentMonth)) > 1) {
            throw new BadRequestException('Current month is out of range');
        }

        const user = await this.UserModel.findById(userId);
        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        const transactions = await this.AllTransactionsInfoModel.findOne({
            userId,
        });
        if (!transactions) {
            throw new BadRequestException('No transactions found');
        }

        const rolloverUpdate = buildMonthRolloverUpdate(
            transactions,
            currentMonth,
        );

        const cardsMigration = buildCardsMigration(transactions);

        if (cardsMigration) {
            transactions.set({
                ...cardsMigration,
                totalAmount: sumCards(cardsMigration.cards),
            });
        }

        if (rolloverUpdate || cardsMigration) {
            if (rolloverUpdate) {
                transactions.set(rolloverUpdate);
            }
            await transactions.save();
        }

        return transactions;
    }

    async changeCurrency(
        { fromCurrency, toCurrency, conversionRate }: ChangeCurrencyDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const storedCurrency = userData.currency;

        if (storedCurrency && fromCurrency && storedCurrency !== fromCurrency) {
            throw new ConflictException(
                'Currency was changed in another session. Refresh and try again',
            );
        }

        if (storedCurrency === toCurrency) {
            return {
                message: 'Currency is already up to date',
                updatedInfo: userData,
            };
        }

        const sourceCurrency = storedCurrency ?? fromCurrency;
        const needsConversion =
            Boolean(sourceCurrency) && sourceCurrency !== toCurrency;

        if (
            needsConversion &&
            (!conversionRate ||
                !Number.isFinite(conversionRate) ||
                conversionRate <= 0)
        ) {
            throw new BadRequestException(
                'A valid conversion rate is required to change currency',
            );
        }

        const cards = this.prepareCards(userData);
        const converted = needsConversion
            ? convertMainCurrencyAmounts(
                  {
                      ...(userData.toObject?.() ?? userData),
                      cards,
                      transactions: userData.transactions,
                  },
                  conversionRate!,
              )
            : null;
        const updateData: Partial<AllTransactionsInfo> = {
            ...(converted || {}),
            currency: toCurrency,
        };
        const currencyFilter = storedCurrency
            ? { currency: storedCurrency }
            : {
                  $or: [{ currency: { $exists: false } }, { currency: null }],
              };

        const updateResult = await this.AllTransactionsInfoModel.updateOne(
            { userId, ...currencyFilter },
            { $set: updateData },
        );

        if (updateResult.matchedCount === 0) {
            const latest = await this.getUserDataOrThrow(userId);
            if (latest.currency === toCurrency) {
                return {
                    message: 'Currency is already up to date',
                    updatedInfo: latest,
                };
            }
            throw new ConflictException(
                'Currency was changed in another session. Refresh and try again',
            );
        }

        const plainUserData =
            (
                userData as AllTransactionsInfo & {
                    toObject?: () => AllTransactionsInfo;
                }
            ).toObject?.() ?? userData;

        return {
            message: needsConversion
                ? 'Currency and saved amounts converted'
                : 'Currency saved',
            updatedInfo: {
                ...plainUserData,
                ...updateData,
            },
        };
    }

    async newTransaction(
        transaction: TransactionDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        const userTransactionsInfo =
            await this.AllTransactionsInfoModel.findOne({ userId });
        if (!userTransactionsInfo) {
            throw new UnauthorizedException('Transaction data not found');
        }

        if (transaction.transactionType === TransactionType.TRANSFER) {
            throw new BadRequestException(
                'Move money between cards with a transfer',
            );
        }

        const cards = this.prepareCards(userTransactionsInfo);
        const card = findCard(cards, transaction.cardId);

        if (transaction.transactionType === TransactionType.EXPENSE) {
            ensureCardFunds(card, transaction.value);
        }

        const updatedCards = this.moveCardMoney(
            cards,
            card.id,
            transaction.value,
            transaction.transactionType,
        );
        const updatedTotals = {
            ...this.calculationService.calculateAllTotals(
                userTransactionsInfo.totalAmount,
                userTransactionsInfo.totalIncome,
                userTransactionsInfo.totalSpend,
                transaction.value,
                transaction.transactionType,
            ),
            totalAmount: sumCards(updatedCards),
        };

        if (
            transaction.transactionType === TransactionType.INCOME &&
            transaction.categorie === SAVINGS_CATEGORY
        ) {
            throw new BadRequestException(
                'Create savings withdrawals from the savings page',
            );
        }

        const transactionToSave: TransactionDto = {
            ...transaction,
            cardId: card.id,
        };
        const savingsOperations = (userTransactionsInfo.savingsOperations ||
            []) as SavingsOperationDto[];

        if (
            transaction.transactionType === TransactionType.EXPENSE &&
            transaction.categorie === SAVINGS_CATEGORY
        ) {
            if (!transaction.savingsStorage || !transaction.savingsCurrency) {
                throw new BadRequestException(
                    'Choose where the savings will be stored',
                );
            }

            const savingsOperationId = uuidv4();
            const savingsOperation: SavingsOperationDto = {
                id: savingsOperationId,
                type: SavingsOperationType.DEPOSIT,
                storage: transaction.savingsStorage,
                amount: transaction.savingsAmount ?? transaction.value,
                currency: transaction.savingsCurrency,
                date: new Date(transaction.date).toISOString(),
                note: transaction.description || undefined,
                linkedTransactionId: transaction.id,
                balanceAmount: transaction.value,
            };

            transactionToSave.savingsOperationId = savingsOperationId;
            userTransactionsInfo.savingsOperations = [
                savingsOperation,
                ...savingsOperations,
            ];
        }

        userTransactionsInfo.transactions.unshift(transactionToSave);
        userTransactionsInfo.cards = updatedCards;
        Object.assign(userTransactionsInfo, updatedTotals);

        await userTransactionsInfo.save();

        return {
            message: 'Transaction added successfully',
            updatedTotals,
            updatedCards,
            updatedItems: userTransactionsInfo.transactions,
            updatedSavingsOperations:
                userTransactionsInfo.savingsOperations || [],
        };
    }

    async setTotalAmount(
        { totalAmount, cardId }: TotalAmountDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const cards = this.prepareCards(userData);
        const card = findCard(cards, cardId);
        const otherCards = cards.filter((item) => item.id !== card.id);
        const balance = cardId
            ? totalAmount
            : totalAmount - sumCards(otherCards);
        ensureWithinCreditLimit(balance, creditLimitOf(card));
        const updatedCards = changeCardBalance(
            cards,
            card.id,
            balance - card.balance,
        );
        const updatedTotal = sumCards(updatedCards);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            {
                $set: {
                    cards: updatedCards,
                    transactions: userData.transactions,
                    totalAmount: updatedTotal,
                },
            },
        );

        return {
            message: 'Total amount updated',
            totalAmount: updatedTotal,
            updatedCards,
        };
    }

    async setNextMonthTotalAmount(
        { nextMonthTotalAmount }: NextMonthTotalAmountDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { nextMonthTotalAmount } },
            { upsert: true },
        );

        return {
            message: 'Next month amount updated',
            nextMonthTotalAmount,
        };
    }

    async setEssentalPayments(
        { type, items }: EssentialsArrayDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: items } },
            { upsert: true },
        );

        return {
            message: 'Essentials updated',
            updatedItems: items,
        };
    }

    async setCheckedEssentalPayments(
        { type, item }: EssentialCheckedDto,
        req: AuthenticatedRequest,
    ) {
        if (type === EssentialsType.DEFAULT) {
            throw new BadRequestException(
                'Default essentials cannot be marked as paid',
            );
        }

        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);
        const userData = await this.getUserDataOrThrow(userId);
        const currentItems =
            (userData[updateFieldName] as EssentialItemDto[]) || [];
        const essentialIndex = currentItems.findIndex(
            (essential) => essential.id === item.id,
        );

        if (essentialIndex === -1) {
            throw new BadRequestException('Essential not found');
        }

        const essential = currentItems[essentialIndex];
        const cards = this.prepareCards(userData);
        const currentTotals = {
            totalAmount: userData.totalAmount,
            totalIncome: userData.totalIncome,
            totalSpend: userData.totalSpend,
        };

        if (essential.checked === item.checked) {
            return {
                message: 'Essential checked state unchanged',
                updatedItems: currentItems,
                updatedTotals: currentTotals,
                updatedTransactions: userData.transactions,
                updatedCards: cards,
            };
        }

        let updatedEssential: EssentialItemDto;
        let updatedTotals = currentTotals;
        let updatedCards = cards;

        if (item.checked) {
            if (
                item.actualAmount === undefined ||
                !Number.isFinite(item.actualAmount) ||
                item.actualAmount <= 0
            ) {
                throw new BadRequestException(
                    'Actual payment amount must be greater than zero',
                );
            }
            const card = findCard(cards, item.cardId);
            ensureCardFunds(card, item.actualAmount);

            const transactionId = uuidv4();
            const paidAt = new Date();
            const transaction: TransactionDto = {
                transactionType: TransactionType.EXPENSE,
                id: transactionId,
                value: item.actualAmount,
                date: paidAt,
                categorie: 'essentials',
                description: essential.title,
                cardId: card.id,
            };

            updatedCards = this.moveCardMoney(
                cards,
                card.id,
                item.actualAmount,
                TransactionType.EXPENSE,
            );
            updatedTotals = {
                ...this.calculationService.calculateAllTotals(
                    userData.totalAmount,
                    userData.totalIncome,
                    userData.totalSpend,
                    item.actualAmount,
                    TransactionType.EXPENSE,
                ),
                totalAmount: sumCards(updatedCards),
            };
            userData.transactions.unshift(transaction);
            updatedEssential = {
                ...essential,
                checked: true,
                paidAmount: item.actualAmount,
                paidAt: paidAt.toISOString(),
                paymentTransactionId: transactionId,
            };
        } else {
            const transactionIndex = essential.paymentTransactionId
                ? userData.transactions.findIndex(
                      (transaction) =>
                          transaction.id === essential.paymentTransactionId,
                  )
                : -1;

            if (transactionIndex >= 0) {
                const transaction = userData.transactions[transactionIndex];
                updatedCards = this.moveCardMoney(
                    cards,
                    findCard(cards, transaction.cardId).id,
                    transaction.value,
                    transaction.transactionType,
                    true,
                );
                updatedTotals = {
                    ...this.calculationService.calculateTotalsAfterDelete(
                        userData.totalAmount,
                        userData.totalIncome,
                        userData.totalSpend,
                        transaction.value,
                        transaction.transactionType,
                    ),
                    totalAmount: sumCards(updatedCards),
                };
                userData.transactions.splice(transactionIndex, 1);
            } else if (
                essential.paymentTransactionId &&
                essential.paidAmount !== undefined
            ) {
                updatedCards = this.moveCardMoney(
                    cards,
                    findCard(cards).id,
                    essential.paidAmount,
                    TransactionType.EXPENSE,
                    true,
                );
                updatedTotals = {
                    ...this.calculationService.calculateTotalsAfterDelete(
                        userData.totalAmount,
                        userData.totalIncome,
                        userData.totalSpend,
                        essential.paidAmount,
                        TransactionType.EXPENSE,
                    ),
                    totalAmount: sumCards(updatedCards),
                };
            }

            updatedEssential = { ...essential, checked: false };
            delete updatedEssential.paidAmount;
            delete updatedEssential.paidAt;
            delete updatedEssential.paymentTransactionId;
        }

        const updatedItems = [...currentItems];
        updatedItems[essentialIndex] = updatedEssential;
        userData.set(updateFieldName, updatedItems);
        userData.cards = updatedCards;
        Object.assign(userData, updatedTotals);
        await userData.save();

        return {
            message: 'Essential checked state updated',
            updatedItems,
            updatedTotals,
            updatedTransactions: userData.transactions,
            updatedCards,
        };
    }

    async removeEssential(
        { type, id }: RemoveEssentialDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);

        const userData = await this.getUserDataOrThrow(userId);
        const currentItems =
            (userData[updateFieldName] as EssentialItemDto[]) || [];
        const essentialToRemove = currentItems.find(
            (essential) => essential.id === id,
        );

        if (essentialToRemove?.checked) {
            throw new BadRequestException(
                'Reverse the essential payment before removing it',
            );
        }

        const updatedItems = currentItems.filter(
            (el: EssentialItemDto) => el.id !== id,
        );

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: updatedItems } },
        );

        return {
            message: 'Essential removed',
            removedId: id,
            updatedItems,
        };
    }

    async addNewEssential(
        { type, item }: NewEssentialDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);

        const userData = await this.getUserDataOrThrow(userId);
        const currentItems =
            (userData[updateFieldName] as EssentialItemDto[]) || [];

        const filteredItems = currentItems.filter(
            (el: EssentialItemDto) => el.id !== item.id,
        );
        const updatedItems = [item, ...filteredItems];

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: updatedItems } },
        );

        return {
            message: 'Essential added',
            addedItem: item,
            updatedItems,
        };
    }

    async updateEssential(
        { type, item }: UpdateEssentialDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const updateFieldName = this.getUpdateFieldName(type);
        const userData = await this.getUserDataOrThrow(userId);
        const currentItems =
            (userData[updateFieldName] as EssentialItemDto[]) || [];
        const currentEssential = currentItems.find(
            (essential) => essential.id === item.id,
        );

        if (!currentEssential) {
            throw new BadRequestException('Essential not found');
        }
        if (currentEssential.checked) {
            throw new BadRequestException(
                'Reverse the essential payment before updating it',
            );
        }

        const updatedItems = currentItems.map((essential) =>
            essential.id === item.id ? item : essential,
        );

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { [updateFieldName]: updatedItems } },
        );

        return {
            message: 'Essential updated',
            updatedItem: item,
            updatedItems,
        };
    }

    async addExpectedIncome(
        { item }: ExpectedIncomePayloadDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const incomes = this.getExpectedIncomes(userData);

        if (incomes.some((income) => income.id === item.id)) {
            throw new BadRequestException('Expected income already exists');
        }

        const updatedItems = byPayday([
            ...incomes,
            { ...item, received: false },
        ]);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { expectedIncomes: updatedItems } },
        );

        return { message: 'Expected income added', updatedItems };
    }

    async updateExpectedIncome(
        { item }: ExpectedIncomePayloadDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const incomes = this.getExpectedIncomes(userData);
        const currentIncome = incomes.find((income) => income.id === item.id);

        if (!currentIncome) {
            throw new BadRequestException('Expected income not found');
        }
        if (currentIncome.received) {
            throw new BadRequestException(
                'Mark the income as not received before editing it',
            );
        }

        const updatedItems = byPayday(
            incomes.map((income) =>
                income.id === item.id ? { ...item, received: false } : income,
            ),
        );

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { expectedIncomes: updatedItems } },
        );

        return { message: 'Expected income updated', updatedItems };
    }

    async removeExpectedIncome(id: string, req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const incomes = this.getExpectedIncomes(userData);
        const currentIncome = incomes.find((income) => income.id === id);

        if (!currentIncome) {
            throw new BadRequestException('Expected income not found');
        }
        if (currentIncome.received) {
            throw new BadRequestException(
                'Mark the income as not received before removing it',
            );
        }

        const updatedItems = incomes.filter((income) => income.id !== id);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { expectedIncomes: updatedItems } },
        );

        return { message: 'Expected income removed', updatedItems };
    }

    /**
     * Marking an expected income as received works like paying an essential:
     * the amount that actually arrived becomes a real income transaction, and
     * undoing it takes exactly that amount back off the balance.
     */
    async setExpectedIncomeReceived(
        {
            id,
            received,
            actualAmount,
            addToBalance = true,
            cardId,
        }: ExpectedIncomeReceivedDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const incomes = this.getExpectedIncomes(userData);
        const incomeIndex = incomes.findIndex((income) => income.id === id);

        if (incomeIndex === -1) {
            throw new BadRequestException('Expected income not found');
        }

        const income = incomes[incomeIndex];
        const cards = this.prepareCards(userData);
        let updatedCards = cards;
        let updatedTotals = {
            totalAmount: userData.totalAmount,
            totalIncome: userData.totalIncome,
            totalSpend: userData.totalSpend,
        };

        if (Boolean(income.received) === received) {
            return {
                message: 'Expected income unchanged',
                updatedItems: incomes,
                updatedTotals,
                updatedTransactions: userData.transactions,
                updatedCards,
            };
        }

        let updatedIncome: ExpectedIncomeRecord;

        if (received) {
            if (
                actualAmount === undefined ||
                !Number.isFinite(actualAmount) ||
                actualAmount <= 0
            ) {
                throw new BadRequestException(
                    'Received amount must be greater than zero',
                );
            }

            const receivedAt = new Date();
            updatedIncome = {
                ...income,
                received: true,
                receivedAmount: actualAmount,
                receivedAt: receivedAt.toISOString(),
            };

            if (addToBalance) {
                const card = findCard(cards, cardId);
                const transactionId = uuidv4();
                userData.transactions.unshift({
                    transactionType: TransactionType.INCOME,
                    id: transactionId,
                    value: actualAmount,
                    date: receivedAt,
                    categorie: INCOME_CATEGORY,
                    description: income.title,
                    cardId: card.id,
                });
                updatedCards = this.moveCardMoney(
                    cards,
                    card.id,
                    actualAmount,
                    TransactionType.INCOME,
                );
                updatedTotals = {
                    ...this.calculationService.calculateAllTotals(
                        userData.totalAmount,
                        userData.totalIncome,
                        userData.totalSpend,
                        actualAmount,
                        TransactionType.INCOME,
                    ),
                    totalAmount: sumCards(updatedCards),
                };
                updatedIncome.transactionId = transactionId;
            }
        } else {
            if (income.transactionId) {
                const transactionIndex = userData.transactions.findIndex(
                    (transaction) => transaction.id === income.transactionId,
                );
                const amount =
                    transactionIndex >= 0
                        ? userData.transactions[transactionIndex].value
                        : (income.receivedAmount ?? 0);
                const card = findCard(
                    cards,
                    transactionIndex >= 0
                        ? userData.transactions[transactionIndex].cardId
                        : undefined,
                );

                ensureCardFunds(
                    card,
                    amount,
                    'Not enough money on the card to undo this income',
                );

                updatedCards = this.moveCardMoney(
                    cards,
                    card.id,
                    amount,
                    TransactionType.INCOME,
                    true,
                );
                updatedTotals = {
                    ...this.calculationService.calculateTotalsAfterDelete(
                        userData.totalAmount,
                        userData.totalIncome,
                        userData.totalSpend,
                        amount,
                        TransactionType.INCOME,
                    ),
                    totalAmount: sumCards(updatedCards),
                };
                if (transactionIndex >= 0) {
                    userData.transactions.splice(transactionIndex, 1);
                }
            }

            updatedIncome = { ...income, received: false };
            delete updatedIncome.receivedAmount;
            delete updatedIncome.receivedAt;
            delete updatedIncome.transactionId;
        }

        const updatedItems = [...incomes];
        updatedItems[incomeIndex] = updatedIncome;
        userData.set('expectedIncomes', updatedItems);
        userData.cards = updatedCards;
        Object.assign(userData, updatedTotals);
        await userData.save();

        return {
            message: 'Expected income updated',
            updatedItems,
            updatedTotals,
            updatedTransactions: userData.transactions,
            updatedCards,
        };
    }

    private getSavingsStorageBalance(
        operations: SavingsOperationDto[],
        storage: SavingsStorage,
        currency: SavingsCurrency,
    ) {
        return operations
            .filter((operation) => operation.currency === currency)
            .reduce((total, operation) => {
                if (operation.type === SavingsOperationType.DEPOSIT) {
                    return operation.storage === storage
                        ? total + operation.amount
                        : total;
                }

                if (operation.type === SavingsOperationType.WITHDRAWAL) {
                    return operation.storage === storage
                        ? total - operation.amount
                        : total;
                }

                if (operation.storage === storage) {
                    return total - operation.amount;
                }

                if (operation.destinationStorage === storage) {
                    return total + operation.amount;
                }

                return total;
            }, 0);
    }

    async addSavingsGoal(
        { item }: SavingsGoalPayloadDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];

        if (goals.some((goal) => goal.id === item.id)) {
            throw new BadRequestException('Savings goal already exists');
        }

        const updatedGoals = [item, ...goals];
        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { savingsGoals: updatedGoals } },
        );

        return {
            message: 'Savings goal added',
            updatedGoals,
            updatedOperations: userData.savingsOperations || [],
        };
    }

    async updateSavingsGoal(
        { item }: SavingsGoalPayloadDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];
        const currentGoal = goals.find((goal) => goal.id === item.id);

        if (!currentGoal) {
            throw new BadRequestException('Savings goal not found');
        }

        const updatedGoals = goals.map((goal) =>
            goal.id === item.id ? item : goal,
        );

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { savingsGoals: updatedGoals } },
        );

        return {
            message: 'Savings goal updated',
            updatedGoals,
            updatedOperations: userData.savingsOperations || [],
        };
    }

    async deleteSavingsGoal(
        id: string,
        req: AuthenticatedRequest,
        {
            purchasedWithSavings = false,
            deductions,
            date,
        }: DeleteSavingsGoalDto = {},
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];
        const operations = (userData.savingsOperations ||
            []) as SavingsOperationDto[];

        const goal = goals.find((goal) => goal.id === id);
        if (!goal) {
            throw new BadRequestException('Savings goal not found');
        }

        const updatedGoals = goals.filter((goal) => goal.id !== id);
        let updatedOperations = operations;

        if (purchasedWithSavings) {
            if (!deductions?.length) {
                throw new BadRequestException(
                    'At least one purchase deduction is required',
                );
            }

            const groupedDeductions = deductions.reduce(
                (grouped, deduction) => {
                    const key = `${deduction.storage}:${deduction.currency}`;
                    const current = grouped.get(key);
                    grouped.set(key, {
                        storage: deduction.storage,
                        currency: deduction.currency,
                        amount: roundCurrency(
                            (current?.amount ?? 0) + deduction.amount,
                        ),
                    });
                    return grouped;
                },
                new Map<
                    string,
                    {
                        storage: SavingsStorage;
                        currency: SavingsCurrency;
                        amount: number;
                    }
                >(),
            );

            for (const deduction of groupedDeductions.values()) {
                if (
                    roundCurrency(
                        this.getSavingsStorageBalance(
                            operations,
                            deduction.storage,
                            deduction.currency,
                        ),
                    ) < deduction.amount
                ) {
                    throw new BadRequestException(
                        'Not enough savings in one of the selected storages or currencies',
                    );
                }
            }

            const purchaseDate = date ?? new Date().toISOString();
            const purchaseOperations: SavingsOperationDto[] = [
                ...groupedDeductions.values(),
            ].map((deduction) => ({
                id: uuidv4(),
                type: SavingsOperationType.WITHDRAWAL,
                storage: deduction.storage,
                amount: deduction.amount,
                currency: deduction.currency,
                date: purchaseDate,
                note: goal.name,
            }));
            updatedOperations = [...purchaseOperations, ...operations];
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            {
                $set: {
                    savingsGoals: updatedGoals,
                    ...(purchasedWithSavings
                        ? { savingsOperations: updatedOperations }
                        : {}),
                },
            },
        );

        return {
            message: 'Savings goal deleted',
            updatedGoals,
            updatedOperations,
        };
    }

    async addSavingsOperation(
        {
            item,
            affectsMainBalance,
            balanceAmount,
            cardId,
        }: SavingsOperationPayloadDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];
        const operations = (userData.savingsOperations ||
            []) as SavingsOperationDto[];
        if (operations.some((operation) => operation.id === item.id)) {
            throw new BadRequestException('Savings operation already exists');
        }

        if (
            item.type === SavingsOperationType.TRANSFER &&
            (!item.destinationStorage ||
                item.destinationStorage === item.storage)
        ) {
            throw new BadRequestException(
                'Choose a different destination for the transfer',
            );
        }

        if (
            item.type !== SavingsOperationType.DEPOSIT &&
            this.getSavingsStorageBalance(
                operations,
                item.storage,
                item.currency,
            ) < item.amount
        ) {
            throw new BadRequestException(
                'Not enough savings in the selected storage',
            );
        }

        const cards = this.prepareCards(userData);
        let updatedCards = cards;
        let operationToSave = item;
        let updatedTransactions = userData.transactions || [];
        let updatedTotals = {
            totalAmount: userData.totalAmount,
            totalIncome: userData.totalIncome,
            totalSpend: userData.totalSpend,
        };

        const shouldAffectMainBalance =
            item.type !== SavingsOperationType.TRANSFER &&
            affectsMainBalance !== false;

        if (shouldAffectMainBalance) {
            if (!balanceAmount || balanceAmount <= 0) {
                throw new BadRequestException(
                    'Main balance amount is required for this savings movement',
                );
            }

            const transactionType =
                item.type === SavingsOperationType.DEPOSIT
                    ? TransactionType.EXPENSE
                    : TransactionType.INCOME;
            const card = findCard(cards, cardId);
            if (transactionType === TransactionType.EXPENSE) {
                ensureCardFunds(card, balanceAmount);
            }
            updatedCards = this.moveCardMoney(
                cards,
                card.id,
                balanceAmount,
                transactionType,
            );
            updatedTotals = {
                ...this.calculationService.calculateAllTotals(
                    userData.totalAmount,
                    userData.totalIncome,
                    userData.totalSpend,
                    balanceAmount,
                    transactionType,
                ),
                totalAmount: sumCards(updatedCards),
            };

            const transactionId = uuidv4();
            operationToSave = {
                ...item,
                linkedTransactionId: transactionId,
                balanceAmount,
            };
            const linkedTransaction: TransactionDto = {
                id: transactionId,
                transactionType,
                value: balanceAmount,
                date: new Date(item.date),
                categorie: SAVINGS_CATEGORY,
                description: item.note || '',
                savingsStorage: item.storage,
                savingsCurrency: item.currency,
                savingsOperationId: item.id,
                cardId: card.id,
            };
            updatedTransactions = [linkedTransaction, ...updatedTransactions];
        }

        const updatedOperations = [operationToSave, ...operations];
        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            {
                $set: {
                    savingsOperations: updatedOperations,
                    transactions: updatedTransactions,
                    cards: updatedCards,
                    ...updatedTotals,
                },
            },
        );

        return {
            message: 'Savings operation added',
            updatedGoals: goals,
            updatedOperations,
            updatedTransactions,
            updatedTotals,
            updatedCards,
        };
    }

    async deleteSavingsOperation(id: string, req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const goals = (userData.savingsGoals || []) as SavingsGoalDto[];
        const operations = (userData.savingsOperations ||
            []) as SavingsOperationDto[];

        const operationToDelete = operations.find(
            (operation) => operation.id === id,
        );

        if (!operationToDelete) {
            throw new BadRequestException('Savings operation not found');
        }

        const updatedOperations = operations.filter(
            (operation) => operation.id !== id,
        );

        const leavesNegativeBalance = Object.values(SavingsStorage).some(
            (storage) =>
                this.getSavingsStorageBalance(
                    updatedOperations,
                    storage,
                    operationToDelete.currency,
                ) < 0,
        );

        if (leavesNegativeBalance) {
            throw new BadRequestException(
                'This operation cannot be deleted because a later withdrawal depends on it',
            );
        }

        const cards = this.prepareCards(userData);
        let updatedCards = cards;
        const linkedTransaction = operationToDelete.linkedTransactionId
            ? (userData.transactions || []).find(
                  (transaction) =>
                      transaction.id === operationToDelete.linkedTransactionId,
              )
            : undefined;
        const updatedTransactions = linkedTransaction
            ? (userData.transactions || []).filter(
                  (transaction) => transaction.id !== linkedTransaction.id,
              )
            : userData.transactions || [];

        let updatedTotals = {
            totalAmount: userData.totalAmount,
            totalIncome: userData.totalIncome,
            totalSpend: userData.totalSpend,
        };
        const linkedBalanceAmount =
            linkedTransaction?.value ?? operationToDelete.balanceAmount;

        if (
            linkedBalanceAmount &&
            operationToDelete.type !== SavingsOperationType.TRANSFER
        ) {
            const linkedTransactionType =
                linkedTransaction?.transactionType ??
                (operationToDelete.type === SavingsOperationType.DEPOSIT
                    ? TransactionType.EXPENSE
                    : TransactionType.INCOME);
            const card = findCard(cards, linkedTransaction?.cardId);
            if (linkedTransactionType === TransactionType.INCOME) {
                ensureCardFunds(
                    card,
                    linkedBalanceAmount,
                    'Not enough money on the card to reverse this withdrawal',
                );
            }
            updatedCards = this.moveCardMoney(
                cards,
                card.id,
                linkedBalanceAmount,
                linkedTransactionType,
                true,
            );
            updatedTotals = {
                ...this.calculationService.calculateTotalsAfterDelete(
                    userData.totalAmount,
                    userData.totalIncome,
                    userData.totalSpend,
                    linkedBalanceAmount,
                    linkedTransactionType,
                ),
                totalAmount: sumCards(updatedCards),
            };
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            {
                $set: {
                    savingsOperations: updatedOperations,
                    transactions: updatedTransactions,
                    cards: updatedCards,
                    ...updatedTotals,
                },
            },
        );

        return {
            message: 'Savings operation deleted',
            updatedGoals: goals,
            updatedOperations,
            updatedTransactions,
            updatedTotals,
            updatedCards,
        };
    }

    async clearAllInfo(
        { clearTotals }: ClearAllInfoDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);
        const updatedSavingsOperations = (
            (userData.savingsOperations || []) as SavingsOperationDto[]
        ).map((operation) => {
            const documentOperation = operation as SavingsOperationDto & {
                toObject?: () => SavingsOperationDto;
            };
            const plainOperation = documentOperation.toObject?.() ?? operation;
            const unlinkedOperation = { ...plainOperation };
            delete unlinkedOperation.linkedTransactionId;
            delete unlinkedOperation.balanceAmount;
            return unlinkedOperation;
        });

        const updateData: Partial<AllTransactionsInfo> = {
            transactions: [],
            savingsOperations: updatedSavingsOperations,
        };
        let essentialsArray: EssentialItemDto[] | undefined;
        let nextMonthEssentialsArray: EssentialItemDto[] | undefined;
        let expectedIncomes: ExpectedIncomeRecord[] | undefined;

        if (clearTotals) {
            const resetPayments = (items: EssentialItemDto[] = []) =>
                items.map((item) => ({
                    id: item.id,
                    amount: item.amount,
                    title: item.title,
                    checked: false,
                }));

            updateData.cards = this.prepareCards(userData).map((card) => ({
                ...card,
                balance: 0,
            }));
            updateData.totalAmount = 0;
            updateData.totalIncome = 0;
            updateData.totalSpend = 0;
            updateData.nextMonthTotalAmount = 0;
            essentialsArray = resetPayments(userData.essentialsArray);
            nextMonthEssentialsArray = resetPayments(
                userData.nextMonthEssentialsArray,
            );
            updateData.essentialsArray = essentialsArray;
            updateData.nextMonthEssentialsArray = nextMonthEssentialsArray;
            expectedIncomes = this.getExpectedIncomes(userData).map(
                (income) => ({
                    id: income.id,
                    title: income.title,
                    amount: income.amount,
                    day: income.day,
                    recurring: income.recurring,
                    received: false,
                }),
            );
            updateData.expectedIncomes = expectedIncomes;
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: updateData },
        );

        return {
            message: 'All info cleared',
            clearedTransactions: true,
            clearedTotals: clearTotals,
            essentialsArray,
            nextMonthEssentialsArray,
            expectedIncomes,
            updatedSavingsOperations,
            updatedCards: updateData.cards,
        };
    }

    /**
     * Records that the app was opened today and returns the streak.
     *
     * Idempotent per day, so every device can call it on load: the second one
     * through gets the same answer as the first and nothing is written.
     */
    async recordStreakVisit(
        { day }: StreakVisitDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.getUserDataOrThrow(userId);

        const storedStreak = userData.streak as
            | (StreakState & { toObject?: () => StreakState })
            | undefined;
        const stored = storedStreak?.toObject?.() ?? storedStreak ?? null;

        const { streak, changed, reached } = registerStreakVisit(
            stored,
            resolveVisitDay(day),
        );

        if (changed) {
            await this.AllTransactionsInfoModel.updateOne(
                { userId },
                { $set: { streak } },
            );
        }

        return {
            message: changed ? 'Streak updated' : 'Streak already recorded',
            streak,
            reached,
        };
    }

    async setPercent({ percent }: SetPercentDto, req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);

        const updateData: Partial<AllTransactionsInfo> = {
            savePercent: percent,
        };

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: updateData },
        );

        return {
            message: 'Save Percent updated',
            percent,
        };
    }

    async deleteTransaction(
        { transactionId }: DeleteTransaction,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        const userTransactionsInfo =
            await this.AllTransactionsInfoModel.findOne({ userId });
        if (!userTransactionsInfo) {
            throw new UnauthorizedException('Transaction data not found');
        }

        const transactionToDelete = userTransactionsInfo.transactions.find(
            (t) => t.id === transactionId,
        );

        if (!transactionToDelete) {
            throw new BadRequestException('Transaction not found');
        }
        if (
            this.isEssentialPaymentTransaction(
                userTransactionsInfo,
                transactionId,
            )
        ) {
            throw new BadRequestException(
                'Reverse essential payments from the essentials checklist',
            );
        }
        if (
            this.isExpectedIncomeTransaction(
                userTransactionsInfo,
                transactionId,
            )
        ) {
            throw new BadRequestException(
                'Undo received income from the expected income list',
            );
        }

        const cards = this.prepareCards(userTransactionsInfo);

        if (transactionToDelete.transactionType === TransactionType.TRANSFER) {
            const destination = findCard(cards, transactionToDelete.toCardId);
            ensureCardFunds(
                destination,
                transactionToDelete.value,
                'The money has already left the destination card',
            );

            const updatedCards = changeCardBalance(
                changeCardBalance(
                    cards,
                    destination.id,
                    -transactionToDelete.value,
                ),
                findCard(cards, transactionToDelete.cardId).id,
                transactionToDelete.value,
            );
            const updatedTotals = {
                totalAmount: sumCards(updatedCards),
                totalIncome: userTransactionsInfo.totalIncome,
                totalSpend: userTransactionsInfo.totalSpend,
            };

            userTransactionsInfo.transactions =
                userTransactionsInfo.transactions.filter(
                    (t) => t.id !== transactionId,
                );
            userTransactionsInfo.cards = updatedCards;
            Object.assign(userTransactionsInfo, updatedTotals);
            await userTransactionsInfo.save();

            return {
                message: 'Transaction deleted successfully',
                deletedTransactionId: transactionId,
                updatedTotals,
                updatedItems: userTransactionsInfo.transactions,
                updatedSavingsOperations:
                    userTransactionsInfo.savingsOperations || [],
                updatedCards,
            };
        }

        const card = findCard(cards, transactionToDelete.cardId);

        if (transactionToDelete.transactionType === TransactionType.INCOME) {
            ensureCardFunds(
                card,
                transactionToDelete.value,
                'You cannot delete this income transaction because it would make the card balance negative',
            );
        }

        const savingsOperations = (userTransactionsInfo.savingsOperations ||
            []) as SavingsOperationDto[];
        const linkedSavingsOperation = savingsOperations.find(
            (operation) =>
                operation.id === transactionToDelete.savingsOperationId ||
                operation.linkedTransactionId === transactionId,
        );

        let updatedSavingsOperations = savingsOperations;
        if (linkedSavingsOperation) {
            updatedSavingsOperations = savingsOperations.filter(
                (operation) => operation.id !== linkedSavingsOperation.id,
            );

            const leavesNegativeBalance = Object.values(SavingsStorage).some(
                (storage) =>
                    this.getSavingsStorageBalance(
                        updatedSavingsOperations,
                        storage,
                        linkedSavingsOperation.currency,
                    ) < 0,
            );

            if (leavesNegativeBalance) {
                throw new BadRequestException(
                    'This savings transaction cannot be deleted because a later movement depends on it',
                );
            }
        }

        userTransactionsInfo.transactions =
            userTransactionsInfo.transactions.filter(
                (t) => t.id !== transactionId,
            );

        const updatedCards = this.moveCardMoney(
            cards,
            card.id,
            transactionToDelete.value,
            transactionToDelete.transactionType,
            true,
        );
        const updatedTotals = {
            ...this.calculationService.calculateTotalsAfterDelete(
                userTransactionsInfo.totalAmount,
                userTransactionsInfo.totalIncome,
                userTransactionsInfo.totalSpend,
                transactionToDelete.value,
                transactionToDelete.transactionType,
            ),
            totalAmount: sumCards(updatedCards),
        };

        userTransactionsInfo.cards = updatedCards;
        Object.assign(userTransactionsInfo, updatedTotals);
        userTransactionsInfo.savingsOperations = updatedSavingsOperations;

        await userTransactionsInfo.save();

        return {
            message: 'Transaction deleted successfully',
            deletedTransactionId: transactionId,
            updatedTotals,
            updatedItems: userTransactionsInfo.transactions,
            updatedSavingsOperations,
            updatedCards,
        };
    }

    async updateTransaction(
        {
            transactionId,
            value,
            transactionType,
            description,
            date,
            categorie,
            savingsStorage,
            savingsCurrency,
            savingsAmount,
            cardId,
        }: UpdateTransactionDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        const userTransactionsInfo =
            await this.AllTransactionsInfoModel.findOne({ userId });
        if (!userTransactionsInfo) {
            throw new UnauthorizedException('Transaction data not found');
        }

        const transactionIndex = userTransactionsInfo.transactions.findIndex(
            (t) => t.id === transactionId,
        );

        if (transactionIndex === -1) {
            throw new BadRequestException('Transaction not found');
        }
        if (
            this.isEssentialPaymentTransaction(
                userTransactionsInfo,
                transactionId,
            )
        ) {
            throw new BadRequestException(
                'Reverse essential payments from the essentials checklist',
            );
        }
        if (
            this.isExpectedIncomeTransaction(
                userTransactionsInfo,
                transactionId,
            )
        ) {
            throw new BadRequestException(
                'Undo received income from the expected income list',
            );
        }

        const oldTransaction =
            userTransactionsInfo.transactions[transactionIndex];

        if (oldTransaction.savingsOperationId) {
            throw new BadRequestException(
                'Edit linked savings movements from the savings page',
            );
        }

        if (
            oldTransaction.transactionType === TransactionType.TRANSFER ||
            transactionType === TransactionType.TRANSFER
        ) {
            throw new BadRequestException(
                'Delete the transfer and make a new one instead',
            );
        }

        if (
            transactionType === TransactionType.INCOME &&
            categorie === SAVINGS_CATEGORY
        ) {
            throw new BadRequestException(
                'Create savings withdrawals from the savings page',
            );
        }

        const cards = this.prepareCards(userTransactionsInfo);
        const oldCard = findCard(cards, oldTransaction.cardId);
        const newCard = findCard(cards, cardId ?? oldCard.id);

        const signed = (amount: number, type: TransactionType) =>
            type === TransactionType.INCOME ? amount : -amount;
        const projected = new Map(cards.map((card) => [card.id, card.balance]));
        projected.set(
            oldCard.id,
            projected.get(oldCard.id)! -
                signed(oldTransaction.value, oldTransaction.transactionType),
        );
        projected.set(
            newCard.id,
            projected.get(newCard.id)! + signed(value, transactionType),
        );

        if (
            [...projected.values()].some(
                (balance) => roundCurrency(balance) < 0,
            )
        ) {
            throw new BadRequestException(
                'Transaction cannot be updated because the card balance would be negative',
            );
        }

        const revertedCards = this.moveCardMoney(
            cards,
            oldCard.id,
            oldTransaction.value,
            oldTransaction.transactionType,
            true,
        );
        const revertedTotals = {
            ...this.calculationService.calculateTotalsAfterDelete(
                userTransactionsInfo.totalAmount,
                userTransactionsInfo.totalIncome,
                userTransactionsInfo.totalSpend,
                oldTransaction.value,
                oldTransaction.transactionType,
            ),
            totalAmount: sumCards(revertedCards),
        };

        Object.assign(userTransactionsInfo, revertedTotals);

        const updatedTransaction: TransactionDto = {
            ...oldTransaction,
            cardId: newCard.id,
            value,
            transactionType,
            categorie: categorie ?? oldTransaction.categorie,
            description: description ?? oldTransaction.description,
            date: date ?? oldTransaction.date,
            savingsStorage:
                categorie === SAVINGS_CATEGORY ? savingsStorage : undefined,
            savingsCurrency:
                categorie === SAVINGS_CATEGORY ? savingsCurrency : undefined,
            savingsAmount:
                categorie === SAVINGS_CATEGORY ? savingsAmount : undefined,
        };
        const savingsOperations = (userTransactionsInfo.savingsOperations ||
            []) as SavingsOperationDto[];

        if (
            transactionType === TransactionType.EXPENSE &&
            categorie === SAVINGS_CATEGORY
        ) {
            if (!savingsStorage || !savingsCurrency) {
                throw new BadRequestException(
                    'Choose where the savings will be stored',
                );
            }

            const savingsOperationId = uuidv4();
            updatedTransaction.savingsOperationId = savingsOperationId;
            userTransactionsInfo.savingsOperations = [
                {
                    id: savingsOperationId,
                    type: SavingsOperationType.DEPOSIT,
                    storage: savingsStorage,
                    amount: savingsAmount ?? value,
                    currency: savingsCurrency,
                    date: new Date(date).toISOString(),
                    note: description || undefined,
                    linkedTransactionId: oldTransaction.id,
                    balanceAmount: value,
                },
                ...savingsOperations,
            ];
        }

        userTransactionsInfo.transactions[transactionIndex] =
            updatedTransaction;

        const updatedCards = this.moveCardMoney(
            revertedCards,
            newCard.id,
            value,
            transactionType,
        );
        const updatedTotals = {
            ...this.calculationService.calculateAllTotals(
                userTransactionsInfo.totalAmount,
                userTransactionsInfo.totalIncome,
                userTransactionsInfo.totalSpend,
                value,
                transactionType,
            ),
            totalAmount: sumCards(updatedCards),
        };

        userTransactionsInfo.cards = updatedCards;
        Object.assign(userTransactionsInfo, updatedTotals);

        await userTransactionsInfo.save();

        return {
            message: 'Transaction updated successfully',
            updatedTransaction:
                userTransactionsInfo.transactions[transactionIndex],
            updatedTotals,
            updatedItems: userTransactionsInfo.transactions,
            updatedSavingsOperations:
                userTransactionsInfo.savingsOperations || [],
            updatedCards,
        };
    }
}
