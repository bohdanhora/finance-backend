import {
    Body,
    Controller,
    Get,
    Post,
    Put,
    Req,
    UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthenticatedRequest } from 'src/app.controller';
import { AuthGuard } from 'src/guards/auth.guard';
import { TotalAmountDto } from './dtos/total-amount.dto';
import { NextMonthTotalAmountDto } from './dtos/next-month-total-amount.dto';
import { EssentialsArrayDto } from './dtos/essential-payments.dto';
import { TransactionDto } from './dtos/transaction.dto';
import { EssentialCheckedDto } from './dtos/essential-checked.dto';
import { RemoveEssentialDto } from './dtos/remove-essential.dto';
import { NewEssentialDto } from './dtos/add-new-essential.dto';

@UseGuards(AuthGuard)
@Controller('transactions')
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) {}
    @Get('all-info')
    async getAllInfo(@Req() req: AuthenticatedRequest) {
        return this.transactionsService.getAllInfo(req);
    }
    @Post('new-transaction')
    async newTransaction(
        @Body() newTransactionData: TransactionDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.newTransaction(newTransactionData, req);
    }
    @Post('set-total')
    async setTotalAmount(
        @Body() totalAmountData: TotalAmountDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.setTotalAmount(totalAmountData, req);
    }
    @Post('set-next-month-total')
    async setNextMonthTotalAmount(
        @Body() nextMonthTotalAmountData: NextMonthTotalAmountDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.setNextMonthTotalAmount(
            nextMonthTotalAmountData,
            req,
        );
    }

    @Put('set-essential-payments')
    async setEssentalPayments(
        @Body() essentialPaymentsData: EssentialsArrayDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.setEssentalPayments(
            essentialPaymentsData,
            req,
        );
    }
    @Put('set-checked-essential-payments')
    async setCheckedEssentalPayments(
        @Body() checkedEssentialPaymentsData: EssentialCheckedDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.setCheckedEssentalPayments(
            checkedEssentialPaymentsData,
            req,
        );
    }

    @Put('remove-essential')
    async removeEssential(
        @Body() removeEssentialData: RemoveEssentialDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.removeEssential(
            removeEssentialData,
            req,
        );
    }

    @Post('new-essential')
    async addNewEssential(
        @Body() newEssentialData: NewEssentialDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.addNewEssential(newEssentialData, req);
    }
}
