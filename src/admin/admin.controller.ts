import {
    BadRequestException,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Query,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

import { AdminKeyGuard } from './admin-key.guard';
import type {
    AdminStats,
    AdminUserDetail,
    AdminUserList,
} from './admin.contract';
import { AdminService } from './admin.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';

const queryPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
});

@UseGuards(AdminKeyGuard)
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Get('stats')
    getStats(): Promise<AdminStats> {
        return this.adminService.getStats();
    }

    @Get('users')
    listUsers(
        @Query(queryPipe) query: AdminUsersQueryDto,
    ): Promise<AdminUserList> {
        return this.adminService.listUsers(query);
    }

    @Get('users/:id')
    getUser(@Param('id') id: string): Promise<AdminUserDetail> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid user id');
        }

        return this.adminService.getUser(id);
    }

    @Delete('users/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteUser(@Param('id') id: string): Promise<void> {
        if (!isValidObjectId(id)) {
            throw new BadRequestException('Invalid user id');
        }

        return this.adminService.deleteUser(id);
    }
}
