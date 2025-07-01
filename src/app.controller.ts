import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AppService } from './app.service';
import { AuthGuard } from './guards/auth.guard';

interface AuthenticatedRequest extends Request {
    userId: string;
}

@UseGuards(AuthGuard)
@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get()
    someProtectedRoute(@Req() req: AuthenticatedRequest) {
        return { message: 'Accessed Resource', userId: req.userId };
    }
}
