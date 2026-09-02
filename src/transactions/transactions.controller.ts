import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Req,
    UseGuards,
    StreamableFile,
    Header,
    ForbiddenException,
    NotFoundException,
    Query,
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
import { PdfService } from 'src/services/pdf.service';
import { Readable } from 'stream';
import { ClearAllInfoDto } from './dtos/clear-all-info';
import { SetPercentDto } from './dtos/percent';
import { DeleteTransaction } from './dtos/delete-transaction';
import { UpdateTransactionDto } from './dtos/update-transaction';
import { CurrentMonthDto } from './dtos/current-month.dto';
import { UpdateEssentialDto } from './dtos/update-essential.dto';
import {
    DeleteSavingsGoalDto,
    SavingsGoalPayloadDto,
    SavingsOperationPayloadDto,
} from './dtos/savings.dto';
import { ChangeCurrencyDto } from './dtos/currency.dto';

@UseGuards(AuthGuard)
@Controller('transactions')
export class TransactionsController {
    constructor(
        private readonly transactionsService: TransactionsService,
        private readonly pdfService: PdfService,
    ) {}

    @Get('all-info')
    async getAllInfo(
        @Req() req: AuthenticatedRequest,
        @Query() { currentMonth }: CurrentMonthDto,
    ) {
        return this.transactionsService.getAllInfo(req, currentMonth);
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

    @Put('currency')
    async changeCurrency(
        @Body() data: ChangeCurrencyDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.changeCurrency(data, req);
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

    @Put('update-essential')
    async updateEssential(
        @Body() updateEssentialData: UpdateEssentialDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.updateEssential(
            updateEssentialData,
            req,
        );
    }

    @Post('savings/goals')
    async addSavingsGoal(
        @Body() data: SavingsGoalPayloadDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.addSavingsGoal(data, req);
    }

    @Put('savings/goals')
    async updateSavingsGoal(
        @Body() data: SavingsGoalPayloadDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.updateSavingsGoal(data, req);
    }

    @Delete('savings/goals/:id')
    async deleteSavingsGoal(
        @Param('id') id: string,
        @Body() data: DeleteSavingsGoalDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.deleteSavingsGoal(id, req, data);
    }

    @Post('savings/operations')
    async addSavingsOperation(
        @Body() data: SavingsOperationPayloadDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.addSavingsOperation(data, req);
    }

    @Delete('savings/operations/:id')
    async deleteSavingsOperation(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.deleteSavingsOperation(id, req);
    }

    @Get(':userId')
    @UseGuards(AuthGuard)
    @Header('Content-Type', 'application/pdf')
    async downloadPdf(
        @Param('userId') userId: string,
        @Req() req: AuthenticatedRequest,
    ): Promise<StreamableFile> {
        if (req.userId !== userId) {
            throw new ForbiddenException('Access denied');
        }

        const buffer = await this.pdfService.generateUserPdf(
            userId,
            req.userId,
        );

        if (!buffer) {
            throw new NotFoundException('PDF not found');
        }

        const stream = Readable.from(buffer);
        return new StreamableFile(stream, {
            disposition: `attachment; filename=transactions-${userId}.pdf`,
            length: buffer.length,
        });
    }

    @Post('clear-all')
    async clearAllInfo(
        @Body() clearAllInfoData: ClearAllInfoDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.clearAllInfo(clearAllInfoData, req);
    }

    @Post('percent')
    async setPercent(
        @Body() percent: SetPercentDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.setPercent(percent, req);
    }

    @Post('delete-transaction')
    async deleteTransaction(
        @Body() transactionId: DeleteTransaction,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.deleteTransaction(transactionId, req);
    }

    @Put('update-transaction')
    async updateTransaction(
        @Body() updateTransactionData: UpdateTransactionDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.updateTransaction(
            updateTransactionData,
            req,
        );
    }
}
