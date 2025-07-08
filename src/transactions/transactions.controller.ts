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

    // TODO: POST set transaction
}
