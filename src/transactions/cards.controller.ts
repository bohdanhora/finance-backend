import {
    Body,
    Controller,
    Delete,
    Param,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from 'src/app.controller';
import { AuthGuard } from 'src/guards/auth.guard';
import { CardsService } from './cards.service';
import {
    CardOrderDto,
    CardTransferDto,
    CreateCardDto,
    DeleteCardQueryDto,
    UpdateCardDto,
} from './dtos/cards.dto';

@UseGuards(AuthGuard)
@Controller('transactions/cards')
export class CardsController {
    constructor(private readonly cardsService: CardsService) {}

    @Post()
    async createCard(
        @Body() data: CreateCardDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.cardsService.createCard(data, req);
    }

    @Put()
    async updateCard(
        @Body() data: UpdateCardDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.cardsService.updateCard(data, req);
    }

    @Put('order')
    async reorderCards(
        @Body() data: CardOrderDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.cardsService.reorderCards(data, req);
    }

    @Post('transfer')
    async transfer(
        @Body() data: CardTransferDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.cardsService.transfer(data, req);
    }

    @Delete(':id')
    async deleteCard(
        @Param('id') id: string,
        @Query() { moveTo }: DeleteCardQueryDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.cardsService.deleteCard(id, moveTo, req);
    }
}
