import { Injectable } from '@nestjs/common';
import { TransactionType } from '../dtos/transaction.dto';

@Injectable()
export class CalculationService {
    calculateTotalAfterTransaction(
        totalAmount: number,
        transactionAmount: number,
        type: TransactionType,
    ): number {
        switch (type) {
            case TransactionType.EXPENSE: {
                const result = totalAmount - transactionAmount;
                return result < 0 ? 0 : result;
            }
            case TransactionType.INCOME:
                return totalAmount + transactionAmount;
            default:
                throw new Error(`Unknown transaction type: ${String(type)}`);
        }
    }

    calculateTotalIncome(
        currentIncome: number,
        transactionAmount: number,
        type: TransactionType,
    ): number {
        if (type === TransactionType.INCOME) {
            return currentIncome + transactionAmount;
        }
        return currentIncome;
    }

    calculateTotalSpend(
        currentSpend: number,
        transactionAmount: number,
        type: TransactionType,
    ): number {
        if (type === TransactionType.EXPENSE) {
            return currentSpend + transactionAmount;
        }
        return currentSpend;
    }

    calculateAllTotals(
        currentTotalAmount: number,
        currentTotalIncome: number,
        currentTotalSpend: number,
        transactionAmount: number,
        type: TransactionType,
    ) {
        return {
            totalAmount: this.calculateTotalAfterTransaction(
                currentTotalAmount,
                transactionAmount,
                type,
            ),
            totalIncome: this.calculateTotalIncome(
                currentTotalIncome,
                transactionAmount,
                type,
            ),
            totalSpend: this.calculateTotalSpend(
                currentTotalSpend,
                transactionAmount,
                type,
            ),
        };
    }
}
