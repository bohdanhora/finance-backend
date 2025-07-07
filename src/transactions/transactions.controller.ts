import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthenticatedRequest } from 'src/app.controller';
import { AuthGuard } from 'src/guards/auth.guard';
import { TotalAmountDto } from './dtos/total-amount.dto';
import { NextMonthTotalAmountDto } from './dtos/next-month-total-amount.dto';

@UseGuards(AuthGuard)
@Controller('transactions')
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) {}
    @Get('all-info')
    async getAllInfo(@Req() req: AuthenticatedRequest) {
        return this.transactionsService.getAllInfo(req);
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
    // TODO: POST set transaction
    // TODO: GET default essential payments
    // TODO: PUT set default essential payments
    // TODO: GET essential payments
    // TODO: GET next month essential payments
    // TODO: POST set essential payments
    // TODO: POST set mext month essential payments
}
