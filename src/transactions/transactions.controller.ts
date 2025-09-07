import {
    Body,
    Controller,
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

@UseGuards(AuthGuard)
@Controller('transactions')
export class TransactionsController {
    constructor(
        private readonly transactionsService: TransactionsService,
        private readonly pdfService: PdfService,
    ) {}

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
}
