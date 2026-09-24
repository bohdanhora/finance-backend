import {
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from 'src/app.controller';
import { AuthGuard } from 'src/guards/auth.guard';
import { SessionEndReason } from './session.schema';
import { SessionsService } from './sessions.service';

@UseGuards(AuthGuard)
@Controller('auth/sessions')
export class SessionsController {
    constructor(private readonly sessionsService: SessionsService) {}

    @Get()
    async list(@Req() req: AuthenticatedRequest) {
        return this.sessionsService.list(req.userId, req.sessionId);
    }

    @Delete('others')
    async endOthers(@Req() req: AuthenticatedRequest) {
        const ended = await this.sessionsService.endAll(
            req.userId,
            SessionEndReason.REVOKED,
            req.sessionId,
        );

        return { message: 'Other sessions ended', ended };
    }

    @Delete('history')
    async clearHistory(@Req() req: AuthenticatedRequest) {
        const removed = await this.sessionsService.clearHistory(req.userId);

        return { message: 'History cleared', removed };
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        const removed = await this.sessionsService.remove(req.userId, id);

        if (!removed) {
            throw new NotFoundException('Session not found');
        }

        return {
            message: 'Session removed',
            current: id === req.sessionId,
        };
    }
}
