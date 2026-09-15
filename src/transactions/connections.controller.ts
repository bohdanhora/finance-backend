import {
    Body,
    Controller,
    Delete,
    Get,
    Put,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from 'src/app.controller';
import { AuthGuard } from 'src/guards/auth.guard';
import { ConnectionsService } from './connections.service';
import {
    AssistantPreferencesDto,
    MonobankTokenDto,
} from './dtos/connections.dto';

@UseGuards(AuthGuard)
@Controller('transactions/connections')
export class ConnectionsController {
    constructor(private readonly connectionsService: ConnectionsService) {}

    @Get()
    async getConnections(@Req() req: AuthenticatedRequest) {
        return this.connectionsService.getConnections(req);
    }

    @Put('assistant')
    async setAssistantPreferences(
        @Body() data: AssistantPreferencesDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.connectionsService.setAssistantPreferences(data, req);
    }

    @Put('monobank')
    async setMonobankToken(
        @Body() data: MonobankTokenDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.connectionsService.setMonobankToken(data, req);
    }

    @Delete('monobank')
    async clearMonobankToken(@Req() req: AuthenticatedRequest) {
        return this.connectionsService.clearMonobankToken(req);
    }
}
